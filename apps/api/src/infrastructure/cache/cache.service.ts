/**
 * Cache / ephemeral-coordination layer (caching spec, project rule §42).
 *
 * Hard rules honoured here:
 *  - Redis is NEVER a source of truth. It caches reads, holds rate-limit counters and hosts
 *    best-effort locks; correctness always rests on PostgreSQL conditional writes.
 *  - Every operation degrades gracefully: when Redis is unavailable the service falls back to a
 *    bounded in-process store so the platform keeps serving traffic instead of failing requests.
 *  - Keys are namespaced with the configured prefix and a version, so a cache format change can be
 *    rolled out without stale-read incidents.
 */
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../config/config.module';
import { InjectLogger, BEZZO_LOGGER, type BezzoLogger } from '../logger/logger.module';

const MAX_MEMORY_ENTRIES = 10_000;

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly client: Redis | null;
  private readonly memory = new Map<string, MemoryEntry>();
  private redisHealthy = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectLogger() private readonly logger: BezzoLogger,
  ) {
    if (!config.REDIS_URL) {
      this.client = null;
      this.logger.warnWith({}, 'REDIS_URL is not set — running with the in-process cache fallback');
      return;
    }

    this.client = new Redis(config.REDIS_URL, {
      keyPrefix: `${config.REDIS_KEY_PREFIX}:`,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    this.client.on('ready', () => {
      this.redisHealthy = true;
      this.logger.info({}, 'redis connection ready');
    });
    this.client.on('error', (error) => {
      if (this.redisHealthy) {
        this.logger.warnWith({ error: error.message }, 'redis connection lost — degrading to in-process cache');
      }
      this.redisHealthy = false;
    });
    this.client.on('end', () => {
      this.redisHealthy = false;
    });
  }

  /* ------------------------------------------------------------------ reads */

  async get(key: string): Promise<string | null> {
    if (this.client && this.redisHealthy) {
      try {
        return await this.client.get(key);
      } catch (error) {
        this.markDown('get', error);
      }
    }
    return this.memoryGet(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.client && this.redisHealthy) {
      try {
        if (ttlSeconds > 0) await this.client.set(key, value, 'EX', ttlSeconds);
        else await this.client.set(key, value);
        return;
      } catch (error) {
        this.markDown('set', error);
      }
    }
    this.memorySet(key, value, ttlSeconds);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.client && this.redisHealthy) {
      try {
        await this.client.del(key);
      } catch (error) {
        this.markDown('del', error);
      }
    }
  }

  /** Cache-aside helper: returns the cached value or computes, stores and returns it. */
  async remember<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  /** Delete by prefix using SCAN (never KEYS) so a large keyspace cannot block Redis. */
  async invalidatePrefix(prefix: string): Promise<number> {
    if (!this.client || !this.redisHealthy) {
      let removed = 0;
      for (const key of [...this.memory.keys()]) {
        if (key.startsWith(prefix)) {
          this.memory.delete(key);
          removed += 1;
        }
      }
      return removed;
    }
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        const stripped = keys.map((key) => key.replace(`${this.config.REDIS_KEY_PREFIX}:`, ''));
        await this.client.del(...stripped);
        removed += stripped.length;
      }
    } while (cursor !== '0');
    return removed;
  }

  /* ------------------------------------------------------------ rate limits */

  /**
   * Increment a counter with a TTL.
   *
   * API rate limiting (api spec §9). When Redis is unavailable the in-process counter still applies,
   * which means limits are per-instance instead of global during an outage — documented behaviour.
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.client && this.redisHealthy) {
      try {
        const value = await this.client.incr(key);
        if (value === 1) await this.client.expire(key, ttlSeconds);
        return value;
      } catch (error) {
        this.markDown('increment', error);
      }
    }
    const entry = this.memory.get(key);
    const now = Date.now();
    if (!entry || (entry.expiresAt !== null && entry.expiresAt <= now)) {
      this.memorySet(key, '1', ttlSeconds);
      return 1;
    }
    const next = Number(entry.value) + 1;
    entry.value = String(next);
    return next;
  }

  async ttl(key: string): Promise<number> {
    if (this.client && this.redisHealthy) {
      try {
        return await this.client.ttl(key);
      } catch (error) {
        this.markDown('ttl', error);
      }
    }
    const entry = this.memory.get(key);
    if (!entry?.expiresAt) return -1;
    return Math.max(Math.ceil((entry.expiresAt - Date.now()) / 1000), 0);
  }

  /* ------------------------------------------------------------------ locks */

  /**
   * Best-effort distributed lock. Locks are an optimisation to avoid duplicated work — never the
   * correctness mechanism. Correctness always comes from conditional SQL (`WHERE status = ...`).
   */
  async acquireLock(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    if (this.client && this.redisHealthy) {
      try {
        const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch (error) {
        this.markDown('acquireLock', error);
      }
    }
    const existing = this.memory.get(key);
    if (existing && (existing.expiresAt === null || existing.expiresAt > Date.now())) return false;
    this.memorySet(key, token, ttlSeconds);
    return true;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    if (this.client && this.redisHealthy) {
      try {
        // Only the owner may release: compare-and-delete via Lua to stay atomic.
        await this.client.eval(
          `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
          1,
          `${this.config.REDIS_KEY_PREFIX}:${key}`,
          token,
        );
        return;
      } catch (error) {
        this.markDown('releaseLock', error);
      }
    }
    const entry = this.memory.get(key);
    if (entry?.value === token) this.memory.delete(key);
  }

  /* ------------------------------------------------------------- geo (routing) */

  /** GEO set used to shortlist nearby pickers/suppliers. PostgreSQL remains authoritative. */
  async geoAdd(key: string, longitude: number, latitude: number, member: string): Promise<void> {
    if (this.client && this.redisHealthy) {
      try {
        await this.client.geoadd(key, longitude, latitude, member);
        return;
      } catch (error) {
        this.markDown('geoAdd', error);
      }
    }
    // Without Redis the routing engine falls back to the SQL haversine search.
  }

  async geoSearch(
    key: string,
    longitude: number,
    latitude: number,
    radiusKm: number,
    count: number,
  ): Promise<Array<{ member: string; distanceKm: number }>> {
    if (!this.client || !this.redisHealthy) return [];
    try {
      const results = (await this.client.geosearch(
        key,
        'FROMLONLAT',
        longitude,
        latitude,
        'BYRADIUS',
        radiusKm,
        'km',
        'ASC',
        'COUNT',
        count,
        'WITHDIST',
      )) as Array<[string, string]>;
      return results.map(([member, distance]) => ({ member, distanceKm: Number(distance) }));
    } catch (error) {
      this.markDown('geoSearch', error);
      return [];
    }
  }

  /* --------------------------------------------------------------- health */

  async ping(): Promise<boolean> {
    if (!this.client) return true; // in-memory driver is always available
    try {
      await this.client.ping();
      this.redisHealthy = true;
      return true;
    } catch {
      this.redisHealthy = false;
      return false;
    }
  }

  status(): { available: boolean; driver: 'redis' | 'memory'; lastError: string | null } {
    return {
      available: this.redisHealthy,
      driver: this.client ? 'redis' : 'memory',
      lastError: this.lastError,
    };
  }

  /** True when reads/writes are being served by the bounded in-process fallback. */
  isUsingFallback(): boolean {
    return !this.client || !this.redisHealthy;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  /* ------------------------------------------------------------- internals */

  private lastError: string | null = null;

  private markDown(operation: string, error: unknown): void {
    this.redisHealthy = false;
    this.lastError = (error as Error).message;
    this.logger.warnWith(
      { operation, error: (error as Error).message },
      'redis operation failed — using in-process cache fallback',
    );
  }

  private memoryGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  private memorySet(key: string, value: string, ttlSeconds: number): void {
    if (this.memory.size >= MAX_MEMORY_ENTRIES) {
      // Bounded store: drop the oldest 10% rather than growing without limit.
      const toDrop = Math.ceil(MAX_MEMORY_ENTRIES * 0.1);
      let dropped = 0;
      for (const existingKey of this.memory.keys()) {
        this.memory.delete(existingKey);
        dropped += 1;
        if (dropped >= toDrop) break;
      }
    }
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }
}

@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}

/**
 * PostgreSQL connection management.
 *
 * Design notes (spec §20 high concurrency, spec §21 inventory concurrency):
 *  - ONE bounded pool per process. Never one connection per user.
 *  - Statements carry an explicit timeout so a pathological query cannot pin a pooled connection.
 *  - `query` helpers are thin: business logic lives in repositories/services, not in SQL strings
 *    scattered across the codebase.
 */
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export interface DatabaseLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  statementTimeoutMs?: number;
  connectionTimeoutMs?: number;
  ssl?: boolean;
  applicationName?: string;
  logger?: DatabaseLogger;
}

export interface SlowQueryRecord {
  text: string;
  durationMs: number;
  rowCount: number | null;
  at: string;
}

export class Database {
  private readonly pool: Pool;
  private readonly logger?: DatabaseLogger;
  private readonly slowQueryThresholdMs: number;
  private readonly slowQueries: SlowQueryRecord[] = [];
  private readonly maxSlowQueryRecords = 50;

  constructor(options: DatabaseOptions) {
    const poolConfig: PoolConfig = {
      connectionString: options.connectionString,
      max: options.maxConnections ?? 20,
      idleTimeoutMillis: options.idleTimeoutMs ?? 30_000,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
      application_name: options.applicationName ?? 'bezzo',
      statement_timeout: options.statementTimeoutMs ?? 15_000,
      query_timeout: (options.statementTimeoutMs ?? 15_000) + 5_000,
      allowExitOnIdle: false,
      ...(options.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    };
    this.pool = new Pool(poolConfig);
    this.logger = options.logger;
    this.slowQueryThresholdMs = Number(process.env.DATABASE_SLOW_QUERY_MS ?? 300);

    this.pool.on('error', (error) => {
      // An idle client error must never crash the process: log, and let the pool replace it.
      this.logger?.error('idle postgres client error', { message: error.message });
    });
  }

  /** Execute a single statement outside an explicit transaction. */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const startedAt = process.hrtime.bigint();
    try {
      const result = await this.pool.query<T>(text, params as unknown[]);
      this.observeSlowQuery(text, startedAt, result.rowCount);
      return result;
    } catch (error) {
      this.logger?.error('query failed', { sql: firstLine(text), error: (error as Error).message });
      throw error;
    }
  }

  /** Convenience: return rows only. */
  async rows<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  /** Convenience: return the first row or null. */
  async row<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] ?? null;
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transactionWith({}, fn);
  }

  /**
   * Run `fn` inside a transaction. `isolation` defaults to READ COMMITTED, which is sufficient for
   * the atomic conditional updates BEZZO relies on (inventory reservation, picker task claim).
   */
  async transactionWith<T>(
    options: { isolation?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'; readOnly?: boolean },
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      const isolation = options.isolation ?? 'READ COMMITTED';
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}${options.readOnly ? ' READ ONLY' : ''}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        this.logger?.error('rollback failed', { message: (rollbackError as Error).message });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Advisory lock used to serialise migration runs across instances. */
  async withAdvisoryLock<T>(lockKey: number, fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
      return await fn();
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      } finally {
        client.release();
      }
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startedAt = process.hrtime.bigint();
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, latencyMs: elapsedMs(startedAt) };
    } catch (error) {
      return { ok: false, latencyMs: elapsedMs(startedAt), error: (error as Error).message };
    }
  }

  async poolStats(): Promise<{ total: number; idle: number; waiting: number }> {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  /** Recent slow queries — surfaced on the internal health endpoint for operational diagnosis. */
  recentSlowQueries(): readonly SlowQueryRecord[] {
    return this.slowQueries;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private observeSlowQuery(text: string, startedAt: bigint, rowCount: number | null): void {
    const durationMs = elapsedMs(startedAt);
    if (durationMs < this.slowQueryThresholdMs) return;
    this.slowQueries.unshift({ text: firstLine(text), durationMs, rowCount, at: new Date().toISOString() });
    if (this.slowQueries.length > this.maxSlowQueryRecords) this.slowQueries.pop();
    this.logger?.warn('slow query', { sql: firstLine(text), durationMs, rowCount });
  }
}

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function firstLine(sql: string): string {
  return sql.trim().split('\n')[0]?.slice(0, 160) ?? '';
}

let sharedDatabase: Database | null = null;

/** Process-wide database handle (one bounded pool per process). */
export function getDatabase(options?: DatabaseOptions): Database {
  if (!sharedDatabase) {
    if (!options) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error('DATABASE_URL is required to create the database pool');
      sharedDatabase = new Database({ connectionString });
    } else {
      sharedDatabase = new Database(options);
    }
  }
  return sharedDatabase;
}

export function setDatabase(instance: Database | null): void {
  sharedDatabase = instance;
}

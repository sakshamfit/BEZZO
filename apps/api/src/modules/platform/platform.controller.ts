/**
 * Operational endpoints.
 *
 *  - `/health/live`  — process liveness (no dependencies touched, never fails on dependency outage);
 *  - `/health/ready` — readiness for traffic: verifies the database round-trip, reports Redis,
 *                      OpenSearch and worker state as degraded capabilities rather than failing the
 *                      pod, because BEZZO is designed to serve traffic in degraded mode;
 *  - `/health`       — full dependency report for operators and the status page;
 *  - `/metrics`      — Prometheus exposition (disabled in production unless METRICS_ENABLED=true).
 *
 * These routes are excluded from the `/api/v1` prefix so load balancers and scrapers can reach them.
 */
import { Controller, Get, Header, Inject, Res, type OnApplicationShutdown } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { AppConfig } from '@bezzo/config';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DATABASE } from '../../infrastructure/database/database.module';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { SearchService } from '../../infrastructure/search/search.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import { Public } from '../../common/decorators';
import { ErrorCode } from '@bezzo/contracts';
import { SERVICE_UNAVAILABLE_DETAIL } from '../../infrastructure/monitoring/constants';

@ApiTags('platform')
@Controller()
export class PlatformController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly cache: CacheService,
    private readonly search: SearchService,
    private readonly metrics: MetricsService,
  ) {}

  @Public()
  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return {
      status: 'ok',
      service: 'bezzo-api',
      version: this.config.APP_VERSION,
      environment: this.config.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe with dependency round-trips' })
  async ready() {
    const databasePing = await this.database.ping().catch(() => ({ ok: false, latencyMs: 0 }));
    const databaseOk = databasePing.ok;
    const cacheOk = await this.cache.ping().catch(() => false);
    const searchStatus = this.search.status();
    const degraded = !databaseOk || !cacheOk;
    return {
      status: databaseOk ? (degraded ? 'degraded' : 'ok') : 'unavailable',
      checks: {
        database: databaseOk ? 'ok' : 'failed',
        databaseLatencyMs: databasePing.latencyMs,
        cache: cacheOk ? 'ok' : 'degraded',
        search: searchStatus.available ? 'ok' : 'degraded',
        searchProvider: searchStatus.provider,
      },
      degradedCapabilities: [
        ...(cacheOk ? [] : ['cache']),
        ...(searchStatus.available ? [] : ['search']),
      ],
    };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Full dependency and capability report' })
  async health() {
    const startedAt = Date.now();
    const databasePing = await this.database.ping().catch(() => ({ ok: false, latencyMs: 0 }));
    const databaseOk = databasePing.ok;
    const databaseLatencyMs = Date.now() - startedAt;
    const pool = await this.database.poolStats().catch(() => ({ total: 0, idle: 0, waiting: 0 }));
    const cacheOk = await this.cache.ping().catch(() => false);
    const searchStatus = this.search.status();
    const pendingSearchJobs = searchStatus.available ? await this.search.pendingCount().catch(() => 0) : 0;

    return {
      status: databaseOk ? 'ok' : 'unavailable',
      service: 'bezzo-api',
      version: this.config.APP_VERSION,
      environment: this.config.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      dependencies: {
        database: { status: databaseOk ? 'ok' : 'down', latencyMs: databaseLatencyMs, pool },
        redis: { status: cacheOk ? 'ok' : 'down', driver: this.cache.status().driver, usedInMemoryFallback: this.cache.isUsingFallback() },
        search: { status: searchStatus.available ? 'ok' : 'fallback', provider: searchStatus.provider, pendingJobs: pendingSearchJobs },
        payments: { provider: this.config.PAYMENTS_PROVIDER },
        logistics: { provider: this.config.LOGISTICS_PROVIDER },
        storage: { driver: this.config.STORAGE_DRIVER },
      },
      worker: { enabled: this.config.WORKER_ENABLED },
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('metrics')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metricsEndpoint(@Res() reply: FastifyReply): Promise<void> {
    if (this.config.NODE_ENV === 'production' && !this.config.METRICS_ENABLED) {
      reply.status(404).send({ success: false, error: { code: ErrorCode.RESOURCE_NOT_FOUND, message: SERVICE_UNAVAILABLE_DETAIL } });
      return;
    }
    const payload = await this.metrics.render();
    reply.status(200).send(payload);
  }

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Build and configuration metadata (no secrets)' })
  version() {
    return {
      service: 'bezzo-api',
      version: this.config.APP_VERSION,
      environment: this.config.NODE_ENV,
      apiBasePath: this.config.API_BASE_PATH,
      features: {
        search: this.config.SEARCH_ENABLED,
        payments: this.config.PAYMENTS_PROVIDER,
        logistics: this.config.LOGISTICS_PROVIDER,
        worker: this.config.WORKER_ENABLED,
      },
    };
  }
}

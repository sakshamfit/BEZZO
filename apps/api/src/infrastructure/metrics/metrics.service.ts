/**
 * Metrics (observability spec §33, performance spec §20).
 *
 * Prometheus counters/histograms covering the platform's operational questions:
 * request latency (p50/p95/p99 derivable from the histogram), database timing, event-outbox health,
 * offer/assignment throughput, reservation outcomes, payment and logistics provider results,
 * notification delivery and queue depth.
 */
import { Injectable, Module, Global } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const HTTP_DURATION_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DB_DURATION_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'bezzo_http_requests_total',
    help: 'Total HTTP requests by method, route and status class',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'bezzo_http_request_duration_seconds',
    help: 'HTTP request duration in seconds (p50/p95/p99 derivable)',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: HTTP_DURATION_BUCKETS,
    registers: [this.registry],
  });

  readonly dbDuration = new Histogram({
    name: 'bezzo_db_query_duration_seconds',
    help: 'Database query duration by operation',
    labelNames: ['operation'] as const,
    buckets: DB_DURATION_BUCKETS,
    registers: [this.registry],
  });

  readonly domainEvents = new Counter({
    name: 'bezzo_domain_events_total',
    help: 'Domain events processed by name and outcome',
    labelNames: ['event', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly pickupOffers = new Counter({
    name: 'bezzo_pickup_offers_total',
    help: 'Pickup task offers by outcome (operational assignment health)',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  readonly pickupTransitions = new Counter({
    name: 'bezzo_pickup_transitions_total',
    help: 'Pickup task state transitions by target state',
    labelNames: ['state'] as const,
    registers: [this.registry],
  });

  readonly payments = new Counter({
    name: 'bezzo_payments_total',
    help: 'Payment outcomes by provider and status',
    labelNames: ['provider', 'status'] as const,
    registers: [this.registry],
  });

  readonly logistics = new Counter({
    name: 'bezzo_logistics_total',
    help: 'Logistics provider interactions by provider and outcome',
    labelNames: ['provider', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly inventoryReservations = new Counter({
    name: 'bezzo_inventory_reservations_total',
    help: 'Inventory reservation attempts by result',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly notifications = new Counter({
    name: 'bezzo_notifications_total',
    help: 'Notification deliveries by channel and status',
    labelNames: ['channel', 'status'] as const,
    registers: [this.registry],
  });

  readonly queueDepth = new Gauge({
    name: 'bezzo_queue_depth',
    help: 'Pending work items per durable queue',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });

  readonly providerLatency = new Histogram({
    name: 'bezzo_external_provider_latency_seconds',
    help: 'Latency of external provider calls (payments, logistics, search, storage)',
    labelNames: ['provider', 'operation'] as const,
    buckets: HTTP_DURATION_BUCKETS,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'bezzo_' });
  }

  /** Time an external dependency call so degraded providers are visible before users complain. */
  async observeProvider<T>(provider: string, operation: string, fn: () => Promise<T>): Promise<T> {
    const startedAt = process.hrtime.bigint();
    try {
      const result = await fn();
      this.providerLatency.observe(
        { provider, operation },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
      );
      this.logistics.inc({ provider, outcome: 'success' });
      return result;
    } catch (error) {
      this.providerLatency.observe(
        { provider, operation },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
      );
      this.logistics.inc({ provider, outcome: 'failure' });
      throw error;
    }
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}

@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}

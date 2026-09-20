/**
 * Transactional outbox + in-process event bus (event-driven architecture spec §7, jobs/queues spec).
 *
 * Guarantees:
 *  - `emit()` writes the event to `domain_events` INSIDE the caller's transaction. If the business
 *    write rolls back, the event disappears with it — no phantom events and no lost events.
 *  - The dispatcher leases a batch (`FOR UPDATE SKIP LOCKED` + attempt counter + lease window), so
 *    several API instances can dispatch concurrently without double-claiming, and a crashed worker's
 *    batch is retried once its lease elapses (at-least-once delivery).
 *  - Failures retry with exponential backoff and are dead-lettered after WORKER_MAX_ATTEMPTS.
 *  - Handlers must be idempotent: they may run more than once for the same event.
 *
 * The outbox row is also the correlation spine of the platform: order/fulfillment/pickup/package/
 * hub-receiving/payment/delivery identifiers are stored as first-class columns, which is what lets a
 * single order journey be reconstructed across all five physical stages (spec §33 observability).
 */
import { Inject, Injectable, Module, Global } from '@nestjs/common';
import type { DomainEventEnvelope, DomainEventName, EventCorrelation } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import type { QueryResult, QueryResultRow } from 'pg';
import { DATABASE } from '../database/database.module';
import { InjectLogger, BEZZO_LOGGER, type BezzoLogger } from '../logger/logger.module';
import {
  currentActor,
  currentRequestId,
  createRequestContext,
  runWithCorrelation,
} from '../../common/context/request-context';

/**
 * Anything that can run a query: the shared pool or a transaction-scoped client.
 *
 * Declared as an explicit call signature rather than a union of `Pick<...>` types, because a union of
 * two generic method types is not callable in TypeScript. Both `Database` and `PoolClient` satisfy
 * this shape structurally.
 */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export interface EmitEventInput<TPayload = Record<string, unknown>> {
  eventName: DomainEventName | string;
  eventVersion?: number;
  aggregateType: string;
  aggregateId: string;
  payload?: TPayload;
  correlation?: EventCorrelation;
}

export type EventHandler<TPayload = Record<string, unknown>> = (
  envelope: DomainEventEnvelope<TPayload>,
) => Promise<void>;

interface RegisteredHandler {
  eventName: string;
  handler: EventHandler;
  description: string;
}

/** Lease duration for a claimed batch: a crashed worker's batch becomes eligible again after this. */
const CLAIM_LEASE_SECONDS = 60;

function isTransactionClient(queryable: Queryable): boolean {
  return typeof (queryable as { release?: unknown }).release === 'function';
}

@Injectable()
export class EventBusService {
  private readonly handlers = new Map<string, RegisteredHandler[]>();

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    @InjectLogger() private readonly logger: BezzoLogger,
  ) {}

  /**
   * Persist a domain event in the caller's transaction.
   * Always pass the transaction client when the event describes a business change.
   */
  async emit<TPayload extends Record<string, unknown>>(
    queryable: Queryable,
    input: EmitEventInput<TPayload>,
  ): Promise<string> {
    const correlation: EventCorrelation = {
      requestId: currentRequestId() ?? null,
      ...(input.correlation ?? {}),
    };
    const actor = currentActor();
    const payload = (input.payload ?? {}) as Record<string, unknown>;

    const result = await queryable.query<{ id: string }>(
      `INSERT INTO domain_events
         (event_name, event_version, aggregate_type, aggregate_id, actor_type, actor_id,
          order_id, fulfillment_id, pickup_task_id, pickup_run_id, package_id, hub_receiving_id,
          payment_id, delivery_id, request_id, correlation_id, payload, publish_status, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::JSONB,'PENDING', now())
       RETURNING id`,
      [
        input.eventName,
        input.eventVersion ?? 1,
        input.aggregateType,
        input.aggregateId,
        actor ? 'USER' : 'SYSTEM',
        actor?.userId ?? null,
        correlation.orderId ?? null,
        correlation.fulfillmentId ?? null,
        correlation.pickupTaskId ?? null,
        correlation.pickupRunId ?? null,
        correlation.packageId ?? null,
        correlation.hubReceivingId ?? null,
        correlation.paymentId ?? null,
        correlation.deliveryId ?? null,
        correlation.requestId ?? null,
        correlation.orderId ?? null,
        JSON.stringify(payload),
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to persist domain event');
    void isTransactionClient;
    return id;
  }

  /**
   * Emit an event outside any business transaction (used by infrastructure-level notifications).
   * Business flows must use the transactional `emit()` above.
   */
  async emitStandalone<TPayload extends Record<string, unknown>>(input: EmitEventInput<TPayload>): Promise<string> {
    return this.emit(this.database, input);
  }

  /** Register a handler for an event name. Handlers must be idempotent. */
  register(eventName: DomainEventName | string, handler: EventHandler, description = ''): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push({ eventName, handler, description });
    this.handlers.set(eventName, list);
  }

  registeredEventNames(): string[] {
    return [...this.handlers.keys()].sort();
  }

  /** Dispatch a single outbox row to its handlers. Never throws: failures are recorded. */
  async dispatch(row: OutboxRow): Promise<{ handled: number; failed: number; error?: string }> {
    const handlers = this.handlers.get(row.event_name) ?? [];
    if (handlers.length === 0) {
      return { handled: 0, failed: 0 };
    }
    const correlation = outboxCorrelation(row);
    const envelope: DomainEventEnvelope = {
      eventId: row.id,
      eventName: row.event_name,
      eventVersion: row.event_version,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      correlation,
      actor: { type: row.actor_type, id: row.actor_id },
      payload: row.payload ?? {},
      occurredAt: row.occurred_at.toISOString(),
    };

    let handled = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const registration of handlers) {
      try {
        // Run inside a context carrying the original correlation so logs/audit/child events stay linked.
        await runWithCorrelation(correlation, async () => registration.handler(envelope), () =>
          createRequestContext({ correlationId: row.correlation_id ?? undefined }),
        );
        handled += 1;
      } catch (error) {
        failed += 1;
        errors.push(`${registration.description || 'handler'}: ${(error as Error).message}`);
        this.logger.errorWith(
          {
            eventId: row.id,
            eventName: row.event_name,
            description: registration.description,
            error: (error as Error).message,
          },
          'domain event handler failed',
        );
      }
    }

    return { handled, failed, ...(errors.length > 0 ? { error: errors.join('; ').slice(0, 2000) } : {}) };
  }

  /**
   * Lease and dispatch a batch of pending events.
   *
   * The lease increments `publish_attempts` and pushes `next_attempt_at` forward, so a worker that
   * dies mid-batch does not block the queue: the rows become eligible again after the lease elapses.
   */
  async dispatchPending(batchSize: number, maxAttempts: number): Promise<{ processed: number; failed: number }> {
    const claimed = await this.claimBatch(batchSize, maxAttempts);
    let processed = 0;
    let failed = 0;

    for (const row of claimed) {
      const outcome = await this.dispatch(row);
      if (outcome.failed === 0) {
        await this.database.query(
          `UPDATE domain_events
              SET publish_status = 'PUBLISHED', published_at = now(), last_error = NULL
            WHERE id = $1`,
          [row.id],
        );
        processed += 1;
      } else {
        failed += 1;
        const exhausted = row.publish_attempts >= maxAttempts;
        const backoffSeconds = Math.min(2 ** row.publish_attempts * 5, 3600);
        await this.database.query(
          `UPDATE domain_events
              SET publish_status = $2, last_error = $3,
                  next_attempt_at = now() + ($4 || ' seconds')::INTERVAL
            WHERE id = $1`,
          [row.id, exhausted ? 'DEAD_LETTER' : 'FAILED', outcome.error ?? 'handler error', String(backoffSeconds)],
        );
      }
    }

    return { processed, failed };
  }

  /** Atomically lease a batch for dispatch, then commit the lease before doing any handler work. */
  private async claimBatch(batchSize: number, maxAttempts: number): Promise<OutboxRow[]> {
    return this.database.transaction(async (client) => {
      const result = await client.query<OutboxRow>(
        `SELECT id, event_name, event_version, aggregate_type, aggregate_id, payload,
                actor_type, actor_id, request_id, correlation_id,
                order_id, fulfillment_id, pickup_task_id, pickup_run_id, package_id, hub_receiving_id,
                payment_id, delivery_id, publish_attempts, occurred_at
           FROM domain_events
          WHERE publish_status IN ('PENDING','FAILED')
            AND publish_attempts < $2
            AND next_attempt_at <= now()
          ORDER BY occurred_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [batchSize, maxAttempts],
      );
      if (result.rows.length > 0) {
        await client.query(
          `UPDATE domain_events
              SET publish_attempts = publish_attempts + 1,
                  next_attempt_at = now() + ($2 || ' seconds')::INTERVAL
            WHERE id = ANY($1::UUID[])`,
          [result.rows.map((row) => row.id), String(CLAIM_LEASE_SECONDS)],
        );
      }
      return result.rows.map((row) => ({ ...row, publish_attempts: row.publish_attempts + 1 }));
    });
  }

  /** Observability: outbox depth by publish status (surfaced on /metrics and the ops dashboard). */
  async backlog(): Promise<Record<string, number>> {
    const rows = await this.database.rows<{ publish_status: string; count: string }>(
      `SELECT publish_status, count(*)::TEXT AS count FROM domain_events GROUP BY publish_status`,
    );
    return Object.fromEntries(rows.map((row) => [row.publish_status, Number(row.count)]));
  }

  /** Dead-letter inspection for operations. */
  async deadLetters(limit = 50) {
    const rows = await this.database.rows<{
      id: string;
      event_name: string;
      aggregate_type: string;
      aggregate_id: string;
      publish_attempts: number;
      last_error: string | null;
      occurred_at: Date;
    }>(
      `SELECT id, event_name, aggregate_type, aggregate_id, publish_attempts, last_error, occurred_at
         FROM domain_events WHERE publish_status = 'DEAD_LETTER'
        ORDER BY occurred_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: row.id,
      eventName: row.event_name,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      attempts: row.publish_attempts,
      lastError: row.last_error,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }
}

export interface OutboxRow {
  id: string;
  event_name: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown> | null;
  actor_type: string;
  actor_id: string | null;
  request_id: string | null;
  correlation_id: string | null;
  order_id: string | null;
  fulfillment_id: string | null;
  pickup_task_id: string | null;
  pickup_run_id: string | null;
  package_id: string | null;
  hub_receiving_id: string | null;
  payment_id: string | null;
  delivery_id: string | null;
  publish_attempts: number;
  occurred_at: Date;
}

export function outboxCorrelation(row: OutboxRow): EventCorrelation {
  return {
    requestId: row.request_id,
    orderId: row.order_id,
    fulfillmentId: row.fulfillment_id,
    pickupTaskId: row.pickup_task_id,
    pickupRunId: row.pickup_run_id,
    packageId: row.package_id,
    hubReceivingId: row.hub_receiving_id,
    paymentId: row.payment_id,
    deliveryId: row.delivery_id,
  };
}

@Global()
@Module({
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}

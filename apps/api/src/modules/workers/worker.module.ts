/**
 * Background worker registration.
 *
 * BEZZO runs durable work through the transactional outbox plus database-backed queues, so a single
 * worker loop (guarded by `WORKER_ENABLED` and per-job advisory locks) is sufficient at launch and
 * horizontally safe: every job is idempotent and lock-guarded. When the platform grows, the same job
 * definitions can be lifted onto a dedicated worker deployment without changing handlers.
 *
 * Jobs registered here (Phase 1–3 scope):
 *  - outbox.dispatch            — deliver domain events to registered handlers (retry + DLQ)
 *  - notifications.dispatch     — send queued push/SMS/email/in-app notifications
 *  - search.index               — project queued `search_index_jobs` rows into OpenSearch
 *  - idempotency.purge          — delete expired idempotency records
 *  - reservations.expire        — release inventory reservations whose TTL elapsed
 *
 * Picker/delivery/payment jobs (offer expiry, run assignment, PORTER reconciliation, settlement
 * generation) are registered by their own modules when those phases ship.
 */
import { Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '@bezzo/config';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DATABASE } from '../../infrastructure/database/database.module';
import { SchedulerService } from '../../infrastructure/jobs/scheduler.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { IdempotencyService } from '../../infrastructure/idempotency/idempotency.service';
import { NotificationService } from '../../infrastructure/notifications/notification.service';
import { SearchService } from '../../infrastructure/search/search.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import { InjectLogger, BEZZO_LOGGER, type BezzoLogger } from '../../infrastructure/logger/logger.module';

const OUTBOX_DISPATCH_INTERVAL_MS = 1_000;
const NOTIFICATION_DISPATCH_INTERVAL_MS = 5_000;
const SEARCH_INDEX_INTERVAL_MS = 15_000;
const IDEMPOTENCY_PURGE_INTERVAL_MS = 60 * 60 * 1_000;
const RESERVATION_EXPIRY_INTERVAL_MS = 30_000;

@Injectable()
export class WorkerJobs implements OnModuleInit {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly scheduler: SchedulerService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationService,
    private readonly search: SearchService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    @InjectLogger() private readonly logger: BezzoLogger,
  ) {}

  onModuleInit(): void {
    if (!this.config.WORKER_ENABLED) {
      this.logger.warnWith({}, 'WORKER_ENABLED=false — background jobs are not registered on this instance');
      return;
    }

    this.scheduler.register({
      name: 'outbox.dispatch',
      intervalMs: OUTBOX_DISPATCH_INTERVAL_MS,
      lockKey: 0x0b2_0001,
      runOnStart: true,
      handler: async () => {
        const result = await this.events.dispatchPending(
          this.config.WORKER_BATCH_SIZE,
          this.config.WORKER_MAX_ATTEMPTS,
        );
        return { itemsProcessed: result.processed, itemsFailed: result.failed };
      },
    });

    this.scheduler.register({
      name: 'notifications.dispatch',
      intervalMs: NOTIFICATION_DISPATCH_INTERVAL_MS,
      lockKey: 0x0b2_0002,
      handler: async () => {
        const result = await this.notifications.dispatchDue(this.config.WORKER_BATCH_SIZE, this.config.WORKER_MAX_ATTEMPTS);
        return { itemsProcessed: result.sent, itemsFailed: result.failed };
      },
    });

    this.scheduler.register({
      name: 'search.index',
      intervalMs: SEARCH_INDEX_INTERVAL_MS,
      lockKey: 0x0b2_0003,
      handler: async () => this.indexQueuedDocuments(),
    });

    this.scheduler.register({
      name: 'idempotency.purge',
      intervalMs: IDEMPOTENCY_PURGE_INTERVAL_MS,
      lockKey: 0x0b2_0004,
      handler: async () => {
        const purged = await this.idempotency.purgeExpired();
        return { itemsProcessed: purged };
      },
    });

    this.scheduler.register({
      name: 'reservations.expire',
      intervalMs: RESERVATION_EXPIRY_INTERVAL_MS,
      lockKey: 0x0b2_0005,
      handler: async () => {
        const released = await this.releaseExpiredReservations();
        return { itemsProcessed: released };
      },
    });

    // Timers are only armed after every job has been registered, otherwise a job registered later
    // would be scheduled twice (once by registration, once by start).
    this.scheduler.start();

    this.logger.info(
      { jobs: this.scheduler.registeredJobs() },
      'BEZZO background jobs registered',
    );
  }

  /**
   * Expire inventory reservations whose TTL elapsed and return the stock to the available pool.
   * Each release is a conditional UPDATE, so a concurrent confirmation and expiry can never both win.
   */
  private async releaseExpiredReservations(): Promise<number> {
    const expired = await this.database.rows<{ id: string; inventory_id: string; quantity: number }>(
      `SELECT id, inventory_id, quantity FROM inventory_reservations
        WHERE status = 'ACTIVE' AND expires_at <= now()
        ORDER BY expires_at
        LIMIT $1`,
      [this.config.WORKER_BATCH_SIZE],
    );
    let released = 0;
    for (const reservation of expired) {
      const outcome = await this.database.transaction(async (client) => {
        const claimed = await client.query(
          `UPDATE inventory_reservations
              SET status = 'EXPIRED', released_at = now(), release_reason = 'RESERVATION_TTL_ELAPSED'
            WHERE id = $1 AND status = 'ACTIVE'`,
          [reservation.id],
        );
        if ((claimed.rowCount ?? 0) === 0) return false;

        const updated = await client.query<{ available_quantity: number; reserved_quantity: number }>(
          `UPDATE inventories
              SET reserved_quantity = reserved_quantity - $3,
                  version = version + 1,
                  status = CASE
                    WHEN status IN ('QUARANTINED','BLOCKED','RECALLED','EXPIRED','DEPLETED') THEN status
                    WHEN status = 'OUT_OF_STOCK' THEN 'AVAILABLE'
                    ELSE status
                  END
            WHERE id = $1 AND reserved_quantity >= $3
            RETURNING available_quantity, reserved_quantity`,
          [reservation.inventory_id, reservation.id, reservation.quantity],
        );
        const row = updated.rows[0];
        if (!row) throw new Error(`Reservation ${reservation.id} could not be released: reserved_quantity invariant`);

        await this.events.emit(client, {
          eventName: 'InventoryReservationExpired',
          aggregateType: 'inventory_reservation',
          aggregateId: reservation.id,
          payload: { inventoryId: reservation.inventory_id, quantity: reservation.quantity },
        });
        await this.audit.record(client, {
          action: 'inventory.reservation_expired',
          resourceType: 'inventory_reservation',
          resourceId: reservation.id,
          metadata: { quantity: reservation.quantity },
        });
        return true;
      });
      if (outcome) {
        released += 1;
        this.metrics.inventoryReservations.inc({ result: 'expired' });
      }
    }
    return released;
  }

  /** Projects queued product documents into the search index, with retry backoff. */
  private async indexQueuedDocuments(): Promise<{ itemsProcessed: number; itemsFailed: number }> {
    if (!this.search.status().available) {
      return { itemsProcessed: 0, itemsFailed: 0 };
    }
    const jobs = await this.database.rows<{ id: string; entity_type: string; entity_id: string; operation: string; attempts: number }>(
      `SELECT id, entity_type, entity_id, operation, attempts
         FROM search_index_jobs
        WHERE status IN ('PENDING','FAILED') AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT $1`,
      [this.config.WORKER_BATCH_SIZE],
    );

    let processed = 0;
    let failed = 0;
    for (const job of jobs) {
      await this.database.query(`UPDATE search_index_jobs SET status = 'PROCESSING' WHERE id = $1`, [job.id]);
      try {
        if (job.operation === 'DELETE') {
          await this.search.removeProduct(job.entity_id);
        } else {
          const document = await this.buildSearchDocument(job.entity_id);
          if (document) await this.search.indexProduct(document);
        }
        await this.database.query(
          `UPDATE search_index_jobs SET status = 'DONE', processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1`,
          [job.id],
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        const attempts = job.attempts + 1;
        const exhausted = attempts >= this.config.WORKER_MAX_ATTEMPTS;
        const backoffSeconds = Math.min(2 ** attempts * 5, 3600);
        await this.database.query(
          `UPDATE search_index_jobs
              SET status = $2, attempts = attempts + 1, last_error = $3,
                  next_attempt_at = now() + ($4 || ' seconds')::INTERVAL
            WHERE id = $1`,
          [job.id, exhausted ? 'FAILED' : 'PENDING', (error as Error).message.slice(0, 500), String(backoffSeconds)],
        );
      }
    }
    return { itemsProcessed: processed, itemsFailed: failed };
  }

  private async buildSearchDocument(productId: string) {
    const row = await this.database.row<{
      id: string;
      name: string;
      generic_name: string | null;
      brand_name: string | null;
      manufacturer_name: string | null;
      category_id: string;
      dosage_form: string | null;
      strength: string | null;
      pack_size: string | null;
      prescription_classification: string;
      status: string;
      updated_at: Date;
      composition: string[] | null;
      supplier_ids: string[] | null;
      min_price: string | null;
      max_price: string | null;
      sellable_quantity: string | null;
    }>(
      `SELECT p.id, p.name, p.generic_name, p.brand_name, m.name AS manufacturer_name, p.category_id,
              df.code AS dosage_form, p.strength, p.pack_size, p.prescription_classification, p.status, p.updated_at,
              (SELECT array_agg(pc.name ORDER BY pc.sequence) FROM product_compositions pc WHERE pc.product_id = p.id) AS composition,
              agg.supplier_ids, agg.min_price, agg.max_price, agg.sellable_quantity
         FROM products p
         LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
         LEFT JOIN (
           SELECT l.product_id, array_agg(DISTINCT l.supplier_id::TEXT) AS supplier_ids,
                  min(l.selling_price)::TEXT AS min_price, max(l.selling_price)::TEXT AS max_price,
                  COALESCE(sum(i.available_quantity - i.reserved_quantity), 0)::TEXT AS sellable_quantity
             FROM supplier_product_listings l
             LEFT JOIN inventories i ON i.supplier_listing_id = l.id AND i.status IN ('AVAILABLE','LOW_STOCK')
            WHERE l.status = 'ACTIVE'
            GROUP BY l.product_id
         ) agg ON agg.product_id = p.id
        WHERE p.id = $1`,
      [productId],
    );
    if (!row) return null;
    return {
      productId: row.id,
      name: row.name,
      genericName: row.generic_name,
      brandName: row.brand_name,
      manufacturerName: row.manufacturer_name,
      categoryId: row.category_id,
      categorySlug: null,
      dosageForm: row.dosage_form,
      strength: row.strength,
      packSize: row.pack_size,
      composition: row.composition ?? [],
      prescriptionClassification: row.prescription_classification,
      status: row.status,
      supplierIds: row.supplier_ids ?? [],
      minPrice: row.min_price ? Number(row.min_price) : null,
      maxPrice: row.max_price ? Number(row.max_price) : null,
      inStock: Number(row.sellable_quantity ?? 0) > 0,
      sellableQuantity: Number(row.sellable_quantity ?? 0),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

@Module({
  providers: [WorkerJobs],
})
export class WorkerModule {}

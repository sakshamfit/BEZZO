import { Inject, Injectable } from '@nestjs/common';
import {
  DomainEventName,
  ErrorCode,
  PackageStatus,
  PICKUP_TASK_STATUS_TRANSITIONS,
  Permission,
  PickupTaskStatus,
} from '@bezzo/contracts';
import type { Database as DatabaseType } from '@bezzo/database';
import type { QueryResult, QueryResultRow } from 'pg';
import { DATABASE } from '../../infrastructure/database/database.module';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { currentRequestId } from '../../common/context/request-context';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { NotificationService } from '../../infrastructure/notifications/notification.service';
import type {
  CompletePickupInput,
  PickerHeartbeatInput,
  PickerLocationInput,
  ScanPackageInput,
} from './picker.schemas';

interface PickupTaskRow {
  id: string;
  task_code: string;
  status: string;
  priority: string;
  supplier_id: string;
  supplier_name: string;
  locality: string | null;
  pickup_address: string | null;
  contact_phone: string | null;
  hub_id: string | null;
  hub_code: string | null;
  hub_name: string | null;
  pickup_window_start: Date | null;
  pickup_window_end: Date | null;
  order_count: number;
  package_count: number;
  assigned_picker_id: string | null;
  created_at: Date;
}

interface PickerQueryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

interface PackageSummaryRow {
  id: string;
  package_code: string;
  status: string;
  collected_at: Date | null;
  expected_hub_id: string | null;
}

@Injectable()
export class PickerService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly notifications: NotificationService,
  ) {}

  /** Expire timed-out offers and fan out the next ranked offers. The worker holds a DB advisory lock. */
  async dispatchOffers(limit = 50): Promise<{ tasksProcessed: number; offersCreated: number }> {
    return this.database.transaction(async (client) => {
      await client.query(
        `UPDATE pickup_offers SET outcome = 'EXPIRED', responded_at = now(), updated_at = now()
          WHERE outcome = 'PENDING' AND expires_at <= now()`,
      );
      await client.query(
        `UPDATE pickers p SET status = 'AVAILABLE', updated_at = now()
          WHERE p.status = 'OFFERED' AND p.last_heartbeat_at >= now() - ($1 || ' seconds')::INTERVAL
            AND NOT EXISTS (SELECT 1 FROM pickup_offers po WHERE po.picker_id = p.id AND po.outcome = 'PENDING' AND po.expires_at > now())
            AND NOT EXISTS (SELECT 1 FROM pickup_tasks pt WHERE pt.assigned_picker_id = p.id
                             AND pt.status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDOVER_EXCEPTION'))`,
        [this.config.PICKER_HEARTBEAT_STALE_SECONDS],
      );
      await client.query(
        `UPDATE pickup_tasks pt SET status = 'EXPIRED', updated_at = now()
          WHERE pt.status = 'OFFERED' AND pt.offer_expires_at <= now()
            AND NOT EXISTS (SELECT 1 FROM pickup_offers po WHERE po.pickup_task_id = pt.id
                              AND po.outcome = 'PENDING' AND po.expires_at > now())`,
      );

      const tasks = await client.query<{ id: string; task_code: string; status: string; priority: string; package_count: number; hub_id: string; supplier_id: string }>(
        `SELECT pt.id, pt.task_code, pt.status, pt.priority, pt.package_count, pt.hub_id, pt.supplier_id
           FROM pickup_tasks pt JOIN suppliers s ON s.id = pt.supplier_id
          WHERE pt.status IN ('CREATED','EXPIRED','REJECTED') AND pt.assigned_picker_id IS NULL
            AND pt.hub_id IS NOT NULL AND s.pickup_latitude IS NOT NULL AND s.pickup_longitude IS NOT NULL
            AND (pt.pickup_window_start IS NULL OR pt.pickup_window_start <= now() + interval '30 minutes')
            AND EXISTS (SELECT 1 FROM pickup_task_orders pto WHERE pto.pickup_task_id = pt.id AND pto.status = 'ACTIVE')
          ORDER BY CASE pt.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
                   pt.pickup_window_end NULLS LAST, pt.created_at
          LIMIT $1`,
        [limit],
      );
      let offersCreated = 0;
      for (const task of tasks.rows) {
        const existing = await client.query<{ count: number }>(
          `SELECT count(*)::INT AS count FROM pickup_offers WHERE pickup_task_id = $1 AND outcome = 'PENDING' AND expires_at > now()`,
          [task.id],
        );
        if ((existing.rows[0]?.count ?? 0) > 0) continue;

        const matchCount = this.config.PICKER_ALLOW_PARALLEL_OFFERS && ['URGENT', 'HIGH'].includes(task.priority)
          ? Math.max(1, this.config.PICKER_PARALLEL_OFFER_COUNT) : 1;
        const candidates = await client.query<{ id: string; user_id: string; distance_km: number }>(
          `SELECT p.id, p.user_id, bezzo_haversine_km(p.current_latitude, p.current_longitude,
                    s.pickup_latitude, s.pickup_longitude)::FLOAT8 AS distance_km
             FROM pickers p JOIN suppliers s ON s.id = $2
            WHERE p.status = 'AVAILABLE' AND p.home_hub_id = $3
              AND p.last_heartbeat_at >= now() - ($4 || ' seconds')::INTERVAL
              AND p.capacity_packages >= $5 AND p.current_latitude IS NOT NULL AND p.current_longitude IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM pickup_tasks active WHERE active.assigned_picker_id = p.id
                               AND active.status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDOVER_EXCEPTION'))
              AND NOT EXISTS (SELECT 1 FROM pickup_offers po WHERE po.pickup_task_id = $1 AND po.picker_id = p.id
                               AND po.outcome = 'PENDING' AND po.expires_at > now())
              AND NOT EXISTS (SELECT 1 FROM pickup_offers po WHERE po.picker_id = p.id
                               AND po.outcome = 'PENDING' AND po.expires_at > now())
              AND bezzo_haversine_km(p.current_latitude, p.current_longitude, s.pickup_latitude, s.pickup_longitude) <= $6
            ORDER BY distance_km ASC, p.last_heartbeat_at DESC
            LIMIT $7 FOR UPDATE OF p SKIP LOCKED`,
          [task.id, task.supplier_id, task.hub_id, this.config.PICKER_HEARTBEAT_STALE_SECONDS,
            task.package_count, this.config.PICKER_ASSIGNMENT_RADIUS_KM, matchCount],
        );
        if (candidates.rows.length === 0) continue;

        const expiresAtSeconds = Math.max(5, this.config.PICKER_OFFER_TIMEOUT_SECONDS);
        const offered = await client.query(
          `UPDATE pickup_tasks SET status = 'OFFERED', offered_at = now(), last_offered_at = now(),
                  offer_expires_at = now() + ($2 || ' seconds')::INTERVAL,
                  offer_count = offer_count + $3, updated_at = now()
            WHERE id = $1 AND status IN ('CREATED','EXPIRED','REJECTED') AND assigned_picker_id IS NULL`,
          [task.id, expiresAtSeconds, candidates.rows.length],
        );
        if ((offered.rowCount ?? 0) === 0) continue;
        for (let index = 0; index < candidates.rows.length; index += 1) {
          const picker = candidates.rows[index]!;
          const minutes = Math.max(1, Math.ceil((picker.distance_km / 20) * 60));
          await client.query(
            `INSERT INTO pickup_offers (pickup_task_id, picker_id, distance_km, estimated_travel_minutes, score, rank, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,now() + ($7 || ' seconds')::INTERVAL)`,
            [task.id, picker.id, picker.distance_km, minutes, (100 - picker.distance_km) - index, index + 1, expiresAtSeconds],
          );
          await client.query(`UPDATE pickers SET status = 'OFFERED', updated_at = now() WHERE id = $1 AND status = 'AVAILABLE'`, [picker.id]);
          await this.notifications.queue(client, {
            userId: picker.user_id,
            type: 'picker.task_offer',
            title: `Pickup ${task.task_code} available`,
            body: `${task.package_count} packages · ${picker.distance_km.toFixed(1)} km away. Accept before the offer expires.`,
            channels: ['IN_APP'],
            referenceType: 'pickup_task',
            referenceId: task.id,
            payload: { taskId: task.id, taskCode: task.task_code, expiresInSeconds: expiresAtSeconds },
          });
        }
        await this.events.emit(client, {
          eventName: 'PickupTaskOffered', aggregateType: 'pickup_task', aggregateId: task.id,
          payload: { taskId: task.id, taskCode: task.task_code, pickerIds: candidates.rows.map(({ id }) => id), expiresInSeconds: expiresAtSeconds },
        });
        await this.audit.record(client, {
          action: 'picker.task_offered', resourceType: 'pickup_task', resourceId: task.id,
          metadata: { pickerIds: candidates.rows.map(({ id }) => id), expiresInSeconds: expiresAtSeconds },
        });
        offersCreated += candidates.rows.length;
      }
      return { tasksProcessed: tasks.rows.length, offersCreated };
    });
  }

  async heartbeat(actor: AuthenticatedActor, input: PickerHeartbeatInput) {
    const pickerId = this.requirePicker(actor);
    return this.database.transaction(async (client) => {
      const result = await client.query<{ status: string; suspended_reason: string | null }>(
        `SELECT status, suspended_reason FROM pickers WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [pickerId, actor.userId],
      );
      const picker = result.rows[0];
      if (!picker)
        throw DomainError.notFound(ErrorCode.PICKER_NOT_FOUND, 'Picker profile was not found');
      if (picker.status === 'SUSPENDED')
        throw DomainError.forbidden(ErrorCode.PICKER_SUSPENDED, 'Picker account is suspended');

      const active = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pickup_tasks WHERE assigned_picker_id = $1
          AND status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDOVER_EXCEPTION')) AS exists`,
        [pickerId],
      );
      const status = active.rows[0]?.exists ? 'BUSY' : (input.status ?? picker.status);
      const updated = await client.query<{ last_heartbeat_at: Date }>(
        `UPDATE pickers SET status = $2, current_latitude = coalesce($3, current_latitude),
             current_longitude = coalesce($4, current_longitude), last_heartbeat_at = now(), updated_at = now()
          WHERE id = $1 RETURNING last_heartbeat_at`,
        [pickerId, status, input.latitude ?? null, input.longitude ?? null],
      );
      await client.query(
        `UPDATE picker_availability SET ended_at = now() WHERE picker_id = $1 AND ended_at IS NULL`,
        [pickerId],
      );
      await client.query(
        `INSERT INTO picker_availability
           (picker_id, status, latitude, longitude, accuracy_meters, device_connectivity, app_version, last_heartbeat_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
        [
          pickerId,
          status,
          input.latitude ?? null,
          input.longitude ?? null,
          input.accuracyMeters ?? null,
          input.deviceConnectivity ?? 'ONLINE',
          input.appVersion ?? null,
        ],
      );
      return { status, serverTime: updated.rows[0]!.last_heartbeat_at.toISOString() };
    });
  }

  async arrive(actor: AuthenticatedActor, taskId: string, input: PickerLocationInput) {
    return this.transitionTask(
      actor,
      taskId,
      PickupTaskStatus.ARRIVED,
      DomainEventName.PickerArrivedAtSupplier,
      {
        timestampColumn: 'arrived_at',
        eventType: 'ARRIVED_AT_SUPPLIER',
        latitude: input.latitude,
        longitude: input.longitude,
      },
    );
  }

  async startCollection(actor: AuthenticatedActor, taskId: string) {
    return this.transitionTask(
      actor,
      taskId,
      PickupTaskStatus.COLLECTING,
      DomainEventName.PickupCollectionStarted,
      { timestampColumn: 'collection_started_at', eventType: 'COLLECTION_STARTED' },
    );
  }

  async listPackages(actor: AuthenticatedActor, taskId: string) {
    const pickerId = this.requirePicker(actor);
    const task = await this.database.row<{ id: string }>(
      `SELECT id FROM pickup_tasks WHERE id = $1 AND assigned_picker_id = $2`,
      [taskId, pickerId],
    );
    if (!task)
      throw DomainError.forbidden(
        ErrorCode.TASK_NOT_ASSIGNED_TO_PICKER,
        'Pickup is not assigned to this picker',
      );

    const rows = await this.database.rows<{
      id: string;
      package_code: string;
      status: string;
      collected_at: Date | null;
      received_at: Date | null;
      expected_hub_id: string | null;
    }>(
      `SELECT id, package_code, status, collected_at, received_at, expected_hub_id
         FROM pickup_packages WHERE pickup_task_id = $1 ORDER BY package_code`,
      [taskId],
    );
    const reconciliation = await this.reconcilePackages(this.database, taskId);
    return {
      items: rows.map((row) => ({
        id: row.id,
        packageCode: row.package_code,
        status: row.status,
        collectedAt: row.collected_at?.toISOString() ?? null,
        receivedAt: row.received_at?.toISOString() ?? null,
        expectedHubId: row.expected_hub_id,
      })),
      reconciliation,
    };
  }

  async scanPackage(actor: AuthenticatedActor, taskId: string, input: ScanPackageInput) {
    const pickerId = this.requirePicker(actor);
    return this.database.transaction(async (client) => {
      const taskResult = await client.query<{ status: string; assigned_picker_id: string | null }>(
        `SELECT status, assigned_picker_id FROM pickup_tasks WHERE id = $1 FOR UPDATE`,
        [taskId],
      );
      const task = taskResult.rows[0];
      if (!task) throw DomainError.notFound(ErrorCode.TASK_NOT_FOUND, 'Pickup task was not found');
      if (task.assigned_picker_id !== pickerId)
        throw DomainError.forbidden(
          ErrorCode.TASK_NOT_ASSIGNED_TO_PICKER,
          'Pickup is not assigned to this picker',
        );
      if (task.status !== PickupTaskStatus.COLLECTING)
        throw DomainError.conflict(
          ErrorCode.TASK_STATE_INVALID,
          'Start collection before scanning packages',
        );

      if (input.localEventId) {
        const prior = await client.query<{
          pickup_task_id: string | null;
          picker_id: string | null;
          package_id: string | null;
        }>(
          `SELECT pickup_task_id, picker_id, package_id FROM pickup_events WHERE local_event_id = $1`,
          [input.localEventId],
        );
        if (prior.rows[0]) {
          if (prior.rows[0].pickup_task_id !== taskId || prior.rows[0].picker_id !== pickerId)
            throw DomainError.conflict(
              ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
              'Local event id was already used for another operation',
            );
          const packageRow = prior.rows[0].package_id
            ? await client.query<{
                id: string;
                package_code: string;
                status: string;
                collected_at: Date | null;
                expected_hub_id: string | null;
              }>(
                `SELECT id, package_code, status, collected_at, expected_hub_id FROM pickup_packages WHERE id = $1`,
                [prior.rows[0].package_id],
              )
            : { rows: [] };
          return {
            accepted: Boolean(packageRow.rows[0]),
            result: packageRow.rows[0] ? 'ACCEPTED' : 'UNEXPECTED',
            package: packageRow.rows[0] ? this.packageSummary(packageRow.rows[0]) : null,
            reconciliation: await this.reconcilePackages(client, taskId),
            message: 'This offline scan was already recorded',
            idempotentReplay: true,
          };
        }
      }

      const packageResult = await client.query<{
        id: string;
        fulfillment_id: string;
        package_code: string;
        status: string;
        collected_at: Date | null;
        collected_by_picker_id: string | null;
        expected_hub_id: string | null;
      }>(
        `SELECT id, fulfillment_id, package_code, status, collected_at, collected_by_picker_id, expected_hub_id
           FROM pickup_packages WHERE package_code = $1 AND pickup_task_id = $2 FOR UPDATE`,
        [input.scanCode, taskId],
      );
      const packageRow = packageResult.rows[0];
      if (!packageRow) {
        const elsewhere = await client.query<{ id: string | null }>(
          `SELECT id FROM pickup_packages WHERE package_code = $1 LIMIT 1`,
          [input.scanCode],
        );
        const exceptionType = elsewhere.rows[0] ? 'WRONG_PACKAGE' : 'PACKAGE_UNEXPECTED';
        await client.query(
          `INSERT INTO pickup_exceptions (pickup_task_id, type, reason, reported_by, reported_by_type)
           VALUES ($1, $2, 'Scanned package is not expected on this pickup task', $3, 'PICKER')`,
          [taskId, exceptionType, actor.userId],
        );
        await client.query(
          `INSERT INTO pickup_events (pickup_task_id, picker_id, event_type, actor_type, actor_id, local_event_id,
             latitude, longitude, request_id, metadata)
           VALUES ($1, $2, 'PACKAGE_SCAN_UNEXPECTED', 'PICKER', $3, $4, $5, $6, $7, jsonb_build_object('scanCode', $8))`,
          [
            taskId,
            pickerId,
            actor.userId,
            input.localEventId ?? null,
            input.latitude ?? null,
            input.longitude ?? null,
            currentRequestId() ?? null,
            input.scanCode,
          ],
        );
        await this.audit.record(client, {
          action: 'picker.unexpected_package_scanned',
          resourceType: 'pickup_task',
          resourceId: taskId,
          actorUserId: actor.userId,
          metadata: { pickerId, exceptionType },
        });
        await this.events.emit(client, {
          eventName: DomainEventName.PickupExceptionCreated,
          aggregateType: 'pickup_task',
          aggregateId: taskId,
          payload: { taskId, pickerId, exceptionType },
        });
        return {
          accepted: false,
          result: 'UNEXPECTED',
          package: null,
          reconciliation: await this.reconcilePackages(client, taskId),
          message: 'Package is not expected on this pickup',
          idempotentReplay: false,
        };
      }

      if (packageRow.collected_at || packageRow.status !== PackageStatus.READY_FOR_PICKUP) {
        await client.query(
          `INSERT INTO pickup_events (pickup_task_id, package_id, picker_id, event_type, actor_type, actor_id,
             local_event_id, latitude, longitude, request_id, metadata)
           VALUES ($1, $2, $3, 'PACKAGE_SCAN_DUPLICATE', 'PICKER', $4, $5, $6, $7, $8, '{}'::JSONB)`,
          [
            taskId,
            packageRow.id,
            pickerId,
            actor.userId,
            input.localEventId ?? null,
            input.latitude ?? null,
            input.longitude ?? null,
            currentRequestId() ?? null,
          ],
        );
        return {
          accepted: false,
          result: 'DUPLICATE',
          package: this.packageSummary(packageRow),
          reconciliation: await this.reconcilePackages(client, taskId),
          message: 'Package was already collected or is not ready for pickup',
          idempotentReplay: false,
        };
      }

      const updated = await client.query<{
        id: string;
        package_code: string;
        status: string;
        collected_at: Date | null;
        expected_hub_id: string | null;
      }>(
        `UPDATE pickup_packages SET status = $3, collected_by_picker_id = $4, collected_at = now(), updated_at = now()
          WHERE id = $1 AND pickup_task_id = $2 AND status = $5 AND collected_at IS NULL
          RETURNING id, package_code, status, collected_at, expected_hub_id`,
        [
          packageRow.id,
          taskId,
          PackageStatus.PICKER_COLLECTED,
          pickerId,
          PackageStatus.READY_FOR_PICKUP,
        ],
      );
      const collected = updated.rows[0];
      if (!collected)
        throw DomainError.conflict(
          ErrorCode.PACKAGE_ALREADY_COLLECTED,
          'Package was already collected',
        );

      await client.query(
        `UPDATE pickup_task_orders SET package_count_collected = package_count_collected + 1, updated_at = now()
          WHERE pickup_task_id = $1 AND fulfillment_id = $2 AND status = 'ACTIVE'`,
        [taskId, packageRow.fulfillment_id],
      );
      await client.query(
        `INSERT INTO pickup_events (pickup_task_id, package_id, picker_id, event_type, actor_type, actor_id,
           local_event_id, latitude, longitude, request_id, metadata)
         VALUES ($1, $2, $3, 'PACKAGE_SCAN_ACCEPTED', 'PICKER', $4, $5, $6, $7, $8, jsonb_build_object('scanCode', $9))`,
        [
          taskId,
          collected.id,
          pickerId,
          actor.userId,
          input.localEventId ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          currentRequestId() ?? null,
          collected.package_code,
        ],
      );
      await this.audit.record(client, {
        action: 'picker.package_collected',
        resourceType: 'pickup_package',
        resourceId: collected.id,
        actorUserId: actor.userId,
        metadata: { pickerId, taskId, packageCode: collected.package_code },
      });
      await this.events.emit(client, {
        eventName: DomainEventName.PackageCollected,
        aggregateType: 'pickup_package',
        aggregateId: collected.id,
        payload: { taskId, packageId: collected.id, packageCode: collected.package_code, pickerId },
      });
      return {
        accepted: true,
        result: 'ACCEPTED',
        package: this.packageSummary(collected),
        reconciliation: await this.reconcilePackages(client, taskId),
        message: 'Package collected',
        idempotentReplay: false,
      };
    });
  }

  async completePickup(actor: AuthenticatedActor, taskId: string, input: CompletePickupInput) {
    const pickerId = this.requirePicker(actor);
    return this.database.transaction(async (client) => {
      const taskResult = await client.query<{
        task_code: string;
        status: string;
        assigned_picker_id: string | null;
        supplier_id: string;
        hub_id: string | null;
      }>(
        `SELECT task_code, status, assigned_picker_id, supplier_id, hub_id
           FROM pickup_tasks WHERE id = $1 FOR UPDATE`,
        [taskId],
      );
      const task = taskResult.rows[0];
      if (!task) throw DomainError.notFound(ErrorCode.TASK_NOT_FOUND, 'Pickup task was not found');
      if (task.assigned_picker_id !== pickerId)
        throw DomainError.forbidden(
          ErrorCode.TASK_NOT_ASSIGNED_TO_PICKER,
          'Pickup is not assigned to this picker',
        );
      if (task.status !== PickupTaskStatus.COLLECTING)
        throw DomainError.conflict(
          ErrorCode.TASK_STATE_INVALID,
          'Only an active collection can be completed',
        );

      const reconciliation = await this.reconcilePackages(client, taskId);
      if (reconciliation.expectedPackageCount === 0 || reconciliation.collectedPackageCount === 0)
        throw DomainError.conflict(
          ErrorCode.TASK_STATE_INVALID,
          'Scan at least one expected package before completing pickup',
        );

      const missing = await client.query<{
        id: string;
        package_code: string;
        fulfillment_id: string;
      }>(
        `SELECT p.id, p.package_code, p.fulfillment_id FROM pickup_packages p
           JOIN pickup_task_orders pto ON pto.pickup_task_id = p.pickup_task_id
             AND pto.fulfillment_id = p.fulfillment_id AND pto.status = 'ACTIVE'
          WHERE p.pickup_task_id = $1 AND p.status = 'READY_FOR_PICKUP' AND p.collected_at IS NULL
          ORDER BY p.package_code FOR UPDATE OF p`,
        [taskId],
      );
      const actualMissingCodes = missing.rows.map((row) => row.package_code).sort();
      if (input.missingPackageCodes) {
        const requested = [...new Set(input.missingPackageCodes)].sort();
        if (
          requested.length !== actualMissingCodes.length ||
          requested.some((code, index) => code !== actualMissingCodes[index])
        )
          throw DomainError.conflict(
            ErrorCode.PACKAGE_NOT_EXPECTED,
            'Missing package list does not match the unscanned packages',
          );
      }
      const isPartial = actualMissingCodes.length > 0;
      if (isPartial && !input.partialReason)
        throw DomainError.unprocessable(
          ErrorCode.PARTIAL_PICKUP_REASON_REQUIRED,
          'Explain why the supplier could not provide every package',
        );

      const collectedFulfillments = await client.query<{ id: string }>(
        `UPDATE fulfillments f SET status = 'COLLECTED', collected_at = now(), updated_at = now()
           FROM pickup_task_orders pto
          WHERE pto.pickup_task_id = $1 AND pto.status = 'ACTIVE' AND pto.fulfillment_id = f.id
            AND pto.package_count_collected = pto.package_count AND f.status = 'PICKUP_ASSIGNED'
          RETURNING f.id`,
        [taskId],
      );
      for (const fulfillment of collectedFulfillments.rows) {
        await client.query(
          `UPDATE fulfillment_items SET status = 'COLLECTED', updated_at = now() WHERE fulfillment_id = $1 AND status = 'PACKED'`,
          [fulfillment.id],
        );
        await client.query(
          `INSERT INTO fulfillment_status_history (fulfillment_id, from_status, to_status, reason, actor_type, actor_id, request_id)
           VALUES ($1, 'PICKUP_ASSIGNED', 'COLLECTED', $2, 'PICKER', $3, $4)`,
          [
            fulfillment.id,
            `Pickup task ${task.task_code} collected`,
            actor.userId,
            currentRequestId() ?? null,
          ],
        );
        await this.events.emit(client, {
          eventName: DomainEventName.FulfillmentCollected,
          aggregateType: 'fulfillment',
          aggregateId: fulfillment.id,
          payload: { fulfillmentId: fulfillment.id, pickupTaskId: taskId, pickerId },
        });
      }

      await client.query(
        `UPDATE pickup_packages SET status = 'PICKER_IN_TRANSIT', updated_at = now()
          WHERE pickup_task_id = $1 AND collected_at IS NOT NULL AND status = 'PICKER_COLLECTED'`,
        [taskId],
      );
      let followUpTask: { id: string; task_code: string } | null = null;
      if (isPartial) {
        await client.query(
          `UPDATE pickup_task_orders SET status = CASE WHEN package_count_collected = package_count THEN 'COLLECTED' ELSE 'PARTIAL' END,
             updated_at = now() WHERE pickup_task_id = $1 AND status = 'ACTIVE'`,
          [taskId],
        );
        const newTask = await client.query<{ id: string; task_code: string }>(
          `INSERT INTO pickup_tasks
             (task_code, supplier_id, hub_id, status, priority, pickup_window_start, pickup_window_end,
              order_count, package_count, partial_reason, supplier_explanation)
           SELECT bezzo_next_pickup_task_code(), supplier_id, hub_id, 'CREATED', 'HIGH', now(), now() + interval '2 hours',
                  (SELECT count(DISTINCT pto.order_id) FROM pickup_task_orders pto
                    JOIN pickup_packages p ON p.pickup_task_id = pto.pickup_task_id AND p.fulfillment_id = pto.fulfillment_id
                   WHERE pto.pickup_task_id = $1 AND pto.status = 'PARTIAL' AND p.status = 'READY_FOR_PICKUP'),
                  (SELECT count(*) FROM pickup_packages WHERE pickup_task_id = $1 AND status = 'READY_FOR_PICKUP'),
                  $2, $3
             FROM pickup_tasks WHERE id = $1
           RETURNING id, task_code`,
          [taskId, input.partialReason ?? null, input.supplierExplanation ?? null],
        );
        followUpTask = newTask.rows[0]!;
        await client.query(
          `INSERT INTO pickup_task_orders (pickup_task_id, order_id, fulfillment_id, package_count, status)
           SELECT $2, pto.order_id, pto.fulfillment_id, count(p.id), 'ACTIVE'
             FROM pickup_task_orders pto JOIN pickup_packages p
               ON p.pickup_task_id = pto.pickup_task_id AND p.fulfillment_id = pto.fulfillment_id
            WHERE pto.pickup_task_id = $1 AND pto.status = 'PARTIAL' AND p.status = 'READY_FOR_PICKUP'
            GROUP BY pto.order_id, pto.fulfillment_id`,
          [taskId, followUpTask.id],
        );
        await client.query(
          `UPDATE pickup_packages SET pickup_task_id = $2, expected_hub_id = coalesce(expected_hub_id, $3), updated_at = now()
            WHERE pickup_task_id = $1 AND status = 'READY_FOR_PICKUP'`,
          [taskId, followUpTask.id, task.hub_id],
        );
        await client.query(
          `INSERT INTO pickup_exceptions (pickup_task_id, package_id, type, reason, reported_by, reported_by_type)
           SELECT $1, id, 'PACKAGE_MISSING', $2, $3, 'PICKER' FROM pickup_packages WHERE pickup_task_id = $4`,
          [taskId, input.partialReason, actor.userId, followUpTask.id],
        );
        await this.events.emit(client, {
          eventName: DomainEventName.PickupTaskCreated,
          aggregateType: 'pickup_task',
          aggregateId: followUpTask.id,
          payload: {
            taskId: followUpTask.id,
            taskCode: followUpTask.task_code,
            supplierId: task.supplier_id,
            hubId: task.hub_id,
            packageCount: actualMissingCodes.length,
            followUpForTaskId: taskId,
          },
        });
      } else {
        await client.query(
          `UPDATE pickup_task_orders SET status = 'COLLECTED', updated_at = now() WHERE pickup_task_id = $1 AND status = 'ACTIVE'`,
          [taskId],
        );
      }

      const status = isPartial ? PickupTaskStatus.PARTIALLY_PICKED : PickupTaskStatus.PICKED_UP;
      const transitioned = await client.query(
        `UPDATE pickup_tasks SET status = $2, collected_at = now(), partial_reason = $3,
             supplier_explanation = $4, updated_at = now()
          WHERE id = $1 AND status = 'COLLECTING'`,
        [
          taskId,
          status,
          isPartial ? (input.partialReason ?? null) : null,
          input.supplierExplanation ?? null,
        ],
      );
      if ((transitioned.rowCount ?? 0) !== 1)
        throw DomainError.conflict(
          ErrorCode.TASK_STATE_INVALID,
          'Pickup status changed; refresh and try again',
        );
      await client.query(
        `INSERT INTO pickup_events (pickup_task_id, picker_id, event_type, actor_type, actor_id, request_id, metadata)
         VALUES ($1, $2, $3, 'PICKER', $4, $5, $6::JSONB)`,
        [
          taskId,
          pickerId,
          isPartial ? 'PICKUP_PARTIALLY_COMPLETED' : 'PICKUP_COMPLETED',
          actor.userId,
          currentRequestId() ?? null,
          JSON.stringify({
            expectedPackageCount: reconciliation.expectedPackageCount,
            collectedPackageCount: reconciliation.collectedPackageCount,
            missingPackageCodes: actualMissingCodes,
            supplierExplanation: input.supplierExplanation ?? null,
          }),
        ],
      );
      await this.events.emit(client, {
        eventName: isPartial
          ? DomainEventName.PickupPartiallyCompleted
          : DomainEventName.PickupCompleted,
        aggregateType: 'pickup_task',
        aggregateId: taskId,
        payload: {
          taskId,
          status,
          pickerId,
          followUpTaskId: followUpTask?.id ?? null,
          reconciliation,
        },
      });
      await this.audit.record(client, {
        action: isPartial ? 'picker.task_partially_completed' : 'picker.task_completed',
        resourceType: 'pickup_task',
        resourceId: taskId,
        actorUserId: actor.userId,
        metadata: {
          pickerId,
          followUpTaskId: followUpTask?.id ?? null,
          reconciliation,
          partialReason: input.partialReason ?? null,
        },
      });
      return {
        success: true,
        status,
        reconciliation,
        followUpTaskId: followUpTask?.id ?? null,
        followUpTaskCode: followUpTask?.task_code ?? null,
      };
    });
  }

  async listTasks(actor: AuthenticatedActor) {
    const pickerId = this.requirePicker(actor);
    const rows = await this.database.rows<PickupTaskRow>(
      `SELECT pt.id, pt.task_code, pt.status, pt.priority, pt.supplier_id,
              s.display_name AS supplier_name, s.locality, s.pickup_address, s.contact_phone,
              h.id AS hub_id, h.code AS hub_code, h.name AS hub_name,
              pt.pickup_window_start, pt.pickup_window_end, pt.order_count, pt.package_count,
              pt.assigned_picker_id, pt.created_at
         FROM pickup_tasks pt
         JOIN suppliers s ON s.id = pt.supplier_id
         LEFT JOIN collection_hubs h ON h.id = pt.hub_id
         JOIN pickers p ON p.id = $1
        WHERE (((pt.status = 'CREATED' OR (pt.status = 'OFFERED' AND EXISTS (
                  SELECT 1 FROM pickup_offers po WHERE po.pickup_task_id = pt.id AND po.picker_id = p.id
                    AND po.outcome = 'PENDING' AND po.expires_at > now()
                ))) AND pt.assigned_picker_id IS NULL
                AND p.status IN ('AVAILABLE','OFFERED') AND p.last_heartbeat_at > now() - ($2 || ' seconds')::INTERVAL
                AND pt.package_count <= p.capacity_packages AND pt.hub_id = p.home_hub_id)
           OR (pt.assigned_picker_id = $1 AND pt.status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDOVER_EXCEPTION'))
              )
        ORDER BY CASE WHEN pt.assigned_picker_id = $1 THEN 0 ELSE 1 END,
                 CASE pt.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
                 pt.pickup_window_end NULLS LAST, pt.created_at
        LIMIT 100`,
      [pickerId, this.config.PICKER_HEARTBEAT_STALE_SECONDS],
    );
    return { items: rows.map((row) => this.toSummary(row)) };
  }

  async acceptTask(actor: AuthenticatedActor, taskId: string) {
    const pickerId = this.requirePicker(actor);
    return this.database.transaction(async (client) => {
      const pickerResult = await client.query<{
        status: string;
        capacity_packages: number;
        last_heartbeat_at: Date | null;
      }>(
        `SELECT status, capacity_packages, last_heartbeat_at FROM pickers WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [pickerId, actor.userId],
      );
      const picker = pickerResult.rows[0];
      if (!picker)
        throw DomainError.notFound(ErrorCode.PICKER_NOT_FOUND, 'Picker profile was not found');
      const hasLiveOffer = picker.status === 'OFFERED' && (await client.query(
        `SELECT EXISTS (SELECT 1 FROM pickup_offers WHERE pickup_task_id = $1 AND picker_id = $2
          AND outcome = 'PENDING' AND expires_at > now()) AS exists`, [taskId, pickerId],
      )).rows[0]?.exists === true;
      if (
        (picker.status !== 'AVAILABLE' && !hasLiveOffer) ||
        !picker.last_heartbeat_at ||
        Date.now() - picker.last_heartbeat_at.getTime() > this.config.PICKER_HEARTBEAT_STALE_SECONDS * 1_000
      ) {
        throw DomainError.conflict(
          ErrorCode.PICKER_NOT_AVAILABLE,
          'Go online and send a fresh heartbeat before accepting a pickup',
        );
      }

      const active = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pickup_tasks WHERE assigned_picker_id = $1
          AND status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDOVER_EXCEPTION')) AS exists`,
        [pickerId],
      );
      if (active.rows[0]?.exists)
        throw DomainError.conflict(
          ErrorCode.PICKER_NOT_AVAILABLE,
          'Complete the active pickup before accepting another task',
        );

      const claim = await client.query<{ id: string; task_code: string }>(
        `UPDATE pickup_tasks pt
            SET status = 'ACCEPTED', assigned_picker_id = $2, accepted_at = now(), updated_at = now()
          WHERE pt.id = $1 AND pt.assigned_picker_id IS NULL
            AND (pt.status = 'CREATED' OR (pt.status = 'OFFERED' AND EXISTS (
              SELECT 1 FROM pickup_offers po WHERE po.pickup_task_id = pt.id AND po.picker_id = $2
                AND po.outcome = 'PENDING' AND po.expires_at > now()
            )))
            AND pt.package_count <= $3
          RETURNING pt.id, pt.task_code`,
        [taskId, pickerId, picker.capacity_packages],
      );
      const claimed = claim.rows[0];
      if (!claimed) {
        const exists = await client.query<{
          package_count: number;
          status: string;
          assigned_picker_id: string | null;
        }>(`SELECT package_count, status, assigned_picker_id FROM pickup_tasks WHERE id = $1`, [
          taskId,
        ]);
        if (!exists.rows[0])
          throw DomainError.notFound(ErrorCode.RESOURCE_NOT_FOUND, 'Pickup task was not found');
        if (exists.rows[0].package_count > picker.capacity_packages)
          throw DomainError.conflict(
            ErrorCode.PICKER_CAPACITY_EXCEEDED,
            'Pickup exceeds your package capacity',
          );
        throw DomainError.conflict(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Pickup was already claimed or is no longer available',
        );
      }

      const taskResult = await client.query<PickupTaskRow>(
        `SELECT pt.id, pt.task_code, pt.status, pt.priority, pt.supplier_id,
                s.display_name AS supplier_name, s.locality, s.pickup_address, s.contact_phone,
                h.id AS hub_id, h.code AS hub_code, h.name AS hub_name,
                pt.pickup_window_start, pt.pickup_window_end, pt.order_count, pt.package_count,
                pt.assigned_picker_id, pt.created_at
           FROM pickup_tasks pt JOIN suppliers s ON s.id = pt.supplier_id
           LEFT JOIN collection_hubs h ON h.id = pt.hub_id WHERE pt.id = $1`,
        [taskId],
      );
      const task = taskResult.rows[0]!;

      const linkedFulfillments = await client.query<{ id: string; status: string }>(
        `SELECT f.id, f.status FROM pickup_task_orders pto JOIN fulfillments f ON f.id = pto.fulfillment_id
          WHERE pto.pickup_task_id = $1 AND pto.status = 'ACTIVE' FOR UPDATE OF f`,
        [taskId],
      );
      const expectedFulfillments = linkedFulfillments.rows.length;
      if (expectedFulfillments === 0) {
        throw DomainError.conflict(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Pickup task has no active fulfillments',
        );
      }
      if (
        linkedFulfillments.rows.some(
          (fulfillment) => !['READY_FOR_PICKUP', 'PICKUP_ASSIGNED'].includes(fulfillment.status),
        )
      ) {
        throw DomainError.conflict(
          ErrorCode.INVALID_STATE_TRANSITION,
          'One or more fulfillments are no longer ready for pickup',
        );
      }
      const assignedFulfillments = await client.query<{ id: string }>(
        `UPDATE fulfillments f SET status = 'PICKUP_ASSIGNED', updated_at = now()
           FROM pickup_task_orders pto
          WHERE pto.pickup_task_id = $1 AND pto.status = 'ACTIVE' AND pto.fulfillment_id = f.id
            AND f.status IN ('READY_FOR_PICKUP','PICKUP_ASSIGNED')
          RETURNING f.id`,
        [taskId],
      );
      if (assignedFulfillments.rowCount !== expectedFulfillments) {
        throw DomainError.conflict(
          ErrorCode.INVALID_STATE_TRANSITION,
          'One or more fulfillments are no longer ready for pickup',
        );
      }
      for (const fulfillment of linkedFulfillments.rows) {
        if (fulfillment.status !== 'READY_FOR_PICKUP') continue;
        await client.query(
          `INSERT INTO fulfillment_status_history (fulfillment_id, from_status, to_status, reason, actor_type, actor_id, request_id)
           VALUES ($1, 'READY_FOR_PICKUP', 'PICKUP_ASSIGNED', $2, 'PICKER', $3, $4)`,
          [
            fulfillment.id,
            `Pickup task ${task.task_code} accepted`,
            actor.userId,
            currentRequestId() ?? null,
          ],
        );
      }

      await client.query(`UPDATE pickers SET status = 'BUSY', updated_at = now() WHERE id = $1`, [
        pickerId,
      ]);
      await client.query(
        `UPDATE picker_availability SET ended_at = now() WHERE picker_id = $1 AND ended_at IS NULL`,
        [pickerId],
      );
      await client.query(
        `INSERT INTO picker_availability (picker_id, status, device_connectivity, last_heartbeat_at)
         VALUES ($1, 'BUSY', 'ONLINE', now())`,
        [pickerId],
      );
      await client.query(
        `UPDATE pickup_offers SET outcome = 'ACCEPTED', responded_at = now(), updated_at = now()
          WHERE pickup_task_id = $1 AND picker_id = $2 AND outcome = 'PENDING'`,
        [taskId, pickerId],
      );
      await client.query(
        `UPDATE pickup_offers SET outcome = 'SUPERSEDED', responded_at = now(), updated_at = now()
          WHERE pickup_task_id = $1 AND outcome = 'PENDING'`,
        [taskId],
      );
      await client.query(
        `INSERT INTO pickup_events (pickup_task_id, picker_id, event_type, actor_type, actor_id, request_id, metadata)
         VALUES ($1, $2, 'TASK_ACCEPTED', 'PICKER', $3, $4, jsonb_build_object('taskCode', $5))`,
        [taskId, pickerId, actor.userId, currentRequestId() ?? null, task.task_code],
      );
      await this.events.emit(client, {
        eventName: DomainEventName.PickupTaskAccepted,
        aggregateType: 'pickup_task',
        aggregateId: taskId,
        payload: { taskId, taskCode: task.task_code, pickerId },
      });
      await this.audit.record(client, {
        action: 'picker.task_accepted',
        resourceType: 'pickup_task',
        resourceId: taskId,
        actorUserId: actor.userId,
        metadata: { pickerId, taskCode: task.task_code },
      });
      return { success: true, item: this.toSummary(task) };
    });
  }

  private requirePicker(actor: AuthenticatedActor): string {
    if (
      !actor.permissions.includes(Permission.PICKER_TASK_READ) &&
      !actor.permissions.includes(Permission.PICKER_TASK_EXECUTE)
    ) {
      throw DomainError.forbidden(ErrorCode.FORBIDDEN, 'Picker permission is required');
    }
    if (!actor.pickerId)
      throw DomainError.notFound(ErrorCode.PICKER_NOT_FOUND, 'Picker profile was not found');
    return actor.pickerId;
  }

  private async transitionTask(
    actor: AuthenticatedActor,
    taskId: string,
    nextStatus: PickupTaskStatus,
    eventName: string,
    options: {
      timestampColumn: 'arrived_at' | 'collection_started_at';
      eventType: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    const pickerId = this.requirePicker(actor);
    return this.database.transaction(async (client) => {
      const result = await client.query<{ status: string; assigned_picker_id: string | null }>(
        `SELECT status, assigned_picker_id FROM pickup_tasks WHERE id = $1 FOR UPDATE`,
        [taskId],
      );
      const task = result.rows[0];
      if (!task) throw DomainError.notFound(ErrorCode.TASK_NOT_FOUND, 'Pickup task was not found');
      if (task.assigned_picker_id !== pickerId)
        throw DomainError.forbidden(
          ErrorCode.TASK_NOT_ASSIGNED_TO_PICKER,
          'Pickup is not assigned to this picker',
        );
      const transitions = PICKUP_TASK_STATUS_TRANSITIONS[task.status as PickupTaskStatus] ?? [];
      if (!transitions.includes(nextStatus))
        throw DomainError.conflict(
          ErrorCode.TASK_STATE_INVALID,
          `Cannot move pickup from ${task.status} to ${nextStatus}`,
        );

      const updated = await client.query<{ status: string }>(
        `UPDATE pickup_tasks SET status = $2,
             arrived_at = CASE WHEN $2 = 'ARRIVED' THEN now() ELSE arrived_at END,
             collection_started_at = CASE WHEN $2 = 'COLLECTING' THEN now() ELSE collection_started_at END,
             updated_at = now()
          WHERE id = $1 AND assigned_picker_id = $3 AND status = $4 RETURNING status`,
        [taskId, nextStatus, pickerId, task.status],
      );
      if (!updated.rows[0])
        throw DomainError.conflict(
          ErrorCode.TASK_STATE_INVALID,
          'Pickup status changed; refresh and try again',
        );
      await client.query(
        `INSERT INTO pickup_events (pickup_task_id, picker_id, event_type, actor_type, actor_id,
           latitude, longitude, request_id, metadata)
         VALUES ($1, $2, $3, 'PICKER', $4, $5, $6, $7, '{}'::JSONB)`,
        [
          taskId,
          pickerId,
          options.eventType,
          actor.userId,
          options.latitude ?? null,
          options.longitude ?? null,
          currentRequestId() ?? null,
        ],
      );
      if (options.latitude !== undefined || options.longitude !== undefined) {
        await client.query(
          `UPDATE pickers SET current_latitude = coalesce($2, current_latitude),
             current_longitude = coalesce($3, current_longitude), last_heartbeat_at = now(), updated_at = now()
           WHERE id = $1`,
          [pickerId, options.latitude ?? null, options.longitude ?? null],
        );
      }
      await this.events.emit(client, {
        eventName,
        aggregateType: 'pickup_task',
        aggregateId: taskId,
        payload: { taskId, pickerId, status: nextStatus },
      });
      await this.audit.record(client, {
        action: options.eventType.toLowerCase(),
        resourceType: 'pickup_task',
        resourceId: taskId,
        actorUserId: actor.userId,
        metadata: { fromStatus: task.status, toStatus: nextStatus },
      });
      return { success: true, status: nextStatus };
    });
  }

  private packageSummary(row: PackageSummaryRow) {
    return {
      id: row.id,
      packageCode: row.package_code,
      status: row.status,
      collectedAt: row.collected_at?.toISOString() ?? null,
      expectedHubId: row.expected_hub_id,
    };
  }

  private async reconcilePackages(queryable: PickerQueryable, taskId: string) {
    const result = await queryable.query<{
      expected_count: number;
      scanned_count: number;
      collected_count: number;
      damaged_count: number;
      unexpected_count: number;
      missing_codes: string[];
      unexpected_codes: string[];
    }>(
      `SELECT
         coalesce((SELECT sum(package_count) FROM pickup_task_orders WHERE pickup_task_id = $1 AND status = 'ACTIVE'), 0)::INTEGER AS expected_count,
         (SELECT count(*) FROM pickup_events WHERE pickup_task_id = $1 AND event_type = 'PACKAGE_SCAN_ACCEPTED')::INTEGER AS scanned_count,
         (SELECT count(*) FROM pickup_packages WHERE pickup_task_id = $1 AND collected_at IS NOT NULL)::INTEGER AS collected_count,
         (SELECT count(*) FROM pickup_packages WHERE pickup_task_id = $1 AND status = 'DAMAGED')::INTEGER AS damaged_count,
         (SELECT count(*) FROM pickup_exceptions WHERE pickup_task_id = $1 AND type IN ('PACKAGE_UNEXPECTED','WRONG_PACKAGE'))::INTEGER AS unexpected_count,
         coalesce((SELECT array_agg(package_code ORDER BY package_code) FROM pickup_packages WHERE pickup_task_id = $1 AND status IN ('READY_FOR_PICKUP','MISSING')), ARRAY[]::TEXT[]) AS missing_codes,
         coalesce((SELECT array_agg(metadata->>'scanCode' ORDER BY occurred_at) FROM pickup_events WHERE pickup_task_id = $1 AND event_type = 'PACKAGE_SCAN_UNEXPECTED'), ARRAY[]::TEXT[]) AS unexpected_codes`,
      [taskId],
    );
    const row = result.rows[0]!;
    return {
      expectedPackageCount: row.expected_count,
      scannedPackageCount: row.scanned_count,
      collectedPackageCount: row.collected_count,
      missingPackageCount: Math.max(row.expected_count - row.collected_count, 0),
      unexpectedPackageCount: row.unexpected_count,
      damagedPackageCount: row.damaged_count,
      isBalanced:
        row.expected_count > 0 &&
        row.expected_count === row.collected_count &&
        row.damaged_count === 0 &&
        row.unexpected_count === 0,
      missingPackageCodes: row.missing_codes,
      unexpectedPackageCodes: row.unexpected_codes,
    };
  }

  private toSummary(row: PickupTaskRow) {
    return {
      id: row.id,
      taskCode: row.task_code,
      status: row.status,
      priority: row.priority,
      supplier: {
        id: row.supplier_id,
        name: row.supplier_name,
        locality: row.locality,
        address: row.pickup_address,
        phone: row.contact_phone,
      },
      hub:
        row.hub_id && row.hub_code && row.hub_name
          ? { id: row.hub_id, code: row.hub_code, name: row.hub_name }
          : null,
      pickupWindowStart: row.pickup_window_start?.toISOString() ?? null,
      pickupWindowEnd: row.pickup_window_end?.toISOString() ?? null,
      orderCount: row.order_count,
      packageCount: row.package_count,
      assignedPickerId: row.assigned_picker_id,
      createdAt: row.created_at.toISOString(),
    };
  }
}

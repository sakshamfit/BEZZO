import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, HubReceivingStatus, PackageStatus, PickupTaskStatus } from '@bezzo/contracts';
import type { Database as DatabaseType } from '@bezzo/database';
import { DATABASE } from '../../infrastructure/database/database.module';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { currentRequestId } from '../../common/context/request-context';
import type { CompleteReceivingInput, ScanHubPackageInput, StartReceivingInput } from './hub-receiving.schemas';

@Injectable()
export class HubReceivingService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedActor, hubId: string) {
    this.assertHubAccess(actor, hubId);
    const rows = await this.database.rows(
      `SELECT hr.id, hr.pickup_task_id, pt.task_code, hr.status, hr.expected_package_count,
              hr.received_package_count, hr.missing_package_count, hr.unexpected_package_count,
              hr.damaged_package_count, hr.discrepancy_count, hr.started_at, hr.completed_at,
              p.employee_code AS picker_code
         FROM hub_receivings hr LEFT JOIN pickup_tasks pt ON pt.id = hr.pickup_task_id
         LEFT JOIN pickers p ON p.id = hr.picker_id
        WHERE hr.hub_id = $1 ORDER BY hr.created_at DESC LIMIT 100`, [hubId],
    );
    return { items: rows.map((row) => ({
      id: row.id, pickupTaskId: row.pickup_task_id, taskCode: row.task_code, status: row.status,
      expectedPackageCount: row.expected_package_count, receivedPackageCount: row.received_package_count,
      missingPackageCount: row.missing_package_count, unexpectedPackageCount: row.unexpected_package_count,
      damagedPackageCount: row.damaged_package_count, discrepancyCount: row.discrepancy_count,
      startedAt: row.started_at, completedAt: row.completed_at, pickerCode: row.picker_code,
    })) };
  }

  async start(actor: AuthenticatedActor, hubId: string, input: StartReceivingInput) {
    this.assertHubAccess(actor, hubId);
    return this.database.transaction(async (client) => {
      const taskResult = await client.query<{
        id: string; task_code: string; status: string; hub_id: string | null;
        assigned_picker_id: string | null;
      }>(
        `SELECT id, task_code, status, hub_id, assigned_picker_id FROM pickup_tasks WHERE id = $1 FOR UPDATE`, [input.pickupTaskId],
      );
      const task = taskResult.rows[0];
      if (!task) throw DomainError.notFound(ErrorCode.TASK_NOT_FOUND, 'Pickup task was not found');
      if (task.hub_id !== hubId)
        throw DomainError.conflict(ErrorCode.PACKAGE_WRONG_HUB, 'Pickup task is assigned to a different hub');
      if (![PickupTaskStatus.PICKED_UP, PickupTaskStatus.PARTIALLY_PICKED, PickupTaskStatus.AT_HUB].includes(task.status as never))
        throw DomainError.conflict(ErrorCode.TASK_STATE_INVALID, 'Only a collected pickup can be received at a hub');

      const hub = await client.query<{ status: string }>(`SELECT status FROM collection_hubs WHERE id = $1 FOR SHARE`, [hubId]);
      if (!hub.rows[0]) throw DomainError.notFound(ErrorCode.HUB_NOT_FOUND, 'Collection hub was not found');
      if (hub.rows[0].status !== 'ACTIVE') throw DomainError.conflict(ErrorCode.HUB_CLOSED, 'Collection hub is not accepting packages');
      const expected = await client.query<{ count: number }>(
        `SELECT count(*)::INT AS count FROM pickup_packages WHERE pickup_task_id = $1 AND collected_at IS NOT NULL`, [task.id],
      );
      const expectedCount = expected.rows[0]?.count ?? 0;
      if (expectedCount === 0) throw DomainError.conflict(ErrorCode.TASK_STATE_INVALID, 'Pickup has no collected packages to receive');

      const opened = await client.query<{ id: string; status: string }>(
        `INSERT INTO hub_receivings (hub_id, pickup_task_id, picker_id, status, expected_package_count, received_by)
         VALUES ($1,$2,$3,'RECEIVING',$4,$5)
         ON CONFLICT (pickup_task_id) WHERE pickup_task_id IS NOT NULL AND completed_at IS NULL
         DO UPDATE SET expected_package_count = EXCLUDED.expected_package_count, updated_at = now()
         RETURNING id, status`,
        [hubId, task.id, task.assigned_picker_id, expectedCount, actor.userId],
      );
      const receiving = opened.rows[0]!;
      await client.query(
        `UPDATE pickup_tasks SET status = 'AT_HUB', at_hub_at = coalesce(at_hub_at, now()), updated_at = now()
          WHERE id = $1 AND status IN ('PICKED_UP','PARTIALLY_PICKED')`, [task.id],
      );
      await client.query(
        `INSERT INTO pickup_events (pickup_task_id, hub_id, picker_id, event_type, actor_type, actor_id, request_id, metadata)
         VALUES ($1,$2,$3,'HUB_RECEIVING_STARTED','HUB',$4,$5,jsonb_build_object('receivingId',$6))`,
        [task.id, hubId, task.assigned_picker_id, actor.userId, currentRequestId() ?? null, receiving.id],
      );
      await this.audit.record(client, {
        action: 'hub.receiving_started', resourceType: 'hub_receiving', resourceId: receiving.id,
        actorUserId: actor.userId, metadata: { hubId, taskId: task.id, taskCode: task.task_code },
      });
      return { id: receiving.id, pickupTaskId: task.id, taskCode: task.task_code, status: receiving.status, expectedPackageCount: expectedCount };
    });
  }

  async scan(actor: AuthenticatedActor, receivingId: string, input: ScanHubPackageInput) {
    return this.database.transaction(async (client) => {
      if (input.localEventId) {
        const replay = await client.query<{ result: string; package_code: string }>(
          `SELECT result, package_code FROM hub_package_scans WHERE local_event_id = $1`, [input.localEventId],
        );
        if (replay.rows[0]) return { result: replay.rows[0].result, packageCode: replay.rows[0].package_code, idempotentReplay: true };
      }
      const receivingResult = await client.query<{
        id: string; hub_id: string; pickup_task_id: string | null; status: string; completed_at: Date | null;
      }>(`SELECT id, hub_id, pickup_task_id, status, completed_at FROM hub_receivings WHERE id = $1 FOR UPDATE`, [receivingId]);
      const receiving = receivingResult.rows[0];
      if (!receiving) throw DomainError.notFound(ErrorCode.HUB_RECEIVING_NOT_FOUND, 'Hub receiving session was not found');
      this.assertHubAccess(actor, receiving.hub_id);
      if (receiving.completed_at) throw DomainError.conflict(ErrorCode.HUB_RECEIVING_ALREADY_COMPLETED, 'Hub receiving session is already complete');

      const packageResult = await client.query<{
        id: string; pickup_task_id: string | null; expected_hub_id: string | null; received_hub_id: string | null; status: string;
      }>(`SELECT id, pickup_task_id, expected_hub_id, received_hub_id, status FROM pickup_packages WHERE package_code = $1 FOR UPDATE`, [input.packageCode]);
      const pack = packageResult.rows[0];
      let result = input.resultHint ?? 'ACCEPTED';
      let packageId: string | null = pack?.id ?? null;
      if (input.resultHint === 'UNREADABLE') result = 'UNREADABLE';
      else if (!pack || pack.pickup_task_id !== receiving.pickup_task_id) {
        result = 'UNEXPECTED';
        packageId = null;
      }
      else if (pack.received_hub_id || pack.status === PackageStatus.HUB_RECEIVED || pack.status === PackageStatus.READY_FOR_DELIVERY) {
        const duplicate = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM hub_package_scans WHERE hub_receiving_id = $1 AND package_id = $2 AND result = 'ACCEPTED') AS exists`,
          [receivingId, pack.id],
        );
        result = duplicate.rows[0]?.exists ? 'DUPLICATE' : 'ALREADY_RECEIVED';
      }
      else if (pack.expected_hub_id !== receiving.hub_id) {
        result = 'WRONG_HUB';
        packageId = null;
      }
      else if (pack.status !== PackageStatus.PICKER_IN_TRANSIT) result = 'UNEXPECTED';
      else if (input.resultHint === 'DAMAGED') result = 'DAMAGED';

      if (result === 'ACCEPTED' && pack) {
        await client.query(
          `UPDATE pickup_packages SET status = 'HUB_RECEIVED', received_hub_id = $2, received_at = now(), updated_at = now()
            WHERE id = $1 AND status = 'PICKER_IN_TRANSIT' AND received_hub_id IS NULL`, [pack.id, receiving.hub_id],
        );
      } else if (result === 'DAMAGED' && pack) {
        await client.query(`UPDATE pickup_packages SET status = 'DAMAGED', updated_at = now() WHERE id = $1 AND status = 'PICKER_IN_TRANSIT'`, [pack.id]);
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO hub_package_scans (hub_receiving_id, package_id, package_code, hub_id, result, scanned_by, local_event_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (local_event_id) WHERE local_event_id IS NOT NULL DO NOTHING RETURNING id`,
        [receivingId, packageId, input.packageCode, receiving.hub_id, result, actor.userId, input.localEventId ?? null, input.notes ?? null],
      );
      if (!inserted.rows[0] && input.localEventId) {
        const replay = await client.query<{ result: string; package_code: string }>(`SELECT result, package_code FROM hub_package_scans WHERE local_event_id = $1`, [input.localEventId]);
        return { result: replay.rows[0]?.result ?? 'DUPLICATE', packageCode: replay.rows[0]?.package_code ?? input.packageCode, idempotentReplay: true };
      }
      if (result === 'ACCEPTED') {
        await client.query(`UPDATE hub_receivings SET received_package_count = received_package_count + 1, status = 'SCANNING', updated_at = now() WHERE id = $1`, [receivingId]);
      } else {
        const countField = result === 'UNEXPECTED' ? 'unexpected_package_count' : result === 'DAMAGED' ? 'damaged_package_count' : null;
        if (result !== 'DUPLICATE' && result !== 'ALREADY_RECEIVED') {
          if (countField) await client.query(`UPDATE hub_receivings SET ${countField} = ${countField} + 1, discrepancy_count = discrepancy_count + 1, status = 'SCANNING', updated_at = now() WHERE id = $1`, [receivingId]);
          else await client.query(`UPDATE hub_receivings SET discrepancy_count = discrepancy_count + 1, status = 'SCANNING', updated_at = now() WHERE id = $1`, [receivingId]);
        }
        if (result !== 'DUPLICATE' && result !== 'ALREADY_RECEIVED') {
          await client.query(
            `INSERT INTO pickup_exceptions (pickup_task_id, package_id, hub_receiving_id, type, reason, reported_by, reported_by_type)
             VALUES ($1,$2,$3,$4,$5,$6,'HUB')`,
            [receiving.pickup_task_id, packageId, receivingId,
              result === 'DAMAGED' ? 'PACKAGE_DAMAGED' : result === 'UNEXPECTED' ? 'PACKAGE_UNEXPECTED' : result === 'UNREADABLE' ? 'PACKAGE_BARCODE_UNREADABLE' : 'HUB_RECEIVING_DISCREPANCY',
              input.notes ?? `Hub scan result: ${result}`, actor.userId],
          );
        }
      }
      await client.query(
        `INSERT INTO pickup_events (pickup_task_id, package_id, hub_id, event_type, actor_type, actor_id, local_event_id, request_id, metadata)
         VALUES ($1,$2,$3,$4,'HUB',$5,$6,$7,jsonb_build_object('receivingId',$8,'packageCode',$9,'result',$10))
         ON CONFLICT (local_event_id) WHERE local_event_id IS NOT NULL DO NOTHING`,
        [receiving.pickup_task_id, packageId, receiving.hub_id, `HUB_PACKAGE_${result}`, actor.userId,
          input.localEventId ?? null, currentRequestId() ?? null, receivingId, input.packageCode],
      );
      await this.events.emit(client, {
        eventName: result === 'ACCEPTED' ? 'HubPackageReceived' : 'HubPackageScanException',
        aggregateType: 'hub_receiving', aggregateId: receivingId,
        payload: { receivingId, taskId: receiving.pickup_task_id, packageId, packageCode: input.packageCode, result },
      });
      await this.audit.record(client, {
        action: 'hub.package_scanned', resourceType: 'hub_receiving', resourceId: receivingId,
        actorUserId: actor.userId, metadata: { packageId, packageCode: input.packageCode, result },
      });
      return { result, packageCode: input.packageCode, idempotentReplay: false };
    });
  }

  async complete(actor: AuthenticatedActor, receivingId: string, input: CompleteReceivingInput) {
    return this.database.transaction(async (client) => {
      const result = await client.query<{
        id: string; hub_id: string; pickup_task_id: string | null; status: string; expected_package_count: number;
        received_package_count: number; unexpected_package_count: number; damaged_package_count: number; discrepancy_count: number; completed_at: Date | null;
      }>(`SELECT * FROM hub_receivings WHERE id = $1 FOR UPDATE`, [receivingId]);
      const receiving = result.rows[0];
      if (!receiving) throw DomainError.notFound(ErrorCode.HUB_RECEIVING_NOT_FOUND, 'Hub receiving session was not found');
      this.assertHubAccess(actor, receiving.hub_id);
      if (receiving.completed_at) throw DomainError.conflict(ErrorCode.HUB_RECEIVING_ALREADY_COMPLETED, 'Hub receiving session is already complete');
      const missing = await client.query<{ id: string; package_code: string }>(
        `SELECT id, package_code FROM pickup_packages WHERE pickup_task_id = $1 AND status = 'PICKER_IN_TRANSIT'
          AND collected_at IS NOT NULL AND received_hub_id IS NULL FOR UPDATE`, [receiving.pickup_task_id],
      );
      const discrepancyCount = receiving.discrepancy_count + missing.rows.length;
      if (discrepancyCount > 0 && (!input.acknowledgeDiscrepancy || !input.discrepancyReason)) {
        throw DomainError.conflict(ErrorCode.HUB_RECEIVING_DISCREPANCY, 'Reconcile missing, unexpected, or damaged packages before completing this handover');
      }
      const status = discrepancyCount === 0 ? HubReceivingStatus.ACCEPTED : HubReceivingStatus.DISPUTED;
      await client.query(
        `UPDATE hub_receivings SET status = $2, missing_package_count = $3, discrepancy_count = $4,
                discrepancy_reason = $5, acknowledged_discrepancy = $6, notes = $7, completed_at = now(), updated_at = now()
          WHERE id = $1`,
        [receivingId, status, missing.rows.length, discrepancyCount, input.discrepancyReason ?? null,
          input.acknowledgeDiscrepancy, input.notes ?? null],
      );
      for (const pack of missing.rows) {
        await client.query(
          `INSERT INTO pickup_exceptions (pickup_task_id, package_id, hub_receiving_id, type, reason, reported_by, reported_by_type)
           VALUES ($1,$2,$3,'PACKAGE_MISSING',$4,$5,'HUB')`,
          [receiving.pickup_task_id, pack.id, receivingId, input.discrepancyReason ?? 'Package was not scanned during hub receiving', actor.userId],
        );
      }
      if (receiving.pickup_task_id) {
        if (discrepancyCount === 0) {
          await client.query(`UPDATE pickup_packages SET status = 'READY_FOR_DELIVERY', updated_at = now() WHERE pickup_task_id = $1 AND status = 'HUB_RECEIVED' AND received_hub_id = $2`, [receiving.pickup_task_id, receiving.hub_id]);
          const fulfillments = await client.query<{ id: string }>(
            `UPDATE fulfillments f SET status = 'AT_HUB', updated_at = now()
              FROM pickup_task_orders pto WHERE pto.pickup_task_id = $1 AND pto.fulfillment_id = f.id
                AND f.status = 'COLLECTED' AND NOT EXISTS (
                  SELECT 1 FROM pickup_packages pp WHERE pp.fulfillment_id = f.id AND pp.status <> 'READY_FOR_DELIVERY'
                ) RETURNING f.id`, [receiving.pickup_task_id],
          );
          for (const fulfillment of fulfillments.rows) {
            await client.query(
              `INSERT INTO fulfillment_status_history (fulfillment_id, from_status, to_status, reason, actor_type, actor_id, request_id)
               VALUES ($1,'COLLECTED','AT_HUB','Packages accepted at Bezzo hub','HUB',$2,$3)`,
              [fulfillment.id, actor.userId, currentRequestId() ?? null],
            );
            await this.events.emit(client, { eventName: 'FulfillmentReceivedAtHub', aggregateType: 'fulfillment', aggregateId: fulfillment.id, payload: { fulfillmentId: fulfillment.id, receivingId } });
          }
          await client.query(`UPDATE pickup_tasks SET status = 'COMPLETED', completed_at = now(), updated_at = now() WHERE id = $1 AND status = 'AT_HUB'`, [receiving.pickup_task_id]);
          await client.query(
            `UPDATE pickers p SET status = 'AVAILABLE', updated_at = now()
              WHERE p.id = (SELECT assigned_picker_id FROM pickup_tasks WHERE id = $1)
                AND p.status = 'BUSY' AND NOT EXISTS (SELECT 1 FROM pickup_tasks pt WHERE pt.assigned_picker_id = p.id
                  AND pt.id <> $1 AND pt.status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDOVER_EXCEPTION'))`,
            [receiving.pickup_task_id],
          );
        } else {
          await client.query(`UPDATE pickup_tasks SET status = 'HANDOVER_EXCEPTION', failure_reason = $2, updated_at = now() WHERE id = $1 AND status = 'AT_HUB'`, [receiving.pickup_task_id, input.discrepancyReason ?? 'Hub discrepancy']);
        }
        await client.query(
          `INSERT INTO pickup_events (pickup_task_id, hub_id, event_type, actor_type, actor_id, request_id, metadata)
           VALUES ($1,$2,$3,'HUB',$4,$5,jsonb_build_object('receivingId',$6,'discrepancyCount',$7))`,
          [receiving.pickup_task_id, receiving.hub_id, discrepancyCount === 0 ? 'HUB_HANDOVER_COMPLETED' : 'HUB_HANDOVER_EXCEPTION', actor.userId, currentRequestId() ?? null, receivingId, discrepancyCount],
        );
      }
      await this.events.emit(client, { eventName: discrepancyCount === 0 ? 'HubReceivingAccepted' : 'HubReceivingDisputed', aggregateType: 'hub_receiving', aggregateId: receivingId, payload: { receivingId, taskId: receiving.pickup_task_id, status, discrepancyCount } });
      await this.audit.record(client, { action: 'hub.receiving_completed', resourceType: 'hub_receiving', resourceId: receivingId, actorUserId: actor.userId, metadata: { status, discrepancyCount, reason: input.discrepancyReason ?? null } });
      return { success: true, status, expectedPackageCount: receiving.expected_package_count, receivedPackageCount: receiving.received_package_count, missingPackageCount: missing.rows.length, discrepancyCount };
    });
  }

  private assertHubAccess(actor: AuthenticatedActor, hubId: string): void {
    if (actor.hubId && actor.hubId !== hubId) {
      throw DomainError.forbidden(ErrorCode.FORBIDDEN, 'This account is not assigned to the requested hub');
    }
  }
}

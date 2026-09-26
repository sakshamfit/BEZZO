import { Inject, Injectable } from '@nestjs/common';
import { DomainEventName, ErrorCode, Permission } from '@bezzo/contracts';
import type { Database as DatabaseType } from '@bezzo/database';
import { DATABASE } from '../../infrastructure/database/database.module';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { currentRequestId } from '../../common/context/request-context';
import type { PickerHeartbeatInput } from './picker.schemas';

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

@Injectable()
export class PickerService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
  ) {}

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
                AND p.status = 'AVAILABLE' AND p.last_heartbeat_at > now() - interval '5 minutes'
                AND pt.package_count <= p.capacity_packages AND pt.hub_id = p.home_hub_id)
           OR (pt.assigned_picker_id = $1 AND pt.status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDOVER_EXCEPTION'))
              )
        ORDER BY CASE WHEN pt.assigned_picker_id = $1 THEN 0 ELSE 1 END,
                 CASE pt.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
                 pt.pickup_window_end NULLS LAST, pt.created_at
        LIMIT 100`,
      [pickerId],
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
      if (
        picker.status !== 'AVAILABLE' ||
        !picker.last_heartbeat_at ||
        Date.now() - picker.last_heartbeat_at.getTime() > 5 * 60_000
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

      const linked = await client.query<{ total: number }>(
        `SELECT count(*)::INTEGER AS total FROM pickup_task_orders WHERE pickup_task_id = $1 AND status = 'ACTIVE'`,
        [taskId],
      );
      const expectedFulfillments = linked.rows[0]?.total ?? 0;
      if (expectedFulfillments === 0) {
        throw DomainError.conflict(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Pickup task has no active fulfillments',
        );
      }
      const assignedFulfillments = await client.query<{ id: string }>(
        `UPDATE fulfillments f SET status = 'PICKUP_ASSIGNED', updated_at = now()
           FROM pickup_task_orders pto
          WHERE pto.pickup_task_id = $1 AND pto.status = 'ACTIVE' AND pto.fulfillment_id = f.id
            AND f.status = 'READY_FOR_PICKUP'
          RETURNING f.id`,
        [taskId],
      );
      if (assignedFulfillments.rowCount !== expectedFulfillments) {
        throw DomainError.conflict(
          ErrorCode.INVALID_STATE_TRANSITION,
          'One or more fulfillments are no longer ready for pickup',
        );
      }
      await client.query(
        `INSERT INTO fulfillment_status_history (fulfillment_id, from_status, to_status, reason, actor_type, actor_id, request_id)
         SELECT pto.fulfillment_id, 'READY_FOR_PICKUP', 'PICKUP_ASSIGNED', $2, 'PICKER', $3, $4
           FROM pickup_task_orders pto WHERE pto.pickup_task_id = $1 AND pto.status = 'ACTIVE'`,
        [
          taskId,
          `Pickup task ${task.task_code} accepted`,
          actor.userId,
          currentRequestId() ?? null,
        ],
      );

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

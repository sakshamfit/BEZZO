/**
 * Audit trail (audit logging spec).
 *
 * Every privileged or compliance-relevant action is recorded append-only: who, what, when, from where,
 * before/after values and the request identifier. Audit rows are written inside the business
 * transaction, so an audit entry can never describe a change that rolled back.
 */
import { Inject, Injectable, Module, Global } from '@nestjs/common';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { DATABASE } from '../database/database.module';
import { currentActor, getRequestContext } from '../../common/context/request-context';
import type { Queryable } from '../events/event-bus.service';

export interface AuditRecordInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  actorRole?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseType) {}

  /**
   * Append an audit record. Pass the transaction client when the audited change is itself
   * transactional; pass the database when auditing a read or an out-of-band action.
   */
  async record(queryable: Queryable, input: AuditRecordInput): Promise<void> {
    const context = getRequestContext();
    const actor = currentActor();
    await queryable.query(
      `INSERT INTO audit_logs
         (actor_user_id, actor_role, actor_type, action, resource_type, resource_id,
          request_id, ip_address, user_agent, reason, before_data, after_data, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::JSONB,$12::JSONB,$13::JSONB)`,
      [
        input.actorUserId ?? actor?.userId ?? null,
        input.actorRole ?? actor?.roles?.[0] ?? null,
        input.actorUserId === null ? 'SYSTEM' : actor ? 'USER' : 'ADMIN',
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        context?.requestId ?? null,
        context?.ipAddress ?? null,
        context?.userAgent ?? null,
        input.reason ?? null,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  /** Query helper used by the admin audit screen. */
  async list(filters: {
    actorUserId?: string;
    resourceType?: string;
    resourceId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
  }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.actorUserId) {
      params.push(filters.actorUserId);
      conditions.push(`actor_user_id = $${params.length}::UUID`);
    }
    if (filters.resourceType) {
      params.push(filters.resourceType);
      conditions.push(`resource_type = $${params.length}`);
    }
    if (filters.resourceId) {
      params.push(filters.resourceId);
      conditions.push(`resource_id = $${params.length}`);
    }
    if (filters.action) {
      params.push(filters.action);
      conditions.push(`action = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`created_at < $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.database.rows<AuditRow>(
      `SELECT id, actor_user_id, actor_role, actor_type, action, resource_type, resource_id,
              request_id, host(ip_address) AS ip_address, reason, before_data, after_data, metadata, created_at
         FROM audit_logs ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    );
    const count = await this.database.row<{ count: string }>(
      `SELECT count(*)::TEXT AS count FROM audit_logs ${where}`,
      params,
    );
    return {
      rows: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        actorRole: row.actor_role,
        actorType: row.actor_type,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        requestId: row.request_id,
        ipAddress: row.ip_address,
        reason: row.reason,
        before: row.before_data,
        after: row.after_data,
        metadata: row.metadata,
        createdAt: row.created_at.toISOString(),
      })),
      total: Number(count?.count ?? 0),
    };
  }
}

export interface AuditRow {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  request_id: string | null;
  ip_address: string | null;
  reason: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

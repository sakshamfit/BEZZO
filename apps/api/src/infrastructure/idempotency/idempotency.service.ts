/**
 * Idempotency.
 *
 * Any mutation that a mobile client may retry on a flaky network (order placement, payment
 * initiation, every picker state change, package scans, hub receipts) requires an `Idempotency-Key`.
 * A replay returns the original response instead of repeating the side effect.
 *
 * Mechanics (api contract spec §8, distributed locks/idempotency spec §9):
 *  - `INSERT ... ON CONFLICT (key, operation, user_scope) DO NOTHING` is the correctness primitive:
 *    exactly one concurrent request creates the record, everybody else reads it.
 *  - `IN_PROGRESS` + no stored response → the parallel request gets IDEMPOTENCY_KEY_CONFLICT (409)
 *    instead of duplicating work.
 *  - A request reusing the same key with a *different* body is rejected: the key belongs to one
 *    logical operation only.
 */
import { Inject, Injectable, Module, Global } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ErrorCode } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { DATABASE } from '../database/database.module';
import { DomainError } from '../../common/errors/domain-error';

export interface IdempotencyBeginInput {
  key: string;
  operation: string;
  userId: string | null;
  requestFingerprint: unknown;
  ttlSeconds?: number;
}

export type IdempotencyBeginResult =
  | { state: 'NEW'; recordId: string }
  | { state: 'IN_PROGRESS'; recordId: string }
  | { state: 'COMPLETED'; recordId: string; status: number; body: unknown };

export function fingerprintRequest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseType) {}

  async begin(input: IdempotencyBeginInput): Promise<IdempotencyBeginResult> {
    const ttlSeconds = input.ttlSeconds ?? 24 * 60 * 60;
    const requestHash = fingerprintRequest(input.requestFingerprint);

    const inserted = await this.database.row<{ id: string }>(
      `INSERT INTO idempotency_keys (key, user_id, operation, request_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, 'IN_PROGRESS', now() + ($5 || ' seconds')::INTERVAL)
       ON CONFLICT (key, operation, user_scope) DO NOTHING
       RETURNING id`,
      [input.key, input.userId, input.operation, requestHash, String(ttlSeconds)],
    );

    if (inserted) {
      return { state: 'NEW', recordId: inserted.id };
    }

    const existing = await this.database.row<{
      id: string;
      request_hash: string;
      status: string;
      response_status: number | null;
      response_body: unknown;
      expires_at: Date;
    }>(
      `SELECT id, request_hash, status, response_status, response_body, expires_at
         FROM idempotency_keys
        WHERE key = $1 AND operation = $2 AND user_scope = COALESCE($3::UUID, '00000000-0000-0000-0000-000000000000'::UUID)`,
      [input.key, input.operation, input.userId],
    );

    if (!existing) {
      // Extremely unlikely (record purged between insert and select) — treat as a conflict, never as
      // permission to execute twice.
      throw new DomainError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT, 'A request with this idempotency key is in flight');
    }

    if (existing.request_hash !== requestHash) {
      throw new DomainError(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'This idempotency key was already used with a different request payload',
        { details: { operation: input.operation } },
      );
    }

    if (existing.status === 'COMPLETED' && existing.response_status !== null) {
      return {
        state: 'COMPLETED',
        recordId: existing.id,
        status: existing.response_status,
        body: existing.response_body,
      };
    }

    return { state: 'IN_PROGRESS', recordId: existing.id };
  }

  /** Persist the response so a retry can replay it byte-for-byte. */
  async complete(recordId: string, status: number, body: unknown, resourceId?: string): Promise<void> {
    await this.database.query(
      `UPDATE idempotency_keys
          SET status = 'COMPLETED', response_status = $2, response_body = $3::JSONB,
              resource_id = COALESCE($4, resource_id), completed_at = now()
        WHERE id = $1`,
      [recordId, status, JSON.stringify(body ?? null), resourceId ?? null],
    );
  }

  /**
   * Mark a failed attempt. The record is deleted rather than stored so the client can legitimately
   * retry the same key after fixing the underlying problem (a stored error would be replayed forever).
   */
  async fail(recordId: string, reason: string): Promise<void> {
    await this.database.query(`DELETE FROM idempotency_keys WHERE id = $1 AND status = 'IN_PROGRESS'`, [recordId]);
    void reason;
  }

  /** Housekeeping job: drop expired records. */
  async purgeExpired(limit = 1000): Promise<number> {
    const result = await this.database.query(
      `DELETE FROM idempotency_keys
        WHERE id IN (SELECT id FROM idempotency_keys WHERE expires_at < now() LIMIT $1)`,
      [limit],
    );
    return result.rowCount ?? 0;
  }
}

@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}

/**
 * Payments — the money side of an order (payment/billing spec, webhook reliability spec).
 *
 * The rules this module exists to enforce:
 *
 *  1. **A payment is only ever PAID because the provider said so, on the server.** Two sources are
 *     accepted, both server-verified: a signed webhook and a server-side status poll. A client that
 *     reports "payment succeeded" gets a 404-shaped answer at worst and no state change at best —
 *     there is no route that accepts a client's word for money.
 *  2. **Every inbound webhook is evidence.** The raw bytes are hashed and stored *before* the body is
 *     interpreted, so a forged or replayed call is on record even when it is rejected. `signature_valid`
 *     is written, never inferred.
 *  3. **A webhook can be delivered twice — it must not apply twice.** `(gateway, external_event_id)` is
 *     unique, so the second delivery is recorded and answered with `DUPLICATE` while the payment, the
 *     order, the status history and the audit trail stay exactly as the first delivery left them.
 *  4. **Money and stock cannot disagree.** Capturing the first payment confirms the order and its lines
 *     in the same transaction; failing a payment leaves the order payable so the buyer can retry
 *     instead of losing the basket, and the reservation TTL (see the worker) is what eventually returns
 *     the stock if they never do.
 *  5. **The gateway is an adapter.** Create, poll and refund go through `PAYMENT_PROVIDER`; nothing in
 *     this file knows what a Razorpay order object looks like.
 *  6. **Refunds are recorded before they are attempted and reconciled after.** A refund row is written
 *     with its amount and requester, the provider is called outside the transaction, and only the
 *     provider's answer moves `payments.refunded_amount`.
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DomainEventName,
  ErrorCode,
  Permission,
  OrderItemStatus,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
} from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DATABASE } from '../../infrastructure/database/database.module';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { NotificationService } from '../../infrastructure/notifications/notification.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payments-infra.module';
import { PaymentProviderError, type PaymentProvider, type ProviderPaymentStatus } from '../../infrastructure/payments/payment-provider';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';

/* ------------------------------------------------------------------ schemas */

export const refundSchema = z.object({
  amount: z.coerce.number().positive().max(100_000_000).nullish().transform((v) => v ?? undefined),
  reason: z.string().trim().max(300).nullish().transform((v) => v ?? undefined),
});

export type RefundInput = z.infer<typeof refundSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the ISO date format YYYY-MM-DD');

/** Backoffice payment search. Every filter is optional; the default is the newest fifty. */
export const adminPaymentListSchema = z.object({
  status: z
    .enum([
      PaymentStatus.PENDING,
      PaymentStatus.AUTHORIZED,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.CANCELLED,
    ])
    .optional(),
  gateway: z.string().trim().max(40).optional(),
  method: z
    .enum([
      PaymentMethodType.UPI,
      PaymentMethodType.CARD,
      PaymentMethodType.NET_BANKING,
      PaymentMethodType.WALLET,
      PaymentMethodType.COD,
    ])
    .optional(),
  q: z.string().trim().max(120).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AdminPaymentListQuery = z.infer<typeof adminPaymentListSchema>;

/* -------------------------------------------------------------------- types */

/** Anything that can run a query: the pool or the transaction client. */
type Queryable = { query: DatabaseType['query'] };

interface PaymentRow {
  id: string;
  order_id: string;
  buyer_id: string;
  order_number: string;
  order_status: string;
  gateway: string;
  gateway_payment_reference: string | null;
  amount: string;
  currency: string;
  status: string;
  payment_method_type: string;
  refunded_amount: string;
}

export interface WebhookOutcome {
  status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED' | 'UNMATCHED' | 'IGNORED';
  eventId: string;
  eventType: string;
  paymentId: string | null;
  applied: boolean;
}

/** The subset of provider states this module reacts to. `PENDING` is a no-op by design. */
const APPLICABLE_STATUSES: readonly string[] = ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'];

/** Money comparison tolerance: gateways round in minor units, so a paisa must not fail a capture. */
const AMOUNT_TOLERANCE = 0.01;

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationService,
  ) {}

  /* ----------------------------------------------------------------- webhooks */

  /**
   * POST /webhooks/payments/:provider — the gateway's own notification that money moved.
   *
   * Order of operations is deliberate: hash and store the evidence first, verify the signature second,
   * deduplicate third, and only then touch canonical data.
   */
  async handleWebhook(
    providerName: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookOutcome> {
    if (providerName !== this.provider.name) {
      // A webhook for a gateway we are not configured with cannot be verified, so it is refused
      // rather than trusted. Recorded by the exception filter with the request id.
      throw new DomainError(
        ErrorCode.PAYMENT_VERIFICATION_FAILED,
        `This endpoint accepts webhooks for the configured provider (${this.provider.name}) only`,
        { details: { receivedProvider: providerName, configuredProvider: this.provider.name } },
      );
    }
    if (!rawBody || rawBody.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'The webhook body is empty', {
        httpStatus: 422,
        fieldErrors: [{ field: 'body', code: ErrorCode.VALIDATION_FAILED, message: 'body is required' }],
      });
    }

    const digest = createHash('sha256').update(rawBody).digest('hex');
    const signatureValid = this.provider.verifyWebhookSignature(rawBody, headers);

    let parsed: ReturnType<PaymentProvider['parseWebhook']> | null = null;
    let parseError: string | null = null;
    try {
      parsed = this.provider.parseWebhook(rawBody);
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'unparseable payload';
    }

    // Evidence row first — including (especially) for rejected calls.
    const eventRow = await this.database.row<{ id: string }>(
      `INSERT INTO payment_webhook_events
         (gateway, external_event_id, event_type, payload_digest, payload_reference,
          signature_valid, processing_status, processing_attempts, processing_error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)
       ON CONFLICT (gateway, external_event_id) DO NOTHING
       RETURNING id`,
      [
        providerName,
        parsed?.externalEventId ?? `unparsed:${digest.slice(0, 32)}`,
        parsed?.eventType ?? 'unknown',
        digest,
        parsed?.providerReference ?? null,
        signatureValid,
        signatureValid && parsed ? 'RECEIVED' : parseError ? 'FAILED' : 'REJECTED',
        signatureValid ? parseError : 'Signature verification failed',
      ],
    );

    // The evidence row is written before any decision (see above), but the *verdict* is rendered before
    // the duplicate short-circuit. Otherwise a forged call that guesses an event id we have already seen
    // would be answered 200 "DUPLICATE" without its signature ever being checked, which would make the
    // signature requirement optional for anyone who can guess an id.
    if (!signatureValid) {
      throw new DomainError(ErrorCode.PAYMENT_VERIFICATION_FAILED, 'The webhook signature could not be verified', {
        details: { eventId: parsed?.externalEventId ?? null, provider: providerName },
      });
    }
    if (!parsed) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'The webhook payload could not be parsed', {
        httpStatus: 422,
        details: { parseError },
      });
    }

    if (!eventRow) {
      // Same provider event id seen before: the work was already done — or already refused — once.
      const existing = await this.database.row<{
        id: string;
        processing_status: string;
        payment_id: string | null;
        signature_valid: boolean;
      }>(
        `SELECT id, processing_status, payment_id, signature_valid FROM payment_webhook_events
          WHERE gateway = $1 AND external_event_id = $2`,
        [providerName, parsed.externalEventId],
      );

      const refusedBefore =
        existing !== null &&
        (!existing.signature_valid ||
          existing.processing_status === 'REJECTED' ||
          existing.processing_status === 'FAILED');

      // A refusal is not a terminal fact. If an earlier delivery of this event was refused for a reason
      // that this properly signed delivery does not share (e.g. the first call was forged, or arrived
      // before the payment row existed), the real event must still be applied — exactly once, because
      // `applyProviderStatus` is itself a guarded transition. Every surface that is already terminal is
      // still answered as a duplicate.
      if (existing && refusedBefore && existing.processing_status !== 'PROCESSED') {
        await this.database.query(
          `UPDATE payment_webhook_events
              SET signature_valid = true, processing_status = 'RECEIVED', processing_error = NULL,
                  processing_attempts = processing_attempts + 1
            WHERE id = $1`,
          [existing.id],
        );
        return this.applyWebhookEvent(existing.id, parsed);
      }

      if (existing && existing.processing_status !== 'REJECTED' && existing.processing_status !== 'FAILED') {
        await this.database.query(
          `UPDATE payment_webhook_events
              SET processing_status = 'DUPLICATE', processing_attempts = processing_attempts + 1
            WHERE id = $1`,
          [existing.id],
        );
      }
      return {
        status: 'DUPLICATE',
        eventId: parsed.externalEventId,
        eventType: parsed.eventType,
        paymentId: existing?.payment_id ?? null,
        applied: false,
      };
    }

    return this.applyWebhookEvent(eventRow.id, parsed);
  }

  /** Applies a verified, first-seen webhook event to canonical data. */
  private async applyWebhookEvent(
    eventRowId: string,
    parsed: ReturnType<PaymentProvider['parseWebhook']>,
  ): Promise<WebhookOutcome> {
    const status = parsed.status;
    if (!status || !APPLICABLE_STATUSES.includes(status)) {
      await this.database.query(
        `UPDATE payment_webhook_events
            SET processing_status = 'PROCESSED', processed_at = now(),
                processing_error = 'Event type carries no payment state this platform acts on'
          WHERE id = $1`,
        [eventRowId],
      );
      return {
        status: 'IGNORED',
        eventId: parsed.externalEventId,
        eventType: parsed.eventType,
        paymentId: null,
        applied: false,
      };
    }

    if (!parsed.providerReference) {
      await this.database.query(
        `UPDATE payment_webhook_events
            SET processing_status = 'FAILED', processed_at = now(),
                processing_error = 'The event does not reference a payment'
          WHERE id = $1`,
        [eventRowId],
      );
      return {
        status: 'REJECTED',
        eventId: parsed.externalEventId,
        eventType: parsed.eventType,
        paymentId: null,
        applied: false,
      };
    }

    const payment = await this.database.row<PaymentRow>(
      `SELECT p.id, p.order_id, p.buyer_id, p.gateway, p.gateway_payment_reference, p.amount, p.currency,
              p.status, p.payment_method_type, p.refunded_amount,
              o.order_number, o.status AS order_status
         FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE p.gateway = $1 AND p.gateway_payment_reference = $2`,
      [this.provider.name, parsed.providerReference],
    );

    if (!payment) {
      // Answer the gateway with 200 (it should stop retrying) but leave the anomaly on record.
      await this.database.query(
        `UPDATE payment_webhook_events
            SET processing_status = 'FAILED', processed_at = now(),
                processing_error = 'No payment matches this provider reference'
          WHERE id = $1`,
        [eventRowId],
      );
      return {
        status: 'UNMATCHED',
        eventId: parsed.externalEventId,
        eventType: parsed.eventType,
        paymentId: null,
        applied: false,
      };
    }

    if (parsed.amount !== null && Math.abs(parsed.amount - Number(payment.amount)) > AMOUNT_TOLERANCE) {
      await this.database.query(
        `UPDATE payment_webhook_events
            SET processing_status = 'FAILED', processed_at = now(), payment_id = $2,
                processing_error = $3
          WHERE id = $1`,
        [
          eventRowId,
          payment.id,
          `Amount mismatch: provider reported ${parsed.amount}, order expects ${payment.amount}`,
        ],
      );
      // The canonical amount is never overwritten by an inbound event.
      await this.audit.record(this.database, {
        action: 'payment.amount_mismatch',
        resourceType: 'payment',
        resourceId: payment.id,
        metadata: {
          orderNumber: payment.order_number,
          providerAmount: parsed.amount,
          expectedAmount: Number(payment.amount),
          providerReference: parsed.providerReference,
        },
      });
      return {
        status: 'REJECTED',
        eventId: parsed.externalEventId,
        eventType: parsed.eventType,
        paymentId: payment.id,
        applied: false,
      };
    }

    const applied = await this.applyProviderStatus(payment.id, status, {
      failureCode: null,
      failureMessage: null,
      source: 'WEBHOOK',
      externalEventId: parsed.externalEventId,
    });

    await this.database.query(
      `UPDATE payment_webhook_events
          SET processing_status = $2, processed_at = now(), payment_id = $3, processing_error = $4
        WHERE id = $1`,
      [
        eventRowId,
        applied ? 'PROCESSED' : 'DUPLICATE',
        payment.id,
        applied ? null : 'Provider state already reflected in canonical data',
      ],
    );

    return {
      status: applied ? 'PROCESSED' : 'DUPLICATE',
      eventId: parsed.externalEventId,
      eventType: parsed.eventType,
      paymentId: payment.id,
      applied,
    };
  }

  /* ------------------------------------------------------- the state transition */

  /**
   * Move a payment (and the order it belongs to) to a provider-reported state.
   *
   * Guarded by `WHERE status <> :target`, so applying the same state twice — a duplicate webhook, a
   * webhook racing a reconciliation poll — changes nothing the second time. Returns whether this call
   * was the one that moved it, which is what the caller records as the event's outcome.
   */
  private async applyProviderStatus(
    paymentId: string,
    status: ProviderPaymentStatus['status'],
    context: {
      failureCode: string | null;
      failureMessage: string | null;
      source: 'WEBHOOK' | 'RECONCILIATION';
      externalEventId?: string;
    },
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const locked = await client.query<PaymentRow>(
        `SELECT p.id, p.order_id, p.buyer_id, p.gateway, p.gateway_payment_reference, p.amount, p.currency,
                p.status, p.payment_method_type, p.refunded_amount,
                o.order_number, o.status AS order_status
           FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.id = $1 FOR UPDATE OF p`,
        [paymentId],
      );
      const payment = locked.rows[0];
      if (!payment) throw new DomainError(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found');

      const target = this.mapProviderStatus(status);
      if (!target || payment.status === target) {
        await client.query(
          `UPDATE payments SET reconciled_at = CASE WHEN $2 THEN now() ELSE reconciled_at END WHERE id = $1`,
          [paymentId, context.source === 'RECONCILIATION'],
        );
        return false;
      }
      // A captured payment is never un-captured by a later, weaker signal (REFUNDED excepted).
      if (payment.status === PaymentStatus.PAID && target !== PaymentStatus.REFUNDED) return false;

      const moved = await client.query(
        `UPDATE payments
            SET status = $2,
                authorized_at = CASE WHEN $2 = 'AUTHORIZED' AND authorized_at IS NULL THEN now() ELSE authorized_at END,
                paid_at = CASE WHEN $2 = 'PAID' AND paid_at IS NULL THEN now() ELSE paid_at END,
                failed_at = CASE WHEN $2 = 'FAILED' THEN now() ELSE failed_at END,
                failure_code = CASE WHEN $2 = 'FAILED' THEN $3 ELSE NULL END,
                failure_message = CASE WHEN $2 = 'FAILED' THEN $4 ELSE NULL END,
                refunded_amount = CASE WHEN $2 = 'REFUNDED' THEN amount ELSE refunded_amount END,
                reconciled_at = CASE WHEN $5 THEN now() ELSE reconciled_at END,
                updated_at = now()
          WHERE id = $1 AND status <> $2
      RETURNING id`,
        [paymentId, target, context.failureCode, context.failureMessage, context.source === 'RECONCILIATION'],
      );
      if ((moved.rowCount ?? 0) === 0) return false;

      if (target === PaymentStatus.PAID || target === PaymentStatus.FAILED) {
        await client.query(
          `INSERT INTO payment_attempts (payment_id, gateway, gateway_attempt_reference, status, amount, failure_code, failure_message)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            paymentId,
            payment.gateway,
            payment.gateway_payment_reference,
            target === PaymentStatus.PAID ? 'SUCCESS' : 'FAILED',
            payment.amount,
            target === PaymentStatus.FAILED ? context.failureCode : null,
            target === PaymentStatus.FAILED ? context.failureMessage : null,
          ],
        );
      }

      if (target === PaymentStatus.PAID) {
        await this.confirmOrderForCapture(client, payment);
      } else if (target === PaymentStatus.FAILED) {
        await this.events.emit(client, {
          eventName: DomainEventName.PaymentFailed,
          aggregateType: 'payment',
          aggregateId: paymentId,
          payload: {
            orderId: payment.order_id,
            orderNumber: payment.order_number,
            gateway: payment.gateway,
            failureCode: context.failureCode,
            source: context.source,
          },
        });
        await this.notifications.queue(client, {
          userId: await this.buyerUserId(client, payment.buyer_id),
          type: 'payment.failed',
          title: `Payment for ${payment.order_number} did not go through`,
          body: context.failureMessage ?? 'The payment failed. The order is still open — you can try paying again.',
          channels: ['IN_APP'],
          referenceType: 'order',
          referenceId: payment.order_id,
          payload: { orderNumber: payment.order_number, paymentId, failureCode: context.failureCode },
        });
        await this.audit.record(client, {
          action: 'payment.failed',
          resourceType: 'payment',
          resourceId: paymentId,
          metadata: {
            orderNumber: payment.order_number,
            failureCode: context.failureCode,
            source: context.source,
            externalEventId: context.externalEventId ?? null,
          },
        });
      } else if (target === PaymentStatus.AUTHORIZED) {
        await this.audit.record(client, {
          action: 'payment.authorized',
          resourceType: 'payment',
          resourceId: paymentId,
          metadata: { orderNumber: payment.order_number, source: context.source },
        });
      } else if (target === PaymentStatus.REFUNDED) {
        // Provider-initiated refund (no refund row was created by us) — record the money, not the story.
        await this.audit.record(client, {
          action: 'payment.refunded_externally',
          resourceType: 'payment',
          resourceId: paymentId,
          metadata: {
            orderNumber: payment.order_number,
            amount: Number(payment.amount) - Number(payment.refunded_amount),
            source: context.source,
          },
        });
      }

      return true;
    });
  }

  /** Capturing the money is what confirms the order, its lines and its fulfilments' readiness. */
  private async confirmOrderForCapture(client: Queryable, payment: PaymentRow): Promise<void> {
    await client.query(
      `UPDATE orders
          SET payment_status = 'PAID',
              status = CASE WHEN status = 'PENDING_PAYMENT' THEN 'CONFIRMED' ELSE status END,
              confirmed_at = CASE WHEN status = 'PENDING_PAYMENT' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
              updated_at = now()
        WHERE id = $1`,
      [payment.order_id],
    );
    // The money is in, so the reservation is no longer a timed hold: it becomes a commitment with no
    // payment window (migration 0017), and the expiry job can never return this stock to the shelf while
    // the order is owed to the buyer.
    await client.query(
      `UPDATE inventory_reservations
          SET status = 'CONFIRMED', confirmed_at = now(), expires_at = NULL, updated_at = now()
        WHERE order_id = $1 AND status = 'ACTIVE'`,
      [payment.order_id],
    );

    if (payment.order_status === OrderStatus.PENDING_PAYMENT) {
      await client.query(
        `UPDATE order_items SET status = $2, updated_at = now()
          WHERE order_id = $1 AND status = $3`,
        [payment.order_id, OrderItemStatus.CONFIRMED, OrderItemStatus.PENDING],
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, reason, actor_type, actor_id, request_id)
         VALUES ($1,$2,$3,$4,'SYSTEM',NULL,NULL)`,
        [payment.order_id, OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED, 'Payment captured by the gateway'],
      );
      await this.events.emit(client, {
        eventName: DomainEventName.OrderConfirmed,
        aggregateType: 'order',
        aggregateId: payment.order_id,
        payload: {
          orderNumber: payment.order_number,
          buyerId: payment.buyer_id,
          reason: 'PAYMENT_CAPTURED',
          amount: Number(payment.amount),
        },
      });
    }

    await this.events.emit(client, {
      eventName: DomainEventName.PaymentConfirmed,
      aggregateType: 'payment',
      aggregateId: payment.id,
      payload: {
        orderId: payment.order_id,
        orderNumber: payment.order_number,
        gateway: payment.gateway,
        amount: Number(payment.amount),
        currency: payment.currency,
        method: payment.payment_method_type,
      },
    });
    await this.notifications.queue(client, {
      userId: await this.buyerUserId(client, payment.buyer_id),
      type: 'payment.captured',
      title: `Payment received for ${payment.order_number}`,
      body: `${payment.currency} ${Number(payment.amount).toFixed(2)} was received. The suppliers have been notified to prepare your order.`,
      channels: ['IN_APP'],
      referenceType: 'order',
      referenceId: payment.order_id,
      payload: { orderNumber: payment.order_number, paymentId: payment.id, amount: Number(payment.amount) },
    });
    await this.audit.record(client, {
      action: 'payment.captured',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: {
        orderNumber: payment.order_number,
        amount: Number(payment.amount),
        gateway: payment.gateway,
        method: payment.payment_method_type,
      },
    });
  }

  private mapProviderStatus(status: ProviderPaymentStatus['status']): string | null {
    switch (status) {
      case 'AUTHORIZED':
        return PaymentStatus.AUTHORIZED;
      case 'PAID':
        return PaymentStatus.PAID;
      case 'FAILED':
        return PaymentStatus.FAILED;
      case 'CANCELLED':
        return PaymentStatus.CANCELLED;
      case 'REFUNDED':
        return PaymentStatus.REFUNDED;
      default:
        return null;
    }
  }

  private async buyerUserId(client: Queryable, buyerId: string): Promise<string> {
    const row = await client.query<{ user_id: string }>(`SELECT user_id FROM buyers WHERE id = $1`, [buyerId]);
    return row.rows[0]?.user_id ?? buyerId;
  }

  /* -------------------------------------------------------------------- retry */

  /**
   * POST /payments/:paymentId/retry — a second attempt at the same payment.
   *
   * The payment row is reused rather than duplicated, which is what the partial unique index
   * (`payments_order_active_unique`) is there to guarantee: an order can never have two live payments.
   * Every attempt is visible in `payment_attempts`, and the provider idempotency key is derived from the
   * attempt number, so even a crash between "intent created" and "attempt recorded" cannot produce two
   * different intents for the same attempt.
   */
  async retry(actor: AuthenticatedActor, paymentId: string) {
    const buyerId = this.requireBuyer(actor);
    const payment = await this.database.row<PaymentRow>(
      `SELECT p.id, p.order_id, p.buyer_id, p.gateway, p.gateway_payment_reference, p.amount, p.currency,
              p.status, p.payment_method_type, p.refunded_amount,
              o.order_number, o.status AS order_status
         FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE p.id = $1 AND p.buyer_id = $2`,
      [paymentId, buyerId],
    );
    if (!payment) throw new DomainError(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found');
    if (payment.gateway === 'cod') {
      throw new DomainError(
        ErrorCode.PAYMENT_ALREADY_PROCESSED,
        'This order is paid in cash on delivery — there is nothing to retry online',
      );
    }
    if (payment.order_status !== OrderStatus.PENDING_PAYMENT) {
      throw new DomainError(ErrorCode.PAYMENT_ALREADY_PROCESSED, 'This order is no longer waiting for a payment', {
        details: { orderStatus: payment.order_status },
      });
    }
    if (![PaymentStatus.PENDING, PaymentStatus.FAILED].includes(payment.status as never)) {
      throw new DomainError(ErrorCode.PAYMENT_ALREADY_PROCESSED, 'This payment is already settled', {
        details: { paymentStatus: payment.status },
      });
    }

    const attemptRow = await this.database.row<{ attempts: string }>(
      `SELECT count(*)::TEXT AS attempts FROM payment_attempts WHERE payment_id = $1`,
      [paymentId],
    );
    const attemptNumber = Number(attemptRow?.attempts ?? 0) + 1;
    const idempotencyKey = `${paymentId}:intent:${attemptNumber}`;

    let intent: { providerReference: string; providerOrderReference: string | null; providerPayload: Record<string, unknown> | null };
    try {
      intent = await this.provider.createIntent({
        orderId: payment.order_id,
        orderNumber: payment.order_number,
        amount: Number(payment.amount),
        currency: payment.currency,
        // A retried payment keeps the method the buyer chose; the adapter maps it to its own vocabulary.
        method: payment.payment_method_type as PaymentMethodType,
        buyerId: payment.buyer_id,
        idempotencyKey,
      });
    } catch (error) {
      const providerError = error instanceof PaymentProviderError ? error : null;
      throw new DomainError(
        ErrorCode.PAYMENT_PROVIDER_ERROR,
        providerError?.message ?? 'The payment gateway could not be reached — please try again',
        { details: { retryable: providerError?.retryable ?? true } },
      );
    }

    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE payments
            SET status = $2, gateway_payment_reference = $3, gateway_order_reference = $4,
                failed_at = NULL, failure_code = NULL, failure_message = NULL, updated_at = now()
          WHERE id = $1`,
        [paymentId, PaymentStatus.PENDING, intent.providerReference, intent.providerOrderReference],
      );
      await client.query(
        `INSERT INTO payment_attempts (payment_id, gateway, gateway_attempt_reference, status, amount)
         VALUES ($1,$2,$3,'INITIATED',$4)`,
        [paymentId, payment.gateway, intent.providerReference, payment.amount],
      );
      await this.events.emit(client, {
        eventName: DomainEventName.PaymentInitiated,
        aggregateType: 'payment',
        aggregateId: paymentId,
        payload: {
          orderId: payment.order_id,
          orderNumber: payment.order_number,
          gateway: payment.gateway,
          amount: Number(payment.amount),
          attemptNumber,
          providerReference: intent.providerReference,
        },
      });
      await this.audit.record(client, {
        action: 'payment.retried',
        resourceType: 'payment',
        resourceId: paymentId,
        metadata: { orderNumber: payment.order_number, attemptNumber, providerReference: intent.providerReference },
      });
    });

    return {
      paymentId,
      orderId: payment.order_id,
      orderNumber: payment.order_number,
      status: PaymentStatus.PENDING,
      amount: Number(payment.amount),
      currency: payment.currency,
      method: payment.payment_method_type,
      gateway: payment.gateway,
      attemptNumber,
      providerReference: intent.providerReference,
      providerPayload: intent.providerPayload,
    };
  }

  /* ------------------------------------------------------------------- refunds */

  /**
   * POST /payments/:paymentId/refund — an administrator returns money.
   *
   * Full or partial, never more than what was captured minus what was already returned. The provider is
   * called after the refund row exists, so an interrupted refund is visible as `PROCESSING`/`FAILED`
   * rather than lost.
   */
  async refund(actor: AuthenticatedActor, paymentId: string, input: RefundInput) {
    const prepared = await this.database.transaction(async (client) => {
      const locked = await client.query<PaymentRow>(
        `SELECT p.id, p.order_id, p.buyer_id, p.gateway, p.gateway_payment_reference, p.amount, p.currency,
                p.status, p.payment_method_type, p.refunded_amount,
                o.order_number, o.status AS order_status
           FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.id = $1 FOR UPDATE OF p`,
        [paymentId],
      );
      const payment = locked.rows[0];
      if (!payment) throw new DomainError(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found');
      if (![PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED].includes(payment.status as never)) {
        throw new DomainError(
          ErrorCode.REFUND_NOT_ALLOWED,
          'Only a captured payment can be refunded — a payment that never completed has nothing to return',
          { details: { paymentStatus: payment.status } },
        );
      }
      if (payment.gateway === 'cod') {
        throw new DomainError(
          ErrorCode.REFUND_NOT_ALLOWED,
          'Cash on delivery is settled offline; record the return in the settlement flow instead of a gateway refund',
        );
      }

      const captured = Number(payment.amount);
      const alreadyRefunded = Number(payment.refunded_amount);
      const remaining = this.round(captured - alreadyRefunded);
      if (remaining <= 0) {
        throw new DomainError(ErrorCode.REFUND_NOT_ALLOWED, 'This payment has already been refunded in full');
      }
      const amount = this.round(input.amount ?? remaining);
      if (amount <= 0 || amount > remaining) {
        throw new DomainError(
          ErrorCode.REFUND_NOT_ALLOWED,
          `The refund must be between 0.01 and ${remaining.toFixed(2)} ${payment.currency}`,
          { details: { captured, alreadyRefunded, remaining, requested: amount } },
        );
      }

      const refundRow = await client.query<{ id: string }>(
        `INSERT INTO refunds (payment_id, order_id, amount, reason, status, requested_by, approved_by)
         VALUES ($1,$2,$3,$4,'APPROVED',$5,$5)
         RETURNING id`,
        [paymentId, payment.order_id, amount, input.reason ?? null, actor.userId],
      );
      const refundId = refundRow.rows[0]?.id;
      if (!refundId) throw new Error('Refund insert returned no row');

      await this.audit.record(client, {
        action: 'payment.refund_requested',
        resourceType: 'payment',
        resourceId: paymentId,
        reason: input.reason ?? null,
        metadata: { orderNumber: payment.order_number, refundId, amount, currency: payment.currency },
      });

      return { refundId, payment, amount, captured, alreadyRefunded };
    });

    const { refundId, payment, amount } = prepared;

    let providerRefundReference: string | null = null;
    let providerStatus: 'PROCESSING' | 'REFUNDED' | 'FAILED' = 'FAILED';
    let failureMessage: string | null = null;
    try {
      const result = await this.provider.refund({
        providerReference: payment.gateway_payment_reference as string,
        amount,
        currency: payment.currency,
        reason: input.reason,
        // Deterministic per refund row: a retried request cannot return the money twice.
        idempotencyKey: `${refundId}:refund:1`,
      });
      providerRefundReference = result.providerRefundReference;
      providerStatus = result.status;
    } catch (error) {
      const providerError = error instanceof PaymentProviderError ? error : null;
      failureMessage = providerError?.message ?? 'The payment gateway rejected the refund request';
    }

    const outcome = await this.database.transaction(async (client) => {
      const settled = providerStatus === 'REFUNDED';
      await client.query(
        `UPDATE refunds
            SET status = $2, gateway_refund_reference = $3, processed_at = CASE WHEN $2 = 'REFUNDED' THEN now() ELSE processed_at END,
                failure_reason = $4, updated_at = now()
          WHERE id = $1`,
        [refundId, providerStatus, providerRefundReference, failureMessage],
      );

      if (!settled) {
        await this.audit.record(client, {
          action: providerStatus === 'PROCESSING' ? 'payment.refund_processing' : 'payment.refund_failed',
          resourceType: 'payment',
          resourceId: paymentId,
          metadata: { orderNumber: payment.order_number, refundId, amount, providerStatus, failureMessage },
        });
        return { settled: false, providerStatus, failureMessage };
      }

      const updated = await client.query<{ refunded_amount: string; amount: string; status: string }>(
        `UPDATE payments
            SET refunded_amount = refunded_amount + $2,
                status = CASE WHEN refunded_amount + $2 >= amount THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
                updated_at = now()
          WHERE id = $1
      RETURNING refunded_amount, amount, status`,
        [paymentId, amount],
      );
      const row = updated.rows[0];
      const fullyRefunded = Boolean(row && Number(row.refunded_amount) >= Number(row.amount));

      await client.query(
        `UPDATE refunds SET status = $2, updated_at = now() WHERE id = $1`,
        [refundId, fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'],
      );
      await client.query(
        `UPDATE orders SET payment_status = $2, updated_at = now() WHERE id = $1`,
        [payment.order_id, fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED],
      );

      await this.events.emit(client, {
        eventName: DomainEventName.RefundCompleted,
        aggregateType: 'payment',
        aggregateId: paymentId,
        payload: {
          orderId: payment.order_id,
          orderNumber: payment.order_number,
          refundId,
          amount,
          currency: payment.currency,
          fullyRefunded,
          gateway: payment.gateway,
          providerRefundReference,
        },
      });
      await this.notifications.queue(client, {
        userId: await this.buyerUserId(client, payment.buyer_id),
        type: 'payment.refunded',
        title: `Refund issued for ${payment.order_number}`,
        body: `${payment.currency} ${amount.toFixed(2)} has been refunded${input.reason ? ` — ${input.reason}` : ''}.`,
        channels: ['IN_APP'],
        referenceType: 'order',
        referenceId: payment.order_id,
        payload: { orderNumber: payment.order_number, refundId, amount },
      });
      await this.audit.record(client, {
        action: 'payment.refunded',
        resourceType: 'payment',
        resourceId: paymentId,
        reason: input.reason ?? null,
        metadata: {
          orderNumber: payment.order_number,
          refundId,
          amount,
          fullyRefunded,
          providerRefundReference,
          approvedBy: actor.userId,
        },
      });

      return { settled: true, providerStatus, failureMessage: null };
    });

    if (!outcome.settled && outcome.providerStatus === 'FAILED') {
      throw new DomainError(ErrorCode.REFUND_FAILED, failureMessage ?? 'The refund could not be processed', {
        details: { refundId, paymentId },
      });
    }

    return {
      refundId,
      paymentId,
      orderId: payment.order_id,
      orderNumber: payment.order_number,
      amount,
      currency: payment.currency,
      status: outcome.settled ? 'REFUNDED' : 'PROCESSING',
      providerRefundReference,
      message: outcome.settled
        ? 'The refund was processed by the gateway'
        : 'The gateway accepted the refund and is still processing it',
    };
  }

  /**
   * Refunds recorded against an order, newest first — the buyer's own order, or any order for an
   * operator holding `admin.payment.read`.
   *
   * Ownership is checked here rather than in the controller because only this layer knows the
   * buyer → order mapping; the route-level permission alone would let any buyer read any order's money
   * trail by changing the id in the URL.
   */
  async listOrderRefunds(actor: AuthenticatedActor, orderId: string) {
    const order = await this.database.row<{ buyer_id: string }>(
      `SELECT buyer_id FROM orders WHERE id = $1`,
      [orderId],
    );
    if (!order) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');

    const isOperator = actor.permissions.includes(Permission.ADMIN_PAYMENT_READ);
    if (!isOperator && actor.buyerId !== order.buyer_id) {
      // Same answer a caller gets for an order that is not theirs: existence is not disclosed.
      throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    return this.listRefunds(orderId);
  }

  /** Refunds recorded against an order, newest first. Used by the order detail screen. */
  async listRefunds(orderId: string) {
    const rows = await this.database.rows<{
      id: string;
      amount: string;
      status: string;
      reason: string | null;
      gateway_refund_reference: string | null;
      processed_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, amount, status, reason, gateway_refund_reference, processed_at, created_at
         FROM refunds WHERE order_id = $1 ORDER BY created_at DESC`,
      [orderId],
    );
    // Money is NUMERIC in the database and therefore a string on the wire by default; the API publishes
    // it as a number for display clients, exactly as the order endpoints do.
    return rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      status: row.status,
      reason: row.reason,
      gatewayRefundReference: row.gateway_refund_reference,
      processedAt: row.processed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /* ---------------------------------------------------------- reconciliation */

  /**
   * Re-check payments the platform has been waiting on.
   *
   * Webhooks get lost — provider outages, a gateway retry that exhausts its budget, a deploy that drops
   * in-flight calls. Polling the provider is the fallback that must exist, and it is also the control
   * that proves the webhook path is honest: both roads end in `applyProviderStatus`.
   */
  async reconcileStalePayments(limit = 25): Promise<{ checked: number; applied: number; failed: number }> {
    const stale = await this.database.rows<{ id: string; gateway_payment_reference: string }>(
      `SELECT id, gateway_payment_reference
         FROM payments
        WHERE status IN ('PENDING','AUTHORIZED')
          AND gateway <> 'cod'
          AND gateway_payment_reference IS NOT NULL
          AND updated_at < now() - make_interval(secs => $1)
        ORDER BY updated_at
        LIMIT $2`,
      [this.config.PAYMENTS_RECONCILE_AFTER_SECONDS, limit],
    );

    let applied = 0;
    let failed = 0;
    for (const payment of stale) {
      try {
        const status = await this.provider.fetchStatus(payment.gateway_payment_reference);
        const moved = await this.applyProviderStatus(payment.id, status.status, {
          failureCode: status.failureCode,
          failureMessage: status.failureMessage,
          source: 'RECONCILIATION',
        });
        if (moved) applied += 1;
      } catch (error) {
        failed += 1;
        await this.database.query(
          `UPDATE payments SET reconciled_at = now(), updated_at = updated_at WHERE id = $1`,
          [payment.id],
        ).catch(() => undefined);
        await this.audit.record(this.database, {
          action: 'payment.reconciliation_failed',
          resourceType: 'payment',
          resourceId: payment.id,
          metadata: {
            providerReference: payment.gateway_payment_reference,
            error: error instanceof Error ? error.message : 'unknown error',
          },
        });
      }
    }
    return { checked: stale.length, applied, failed };
  }

  /* ---------------------------------------------------------------- backoffice */

  /**
   * Payment search for the operations backoffice.
   *
   * Money is the one thing an operator must be able to find from any direction: by order number, by the
   * buyer's name, by gateway reference, by state. The list is deliberately read-only — moving money is
   * the separate, permission-checked refund command — and it never exposes provider payloads or bank
   * data, only the identifiers an operator needs to talk to the gateway.
   */
  async adminList(query: AdminPaymentListQuery) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (query.gateway) {
      params.push(query.gateway);
      conditions.push(`p.gateway = $${params.length}`);
    }
    if (query.method) {
      params.push(query.method);
      conditions.push(`p.payment_method_type = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q}%`);
      const index = params.length;
      conditions.push(
        `(o.order_number ILIKE $${index} OR p.gateway_payment_reference ILIKE $${index} OR b.store_name ILIKE $${index} OR u.display_name ILIKE $${index})`,
      );
    }
    if (query.from) {
      params.push(query.from);
      conditions.push(`p.created_at >= $${params.length}::DATE`);
    }
    if (query.to) {
      params.push(query.to);
      conditions.push(`p.created_at < ($${params.length}::DATE + INTERVAL '1 day')`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await this.database.row<{ count: string }>(
      `SELECT count(*)::TEXT AS count
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         JOIN buyers b ON b.id = p.buyer_id
         LEFT JOIN users u ON u.id = b.user_id
         ${where}`,
      params,
    );
    const totalItems = Number(total?.count ?? 0);
    const pageSize = query.pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(query.page, totalPages);
    const offset = (page - 1) * pageSize;

    const rows = await this.database.rows<{
      id: string;
      order_id: string;
      order_number: string;
      order_status: string;
      buyer_id: string;
      buyer_name: string | null;
      gateway: string;
      gateway_payment_reference: string | null;
      payment_method_type: string;
      status: string;
      amount: string;
      refunded_amount: string;
      currency: string;
      failure_code: string | null;
      failure_message: string | null;
      reconciled_at: Date | null;
      paid_at: Date | null;
      created_at: Date;
    }>(
      `SELECT p.id, p.order_id, o.order_number, o.status AS order_status, p.buyer_id,
              coalesce(b.store_name, u.display_name) AS buyer_name,
              p.gateway, p.gateway_payment_reference, p.payment_method_type, p.status,
              p.amount, p.refunded_amount, p.currency, p.failure_code, p.failure_message,
              p.reconciled_at, p.paid_at, p.created_at
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         JOIN buyers b ON b.id = p.buyer_id
         LEFT JOIN users u ON u.id = b.user_id
         ${where}
        ORDER BY p.created_at DESC, p.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return {
      payments: rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        buyerId: row.buyer_id,
        buyerName: row.buyer_name,
        gateway: row.gateway,
        providerReference: row.gateway_payment_reference,
        method: row.payment_method_type,
        status: row.status,
        amount: Number(row.amount),
        refundedAmount: Number(row.refunded_amount),
        refundableAmount: this.round(Math.max(0, Number(row.amount) - Number(row.refunded_amount))),
        currency: row.currency,
        failureCode: row.failure_code,
        failureMessage: row.failure_message,
        lastReconciledAt: row.reconciled_at?.toISOString() ?? null,
        paidAt: row.paid_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
      })),
      pagination: { page, pageSize, totalItems, totalPages },
    };
  }

  /**
   * One payment with everything that explains it: attempts, refunds, and the webhook evidence log.
   *
   * The evidence log is what makes "the gateway told us X at 14:02" a fact rather than a memory — the
   * raw payload digest, whether the signature verified, and how the row was processed.
   */
  async adminDetail(paymentId: string) {
    const payment = await this.database.row<{
      id: string;
      order_id: string;
      order_number: string;
      order_status: string;
      buyer_id: string;
      buyer_name: string | null;
      status: string;
      amount: string;
      refunded_amount: string;
      currency: string;
      gateway: string;
      gateway_payment_reference: string | null;
      payment_method_type: string;
      failure_code: string | null;
      failure_message: string | null;
      reconciled_at: Date | null;
      paid_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT p.id, p.order_id, o.order_number, o.status AS order_status, p.buyer_id,
              coalesce(b.store_name, u.display_name) AS buyer_name,
              p.status, p.amount, p.refunded_amount, p.currency, p.gateway,
              p.gateway_payment_reference, p.payment_method_type, p.failure_code, p.failure_message,
              p.reconciled_at, p.paid_at, p.created_at, p.updated_at
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         JOIN buyers b ON b.id = p.buyer_id
         LEFT JOIN users u ON u.id = b.user_id
        WHERE p.id = $1`,
      [paymentId],
    );
    if (!payment) throw new DomainError(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found');

    const [attempts, refunds, events] = await Promise.all([
      this.database.rows<{
        id: string;
        gateway: string;
        gateway_attempt_reference: string | null;
        status: string;
        amount: string;
        failure_code: string | null;
        failure_message: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, gateway, gateway_attempt_reference, status, amount, failure_code, failure_message,
                created_at, updated_at
           FROM payment_attempts WHERE payment_id = $1 ORDER BY created_at, id`,
        [paymentId],
      ),
      this.database.rows<{
        id: string;
        amount: string;
        status: string;
        reason: string | null;
        gateway_refund_reference: string | null;
        requested_by: string | null;
        failure_reason: string | null;
        processed_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, amount, status, reason, gateway_refund_reference, requested_by, failure_reason,
                processed_at, created_at
           FROM refunds WHERE payment_id = $1 ORDER BY created_at DESC`,
        [paymentId],
      ),
      this.database.rows<{
        id: string;
        external_event_id: string;
        event_type: string;
        signature_valid: boolean;
        processing_status: string;
        processing_attempts: number;
        processing_error: string | null;
        received_at: Date;
        processed_at: Date | null;
      }>(
        `SELECT id, external_event_id, event_type, signature_valid, processing_status,
                processing_attempts, processing_error, received_at, processed_at
           FROM payment_webhook_events
          WHERE payment_id = $1 OR payload_reference = $2
          ORDER BY received_at DESC
          LIMIT 50`,
        [paymentId, payment.gateway_payment_reference],
      ),
    ]);

    return {
      payment: {
        id: payment.id,
        orderId: payment.order_id,
        orderNumber: payment.order_number,
        orderStatus: payment.order_status,
        buyerId: payment.buyer_id,
        buyerName: payment.buyer_name,
        status: payment.status,
        amount: Number(payment.amount),
        refundedAmount: Number(payment.refunded_amount),
        refundableAmount: this.round(Math.max(0, Number(payment.amount) - Number(payment.refunded_amount))),
        currency: payment.currency,
        gateway: payment.gateway,
        providerReference: payment.gateway_payment_reference,
        method: payment.payment_method_type,
        failureCode: payment.failure_code,
        failureMessage: payment.failure_message,
        lastReconciledAt: payment.reconciled_at?.toISOString() ?? null,
        paidAt: payment.paid_at?.toISOString() ?? null,
        createdAt: payment.created_at.toISOString(),
        updatedAt: payment.updated_at.toISOString(),
      },
      attempts: attempts.map((attempt, index) => ({
        id: attempt.id,
        // Display order, not a stored column: the physical sequence is the creation order of the rows.
        attemptNumber: index + 1,
        gateway: attempt.gateway,
        status: attempt.status,
        amount: Number(attempt.amount),
        providerReference: attempt.gateway_attempt_reference,
        failureCode: attempt.failure_code,
        failureMessage: attempt.failure_message,
        createdAt: attempt.created_at.toISOString(),
        updatedAt: attempt.updated_at.toISOString(),
      })),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        amount: Number(refund.amount),
        currency: payment.currency,
        status: refund.status,
        reason: refund.reason,
        gatewayRefundReference: refund.gateway_refund_reference,
        requestedBy: refund.requested_by,
        failureReason: refund.failure_reason,
        processedAt: refund.processed_at?.toISOString() ?? null,
        createdAt: refund.created_at.toISOString(),
      })),
      webhookEvents: events.map((event) => ({
        id: event.id,
        externalEventId: event.external_event_id,
        eventType: event.event_type,
        signatureValid: event.signature_valid,
        processingStatus: event.processing_status,
        processingAttempts: event.processing_attempts,
        processingError: event.processing_error,
        receivedAt: event.received_at.toISOString(),
        processedAt: event.processed_at?.toISOString() ?? null,
      })),
    };
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private requireBuyer(actor: AuthenticatedActor): string {
    const buyerId = actor.buyerId ?? null;
    if (!buyerId) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Only a buyer account can act on its own payments');
    }
    return buyerId;
  }
}

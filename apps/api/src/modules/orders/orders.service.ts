/**
 * Checkout & orders — turning a basket into a commitment (cart/checkout/order spec §7-§12).
 *
 * This module owns every hard guarantee in the marketplace flow:
 *
 *  1. **Pricing is server-authoritative.** The client never sends prices. Every line is re-read from
 *     `supplier_product_listings` inside the order transaction and snapshotted onto the order, so a
 *     later price change cannot rewrite history.
 *  2. **Stock can never be oversold.** Each line takes a row-level conditional reservation:
 *     `UPDATE inventories SET reserved_quantity = reserved_quantity + :q
 *       WHERE id = :id AND available_quantity - reserved_quantity >= :q`.
 *     Postgres serialises the two competing updates; the loser matches zero rows and gets
 *     `INSUFFICIENT_STOCK`. Two buyers checking out for the last unit therefore cannot both win.
 *  3. **One order, many fulfilments.** A basket spanning several suppliers produces one order and one
 *     fulfilment per supplier (each with its own state machine), never a collapsed pseudo-status.
 *  4. **The gateway is called after the commit.** Provider failures are recorded *on the payment* and
 *     returned with the order — an order that exists must never be reported as though it failed, and a
 *     buyer whose gateway hiccuped must still be able to pay.
 *  5. **Payment is abstracted.** The service talks to the `PAYMENT_PROVIDER` token only.
 *  6. **Cancellation is guarded, never blind.** Only states that still allow it, only when nothing has
 *     been paid (a paid order needs a refund, which is a different command), and the reservation
 *     release is idempotent so a retried cancel cannot double-restock.
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  CartStatus,
  DeliveryMode,
  DomainEventName,
  ErrorCode,
  FulfillmentItemStatus,
  FulfillmentStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
  PrescriptionClassification,
  ReservationStatus,
} from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DATABASE } from '../../infrastructure/database/database.module';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payments-infra.module';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider';
import { PaymentProviderError } from '../../infrastructure/payments/payment-provider';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { paginate, sqlLimitOffset, type PagePaginationInput } from '../../common/pagination/pagination';

/* ------------------------------------------------------------------ schemas */

const deliveryModeEnum = z.enum([DeliveryMode.INSTANT, DeliveryMode.SCHEDULED]);
const paymentMethodEnum = z.enum([
  PaymentMethodType.UPI,
  PaymentMethodType.CARD,
  PaymentMethodType.NET_BANKING,
  PaymentMethodType.WALLET,
  PaymentMethodType.COD,
]);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the ISO date format YYYY-MM-DD');

/** Everything a quote and an order need. The order endpoint adds the payment method and note. */
const checkoutBase = {
  deliveryAddressId: z.string().uuid(),
  deliveryMode: deliveryModeEnum.default(DeliveryMode.SCHEDULED),
  deliverySlotId: z.string().uuid().nullish().transform((value) => value ?? undefined),
  deliveryDate: isoDate.nullish().transform((value) => value ?? undefined),
};

export const checkoutQuoteSchema = z.object(checkoutBase);

export const placeOrderSchema = z.object({
  ...checkoutBase,
  paymentMethod: paymentMethodEnum.default(PaymentMethodType.COD),
  buyerNote: z.string().trim().max(500).nullish().transform((value) => value ?? undefined),
});

export const orderListQuerySchema = z.object({
  status: z
    .enum([
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.PARTIALLY_FULFILLED,
      OrderStatus.FULFILLED,
      OrderStatus.CANCELLED,
      OrderStatus.CLOSED,
    ])
    .optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(300).nullish().transform((value) => value ?? undefined),
});

export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/* -------------------------------------------------------------------- types */

interface PricedLine {
  cartItemId: string;
  listingId: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  manufacturerName: string | null;
  composition: string | null;
  packSize: string | null;
  unitPrice: number;
  mrpReference: number | null;
  taxRate: number;
  quantity: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  inventoryId: string;
  availableQuantity: number;
  reservedQuantity: number;
  minimumOrderQuantity: number;
  issue: string | null;
}

interface AddressRow {
  id: string;
  label: string;
  contact_name: string;
  contact_phone: string;
  address_line_1: string;
  address_line_2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: string | null;
  longitude: string | null;
}

/**
 * Anything that can run a query — the pool itself or the transaction client. The checkout path must
 * work inside a transaction (`PoolClient` exposes `query` only), which is why the shared helpers take
 * this narrow shape instead of the full `Database` facade.
 */
type Queryable = { query: DatabaseType['query'] };

/**
 * Inventory statuses that may still be sold. `inventories.status` describes the shelf, not the
 * quantity: a LOW_STOCK or OUT_OF_STOCK row is sellable while `available - reserved` allows it, whereas
 * a quarantined, blocked, damaged, expired or recalled row must never be offered even with stock on it.
 */
const SELLABLE_INVENTORY_STATUSES = ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'];

/** `payments.gateway` is a constrained vocabulary; cash on delivery is not a gateway, it is its own value. */
const PAYMENT_GATEWAY_COD = 'cod';

/** Cancel is allowed only while the goods have not moved and no money has been captured. */
const CANCELLABLE_ORDER_STATUSES: string[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED];

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
  ) {}

  /* ------------------------------------------------------------------ quote */

  /**
   * POST /checkout/quote — price the basket without touching it.
   *
   * Read-only on purpose: a preview must never hold stock, create a payment or write an order. It is
   * the same validation and pricing code the order endpoint runs, so what the buyer sees is what the
   * order will charge.
   */
  async quote(actor: AuthenticatedActor, input: CheckoutQuoteInput) {
    const buyerId = this.requireBuyer(actor);
    const context = await this.prepare(this.database, buyerId, input, null);
    const fees = this.deliveryFee(input.deliveryMode);

    const issues = [
      ...context.issues,
      ...context.lines.filter((line) => line.issue).map((line) => this.lineIssue(line)),
    ].filter(Boolean);

    const placeable = issues.length === 0 && context.lines.length > 0;

    return {
      placeable,
      currency: context.currency,
      deliveryMode: input.deliveryMode,
      deliveryFee: fees.total,
      deliveryFeeBreakdown: fees.breakdown,
      subtotal: this.round(context.subtotal),
      taxTotal: this.round(context.taxTotal),
      discountTotal: 0,
      grandTotal: this.round(context.subtotal + context.taxTotal + fees.total),
      itemCount: context.lines.reduce((total, line) => total + line.quantity, 0),
      cartId: context.cartId,
      supplierCount: new Set(context.lines.map((line) => line.supplierId)).size,
      deliveryAddress: context.address ? this.presentAddress(context.address) : null,
      issues,
      lines: context.lines.map((line) => this.presentLine(line)),
      quotedAt: new Date().toISOString(),
    };
  }

  /* ------------------------------------------------------------- place order */

  /** POST /orders — validate, price, reserve, create the order, then ask the gateway for an intent. */
  async placeOrder(actor: AuthenticatedActor, input: PlaceOrderInput, requestId: string | null) {
    const buyerId = this.requireBuyer(actor);
    const fees = this.deliveryFee(input.deliveryMode);

    const result = await this.database.transaction(async (client) => {
      const context = await this.prepare(client, buyerId, input, input.paymentMethod);

      if (context.lines.length === 0) {
        throw new DomainError(ErrorCode.CART_EMPTY, 'Your basket is empty');
      }

      const blocking = [
        ...context.issues,
        ...context.lines.filter((line) => line.issue).map((line) => this.lineIssue(line)),
      ].filter(Boolean);
      if (blocking.length > 0) {
        throw new DomainError(ErrorCode.CHECKOUT_VALIDATION_FAILED, 'This basket cannot be ordered yet', {
          httpStatus: 422,
          details: { issues: blocking },
        });
      }

      /* 1. Reserve every line. Deterministic order (by inventory id) keeps concurrent checkouts from
         deadlocking against each other; the guarded predicate is what makes the last unit safe. */
      const ordered = [...context.lines].sort((left, right) => left.inventoryId.localeCompare(right.inventoryId));
      for (const line of ordered) {
        const reserved = await client.query<{ reserved_quantity: number; available_quantity: number }>(
          `UPDATE inventories
              SET reserved_quantity = reserved_quantity + $2, updated_at = now()
            WHERE id = $1
              AND status = ANY($3::TEXT[])
              AND available_quantity - reserved_quantity >= $2
        RETURNING available_quantity, reserved_quantity`,
          [line.inventoryId, line.quantity, SELLABLE_INVENTORY_STATUSES],
        );
        if ((reserved.rowCount ?? 0) === 0) {
          const current = await client.query<{ available_quantity: number; reserved_quantity: number }>(
            `SELECT available_quantity, reserved_quantity FROM inventories WHERE id = $1`,
            [line.inventoryId],
          );
          const sellable = Math.max(
            (current.rows[0]?.available_quantity ?? 0) - (current.rows[0]?.reserved_quantity ?? 0),
            0,
          );
          throw new DomainError(
            ErrorCode.INSUFFICIENT_STOCK,
            sellable === 0
              ? `${line.productName} sold out while you were checking out`
              : `Only ${sellable} unit(s) of ${line.productName} are still available`,
            { details: { supplierProductId: line.listingId, availableQuantity: sellable } },
          );
        }
      }

      const subtotal = this.round(context.lines.reduce((total, line) => total + line.lineSubtotal, 0));
      const taxTotal = this.round(context.lines.reduce((total, line) => total + line.lineTax, 0));
      const grandTotal = this.round(subtotal + taxTotal + fees.total);

      const cashOnDelivery = context.paymentMethod === PaymentMethodType.COD;
      const orderStatus = cashOnDelivery ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT;

      /* 2. The order itself. `prepared:order_number` is the database's job (`BZ-2026-000001`). */
      const orderRow = await client.query<{ id: string; order_number: string; created_at: Date }>(
        `INSERT INTO orders
           (order_number, buyer_id, status, payment_status, currency, subtotal, discount_total, tax_total,
            delivery_fee, grand_total, delivery_mode, delivery_date, delivery_slot_id,
            shipping_address_snapshot, buyer_note, placed_at, confirmed_at)
         VALUES (bezzo_next_order_number(), $1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12::JSONB, $13,
                 now(), CASE WHEN $14::BOOLEAN THEN now() ELSE NULL END)
         RETURNING id, order_number, created_at`,
        [
          buyerId,
          orderStatus,
          PaymentStatus.PENDING,
          context.currency,
          subtotal,
          taxTotal,
          fees.total,
          grandTotal,
          input.deliveryMode,
          context.deliveryDate,
          context.deliverySlotId,
          JSON.stringify(this.addressSnapshot(context.address)),
          input.buyerNote ?? null,
          cashOnDelivery,
        ],
      );
      const order = orderRow.rows[0];
      if (!order) throw new Error('Order insert returned no row');

      /* 3. Lines, fulfilments and reservations. */
      const itemIds = new Map<string, string>();
      for (const line of context.lines) {
        const itemRow = await client.query<{ id: string }>(
          `INSERT INTO order_items
             (order_id, product_id, supplier_listing_id, supplier_id, product_name_snapshot,
              manufacturer_snapshot, composition_snapshot, pack_size_snapshot, unit_price, mrp_snapshot,
              tax_rate_snapshot, quantity, discount_amount, tax_amount, line_total, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,$15)
           RETURNING id`,
          [
            order.id,
            line.productId,
            line.listingId,
            line.supplierId,
            line.productName,
            line.manufacturerName,
            line.composition,
            line.packSize,
            line.unitPrice,
            line.mrpReference,
            line.taxRate,
            line.quantity,
            this.round(line.lineTax),
            this.round(line.lineTotal),
            cashOnDelivery ? OrderItemStatus.CONFIRMED : OrderItemStatus.PENDING,
          ],
        );
        const itemId = itemRow.rows[0]?.id;
        if (!itemId) throw new Error('Order item insert returned no row');
        itemIds.set(line.cartItemId, itemId);

        // The TTL is a *payment* window, so it only applies to an order that is still waiting for money.
        // Cash on delivery commits at placement — there is no window to wait for — and holding it as
        // ACTIVE would let the expiry job return the stock to the shelf while the order is live and
        // expected to be fulfilled. A paid order is flipped to CONFIRMED by the payment capture.
        await client.query(
          `INSERT INTO inventory_reservations (inventory_id, order_id, order_item_id, quantity, status, expires_at, confirmed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            line.inventoryId,
            order.id,
            itemId,
            line.quantity,
            cashOnDelivery ? ReservationStatus.CONFIRMED : ReservationStatus.ACTIVE,
            // `expires_at` is NULL for a committed reservation: no timer can release it (migration 0017).
            cashOnDelivery ? null : new Date(Date.now() + this.config.RESERVATION_TTL_SECONDS * 1_000),
            cashOnDelivery ? new Date() : null,
          ],
        );
      }

      const fulfillmentSummaries: Array<{
        fulfillmentId: string;
        fulfillmentReference: string;
        supplierId: string;
        supplierName: string;
        subtotal: number;
        taxTotal: number;
        deliveryAllocation: number;
        total: number;
        status: string;
        itemCount: number;
      }> = [];

      const supplierIds = [...new Set(context.lines.map((line) => line.supplierId))];
      /* The buyer pays one delivery fee for the order, so the fee is split across suppliers — never
         charged once per supplier. The remainder lands on the first satisfaction so that the
         allocations always add up to exactly what the buyer is charged. */
      const allocations = this.splitFee(fees.total, supplierIds.length);
      let index = 0;
      for (const supplierId of supplierIds) {
        const deliveryAllocation = allocations[index] ?? 0;
        index += 1;
        const supplierLines = context.lines.filter((line) => line.supplierId === supplierId);
        const supplierSubtotal = this.round(supplierLines.reduce((total, line) => total + line.lineSubtotal, 0));
        const supplierTax = this.round(supplierLines.reduce((total, line) => total + line.lineTax, 0));
        const supplierUnits = supplierLines.reduce((total, line) => total + line.quantity, 0);

        const fulfillmentRow = await client.query<{ id: string; fulfillment_reference: string; status: string }>(
          `INSERT INTO fulfillments
             (order_id, supplier_id, fulfillment_reference, status, subtotal, discount_total, tax_total,
              delivery_allocation, total, package_count)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,1)
           RETURNING id, fulfillment_reference, status`,
          [
            order.id,
            supplierId,
            `${order.order_number}-F${index}`,
            FulfillmentStatus.CREATED,
            supplierSubtotal,
            supplierTax,
            deliveryAllocation,
            this.round(supplierSubtotal + supplierTax + deliveryAllocation),
          ],
        );
        const fulfillment = fulfillmentRow.rows[0];
        if (!fulfillment) throw new Error('Fulfillment insert returned no row');

        for (const line of supplierLines) {
          const orderItemId = itemIds.get(line.cartItemId);
          if (!orderItemId) continue;
          await client.query(
            `INSERT INTO fulfillment_items (fulfillment_id, order_item_id, quantity, status)
             VALUES ($1,$2,$3,$4)`,
            [fulfillment.id, orderItemId, line.quantity, FulfillmentItemStatus.PENDING],
          );
        }

        fulfillmentSummaries.push({
          fulfillmentId: fulfillment.id,
          fulfillmentReference: fulfillment.fulfillment_reference,
          supplierId,
          supplierName: supplierLines[0]?.supplierName ?? 'Supplier',
          subtotal: supplierSubtotal,
          taxTotal: supplierTax,
          deliveryAllocation,
          total: this.round(supplierSubtotal + supplierTax + deliveryAllocation),
          status: fulfillment.status,
          itemCount: supplierUnits,
        });
      }

      /* 4. Payment row. `gateway` is the configured provider or `cod`; the intent is created after
         the commit so a gateway timeout can never roll back a placed order. */
      const gateway = cashOnDelivery ? PAYMENT_GATEWAY_COD : this.payments.name;
      const paymentRow = await client.query<{ id: string }>(
        `INSERT INTO payments
           (order_id, buyer_id, gateway, amount, currency, status, payment_method_type, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          order.id,
          buyerId,
          gateway,
          grandTotal,
          context.currency,
          PaymentStatus.PENDING,
          context.paymentMethod,
          `${order.id}:intent:1`,
        ],
      );
      const paymentId = paymentRow.rows[0]?.id;
      if (!paymentId) throw new Error('Payment insert returned no row');

      /* 5. The checkout attempt is auditable in its own right (pricing snapshot, address, method). */
      const sessionRow = await client.query<{ id: string }>(
        `INSERT INTO checkout_sessions
           (buyer_id, cart_id, status, idempotency_key, delivery_mode, delivery_date, delivery_slot_id,
            address_id, shipping_address_snapshot, payment_method, currency, calculated_subtotal,
            discount_total, tax_total, delivery_fee, grand_total, pricing_snapshot, order_id, expires_at)
         VALUES ($1,$2,'ORDER_CREATED',$3,$4,$5,$6,$7,$8::JSONB,$9,$10,$11,0,$12,$13,$14,$15::JSONB,$16, now() + make_interval(secs => $17))
         RETURNING id`,
        [
          buyerId,
          context.cartId,
          requestId ?? `${order.id}:checkout`,
          input.deliveryMode,
          context.deliveryDate,
          context.deliverySlotId,
          context.address?.id ?? null,
          JSON.stringify(this.addressSnapshot(context.address)),
          context.paymentMethod,
          context.currency,
          subtotal,
          taxTotal,
          fees.total,
          grandTotal,
          JSON.stringify({
            lines: context.lines.map((line) => this.presentLine(line)),
            deliveryFeeBreakdown: fees.breakdown,
          }),
          order.id,
          this.config.RESERVATION_TTL_SECONDS,
        ],
      );

      await client.query(`UPDATE orders SET checkout_session_id = $2 WHERE id = $1`, [
        order.id,
        sessionRow.rows[0]?.id ?? null,
      ]);

      /* 6. The basket becomes history: a new one is created lazily on the next visit. */
      await client.query(`UPDATE carts SET status = $2, updated_at = now() WHERE id = $1`, [
        context.cartId,
        CartStatus.CONVERTED,
      ]);

      const writeHistory = (fromStatus: string | null, toStatus: string, reason: string) =>
        client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, reason, actor_type, actor_id, request_id)
           VALUES ($1,$2,$3,$4,'BUYER',$5,$6)`,
          [order.id, fromStatus, toStatus, reason, actor.userId, requestId],
        );
      await writeHistory(
        null,
        orderStatus,
        cashOnDelivery
          ? 'Order placed — cash on delivery, nothing to pay online'
          : 'Order placed — awaiting payment',
      );

      await this.events.emit(client, {
        eventName: DomainEventName.OrderCreated,
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          orderNumber: order.order_number,
          buyerId,
          grandTotal,
          currency: context.currency,
          supplierCount: supplierIds.length,
          deliveryMode: input.deliveryMode,
          paymentMethod: context.paymentMethod,
        },
      });
      if (cashOnDelivery) {
        await this.events.emit(client, {
          eventName: DomainEventName.OrderConfirmed,
          aggregateType: 'order',
          aggregateId: order.id,
          payload: { orderNumber: order.order_number, buyerId, reason: 'CASH_ON_DELIVERY', grandTotal },
        });
      }

      await this.audit.record(client, {
        action: 'order.placed',
        resourceType: 'order',
        resourceId: order.id,
        metadata: {
          orderNumber: order.order_number,
          grandTotal,
          itemCount: context.lines.length,
          supplierCount: supplierIds.length,
          deliveryMode: input.deliveryMode,
          paymentMethod: context.paymentMethod,
        },
      });

      return {
        order,
        paymentId,
        grandTotal,
        currency: context.currency,
        fulfillmentSummaries,
        cashOnDelivery,
      };
    });

    /* -------------------------------- after the commit: the gateway, never before ------------- */
    // `input.paymentMethod` is non-COD here, which is exactly what the provider contract expects.
    let paymentStatus: string = PaymentStatus.PENDING;
    let providerPayload: Record<string, unknown> | null = null;
    let providerReference: string | null = null;
    let paymentFailure: { code: string; message: string } | null = null;

    if (!result.cashOnDelivery) {
      try {
        const intent = await this.payments.createIntent({
          orderId: result.order.id,
          orderNumber: result.order.order_number,
          amount: result.grandTotal,
          currency: result.currency,
          method: input.paymentMethod,
          buyerId,
          idempotencyKey: `${result.order.id}:intent:1`,
        });
        providerReference = intent.providerReference;
        providerPayload = intent.providerPayload;

        await this.database.transaction(async (client) => {
          await client.query(
            `UPDATE payments
                SET gateway_payment_reference = $2, gateway_order_reference = $3, updated_at = now()
              WHERE id = $1`,
            [result.paymentId, intent.providerReference, intent.providerOrderReference],
          );
          await client.query(
            `INSERT INTO payment_attempts (payment_id, gateway, gateway_attempt_reference, status, amount)
             VALUES ($1,$2,$3,'INITIATED',$4)`,
            [result.paymentId, this.payments.name, intent.providerReference, result.grandTotal],
          );
          await this.events.emit(client, {
            eventName: DomainEventName.PaymentInitiated,
            aggregateType: 'payment',
            aggregateId: result.paymentId,
            payload: {
              orderId: result.order.id,
              orderNumber: result.order.order_number,
              gateway: this.payments.name,
              amount: result.grandTotal,
              providerReference: intent.providerReference,
            },
          });
        });
      } catch (error) {
        const providerError = error instanceof PaymentProviderError ? error : null;
        paymentStatus = PaymentStatus.FAILED;
        paymentFailure = {
          code: ErrorCode.PAYMENT_PROVIDER_ERROR,
          message: providerError?.message ?? 'The payment gateway could not be reached',
        };
        // The order stands; only the payment failed, and the buyer can retry paying for it.
        await this.database.transaction(async (client) => {
          await client.query(
            `UPDATE payments
                SET status = $2, failed_at = now(), failure_code = $3, failure_message = $4, updated_at = now()
              WHERE id = $1`,
            [result.paymentId, PaymentStatus.FAILED, paymentFailure?.code ?? null, paymentFailure?.message ?? null],
          );
          await client.query(
            `INSERT INTO payment_attempts (payment_id, gateway, status, amount, failure_code, failure_message)
             VALUES ($1,$2,'FAILED',$3,$4,$5)`,
            [result.paymentId, this.payments.name, result.grandTotal, paymentFailure?.code ?? null, paymentFailure?.message ?? null],
          );
          await this.events.emit(client, {
            eventName: DomainEventName.PaymentFailed,
            aggregateType: 'payment',
            aggregateId: result.paymentId,
            payload: {
              orderId: result.order.id,
              orderNumber: result.order.order_number,
              gateway: this.payments.name,
              failureCode: paymentFailure?.code ?? null,
            },
          });
        });
      }
    }

    const detail = await this.detailInternal(result.order.id, buyerId);
    return {
      ...detail,
      payment: detail.payment
        ? {
            ...detail.payment,
            status: paymentStatus === PaymentStatus.FAILED ? PaymentStatus.FAILED : detail.payment.status,
            providerPayload,
            providerReference: providerReference ?? detail.payment.providerReference,
            failure: paymentFailure,
          }
        : null,
    };
  }

  /* ---------------------------------------------------------------- read APIs */

  /** GET /orders — the buyer's own order history (ownership enforced in SQL). */
  async list(actor: AuthenticatedActor, query: OrderListQuery) {
    const buyerId = this.requireBuyer(actor);
    const { limit, offset } = sqlLimitOffset(query as PagePaginationInput);

    const filters: string[] = ['o.buyer_id = $1'];
    const params: unknown[] = [buyerId];
    if (query.status) {
      params.push(query.status);
      filters.push(`o.status = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      filters.push(`o.placed_at >= $${params.length}::DATE`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`o.placed_at < ($${params.length}::DATE + INTERVAL '1 day')`);
    }
    const where = filters.join(' AND ');

    const total = await this.database.row<{ count: string }>(
      `SELECT count(*)::TEXT AS count FROM orders o WHERE ${where}`,
      params,
    );

    const rows = await this.database.rows<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      currency: string;
      subtotal: string;
      tax_total: string;
      delivery_fee: string;
      grand_total: string;
      delivery_mode: string;
      delivery_date: Date | null;
      placed_at: Date;
      confirmed_at: Date | null;
      cancelled_at: Date | null;
      item_count: string;
      unit_count: string;
      supplier_count: string;
      fulfillment_statuses: string[] | null;
    }>(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.currency, o.subtotal, o.tax_total,
              o.delivery_fee, o.grand_total, o.delivery_mode, o.delivery_date, o.placed_at,
              o.confirmed_at, o.cancelled_at,
              (SELECT count(*)::TEXT FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              (SELECT COALESCE(sum(oi.quantity), 0)::TEXT FROM order_items oi WHERE oi.order_id = o.id) AS unit_count,
              (SELECT count(*)::TEXT FROM fulfillments f WHERE f.order_id = o.id) AS supplier_count,
              (SELECT array_agg(DISTINCT f.status) FROM fulfillments f WHERE f.order_id = o.id) AS fulfillment_statuses
         FROM orders o
        WHERE ${where}
        ORDER BY o.placed_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return paginate(
      rows.map((row) => this.presentSummary(row)),
      Number(total?.count ?? 0),
      query as PagePaginationInput,
    );
  }

  /** GET /orders/:orderId */
  async detail(actor: AuthenticatedActor, orderId: string) {
    const buyerId = this.requireBuyer(actor);
    return this.detailInternal(orderId, buyerId);
  }

  /* ----------------------------------------------------------------- cancel */

  /**
   * POST /orders/:orderId/cancel — give the stock back.
   *
   * The release is written as `ACTIVE → RELEASED` with a guarded decrement, so calling cancel twice
   * can never inflate stock: the second call finds no active reservation and reports the order as
   * already cancelled instead of restocking twice.
   */
  async cancel(actor: AuthenticatedActor, orderId: string, reason: string | undefined, requestId: string | null) {
    const buyerId = this.requireBuyer(actor);

    const outcome = await this.database.transaction(async (client) => {
      const found = await client.query<{ id: string; order_number: string; status: string; payment_status: string }>(
        `SELECT id, order_number, status, payment_status FROM orders
          WHERE id = $1 AND buyer_id = $2 FOR UPDATE`,
        [orderId, buyerId],
      );
      const order = found.rows[0];
      if (!order) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');

      if (order.status === OrderStatus.CANCELLED) {
        throw new DomainError(ErrorCode.ORDER_ALREADY_CANCELLED, 'This order is already cancelled');
      }
      if (!CANCELLABLE_ORDER_STATUSES.includes(order.status)) {
        throw new DomainError(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          'This order has already moved past the point where it can be cancelled — contact support',
          { details: { status: order.status } },
        );
      }
      if (order.payment_status === PaymentStatus.PAID || order.payment_status === PaymentStatus.PARTIALLY_REFUNDED) {
        // A refund is a different command with its own money-movement audit trail (payments phase).
        throw new DomainError(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          'This order is already paid; raise a refund request instead of cancelling it',
          { details: { paymentStatus: order.payment_status } },
        );
      }

      // ACTIVE *and* CONFIRMED both hold stock in `inventories.reserved_quantity`, so both must be
      // returned when the order is cancelled — a cash-on-delivery order is confirmed at placement and
      // would otherwise strand its units forever.
      const released = await client.query<{ inventory_id: string; quantity: number; status: string }>(
        `UPDATE inventory_reservations
            SET status = $2, released_at = now(), release_reason = $3, updated_at = now()
          WHERE order_id = $1 AND status IN ($4, $5)
      RETURNING inventory_id, quantity, status`,
        [
          orderId,
          ReservationStatus.RELEASED,
          reason ?? 'Buyer cancelled the order',
          ReservationStatus.ACTIVE,
          ReservationStatus.CONFIRMED,
        ],
      );

      let releasedUnits = 0;
      for (const reservation of released.rows) {
        const updated = await client.query(
          `UPDATE inventories
              SET reserved_quantity = reserved_quantity - $2, updated_at = now()
            WHERE id = $1 AND reserved_quantity >= $2`,
          [reservation.inventory_id, reservation.quantity],
        );
        if ((updated.rowCount ?? 0) === 0) {
          // Invariant breach: never silently continue with stock that does not add up.
          throw new Error(
            `Reservation release would drive inventories.reserved_quantity below zero for ${reservation.inventory_id}`,
          );
        }
        releasedUnits += reservation.quantity;
      }

      await client.query(
        `UPDATE orders
            SET status = $2, payment_status = $3, cancelled_at = now(), cancellation_reason = $4,
                updated_at = now()
          WHERE id = $1`,
        [orderId, OrderStatus.CANCELLED, PaymentStatus.CANCELLED, reason ?? 'Cancelled by the buyer'],
      );
      await client.query(
        `UPDATE order_items SET status = $2, updated_at = now() WHERE order_id = $1 AND status <> $2`,
        [orderId, OrderItemStatus.CANCELLED],
      );
      await client.query(
        `UPDATE fulfillment_items
            SET status = $2, updated_at = now()
          WHERE fulfillment_id IN (SELECT id FROM fulfillments WHERE order_id = $1)
            AND status <> $2`,
        [orderId, FulfillmentItemStatus.CANCELLED],
      );
      await client.query(
        `UPDATE fulfillments
            SET status = $2, cancelled_at = now(), cancellation_reason = $3, updated_at = now()
          WHERE order_id = $1 AND status IN ($4, $5)`,
        [orderId, FulfillmentStatus.CANCELLED, reason ?? 'Cancelled by the buyer', FulfillmentStatus.CREATED, FulfillmentStatus.ALLOCATED],
      );
      await client.query(
        `UPDATE payments
            SET status = $2, updated_at = now()
          WHERE order_id = $1 AND status = $3`,
        [orderId, PaymentStatus.CANCELLED, PaymentStatus.PENDING],
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, reason, actor_type, actor_id, request_id)
         VALUES ($1,$2,$3,$4,'BUYER',$5,$6)`,
        [orderId, order.status, OrderStatus.CANCELLED, reason ?? 'Cancelled by the buyer', actor.userId, requestId],
      );

      if (released.rows.length > 0) {
        await this.events.emit(client, {
          eventName: DomainEventName.InventoryReservationReleased,
          aggregateType: 'order',
          aggregateId: orderId,
          payload: { reason: reason ?? 'ORDER_CANCELLED', releasedLines: released.rows.length, releasedUnits },
        });
      }
      await this.events.emit(client, {
        eventName: DomainEventName.OrderCancelled,
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {
          orderNumber: order.order_number,
          buyerId,
          reason: reason ?? 'Cancelled by the buyer',
          releasedUnits,
        },
      });
      await this.audit.record(client, {
        action: 'order.cancelled',
        resourceType: 'order',
        resourceId: orderId,
        metadata: { orderNumber: order.order_number, releasedLines: released.rows.length, releasedUnits },
      });

      return { orderNumber: order.order_number, releasedLines: released.rows.length, releasedUnits };
    });

    const detail = await this.detailInternal(orderId, buyerId);
    return { ...detail, cancellation: outcome };
  }

  /* --------------------------------------------------------------- internals */

  /**
   * Shared validation + pricing used by both the quote and the order.
   *
   * `queryable` is either the pool or the transaction client, which is what lets the order path price
   * and reserve inside one atomic unit while the quote path stays read-only.
   */
  private async prepare(
    queryable: Queryable,
    buyerId: string,
    input: CheckoutQuoteInput,
    paymentMethod: string | null,
  ) {
    const cart = (
      await queryable.query<{ id: string; currency: string }>(
      `SELECT id, currency FROM carts
        WHERE buyer_id = $1 AND status IN ('ACTIVE','CHECKOUT_STARTED')
        ORDER BY created_at DESC LIMIT 1`,
        [buyerId],
      )
    ).rows[0];
    if (!cart) throw new DomainError(ErrorCode.CART_EMPTY, 'Your basket is empty');

    const buyer = (
      await queryable.query<{ status: string; verification_status: string }>(
        `SELECT status, verification_status FROM buyers WHERE id = $1`,
        [buyerId],
      )
    ).rows[0];
    if (!buyer || buyer.status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.BUYER_SUSPENDED, 'This account cannot place orders right now');
    }

    const address = (
      await queryable.query<AddressRow>(
        `SELECT id, label, contact_name, contact_phone, address_line_1, address_line_2, landmark, city, state,
                postal_code, country, latitude, longitude
           FROM buyer_addresses
          WHERE id = $1 AND buyer_id = $2 AND status = 'ACTIVE'`,
        [input.deliveryAddressId, buyerId],
      )
    ).rows[0];
    if (!address) {
      throw new DomainError(ErrorCode.DELIVERY_ADDRESS_INVALID, 'Choose a valid delivery address of your own', {
        details: { deliveryAddressId: input.deliveryAddressId },
      });
    }

    const rows = (await queryable.query<{
      cart_item_id: string;
      listing_id: string;
      supplier_id: string;
      supplier_name: string;
      supplier_status: string;
      supplier_verification_status: string;
      product_id: string;
      product_name: string;
      manufacturer_name: string | null;
      composition: string | null;
      pack_size: string | null;
      pack_unit: string | null;
      prescription_classification: string;
      product_status: string;
      listing_status: string;
      quantity: number;
      selling_price: string;
      mrp_reference: string | null;
      tax_rate: string | null;
      minimum_order_quantity: number;
      inventory_id: string | null;
      inventory_status: string | null;
      available_quantity: number | null;
      reserved_quantity: number | null;
    }>(
      `SELECT ci.id AS cart_item_id, ci.supplier_listing_id AS listing_id, ci.supplier_id,
              s.display_name AS supplier_name, s.status AS supplier_status,
              s.verification_status AS supplier_verification_status,
              p.id AS product_id, p.name AS product_name, p.prescription_classification,
              p.status AS product_status, p.pack_size, p.pack_unit,
              m.name AS manufacturer_name, p.composition_summary AS composition,
              ci.quantity, l.selling_price, l.mrp_reference, l.tax_rate, l.minimum_order_quantity,
              l.status AS listing_status,
              i.id AS inventory_id, i.status AS inventory_status,
              i.available_quantity, i.reserved_quantity
         FROM cart_items ci
         JOIN supplier_product_listings l ON l.id = ci.supplier_listing_id
         JOIN suppliers s ON s.id = ci.supplier_id
         JOIN products p ON p.id = l.product_id
         LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
          WHERE ci.cart_id = $1
          ORDER BY s.display_name, p.name`,
        [cart.id],
      )
    ).rows;

    const issues: Array<{ code: string; message: string; supplierProductId?: string }> = [];
    const lines: PricedLine[] = [];

    for (const row of rows) {
      let issue: string | null = null;
      const sellable = Math.max((row.available_quantity ?? 0) - (row.reserved_quantity ?? 0), 0);

      if (!row.inventory_id || !SELLABLE_INVENTORY_STATUSES.includes(row.inventory_status ?? '')) {
        issue = 'INVENTORY_UNAVAILABLE';
      } else if (row.listing_status !== 'ACTIVE') {
        issue = 'LISTING_UNAVAILABLE';
      } else if (row.supplier_status !== 'ACTIVE' || row.supplier_verification_status !== 'VERIFIED') {
        issue = 'SUPPLIER_NOT_VERIFIED';
      } else if (row.product_status !== 'PUBLISHED') {
        issue = 'PRODUCT_UNAVAILABLE';
      } else if (row.quantity < row.minimum_order_quantity) {
        issue = 'BELOW_MINIMUM_QUANTITY';
      } else if (row.quantity > sellable) {
        issue = 'INSUFFICIENT_STOCK';
      } else if (
        this.isRestricted(row.prescription_classification) &&
        buyer.verification_status !== 'VERIFIED'
      ) {
        issue = 'BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM';
      }

      const unitPrice = Number(row.selling_price);
      const taxRate = row.tax_rate ? Number(row.tax_rate) : 0;
      const lineSubtotal = this.round(unitPrice * row.quantity);
      const lineTax = this.round((lineSubtotal * taxRate) / 100);

      lines.push({
        cartItemId: row.cart_item_id,
        listingId: row.listing_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        productId: row.product_id,
        productName: row.product_name,
        manufacturerName: row.manufacturer_name,
        composition: row.composition,
        packSize: [row.pack_size, row.pack_unit].filter(Boolean).join(' ') || null,
        unitPrice,
        mrpReference: row.mrp_reference ? Number(row.mrp_reference) : null,
        taxRate,
        quantity: row.quantity,
        lineSubtotal,
        lineTax,
        lineTotal: this.round(lineSubtotal + lineTax),
        inventoryId: row.inventory_id ?? '',
        availableQuantity: row.available_quantity ?? 0,
        reservedQuantity: row.reserved_quantity ?? 0,
        minimumOrderQuantity: row.minimum_order_quantity,
        issue,
      });
    }

    /* Serviceability: the supplier must have declared this postal code for this delivery mode.
       Missing coverage is reported, never silently dropped from the order. */
    const supplierIds = [...new Set(lines.map((line) => line.supplierId))];
    if (supplierIds.length > 0) {
      const areas = (
        await queryable.query<{ supplier_id: string; service_type: string }>(
          `SELECT supplier_id, service_type FROM supplier_service_areas
            WHERE supplier_id = ANY($1::UUID[]) AND postal_code = $2 AND active = TRUE`,
          [supplierIds, address.postal_code],
        )
      ).rows;
      const required = input.deliveryMode === DeliveryMode.INSTANT ? ['INSTANT', 'BOTH'] : ['SCHEDULED', 'BOTH'];
      const covered = new Set(areas.filter((area) => required.includes(area.service_type)).map((area) => area.supplier_id));
      for (const supplierId of supplierIds) {
        if (covered.has(supplierId)) continue;
        const supplierName = lines.find((line) => line.supplierId === supplierId)?.supplierName ?? 'A supplier';
        issues.push({
          code: 'DELIVERY_UNAVAILABLE',
          message:
            input.deliveryMode === DeliveryMode.INSTANT
              ? `${supplierName} does not offer instant delivery to ${address.postal_code}`
              : `${supplierName} does not deliver to ${address.postal_code} yet`,
        });
      }
    }

    const deliveryDate = this.resolveDeliveryDate(input, issues);
    const deliverySlotId = await this.resolveSlot(queryable, input, deliveryDate, issues);

    const subtotal = this.round(
      lines.filter((line) => !line.issue).reduce((total, line) => total + line.lineSubtotal, 0),
    );
    const taxTotal = this.round(
      lines.filter((line) => !line.issue).reduce((total, line) => total + line.lineTax, 0),
    );

    return {
      cartId: cart.id,
      currency: cart.currency,
      address,
      lines,
      issues,
      subtotal,
      taxTotal,
      deliveryDate,
      deliverySlotId,
      paymentMethod,
    };
  }

  private resolveDeliveryDate(
    input: CheckoutQuoteInput,
    issues: Array<{ code: string; message: string }>,
  ): string | null {
    if (input.deliveryMode === DeliveryMode.INSTANT) {
      if (input.deliveryDate) {
        issues.push({
          code: 'DELIVERY_DATE_NOT_APPLICABLE',
          message: 'An instant delivery is dispatched within the hour — pick a slot date on a scheduled order',
        });
      }
      return null;
    }
    if (!input.deliveryDate) return null;
    const today = new Date();
    /* Business timezone is Asia/Kolkata; compare on the calendar date rather than raw ms so a late
       evening order in IST is not rejected by a UTC clock. */
    const todayIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.config.BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(today);
    if (input.deliveryDate < todayIst) {
      issues.push({ code: 'DELIVERY_DATE_IN_PAST', message: 'The delivery date cannot be in the past' });
    }
    return input.deliveryDate;
  }

  private async resolveSlot(
    queryable: Queryable,
    input: CheckoutQuoteInput,
    deliveryDate: string | null,
    issues: Array<{ code: string; message: string }>,
  ): Promise<string | null> {
    if (input.deliveryMode === DeliveryMode.INSTANT) {
      if (input.deliverySlotId) {
        issues.push({
          code: 'DELIVERY_SLOT_NOT_APPLICABLE',
          message: 'Instant deliveries are not bound to a slot',
        });
      }
      return null;
    }
    if (!input.deliverySlotId) {
      issues.push({ code: 'DELIVERY_SLOT_REQUIRED', message: 'Choose a delivery slot for a scheduled order' });
      return null;
    }
    const slot = (
      await queryable.query<{ id: string; name: string }>(
        `SELECT id, name FROM delivery_slots WHERE id = $1 AND active = TRUE`,
        [input.deliverySlotId],
      )
    ).rows[0];
    if (!slot) {
      issues.push({ code: 'DELIVERY_SLOT_UNAVAILABLE', message: 'That delivery slot is no longer offered' });
      return null;
    }
    if (!deliveryDate) {
      issues.push({ code: 'DELIVERY_DATE_REQUIRED', message: 'Choose a delivery date for a scheduled order' });
      return null;
    }
    return slot.id;
  }

  /** Delivery pricing lives in configuration; the total is what the buyer pays, whoever fulfils. */
  private deliveryFee(mode: string) {
    const base = Number(this.config.DELIVERY_FEE_DEFAULT);
    const surcharge = mode === DeliveryMode.INSTANT ? Number(this.config.INSTANT_DELIVERY_SURCHARGE) : 0;
    return {
      total: this.round(base + surcharge),
      breakdown: {
        base,
        instantSurcharge: surcharge,
        currency: this.config.DEFAULT_CURRENCY,
      },
    };
  }

  /** Split an amount into `parts` shares whose sum is exactly the original amount. */
  private splitFee(amount: number, parts: number): number[] {
    if (parts <= 0) return [];
    const share = Math.floor((amount * 100) / parts) / 100;
    const shares = new Array<number>(parts).fill(share);
    shares[0] = this.round(amount - share * (parts - 1));
    return shares;
  }

  private async detailInternal(orderId: string, buyerId: string) {
    const order = await this.database.row<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      currency: string;
      subtotal: string;
      discount_total: string;
      tax_total: string;
      delivery_fee: string;
      grand_total: string;
      delivery_mode: string;
      delivery_date: Date | null;
      shipping_address_snapshot: Record<string, unknown>;
      buyer_note: string | null;
      placed_at: Date | null;
      confirmed_at: Date | null;
      cancelled_at: Date | null;
      completed_at: Date | null;
      created_at: Date;
      checkout_session_id: string | null;
    }>(
      `SELECT o.* FROM orders o WHERE o.id = $1 AND o.buyer_id = $2`,
      [orderId, buyerId],
    );
    if (!order) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');

    const items = await this.database.rows<{
      id: string;
      product_id: string;
      supplier_listing_id: string;
      supplier_id: string;
      supplier_name: string | null;
      product_name_snapshot: string;
      manufacturer_snapshot: string | null;
      composition_snapshot: string | null;
      pack_size_snapshot: string | null;
      unit_price: string;
      mrp_snapshot: string | null;
      tax_rate_snapshot: string | null;
      quantity: number;
      discount_amount: string;
      tax_amount: string;
      line_total: string;
      status: string;
    }>(
      `SELECT oi.id, oi.product_id, oi.supplier_listing_id, oi.supplier_id, s.display_name AS supplier_name,
              oi.product_name_snapshot, oi.manufacturer_snapshot, oi.composition_snapshot, oi.pack_size_snapshot,
              oi.unit_price, oi.mrp_snapshot, oi.tax_rate_snapshot, oi.quantity, oi.discount_amount, oi.tax_amount,
              oi.line_total, oi.status
         FROM order_items oi
         LEFT JOIN suppliers s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1
        ORDER BY s.display_name NULLS LAST, oi.product_name_snapshot`,
      [orderId],
    );

    const fulfillments = await this.database.rows<{
      id: string;
      fulfillment_reference: string;
      supplier_id: string;
      supplier_name: string | null;
      status: string;
      subtotal: string;
      discount_total: string;
      tax_total: string;
      delivery_allocation: string;
      total: string;
      package_count: number;
      accepted_at: Date | null;
      packed_at: Date | null;
      ready_at: Date | null;
      collected_at: Date | null;
      delivered_at: Date | null;
      cancelled_at: Date | null;
      item_count: string;
      unit_count: string;
    }>(
      `SELECT f.id, f.fulfillment_reference, f.supplier_id, s.display_name AS supplier_name, f.status,
              f.subtotal, f.discount_total, f.tax_total, f.delivery_allocation, f.total, f.package_count,
              f.accepted_at, f.packed_at, f.ready_at, f.collected_at, f.delivered_at, f.cancelled_at,
              (SELECT count(*)::TEXT FROM fulfillment_items fi WHERE fi.fulfillment_id = f.id) AS item_count,
              (SELECT COALESCE(sum(fi.quantity),0)::TEXT FROM fulfillment_items fi WHERE fi.fulfillment_id = f.id) AS unit_count
         FROM fulfillments f
         LEFT JOIN suppliers s ON s.id = f.supplier_id
        WHERE f.order_id = $1
        ORDER BY f.fulfillment_reference`,
      [orderId],
    );

    const payment = await this.database.row<{
      id: string;
      gateway: string;
      status: string;
      amount: string;
      currency: string;
      payment_method_type: string;
      gateway_payment_reference: string | null;
      gateway_order_reference: string | null;
      failure_code: string | null;
      failure_message: string | null;
      paid_at: Date | null;
      refunded_amount: string;
    }>(
      `SELECT id, gateway, status, amount, currency, payment_method_type, gateway_payment_reference,
              gateway_order_reference, failure_code, failure_message, paid_at, refunded_amount
         FROM payments WHERE order_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );

    const timeline = await this.database.rows<{
      from_status: string | null;
      to_status: string;
      reason: string | null;
      actor_type: string;
      created_at: Date;
    }>(
      `SELECT from_status, to_status, reason, actor_type, created_at
         FROM order_status_history WHERE order_id = $1
        ORDER BY created_at ASC`,
      [orderId],
    );

    const reservations = await this.database.rows<{ status: string; quantity: number; expires_at: Date }>(
      `SELECT status, quantity, expires_at FROM inventory_reservations WHERE order_id = $1`,
      [orderId],
    );

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discount_total),
      taxTotal: Number(order.tax_total),
      deliveryFee: Number(order.delivery_fee),
      grandTotal: Number(order.grand_total),
      deliveryMode: order.delivery_mode,
      deliveryDate: order.delivery_date ? order.delivery_date.toISOString().slice(0, 10) : null,
      shippingAddress: order.shipping_address_snapshot,
      buyerNote: order.buyer_note,
      placedAt: order.placed_at?.toISOString() ?? null,
      confirmedAt: order.confirmed_at?.toISOString() ?? null,
      cancelledAt: order.cancelled_at?.toISOString() ?? null,
      completedAt: order.completed_at?.toISOString() ?? null,
      createdAt: order.created_at.toISOString(),
      checkoutSessionId: order.checkout_session_id,
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
      supplierCount: fulfillments.length,
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        supplierProductId: item.supplier_listing_id,
        supplierId: item.supplier_id,
        supplierName: item.supplier_name,
        productName: item.product_name_snapshot,
        manufacturerName: item.manufacturer_snapshot,
        composition: item.composition_snapshot,
        packSize: item.pack_size_snapshot,
        unitPrice: Number(item.unit_price),
        mrpReference: item.mrp_snapshot ? Number(item.mrp_snapshot) : null,
        taxRate: item.tax_rate_snapshot ? Number(item.tax_rate_snapshot) : null,
        quantity: item.quantity,
        discountAmount: Number(item.discount_amount),
        taxAmount: Number(item.tax_amount),
        lineTotal: Number(item.line_total),
        status: item.status,
      })),
      fulfillments: fulfillments.map((fulfillment) => ({
        id: fulfillment.id,
        fulfillmentReference: fulfillment.fulfillment_reference,
        supplierId: fulfillment.supplier_id,
        supplierName: fulfillment.supplier_name,
        status: fulfillment.status,
        subtotal: Number(fulfillment.subtotal),
        taxTotal: Number(fulfillment.tax_total),
        deliveryAllocation: Number(fulfillment.delivery_allocation),
        total: Number(fulfillment.total),
        packageCount: fulfillment.package_count,
        itemCount: Number(fulfillment.item_count),
        unitCount: Number(fulfillment.unit_count),
        acceptedAt: fulfillment.accepted_at?.toISOString() ?? null,
        packedAt: fulfillment.packed_at?.toISOString() ?? null,
        readyAt: fulfillment.ready_at?.toISOString() ?? null,
        collectedAt: fulfillment.collected_at?.toISOString() ?? null,
        deliveredAt: fulfillment.delivered_at?.toISOString() ?? null,
        cancelledAt: fulfillment.cancelled_at?.toISOString() ?? null,
      })),
      payment: payment
        ? {
            id: payment.id,
            gateway: payment.gateway,
            status: payment.status,
            amount: Number(payment.amount),
            currency: payment.currency,
            method: payment.payment_method_type,
            providerReference: payment.gateway_payment_reference,
            providerOrderReference: payment.gateway_order_reference,
            failureCode: payment.failure_code,
            failureMessage: payment.failure_message,
            paidAt: payment.paid_at?.toISOString() ?? null,
            refundedAmount: Number(payment.refunded_amount),
          }
        : null,
      activeReservations: reservations.filter((row) => row.status === ReservationStatus.ACTIVE).length,
      reservationCount: reservations.length,
      timeline: timeline.map((entry) => ({
        fromStatus: entry.from_status,
        toStatus: entry.to_status,
        reason: entry.reason,
        actorType: entry.actor_type,
        createdAt: entry.created_at.toISOString(),
      })),
    };
  }

  private presentSummary(row: {
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    currency: string;
    subtotal: string;
    tax_total: string;
    delivery_fee: string;
    grand_total: string;
    delivery_mode: string;
    delivery_date: Date | null;
    placed_at: Date;
    confirmed_at: Date | null;
    cancelled_at: Date | null;
    item_count: string;
    unit_count: string;
    supplier_count: string;
    fulfillment_statuses: string[] | null;
  }) {
    return {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      currency: row.currency,
      subtotal: Number(row.subtotal),
      taxTotal: Number(row.tax_total),
      deliveryFee: Number(row.delivery_fee),
      grandTotal: Number(row.grand_total),
      deliveryMode: row.delivery_mode,
      deliveryDate: row.delivery_date ? row.delivery_date.toISOString().slice(0, 10) : null,
      placedAt: row.placed_at.toISOString(),
      confirmedAt: row.confirmed_at?.toISOString() ?? null,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      itemCount: Number(row.item_count),
      unitCount: Number(row.unit_count),
      supplierCount: Number(row.supplier_count),
      fulfillmentStatuses: row.fulfillment_statuses ?? [],
    };
  }

  private presentLine(line: PricedLine) {
    return {
      supplierProductId: line.listingId,
      productId: line.productId,
      productName: line.productName,
      manufacturerName: line.manufacturerName,
      packSize: line.packSize,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      mrpReference: line.mrpReference,
      taxRate: line.taxRate,
      lineSubtotal: line.lineSubtotal,
      lineTax: line.lineTax,
      lineTotal: line.lineTotal,
      sellableQuantity: Math.max(line.availableQuantity - line.reservedQuantity, 0),
      issue: line.issue,
    };
  }

  private lineIssue(line: PricedLine) {
    const messages: Record<string, string> = {
      INVENTORY_UNAVAILABLE: `${line.productName} is not available for ordering right now`,
      LISTING_UNAVAILABLE: `${line.productName} was paused by the supplier`,
      SUPPLIER_NOT_VERIFIED: `${line.supplierName} is not verified to sell right now`,
      PRODUCT_UNAVAILABLE: `${line.productName} is no longer published`,
      BELOW_MINIMUM_QUANTITY: `Minimum order quantity for ${line.productName} is ${line.minimumOrderQuantity}`,
      INSUFFICIENT_STOCK: `Only ${Math.max(line.availableQuantity - line.reservedQuantity, 0)} unit(s) of ${line.productName} remain`,
      BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM: `${line.productName} needs a verified drug licence on your account`,
    };
    return {
      code: line.issue as string,
      message: messages[line.issue as string] ?? 'This line cannot be ordered right now',
      supplierProductId: line.listingId,
    };
  }

  private presentAddress(address: AddressRow) {
    return {
      id: address.id,
      label: address.label,
      contactName: address.contact_name,
      contactPhone: address.contact_phone,
      addressLine1: address.address_line_1,
      addressLine2: address.address_line_2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      postalCode: address.postal_code,
      country: address.country,
    };
  }

  /** The snapshot is what the order ships to, even if the address is edited or deleted later. */
  private addressSnapshot(address: AddressRow | null): Record<string, unknown> {
    if (!address) return {};
    return {
      ...this.presentAddress(address),
      latitude: address.latitude ? Number(address.latitude) : null,
      longitude: address.longitude ? Number(address.longitude) : null,
      capturedAt: new Date().toISOString(),
    };
  }

  private isRestricted(classification: string): boolean {
    return (
      classification === PrescriptionClassification.CONTROLLED_SCHEDULE ||
      classification === PrescriptionClassification.NARCOTIC
    );
  }

  private requireBuyer(actor: AuthenticatedActor): string {
    const buyerId = actor.buyerId ?? null;
    if (!buyerId) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Only a buyer account can use the checkout and order APIs');
    }
    return buyerId;
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

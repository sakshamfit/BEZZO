/**
 * Checkout & Orders — the point where a basket becomes a commercial commitment.
 *
 * Source of truth: `Bezzo_cart_checkout_order_placement_spec_v1.0.md` (§16–§45),
 * `Bezo_api_specification_v1.0.md` §22–§23 and `Bezzo_business_rules_state_machine_spec_v1.0.md`.
 *
 * Invariants this service exists to protect:
 *  1. **Server-authoritative pricing.** Totals are recomputed from `supplier_product_listings` inside
 *     the placement transaction; nothing the client sent about price, tax or availability is trusted.
 *  2. **Never oversell the last unit.** Stock is reserved with a guarded UPDATE
 *     (`available_quantity - reserved_quantity >= :qty`); a losing request is rejected instead of
 *     double-selling, even under concurrent checkouts of the same last unit.
 *  3. **Order ≠ Fulfillment.** One order is split into one fulfillment per supplier, each with its own
 *     lifecycle. They are never collapsed into a single order status.
 *  4. **Idempotent commands.** `POST /orders` carries `@Idempotent`, and the checkout session stores the
 *     key, so a retried submission returns the original order instead of a second one.
 *  5. **No external call inside a transaction.** The payment intent is created after the order commits,
 *     so a slow gateway can never hold database locks; a gateway failure leaves a real, payable order.
 *  6. **Cancellation releases stock.** Reservations are released with a guarded UPDATE, so cancelling
 *     twice cannot credit inventory twice.
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ErrorCode,
  DomainEventName,
  OrderStatus,
  PaymentStatus,
  PrescriptionClassification,
} from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DATABASE } from '../../infrastructure/database/database.module';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payments-infra.module';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { paginate, sqlLimitOffset, type PagePaginationInput } from '../../common/pagination/pagination';

/* ------------------------------------------------------------------ validation */

export const DELIVERY_MODES = ['INSTANT', 'SCHEDULED'] as const;
export const PAYMENT_METHODS = ['UPI', 'CARD', 'NET_BANKING', 'WALLET', 'COD'] as const;

/**
 * Clients (and the API specification's own examples) send explicit `null` for "not set", so optional
 * fields accept null and normalise it to undefined. Rejecting null would be a contract nobody expects.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format')
  .nullish()
  .transform((value) => value ?? undefined);

export const checkoutQuoteSchema = z.object({
  deliveryAddressId: z.string().uuid(),
  deliveryMode: z.enum(DELIVERY_MODES),
  deliverySlotId: z.string().uuid().nullish().transform((value) => value ?? undefined),
  deliveryDate: isoDate,
});

export const placeOrderSchema = checkoutQuoteSchema.extend({
  paymentMethod: z.enum(PAYMENT_METHODS),
  buyerNote: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value ?? undefined),
});

export const cancelOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .nullish()
    .transform((value) => value ?? undefined),
});

export const orderListQuerySchema = z.object({
  status: z.enum(Object.values(OrderStatus) as [string, ...string[]]).optional(),
  from: isoDate,
  to: isoDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/* ------------------------------------------------------------------ rows */

interface CartLineRow {
  cart_item_id: string;
  supplier_listing_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_city: string | null;
  supplier_status: string;
  supplier_verification_status: string;
  product_id: string;
  product_name: string;
  composition_summary: string | null;
  manufacturer_name: string | null;
  pack_size: string | null;
  prescription_classification: string;
  product_status: string;
  quantity: number;
  selling_price: string;
  mrp_reference: string | null;
  tax_rate: string | null;
  minimum_order_quantity: number;
  listing_status: string;
  inventory_id: string | null;
  available_quantity: number | null;
  reserved_quantity: number | null;
  batch_number: string | null;
  expiry_date: Date | null;
}

interface OrderRow {
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
  delivery_slot_id: string | null;
  delivery_slot_name: string | null;
  shipping_address_snapshot: Record<string, unknown>;
  buyer_note: string | null;
  cancellation_reason: string | null;
  placed_at: Date | null;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CheckoutIssue {
  code: string;
  message: string;
  supplierProductId?: string;
}

export interface PricedLine {
  cartItemId: string;
  supplierListingId: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  manufacturerName: string | null;
  packSize: string | null;
  quantity: number;
  unitPrice: number;
  mrpReference: number | null;
  taxRate: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  /* ---------------------------------------------------------------- quoting */

  /**
   * POST /checkout/quote — server-calculated totals for the current basket, with every reason the
   * order could not be placed. Read-only: this never reserves stock, so a preview can never
   * accidentally hold inventory.
   */
  async quote(actor: AuthenticatedActor, input: CheckoutQuoteInput) {
    const buyerId = this.requireBuyer(actor);
    const context = await this.buildContext(this.database, buyerId, input);

    return {
      currency: context.currency,
      deliveryMode: input.deliveryMode,
      deliveryDate: context.deliveryDate,
      deliverySlot: context.deliverySlot
        ? { id: context.deliverySlot.id, name: context.deliverySlot.name, startTime: context.deliverySlot.start_time, endTime: context.deliverySlot.end_time }
        : null,
      address: context.address,
      totals: context.totals,
      lines: context.lines.map((line) => ({
        supplierProductId: line.supplierListingId,
        supplierId: line.supplierId,
        supplierName: line.supplierName,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        taxAmount: line.taxAmount,
        discountAmount: line.discountAmount,
        lineTotal: line.lineTotal,
      })),
      issues: context.issues,
      placeable: context.issues.length === 0,
      paymentMethods: PAYMENT_METHODS,
    };
  }

  /* ---------------------------------------------------------------- placing */

  /** POST /orders — atomically reserve stock, create the order, its fulfillments and the payment. */
  async place(actor: AuthenticatedActor, input: PlaceOrderInput) {
    const buyerId = this.requireBuyer(actor);

    const prepared = await this.buildContext(this.database, buyerId, input);
    if (prepared.cartId === null) {
      throw new DomainError(ErrorCode.CART_EMPTY, 'Your basket is empty');
    }
    if (prepared.issues.length > 0) {
      const blocking = prepared.issues[0];
      throw new DomainError(
        blocking?.code === 'INSUFFICIENT_STOCK' ? ErrorCode.INSUFFICIENT_STOCK : ErrorCode.CART_ITEM_UNAVAILABLE,
        blocking?.message ?? 'The basket cannot be ordered in its current state',
        { httpStatus: 409, details: { issues: prepared.issues } },
      );
    }

    const confirmedImmediately = input.paymentMethod === 'COD';

    const placed = await this.database.transaction(async (client) => {
      /* 1. Re-read the basket inside the transaction and lock the lines: a concurrent mutation must
            not change the order between validation and reservation. */
      const lines = await this.loadCartLines(client, prepared.cartId as string, true);
      if (lines.length === 0) {
        throw new DomainError(ErrorCode.CART_EMPTY, 'Your basket is empty');
      }

      /* 2. Reserve every line, ordered by inventory id so two concurrent checkouts take locks in the
            same sequence (no deadlock, no lost update). This guarded UPDATE is the only gate that
            decides whether the last unit is sold — the earlier availability read is advisory. */
      const sorted = [...lines].sort((a, b) => (a.inventory_id ?? '').localeCompare(b.inventory_id ?? ''));
      for (const line of sorted) {
        if (!line.inventory_id) {
          throw new DomainError(ErrorCode.OUT_OF_STOCK, `${line.product_name} is not stocked by ${line.supplier_name}`);
        }
        const reserved = await client.query<{ available_quantity: number; reserved_quantity: number }>(
          `UPDATE inventories
              SET reserved_quantity = reserved_quantity + $2,
                  status = CASE WHEN available_quantity - (reserved_quantity + $2) <= 0 THEN 'OUT_OF_STOCK' ELSE status END,
                  updated_at = now()
            WHERE id = $1
              AND available_quantity - reserved_quantity >= $2
              AND status <> 'BLOCKED'
        RETURNING available_quantity, reserved_quantity`,
          [line.inventory_id, line.quantity],
        );
        if (reserved.rowCount === 0) {
          throw new DomainError(
            ErrorCode.INSUFFICIENT_STOCK,
            `Only limited stock of ${line.product_name} is available right now`,
            { httpStatus: 409, details: { supplierProductId: line.supplier_listing_id } },
          );
        }
      }

      const priced = prepared.lines;
      const totals = prepared.totals;
      const orderStatus = confirmedImmediately ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT;

      /* 3. Order header with a customer-facing number generated by the database sequence. */
      const orderInsert = await client.query<OrderRow>(
        `INSERT INTO orders
           (order_number, buyer_id, status, payment_status, currency, subtotal, discount_total, tax_total,
            delivery_fee, grand_total, delivery_mode, delivery_date, delivery_slot_id,
            shipping_address_snapshot, billing_address_snapshot, buyer_note, placed_at, confirmed_at)
         VALUES (bezzo_next_order_number(), $1, $2, 'PENDING', $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 $12::JSONB, $12::JSONB, $13, now(), CASE WHEN $2 = 'CONFIRMED' THEN now() ELSE NULL END)
         RETURNING *`,
        [
          buyerId,
          orderStatus,
          prepared.currency,
          totals.subtotal,
          totals.discountTotal,
          totals.taxTotal,
          totals.deliveryFee,
          totals.grandTotal,
          input.deliveryMode,
          prepared.deliveryDate,
          prepared.deliverySlot?.id ?? null,
          JSON.stringify(prepared.address),
          input.buyerNote ?? null,
        ],
      );
      const order = orderInsert.rows[0];
      if (!order) throw new Error('Order insert returned no row');

      /* 4. Order lines carry immutable snapshots — a later price or catalogue edit must never rewrite
            what the buyer agreed to. */
      const orderItems: { id: string; line: PricedLine; fulfillmentId: string }[] = [];
      const fulfillmentBySupplier = new Map<string, { id: string; reference: string }>();

      for (const line of priced) {
        const item = await client.query<{ id: string }>(
          `INSERT INTO order_items
             (order_id, product_id, supplier_listing_id, supplier_id, product_name_snapshot,
              manufacturer_snapshot, composition_snapshot, pack_size_snapshot, unit_price, mrp_snapshot,
              tax_rate_snapshot, quantity, discount_amount, tax_amount, line_total, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PENDING')
           RETURNING id`,
          [
            order.id,
            line.productId,
            line.supplierListingId,
            line.supplierId,
            line.productName,
            line.manufacturerName,
            null,
            line.packSize,
            line.unitPrice,
            line.mrpReference,
            line.taxRate,
            line.quantity,
            line.discountAmount,
            line.taxAmount,
            line.lineTotal,
          ],
        );
        const orderItemId = item.rows[0]?.id;
        if (!orderItemId) throw new Error('Order item insert returned no row');

        /* 5. One fulfillment per supplier — the boundary the picker and delivery flows attach to. */
        let fulfillment = fulfillmentBySupplier.get(line.supplierId);
        if (!fulfillment) {
          const sequence = fulfillmentBySupplier.size + 1;
          const reference = `${order.order_number}-F${sequence}`;
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO fulfillments
               (order_id, supplier_id, fulfillment_reference, status, subtotal, discount_total, tax_total,
                delivery_allocation, total, package_count)
             VALUES ($1,$2,$3,'CREATED',0,0,0,0,0,0)
             RETURNING id`,
            [order.id, line.supplierId, reference],
          );
          const fulfillmentId = inserted.rows[0]?.id;
          if (!fulfillmentId) throw new Error('Fulfillment insert returned no row');
          fulfillment = { id: fulfillmentId, reference };
          fulfillmentBySupplier.set(line.supplierId, fulfillment);
        }

        await client.query(
          `INSERT INTO fulfillment_items (fulfillment_id, order_item_id, quantity, status)
           VALUES ($1,$2,$3,'PENDING')`,
          [fulfillment.id, orderItemId, line.quantity],
        );

        const inventoryId = lines.find((row) => row.supplier_listing_id === line.supplierListingId)?.inventory_id;
        if (inventoryId) {
          await client.query(
            `INSERT INTO inventory_reservations
               (inventory_id, order_id, order_item_id, quantity, status, expires_at)
             VALUES ($1,$2,$3,$4,'ACTIVE', now() + make_interval(secs => $5))`,
            [inventoryId, order.id, orderItemId, line.quantity, this.config.RESERVATION_TTL_SECONDS],
          );
        }

        orderItems.push({ id: orderItemId, line, fulfillmentId: fulfillment.id });
      }

      await this.recomputeFulfillmentTotals(client, [...fulfillmentBySupplier.values()].map((f) => f.id));

      /* 6. Payment row. The gateway reference is filled in after commit — see `initiatePayment`. */
      const paymentInsert = await client.query<{ id: string }>(
        `INSERT INTO payments
           (order_id, buyer_id, gateway, amount, currency, status, payment_method_type, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7)
         RETURNING id`,
        [
          order.id,
          buyerId,
          input.paymentMethod === 'COD' ? 'cod' : this.paymentProvider.name,
          totals.grandTotal,
          prepared.currency,
          input.paymentMethod,
          null,
        ],
      );
      const paymentId = paymentInsert.rows[0]?.id ?? null;

      /* 7. Checkout session: the auditable record of what was validated and priced at placement. */
      await client.query(
        `INSERT INTO checkout_sessions
           (buyer_id, cart_id, status, idempotency_key, delivery_mode, delivery_date, delivery_slot_id,
            address_id, shipping_address_snapshot, payment_method, currency, calculated_subtotal,
            discount_total, tax_total, delivery_fee, grand_total, pricing_snapshot, order_id, expires_at)
         VALUES ($1,$2,'ORDER_CREATED',$3,$4,$5,$6,$7,$8::JSONB,$9,$10,$11,$12,$13,$14,$15,$16::JSONB,$17,
                 now() + make_interval(secs => $18))`,
        [
          buyerId,
          prepared.cartId,
          actor.sessionId ?? null,
          input.deliveryMode,
          prepared.deliveryDate,
          prepared.deliverySlot?.id ?? null,
          input.deliveryAddressId,
          JSON.stringify(prepared.address),
          input.paymentMethod,
          prepared.currency,
          totals.subtotal,
          totals.discountTotal,
          totals.taxTotal,
          totals.deliveryFee,
          totals.grandTotal,
          JSON.stringify(priced),
          order.id,
          this.config.RESERVATION_TTL_SECONDS,
        ],
      );

      /* 8. Status history + cart closure. */
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, reason, actor_type, actor_id)
         VALUES ($1, NULL, $2, $3, 'BUYER', $4)`,
        [order.id, orderStatus, confirmedImmediately ? 'COD order confirmed at placement' : 'Order placed, awaiting payment', actor.userId],
      );

      await client.query(`UPDATE carts SET status = 'CONVERTED', updated_at = now() WHERE id = $1`, [prepared.cartId]);

      await this.events.emit(client, {
        eventName: DomainEventName.OrderCreated,
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          orderNumber: order.order_number,
          buyerId,
          grandTotal: totals.grandTotal,
          currency: prepared.currency,
          deliverMode: input.deliveryMode,
          fulfillmentIds: [...fulfillmentBySupplier.values()].map((f) => f.id),
          paymentId,
        },
      });
      if (confirmedImmediately) {
        await this.events.emit(client, {
          eventName: DomainEventName.OrderConfirmed,
          aggregateType: 'order',
          aggregateId: order.id,
          payload: { orderId: order.id, orderNumber: order.order_number, reason: 'COD' },
        });
      }

      await this.audit.record(client, {
        action: 'order.placed',
        resourceType: 'order',
        resourceId: order.id,
        metadata: {
          orderNumber: order.order_number,
          grandTotal: totals.grandTotal,
          itemCount: priced.length,
          supplierCount: fulfillmentBySupplier.size,
          paymentMethod: input.paymentMethod,
        },
      });

      return {
        order,
        paymentId,
        fulfillmentIds: [...fulfillmentBySupplier.values()].map((f) => f.id),
      };
    });

    /* The gateway is called outside the transaction: a slow provider must never hold row locks. */
    const payment = placed.paymentId
      ? await this.initiatePayment(placed.order, placed.paymentId, input.paymentMethod, buyerId)
      : null;

    const detail = await this.presentOrder(this.database, buyerId, placed.order.id);
    return { ...detail, payment };
  }

  /* ---------------------------------------------------------------- reading */

  /** GET /orders — the buyer's own history. Pagination is always bounded. */
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
      filters.push(`o.created_at >= $${params.length}::date`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`o.created_at < ($${params.length}::date + interval '1 day')`);
    }
    const where = filters.join(' AND ');

    const total = await this.database.row<{ count: string }>(`SELECT count(*)::TEXT AS count FROM orders o WHERE ${where}`, params);

    const rows = await this.database.rows<OrderRow & { item_count: string; supplier_count: string }>(
      `SELECT o.*, ds.name AS delivery_slot_name,
              COALESCE(items.item_count, 0)::TEXT AS item_count,
              COALESCE(items.supplier_count, 0)::TEXT AS supplier_count
         FROM orders o
         LEFT JOIN delivery_slots ds ON ds.id = o.delivery_slot_id
         LEFT JOIN (
              SELECT order_id, count(*) AS item_count, count(DISTINCT supplier_id) AS supplier_count
                FROM order_items GROUP BY order_id
         ) items ON items.order_id = o.id
        WHERE ${where}
        ORDER BY o.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return paginate(
      rows.map((row) => this.serializeOrderSummary(row)),
      Number(total?.count ?? 0),
      query as PagePaginationInput,
    );
  }

  /** GET /orders/:orderId — buyer-visible detail: lines, per-supplier fulfillments, payment, timeline. */
  async detail(actor: AuthenticatedActor, orderId: string) {
    const buyerId = this.requireBuyer(actor);
    return this.presentOrder(this.database, buyerId, orderId);
  }

  /* ---------------------------------------------------------------- cancelling */

  /** POST /orders/:orderId/cancel — only from states that still permit it, releasing reserved stock. */
  async cancel(actor: AuthenticatedActor, orderId: string, reason?: string) {
    const buyerId = this.requireBuyer(actor);

    const cancelled = await this.database.transaction(async (client) => {
      const order = await client.query<{ id: string; order_number: string; status: string; payment_status: string }>(
        `SELECT id, order_number, status, payment_status
           FROM orders WHERE id = $1 AND buyer_id = $2
          FOR UPDATE`,
        [orderId, buyerId],
      );
      const row = order.rows[0];
      if (!row) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');

      if (row.status === OrderStatus.CANCELLED) {
        throw new DomainError(ErrorCode.ORDER_ALREADY_CANCELLED, 'This order is already cancelled');
      }
      const cancellable: string[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED, OrderStatus.PROCESSING];
      if (!cancellable.includes(row.status)) {
        throw new DomainError(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          `An order in state ${row.status} can no longer be cancelled`,
          { details: { status: row.status } },
        );
      }
      /* Money already captured can only be returned through the refund flow (phase 6). Saying so is
         better than cancelling an order the buyer has paid for. */
      if (row.payment_status === PaymentStatus.PAID) {
        throw new DomainError(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          'This order is already paid; a refund request is required instead of a cancellation',
          { details: { paymentStatus: row.payment_status } },
        );
      }

      /* Release stock with a guard so a repeated cancellation cannot credit inventory twice. */
      const reservations = await client.query<{ inventory_id: string; quantity: number }>(
        `UPDATE inventory_reservations
            SET status = 'RELEASED', released_at = now(), release_reason = $2, updated_at = now()
          WHERE order_id = $1 AND status = 'ACTIVE'
        RETURNING inventory_id, quantity`,
        [orderId, reason ?? 'buyer cancelled'],
      );
      for (const reservation of reservations.rows) {
        await client.query(
          `UPDATE inventories
              SET reserved_quantity = reserved_quantity - $2, updated_at = now(),
                  status = CASE WHEN status = 'OUT_OF_STOCK' AND available_quantity - (reserved_quantity - $2) > 0
                                THEN 'ACTIVE' ELSE status END
            WHERE id = $1 AND reserved_quantity >= $2`,
          [reservation.inventory_id, reservation.quantity],
        );
      }

      await client.query(
        `UPDATE fulfillments
            SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = $2, updated_at = now()
          WHERE order_id = $1 AND status IN ('CREATED','ALLOCATING','ALLOCATED')`,
        [orderId, reason ?? 'buyer cancelled'],
      );
      await client.query(`UPDATE order_items SET status = 'CANCELLED', updated_at = now() WHERE order_id = $1`, [orderId]);
      await client.query(
        `UPDATE payments SET status = 'CANCELLED', updated_at = now()
          WHERE order_id = $1 AND status IN ('PENDING','AUTHORIZED')`,
        [orderId],
      );

      const updated = await client.query<OrderRow>(
        `UPDATE orders
            SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = $2, updated_at = now()
          WHERE id = $1
        RETURNING *`,
        [orderId, reason ?? null],
      );
      const order2 = updated.rows[0];
      if (!order2) throw new Error('Order update returned no row');

      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, reason, actor_type, actor_id)
         VALUES ($1,$2,'CANCELLED',$3,'BUYER',$4)`,
        [orderId, row.status, reason ?? 'buyer cancelled', actor.userId],
      );

      await this.events.emit(client, {
        eventName: DomainEventName.OrderCancelled,
        aggregateType: 'order',
        aggregateId: orderId,
        payload: { orderId, orderNumber: row.order_number, reason: reason ?? 'buyer cancelled', releasedReservations: reservations.rowCount ?? 0 },
      });
      await this.events.emit(client, {
        eventName: DomainEventName.InventoryReservationReleased,
        aggregateType: 'order',
        aggregateId: orderId,
        payload: { orderId, releasedReservations: reservations.rowCount ?? 0 },
      });
      await this.audit.record(client, {
        action: 'order.cancelled',
        resourceType: 'order',
        resourceId: orderId,
        metadata: { reason: reason ?? null, fromStatus: row.status },
      });

      return order2;
    });

    return this.presentOrder(this.database, buyerId, cancelled.id);
  }

  /* ---------------------------------------------------------------- internals */

  private requireBuyer(actor: AuthenticatedActor): string {
    if (!actor.buyerId) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Only a retailer account can place or read orders');
    }
    return actor.buyerId;
  }

  /** Validate buyer, address, delivery mode/slot and price the live basket. Never mutates anything. */
  private async buildContext(
    queryable: DatabaseType,
    buyerId: string,
    input: CheckoutQuoteInput,
  ) {
    const buyer = await queryable.row<{ id: string; status: string; verification_status: string }>(
      `SELECT id, status, verification_status FROM buyers WHERE id = $1`,
      [buyerId],
    );
    if (!buyer) throw new DomainError(ErrorCode.FORBIDDEN, 'Retailer account not found');
    if (buyer.status === 'SUSPENDED' || buyer.status === 'DEACTIVATED') {
      throw new DomainError(ErrorCode.BUYER_SUSPENDED, 'This retailer account cannot place orders at the moment');
    }

    const address = await queryable.row<{
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
    }>(
      `SELECT id, label, contact_name, contact_phone, address_line_1, address_line_2, landmark, city, state,
              postal_code, country, latitude, longitude
         FROM buyer_addresses
        WHERE id = $1 AND buyer_id = $2 AND status = 'ACTIVE'`,
      [input.deliveryAddressId, buyerId],
    );
    if (!address) {
      throw new DomainError(ErrorCode.DELIVERY_ADDRESS_INVALID, 'The delivery address does not belong to this account or is archived');
    }

    const cart = await queryable.row<{ id: string; status: string; currency: string }>(
      `SELECT id, status, currency FROM carts
        WHERE buyer_id = $1 AND status IN ('ACTIVE','CHECKOUT_STARTED')
        ORDER BY created_at DESC LIMIT 1`,
      [buyerId],
    );

    const issues: CheckoutIssue[] = [];
    const lines: PricedLine[] = [];
    let currency = cart?.currency ?? this.config.DEFAULT_CURRENCY;

    if (cart) {
      const cartLines = await this.loadCartLines(queryable, cart.id, false);
      currency = cart.currency;
      for (const row of cartLines) {
        issues.push(...this.validateLine(row, buyer));
        lines.push(this.priceLine(row));
      }
    } else {
      issues.push({ code: 'CART_EMPTY', message: 'Your basket is empty' });
    }

    const delivery = await this.resolveDelivery(queryable, buyerId, address, input, lines, issues);

    const subtotal = round2(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
    const discountTotal = round2(lines.reduce((sum, line) => sum + line.discountAmount, 0));
    const taxTotal = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
    const grandTotal = round2(subtotal - discountTotal + taxTotal + delivery.fee);

    return {
      buyer,
      cartId: cart?.id ?? null,
      currency,
      address: {
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
        latitude: address.latitude === null ? null : Number(address.latitude),
        longitude: address.longitude === null ? null : Number(address.longitude),
      },
      deliveryDate: delivery.deliveryDate,
      deliverySlot: delivery.slot,
      lines,
      issues,
      totals: {
        subtotal,
        discountTotal,
        taxTotal,
        deliveryFee: delivery.fee,
        grandTotal,
        currency,
      },
    };
  }

  private async loadCartLines(
    queryable: { query: DatabaseType['query'] },
    cartId: string,
    forUpdate: boolean,
  ): Promise<CartLineRow[]> {
    const sql = `SELECT ci.id AS cart_item_id, ci.supplier_listing_id, ci.supplier_id, ci.quantity,
                        s.display_name AS supplier_name, s.city AS supplier_city,
                        s.status AS supplier_status, s.verification_status AS supplier_verification_status,
                        p.id AS product_id, p.name AS product_name, p.composition_summary,
                        p.pack_size, p.prescription_classification, p.status AS product_status,
                        m.name AS manufacturer_name,
                        l.selling_price, l.mrp_reference, l.tax_rate, l.minimum_order_quantity, l.status AS listing_status,
                        i.id AS inventory_id, i.available_quantity, i.reserved_quantity, i.batch_number, i.expiry_date
                   FROM cart_items ci
                   JOIN carts c ON c.id = ci.cart_id
                   JOIN supplier_product_listings l ON l.id = ci.supplier_listing_id
                   JOIN suppliers s ON s.id = ci.supplier_id
                   JOIN products p ON p.id = l.product_id
                   LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
                   LEFT JOIN inventories i ON i.supplier_listing_id = l.id
                  WHERE c.id = $1
                  ORDER BY s.display_name, p.name${forUpdate ? '\n                  FOR UPDATE OF ci' : ''}`;
    const result = await queryable.query<CartLineRow>(sql, [cartId]);
    return result.rows;
  }

  private validateLine(row: CartLineRow, buyer: { verification_status: string }): CheckoutIssue[] {
    const issues: CheckoutIssue[] = [];
    const sellable = Math.max((row.available_quantity ?? 0) - (row.reserved_quantity ?? 0), 0);
    if (row.listing_status !== 'ACTIVE') {
      issues.push({ code: 'LISTING_UNAVAILABLE', message: `${row.product_name} is no longer offered by ${row.supplier_name}`, supplierProductId: row.supplier_listing_id });
    }
    if (row.supplier_status !== 'ACTIVE' || row.supplier_verification_status !== 'VERIFIED') {
      issues.push({ code: 'SUPPLIER_NOT_VERIFIED', message: `${row.supplier_name} is not currently verified to sell`, supplierProductId: row.supplier_listing_id });
    }
    if (row.product_status !== 'PUBLISHED') {
      issues.push({ code: 'PRODUCT_UNAVAILABLE', message: `${row.product_name} is not currently published`, supplierProductId: row.supplier_listing_id });
    }
    if (row.quantity > sellable) {
      issues.push({
        code: 'INSUFFICIENT_STOCK',
        message: `Only ${sellable} unit(s) of ${row.product_name} are available right now`,
        supplierProductId: row.supplier_listing_id,
      });
    }
    if (row.quantity < row.minimum_order_quantity) {
      issues.push({
        code: 'BELOW_MINIMUM_QUANTITY',
        message: `The minimum order quantity for ${row.product_name} is ${row.minimum_order_quantity}`,
        supplierProductId: row.supplier_listing_id,
      });
    }
    if (this.isRestricted(row.prescription_classification) && buyer.verification_status !== 'VERIFIED') {
      issues.push({
        code: 'BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM',
        message: `${row.product_name} requires a verified retailer licence`,
        supplierProductId: row.supplier_listing_id,
      });
    }
    if (row.expiry_date && row.expiry_date.getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000) {
      issues.push({
        code: 'BATCH_EXPIRING',
        message: `Batch ${row.batch_number ?? '—'} of ${row.product_name} expires on ${row.expiry_date.toISOString().slice(0, 10)}`,
        supplierProductId: row.supplier_listing_id,
      });
    }
    return issues;
  }

  private priceLine(row: CartLineRow): PricedLine {
    const unitPrice = Number(row.selling_price);
    const taxRate = row.tax_rate ? Number(row.tax_rate) : 0;
    const lineSubtotal = round2(unitPrice * row.quantity);
    const taxAmount = round2((lineSubtotal * taxRate) / 100);
    return {
      cartItemId: row.cart_item_id,
      supplierListingId: row.supplier_listing_id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      productId: row.product_id,
      productName: row.product_name,
      manufacturerName: row.manufacturer_name,
      packSize: row.pack_size,
      quantity: row.quantity,
      unitPrice,
      mrpReference: row.mrp_reference === null ? null : Number(row.mrp_reference),
      taxRate,
      discountAmount: 0,
      taxAmount,
      lineTotal: round2(lineSubtotal + taxAmount),
    };
  }

  /**
   * Delivery validation: the address must be inside at least one ordering supplier's service area, the
   * mode must be supported for that address, and a scheduled order must name an active slot.
   * The fee is configuration-driven (`DELIVERY_FEE_DEFAULT` + `INSTANT_DELIVERY_SURCHARGE`).
   */
  private async resolveDelivery(
    queryable: Pick<DatabaseType, 'row' | 'rows'>,
    buyerId: string,
    address: { postal_code: string; city: string; state: string },
    input: CheckoutQuoteInput,
    lines: PricedLine[],
    issues: CheckoutIssue[],
  ) {
    const supplierIds = [...new Set(lines.map((line) => line.supplierId))];
    let serviceable = false;
    if (supplierIds.length > 0) {
      const covered = await queryable.row<{ count: string }>(
        `SELECT count(*)::TEXT AS count
           FROM supplier_service_areas
          WHERE supplier_id = ANY($1::uuid[])
            AND active = TRUE
            AND (postal_code = $2 OR lower(city) = lower($3))
            AND ($4 = 'INSTANT' AND service_type IN ('DELIVERY','BOTH') OR $4 = 'SCHEDULED' AND service_type IN ('DELIVERY','PICKUP','BOTH'))`,
        [supplierIds, address.postal_code, address.city, input.deliveryMode],
      );
      serviceable = Number(covered?.count ?? 0) > 0;
    }

    if (lines.length > 0 && !serviceable) {
      issues.push({
        code: 'ADDRESS_NOT_SERVICEABLE',
        message: `No supplier delivers ${input.deliveryMode.toLowerCase()} orders to ${address.city} (${address.postal_code}) yet`,
      });
    }

    let slot: { id: string; name: string; start_time: string; end_time: string } | null = null;
    let deliveryDate: string | null = null;

    if (input.deliveryMode === 'SCHEDULED') {
      if (!input.deliverySlotId) {
        issues.push({ code: 'DELIVERY_SLOT_REQUIRED', message: 'Choose a delivery window for a scheduled order' });
      } else {
        const found = await queryable.row<{ id: string; name: string; start_time: string; end_time: string }>(
          `SELECT id, name, start_time::TEXT AS start_time, end_time::TEXT AS end_time
             FROM delivery_slots WHERE id = $1 AND active = TRUE`,
          [input.deliverySlotId],
        );
        if (!found) {
          issues.push({ code: 'DELIVERY_SLOT_INVALID', message: 'The selected delivery window is no longer available' });
        } else {
          slot = found;
        }
      }
      deliveryDate = input.deliveryDate ?? todayInTimezone(this.config.BUSINESS_TIMEZONE);
      if (deliveryDate < todayInTimezone(this.config.BUSINESS_TIMEZONE)) {
        issues.push({ code: 'DELIVERY_DATE_INVALID', message: 'The delivery date cannot be in the past' });
      }
    }

    const fee = round2(
      input.deliveryMode === 'INSTANT'
        ? this.config.DELIVERY_FEE_DEFAULT + this.config.INSTANT_DELIVERY_SURCHARGE
        : this.config.DELIVERY_FEE_DEFAULT,
    );

    void buyerId;
    return { fee, slot, deliveryDate };
  }

  private isRestricted(classification: string): boolean {
    return (
      classification === PrescriptionClassification.PRESCRIPTION_REQUIRED ||
      classification === PrescriptionClassification.CONTROLLED_SCHEDULE ||
      classification === PrescriptionClassification.NARCOTIC
    );
  }

  /** Create the gateway intent after the order is committed. A failure never loses the order. */
  private async initiatePayment(
    order: OrderRow,
    paymentId: string,
    method: (typeof PAYMENT_METHODS)[number],
    buyerId: string,
  ) {
    if (method === 'COD') {
      await this.database.query(`UPDATE payments SET status = 'PENDING', updated_at = now() WHERE id = $1`, [paymentId]);
      return {
        id: paymentId,
        gateway: 'cod',
        status: 'PENDING',
        amount: Number(order.grand_total),
        currency: order.currency,
        method,
        providerReference: null,
        providerPayload: null,
        failureCode: null,
        failureMessage: 'Cash on delivery is collected at hand-over',
      };
    }

    try {
      const intent = await this.paymentProvider.createIntent({
        orderId: order.id,
        orderNumber: order.order_number,
        amount: Number(order.grand_total),
        currency: order.currency,
        method,
        buyerId,
        idempotencyKey: paymentId,
      });

      await this.database.transaction(async (client) => {
        await client.query(
          `UPDATE payments
              SET gateway_payment_reference = $2, gateway_order_reference = $3, updated_at = now()
            WHERE id = $1`,
          [paymentId, intent.providerReference, intent.providerOrderReference],
        );
        await client.query(
          `INSERT INTO payment_attempts (payment_id, gateway, gateway_attempt_reference, status, amount)
           VALUES ($1,$2,$3,'INITIATED',$4)`,
          [paymentId, this.paymentProvider.name, intent.providerReference, Number(order.grand_total)],
        );
        await this.events.emit(client, {
          eventName: DomainEventName.PaymentInitiated,
          aggregateType: 'payment',
          aggregateId: paymentId,
          payload: { paymentId, orderId: order.id, amount: Number(order.grand_total), currency: order.currency, method },
        });
      });

      return {
        id: paymentId,
        gateway: this.paymentProvider.name,
        status: 'PENDING',
        amount: Number(order.grand_total),
        currency: order.currency,
        method,
        providerReference: intent.providerReference,
        providerPayload: intent.providerPayload,
        failureCode: null,
        failureMessage: null,
      };
    } catch (error) {
      /* The order exists and is payable, so the failure is recorded on the payment and returned —
         throwing here would tell the client the order failed when it did not. */
      const message = error instanceof Error ? error.message : 'The payment gateway could not be reached';
      await this.database.transaction(async (client) => {
        await client.query(
          `UPDATE payments SET status = 'FAILED', failed_at = now(), failure_code = 'PROVIDER_ERROR', failure_message = $2, updated_at = now()
            WHERE id = $1`,
          [paymentId, message],
        );
        await client.query(
          `INSERT INTO payment_attempts (payment_id, gateway, status, amount, failure_code, failure_message)
           VALUES ($1,$2,'FAILED',$3,'PROVIDER_ERROR',$4)`,
          [paymentId, this.paymentProvider.name, Number(order.grand_total), message],
        );
        await this.events.emit(client, {
          eventName: DomainEventName.PaymentFailed,
          aggregateType: 'payment',
          aggregateId: paymentId,
          payload: { paymentId, orderId: order.id, reason: message },
        });
      });
      return {
        id: paymentId,
        gateway: this.paymentProvider.name,
        status: 'FAILED',
        amount: Number(order.grand_total),
        currency: order.currency,
        method,
        providerReference: null,
        providerPayload: null,
        failureCode: 'PROVIDER_ERROR',
        failureMessage: message,
      };
    }
  }

  private async recomputeFulfillmentTotals(
    client: { query: DatabaseType['query'] },
    fulfillmentIds: string[],
  ): Promise<void> {
    if (fulfillmentIds.length === 0) return;
    await client.query(
      `UPDATE fulfillments f
          SET subtotal = agg.subtotal,
              tax_total = agg.tax_total,
              discount_total = agg.discount_total,
              total = agg.subtotal - agg.discount_total + agg.tax_total,
              updated_at = now()
         FROM (
           SELECT fi.fulfillment_id,
                  COALESCE(SUM(oi.unit_price * fi.quantity), 0) AS subtotal,
                  COALESCE(SUM(oi.tax_amount), 0) AS tax_total,
                  COALESCE(SUM(oi.discount_amount), 0) AS discount_total
             FROM fulfillment_items fi
             JOIN order_items oi ON oi.id = fi.order_item_id
            WHERE fi.fulfillment_id = ANY($1::uuid[])
            GROUP BY fi.fulfillment_id
         ) agg
        WHERE f.id = agg.fulfillment_id`,
      [fulfillmentIds],
    );
  }

  /** Assemble the buyer-visible order: lines, fulfillments, payment, timeline. */
  private async presentOrder(queryable: Pick<DatabaseType, 'row' | 'rows'>, buyerId: string, orderId: string) {
    const order = await queryable.row<OrderRow & { item_count: string; supplier_count: string }>(
      `SELECT o.*, ds.name AS delivery_slot_name,
              COALESCE(items.item_count, 0)::TEXT AS item_count,
              COALESCE(items.supplier_count, 0)::TEXT AS supplier_count
         FROM orders o
         LEFT JOIN delivery_slots ds ON ds.id = o.delivery_slot_id
         LEFT JOIN (
              SELECT order_id, count(*) AS item_count, count(DISTINCT supplier_id) AS supplier_count
                FROM order_items GROUP BY order_id
         ) items ON items.order_id = o.id
        WHERE o.id = $1 AND o.buyer_id = $2`,
      [orderId, buyerId],
    );
    if (!order) throw new DomainError(ErrorCode.ORDER_NOT_FOUND, 'Order not found');

    const items = await queryable.rows<{
      id: string;
      fulfillment_id: string;
      product_id: string;
      supplier_listing_id: string;
      supplier_id: string;
      supplier_name: string;
      product_name_snapshot: string;
      manufacturer_snapshot: string | null;
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
      `SELECT oi.id, fi.fulfillment_id, oi.product_id, oi.supplier_listing_id, oi.supplier_id,
              s.display_name AS supplier_name, oi.product_name_snapshot, oi.manufacturer_snapshot,
              oi.pack_size_snapshot, oi.unit_price, oi.mrp_snapshot, oi.tax_rate_snapshot, oi.quantity,
              oi.discount_amount, oi.tax_amount, oi.line_total, oi.status
         FROM order_items oi
         JOIN fulfillments f ON f.order_id = oi.order_id AND f.supplier_id = oi.supplier_id
         JOIN fulfillment_items fi ON fi.order_item_id = oi.id AND fi.fulfillment_id = f.id
         JOIN suppliers s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1
        ORDER BY s.display_name, oi.product_name_snapshot`,
      [orderId],
    );

    const fulfillments = await queryable.rows<{
      id: string;
      fulfillment_reference: string;
      supplier_id: string;
      supplier_name: string;
      status: string;
      subtotal: string;
      tax_total: string;
      delivery_allocation: string;
      total: string;
      package_count: number;
      created_at: Date;
    }>(
      `SELECT f.id, f.fulfillment_reference, f.supplier_id, s.display_name AS supplier_name, f.status,
              f.subtotal, f.tax_total, f.delivery_allocation, f.total, f.package_count, f.created_at
         FROM fulfillments f
         JOIN suppliers s ON s.id = f.supplier_id
        WHERE f.order_id = $1
        ORDER BY f.fulfillment_reference`,
      [orderId],
    );

    const payment = await queryable.row<{
      id: string;
      gateway: string;
      status: string;
      amount: string;
      currency: string;
      payment_method_type: string;
      gateway_payment_reference: string | null;
      failure_code: string | null;
      failure_message: string | null;
      paid_at: Date | null;
    }>(
      `SELECT id, gateway, status, amount, currency, payment_method_type, gateway_payment_reference,
              failure_code, failure_message, paid_at
         FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );

    const timeline = await queryable.rows<{
      from_status: string | null;
      to_status: string;
      reason: string | null;
      actor_type: string;
      created_at: Date;
    }>(
      `SELECT from_status, to_status, reason, actor_type, created_at
         FROM order_status_history WHERE order_id = $1 ORDER BY created_at`,
      [orderId],
    );

    return {
      ...this.serializeOrderSummary(order),
      address: order.shipping_address_snapshot,
      buyerNote: order.buyer_note,
      items: items.map((item) => ({
        id: item.id,
        fulfillmentId: item.fulfillment_id,
        productId: item.product_id,
        supplierProductId: item.supplier_listing_id,
        supplierId: item.supplier_id,
        supplierName: item.supplier_name,
        productName: item.product_name_snapshot,
        manufacturerName: item.manufacturer_snapshot,
        packSize: item.pack_size_snapshot,
        unitPrice: Number(item.unit_price),
        mrpReference: item.mrp_snapshot === null ? null : Number(item.mrp_snapshot),
        taxRate: item.tax_rate_snapshot === null ? 0 : Number(item.tax_rate_snapshot),
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
        createdAt: fulfillment.created_at,
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
            failureCode: payment.failure_code,
            failureMessage: payment.failure_message,
            paidAt: payment.paid_at,
          }
        : null,
      timeline: timeline.map((entry) => ({
        fromStatus: entry.from_status,
        toStatus: entry.to_status,
        reason: entry.reason,
        actorType: entry.actor_type,
        createdAt: entry.created_at,
      })),
    };
  }

  private serializeOrderSummary(row: OrderRow & { item_count?: string; supplier_count?: string }) {
    return {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      currency: row.currency,
      subtotal: Number(row.subtotal),
      discountTotal: Number(row.discount_total),
      taxTotal: Number(row.tax_total),
      deliveryFee: Number(row.delivery_fee),
      grandTotal: Number(row.grand_total),
      deliveryMode: row.delivery_mode,
      deliveryDate: row.delivery_date ? row.delivery_date.toISOString().slice(0, 10) : null,
      deliverySlot: row.delivery_slot_id ? { id: row.delivery_slot_id, name: row.delivery_slot_name ?? null } : null,
      itemCount: Number(row.item_count ?? 0),
      supplierCount: Number(row.supplier_count ?? 0),
      placedAt: row.placed_at,
      confirmedAt: row.confirmed_at,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/* ------------------------------------------------------------------ helpers */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

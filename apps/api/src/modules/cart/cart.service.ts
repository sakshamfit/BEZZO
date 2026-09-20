/**
 * Cart — buyer purchasing basket (cart/checkout/order spec, API spec §20).
 *
 * Boundary of responsibility:
 *  - the cart is a *soft* intention: it never reserves stock and never prices a final total. Prices and
 *    availability are re-read on every view so the buyer always sees current truth;
 *  - the cart is always scoped to the authenticated buyer (`carts.buyer_id`), never to a client-supplied
 *    id — a buyer can only ever read or mutate their own basket;
 *  - one active cart per buyer is guaranteed by the database (`carts_active_unique`), so the service
 *    cannot create duplicates under concurrency;
 *  - hard guarantees (reservation, oversell protection, totals, order creation) belong to checkout,
 *    which runs in its own transaction with row-level conditional updates.
 *
 * API naming follows the specification: `supplierProductId` is the supplier's offer for a product, i.e.
 * the `supplier_product_listings` row (`listing_id`).
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ErrorCode, DomainEventName, PrescriptionClassification } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { DATABASE } from '../../infrastructure/database/database.module';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';

export const cartItemSchema = z.object({
  /** `supplier_product_listings.id` — the supplier's offer for a catalogue product. */
  supplierProductId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10_000),
});

export const cartQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(10_000),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

interface CartRow {
  id: string;
  status: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

interface CartItemRow {
  id: string;
  supplier_listing_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_city: string | null;
  supplier_status: string;
  supplier_verification_status: string;
  product_id: string;
  product_name: string;
  product_status: string;
  prescription_classification: string;
  strength: string | null;
  pack_size: string | null;
  pack_unit: string | null;
  manufacturer_name: string | null;
  quantity: number;
  selling_price: string;
  mrp_reference: string | null;
  tax_rate: string | null;
  minimum_order_quantity: number;
  lead_time_minutes: number | null;
  available_quantity: number | null;
  reserved_quantity: number | null;
  listing_status: string | null;
  batch_number: string | null;
  expiry_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type CartIssueCode =
  | 'LISTING_UNAVAILABLE'
  | 'SUPPLIER_NOT_VERIFIED'
  | 'PRODUCT_UNAVAILABLE'
  | 'INSUFFICIENT_STOCK'
  | 'BELOW_MINIMUM_QUANTITY'
  | 'BATCH_EXPIRING'
  | 'BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM';

export interface CartIssue {
  code: CartIssueCode;
  message: string;
  itemId?: string;
}

@Injectable()
export class CartService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
  ) {}

  /** GET /cart — the buyer's active basket with live pricing and availability. */
  async view(actor: AuthenticatedActor) {
    const buyerId = this.requireBuyer(actor);
    const cart = await this.ensureActiveCart(this.database, buyerId);
    return this.present(this.database, cart, buyerId);
  }

  /** POST /cart/items — add to (or top up) an item. */
  async addItem(actor: AuthenticatedActor, input: CartItemInput) {
    const buyerId = this.requireBuyer(actor);

    const offer = await this.database.row<OfferRow>(
      `SELECT l.id AS listing_id, l.supplier_id, l.product_id, l.status AS listing_status, l.minimum_order_quantity,
              l.selling_price, l.mrp_reference, l.tax_rate, l.lead_time_minutes,
              s.status AS supplier_status, s.verification_status AS supplier_verification_status,
              p.status AS product_status, p.prescription_classification,
              i.id AS inventory_id, COALESCE(i.available_quantity, 0) AS available_quantity,
              COALESCE(i.reserved_quantity, 0) AS reserved_quantity
         FROM supplier_product_listings l
         JOIN suppliers s ON s.id = l.supplier_id
         JOIN products p ON p.id = l.product_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
        WHERE l.id = $1`,
      [input.supplierProductId],
    );

    if (!offer) {
      throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'This supplier offer does not exist');
    }
    if (offer.listing_status !== 'ACTIVE') {
      throw new DomainError(ErrorCode.LISTING_NOT_ACTIVE, 'This offer is no longer available for ordering');
    }
    if (offer.supplier_status !== 'ACTIVE' || offer.supplier_verification_status !== 'VERIFIED') {
      throw new DomainError(ErrorCode.SUPPLIER_NOT_VERIFIED, 'This supplier is not currently verified to sell');
    }
    if (offer.product_status !== 'PUBLISHED') {
      throw new DomainError(ErrorCode.PRODUCT_INACTIVE, 'This product is not currently published');
    }
    if (input.quantity < offer.minimum_order_quantity) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        `The minimum order quantity for this offer is ${offer.minimum_order_quantity}`,
        { httpStatus: 422, details: { minimumOrderQuantity: offer.minimum_order_quantity } },
      );
    }
    if (this.isRestricted(offer.prescription_classification)) {
      await this.assertBuyerVerifiedForRestricted(buyerId);
    }

    const result = await this.database.transaction(async (client) => {
      const cart = await this.ensureActiveCart(client, buyerId);

      const existing = await client.query<{ quantity: number }>(
        `SELECT quantity FROM cart_items WHERE cart_id = $1 AND supplier_listing_id = $2 FOR UPDATE`,
        [cart.id, offer.listing_id],
      );
      const currentQuantity = existing.rows[0]?.quantity ?? 0;
      const requestedQuantity = currentQuantity + input.quantity;

      this.assertStock(offer, requestedQuantity);

      if (currentQuantity === 0) {
        await client.query(
          `INSERT INTO cart_items (cart_id, supplier_listing_id, supplier_id, quantity)
           VALUES ($1, $2, $3, $4)`,
          [cart.id, offer.listing_id, offer.supplier_id, input.quantity],
        );
        await this.events.emit(client, {
          eventName: DomainEventName.CartItemAdded,
          aggregateType: 'cart',
          aggregateId: cart.id,
          payload: {
            buyerId,
            supplierProductId: offer.listing_id,
            productId: offer.product_id,
            supplierId: offer.supplier_id,
            quantity: input.quantity,
          },
        });
      } else {
        await client.query(`UPDATE cart_items SET quantity = $2 WHERE cart_id = $1 AND supplier_listing_id = $3`, [
          cart.id,
          requestedQuantity,
          offer.listing_id,
        ]);
      }

      await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cart.id]);
      await this.audit.record(client, {
        action: currentQuantity === 0 ? 'cart.item_added' : 'cart.item_quantity_increased',
        resourceType: 'cart_item',
        resourceId: offer.listing_id,
        metadata: { quantity: requestedQuantity, supplierProductId: offer.listing_id },
      });

      return { cart, requestedQuantity };
    });

    const view = await this.present(this.database, result.cart, buyerId);
    return { ...view, addedQuantity: input.quantity };
  }

  /** PATCH /cart/items/:itemId — set an absolute quantity. */
  async updateItem(actor: AuthenticatedActor, itemId: string, quantity: number) {
    const buyerId = this.requireBuyer(actor);

    const item = await this.database.row<{ cart_id: string; supplier_listing_id: string }>(
      `SELECT ci.cart_id, ci.supplier_listing_id
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
        WHERE ci.id = $1 AND c.buyer_id = $2 AND c.status IN ('ACTIVE','CHECKOUT_STARTED')`,
      [itemId, buyerId],
    );
    if (!item) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Cart item not found');

    const offer = await this.database.row<OfferRow>(
      `SELECT l.id AS listing_id, l.supplier_id, l.product_id, l.status AS listing_status, l.minimum_order_quantity,
              l.selling_price, l.mrp_reference, l.tax_rate, l.lead_time_minutes,
              s.status AS supplier_status, s.verification_status AS supplier_verification_status,
              p.status AS product_status, p.prescription_classification,
              i.id AS inventory_id, COALESCE(i.available_quantity, 0) AS available_quantity,
              COALESCE(i.reserved_quantity, 0) AS reserved_quantity
         FROM supplier_product_listings l
         JOIN suppliers s ON s.id = l.supplier_id
         JOIN products p ON p.id = l.product_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
        WHERE l.id = $1`,
      [item.supplier_listing_id],
    );
    if (!offer) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'The supplier offer for this item no longer exists');

    if (quantity < offer.minimum_order_quantity) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        `The minimum order quantity for this offer is ${offer.minimum_order_quantity}`,
        { httpStatus: 422, details: { minimumOrderQuantity: offer.minimum_order_quantity } },
      );
    }
    this.assertStock(offer, quantity);

    await this.database.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE cart_items SET quantity = $2 WHERE id = $1`,
        [itemId, quantity],
      );
      if ((updated.rowCount ?? 0) === 0) {
        throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Cart item not found');
      }
      await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [item.cart_id]);
      await this.audit.record(client, {
        action: 'cart.item_quantity_updated',
        resourceType: 'cart_item',
        resourceId: itemId,
        metadata: { quantity },
      });
    });

    return this.view(actor);
  }

  /** DELETE /cart/items/:itemId */
  async removeItem(actor: AuthenticatedActor, itemId: string) {
    const buyerId = this.requireBuyer(actor);

    await this.database.transaction(async (client) => {
      const removed = await client.query<{ cart_id: string; supplier_listing_id: string }>(
        `DELETE FROM cart_items ci
          USING carts c
          WHERE ci.id = $1 AND c.id = ci.cart_id AND c.buyer_id = $2 AND c.status IN ('ACTIVE','CHECKOUT_STARTED')
        RETURNING ci.cart_id, ci.supplier_listing_id`,
        [itemId, buyerId],
      );
      const row = removed.rows[0];
      if (!row) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Cart item not found');
      await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [row.cart_id]);
      await this.audit.record(client, {
        action: 'cart.item_removed',
        resourceType: 'cart_item',
        resourceId: itemId,
        metadata: { supplierProductId: row.supplier_listing_id },
      });
    });

    return this.view(actor);
  }

  /** DELETE /cart — empty the basket (the cart row itself is kept for continuity). */
  async clear(actor: AuthenticatedActor) {
    const buyerId = this.requireBuyer(actor);

    await this.database.transaction(async (client) => {
      const cart = await this.ensureActiveCart(client, buyerId);
      const deleted = await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cart.id]);
      await client.query(
        `UPDATE carts SET updated_at = now(), coupon_code = NULL, status = 'ACTIVE' WHERE id = $1`,
        [cart.id],
      );
      await this.audit.record(client, {
        action: 'cart.cleared',
        resourceType: 'cart',
        resourceId: cart.id,
        metadata: { removedItems: deleted.rowCount ?? 0 },
      });
    });

    return this.view(actor);
  }

  /* ------------------------------------------------------------------ internals */

  /**
   * Resolve (or lazily create) the buyer's active cart.
   *
   * The partial unique index `carts_active_unique` makes the insert race-safe: a concurrent request
   * loses the insert and re-reads the winning row instead of creating a second cart.
   */
  private async ensureActiveCart(
    queryable: { query: DatabaseType['query'] },
    buyerId: string,
  ): Promise<CartRow> {
    const existing = await queryable.query<CartRow>(
      `SELECT id, status, currency, created_at, updated_at
         FROM carts WHERE buyer_id = $1 AND status IN ('ACTIVE','CHECKOUT_STARTED')
        ORDER BY created_at DESC LIMIT 1`,
      [buyerId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const inserted = await queryable.query<CartRow>(
      `INSERT INTO carts (buyer_id, status, currency) VALUES ($1, 'ACTIVE', 'INR')
       ON CONFLICT (buyer_id) WHERE status IN ('ACTIVE','CHECKOUT_STARTED') DO NOTHING
       RETURNING id, status, currency, created_at, updated_at`,
      [buyerId],
    );
    if (inserted.rows[0]) return inserted.rows[0];

    const raced = await queryable.query<CartRow>(
      `SELECT id, status, currency, created_at, updated_at
         FROM carts WHERE buyer_id = $1 AND status IN ('ACTIVE','CHECKOUT_STARTED')
        ORDER BY created_at DESC LIMIT 1`,
      [buyerId],
    );
    const cart = raced.rows[0];
    if (!cart) throw new Error('Failed to resolve an active cart for this buyer');
    return cart;
  }

  /** Build the client-facing cart, re-reading price/stock and surfacing every issue. */
  private async present(queryable: Pick<DatabaseType, 'rows' | 'row'>, cart: CartRow, buyerId: string) {
    const items = await queryable.rows<CartItemRow>(
      `SELECT ci.id, ci.supplier_listing_id, ci.supplier_id, s.display_name AS supplier_name, s.city AS supplier_city,
              s.status AS supplier_status, s.verification_status AS supplier_verification_status,
              p.id AS product_id, p.name AS product_name, p.status AS product_status,
              p.prescription_classification, p.strength, p.pack_size, p.pack_unit,
              m.name AS manufacturer_name,
              ci.quantity, l.selling_price, l.mrp_reference, l.tax_rate, l.minimum_order_quantity,
              l.lead_time_minutes, l.status AS listing_status,
              i.available_quantity, i.reserved_quantity, i.batch_number, i.expiry_date,
              ci.created_at, ci.updated_at
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         JOIN supplier_product_listings l ON l.id = ci.supplier_listing_id
         JOIN suppliers s ON s.id = ci.supplier_id
         JOIN products p ON p.id = l.product_id
         LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
        WHERE c.id = $1
        ORDER BY s.display_name, p.name`,
      [cart.id],
    );

    const buyer = await queryable.row<{ verification_status: string; status: string }>(
      `SELECT verification_status, status FROM buyers WHERE id = $1`,
      [buyerId],
    );

    const issues: CartIssue[] = [];
    let subtotal = 0;
    let taxTotal = 0;
    const suppliers = new Set<string>();

    const presentedItems = items.map((item) => {
      const sellableQuantity = Math.max((item.available_quantity ?? 0) - (item.reserved_quantity ?? 0), 0);
      const unitPrice = Number(item.selling_price);
      const taxRate = item.tax_rate ? Number(item.tax_rate) : 0;
      const lineSubtotal = unitPrice * item.quantity;
      const lineTax = (lineSubtotal * taxRate) / 100;
      const itemIssues: CartIssue[] = [];

      if (item.listing_status !== 'ACTIVE') {
        itemIssues.push({ code: 'LISTING_UNAVAILABLE', message: 'This offer is paused by the supplier', itemId: item.id });
      }
      if (item.supplier_status !== 'ACTIVE' || item.supplier_verification_status !== 'VERIFIED') {
        itemIssues.push({ code: 'SUPPLIER_NOT_VERIFIED', message: 'The supplier is not verified to sell', itemId: item.id });
      }
      if (item.product_status !== 'PUBLISHED') {
        itemIssues.push({ code: 'PRODUCT_UNAVAILABLE', message: 'The product is not published', itemId: item.id });
      }
      if (item.quantity > sellableQuantity) {
        itemIssues.push({
          code: 'INSUFFICIENT_STOCK',
          message: `Only ${sellableQuantity} unit(s) are currently available`,
          itemId: item.id,
        });
      }
      if (item.quantity < item.minimum_order_quantity) {
        itemIssues.push({
          code: 'BELOW_MINIMUM_QUANTITY',
          message: `Minimum order quantity is ${item.minimum_order_quantity}`,
          itemId: item.id,
        });
      }
      if (item.expiry_date && item.expiry_date.getTime() < Date.now() + 90 * 24 * 60 * 60 * 1000) {
        itemIssues.push({
          code: 'BATCH_EXPIRING',
          message: `Batch ${item.batch_number ?? '—'} expires on ${item.expiry_date.toISOString().slice(0, 10)}`,
          itemId: item.id,
        });
      }
      if (
        this.isRestricted(item.prescription_classification) &&
        buyer?.verification_status !== 'VERIFIED'
      ) {
        itemIssues.push({
          code: 'BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM',
          message: 'A verified drug licence is required to order this item',
          itemId: item.id,
        });
      }

      issues.push(...itemIssues);
      if (itemIssues.length === 0) {
        subtotal += lineSubtotal;
        taxTotal += lineTax;
        suppliers.add(item.supplier_id);
      }

      return {
        id: item.id,
        supplierProductId: item.supplier_listing_id,
        productId: item.product_id,
        productName: item.product_name,
        manufacturerName: item.manufacturer_name,
        strength: item.strength,
        packSize: [item.pack_size, item.pack_unit].filter(Boolean).join(' ') || null,
        prescriptionClassification: item.prescription_classification,
        supplierId: item.supplier_id,
        supplierName: item.supplier_name,
        supplierCity: item.supplier_city,
        quantity: item.quantity,
        minimumOrderQuantity: item.minimum_order_quantity,
        sellableQuantity,
        unitPrice,
        mrpReference: item.mrp_reference ? Number(item.mrp_reference) : null,
        taxRate: item.tax_rate ? Number(item.tax_rate) : null,
        lineSubtotal,
        lineTax,
        lineTotal: lineSubtotal + lineTax,
        leadTimeMinutes: item.lead_time_minutes,
        batchNumber: item.batch_number,
        expiryDate: item.expiry_date ? item.expiry_date.toISOString().slice(0, 10) : null,
        available: itemIssues.length === 0,
        issues: itemIssues.map((issue) => issue.code),
        addedAt: item.created_at.toISOString(),
        updatedAt: item.updated_at.toISOString(),
      };
    });

    return {
      cartId: cart.id,
      status: cart.status,
      currency: cart.currency,
      itemCount: presentedItems.length,
      unitCount: presentedItems.reduce((total, item) => total + item.quantity, 0),
      supplierCount: suppliers.size,
      /** Indicative only: checkout re-prices and reserves stock before an order exists. */
      estimatedSubtotal: Number(subtotal.toFixed(2)),
      estimatedTax: Number(taxTotal.toFixed(2)),
      estimatedTotal: Number((subtotal + taxTotal).toFixed(2)),
      hasIssues: issues.length > 0,
      issues,
      items: presentedItems,
      updatedAt: cart.updated_at.toISOString(),
    };
  }

  private assertStock(offer: OfferRow, requestedQuantity: number): void {
    const sellable = Math.max(offer.available_quantity - offer.reserved_quantity, 0);
    if (sellable <= 0) {
      throw new DomainError(ErrorCode.OUT_OF_STOCK, 'This offer is currently out of stock', {
        details: { supplierProductId: offer.listing_id },
      });
    }
    if (requestedQuantity > sellable) {
      throw new DomainError(
        ErrorCode.CART_ITEM_UNAVAILABLE,
        `Only ${sellable} unit(s) are currently available for this offer`,
        { details: { supplierProductId: offer.listing_id, sellableQuantity: sellable } },
      );
    }
  }

  private async assertBuyerVerifiedForRestricted(buyerId: string): Promise<void> {
    const buyer = await this.database.row<{ verification_status: string; status: string }>(
      `SELECT verification_status, status FROM buyers WHERE id = $1`,
      [buyerId],
    );
    if (!buyer || buyer.status !== 'ACTIVE' || buyer.verification_status !== 'VERIFIED') {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        'This product is a scheduled/controlled medicine. A verified drug licence is required.',
        { details: { requiredBuyerVerification: 'VERIFIED' } },
      );
    }
  }

  private isRestricted(classification: string): boolean {
    return (
      classification === PrescriptionClassification.CONTROLLED_SCHEDULE ||
      classification === PrescriptionClassification.NARCOTIC
    );
  }

  private requireBuyer(actor: AuthenticatedActor): string {
    if (!actor.buyerId) {
      throw new DomainError(ErrorCode.ROLE_NOT_ALLOWED, 'Only a retailer account has a purchasing cart');
    }
    return actor.buyerId;
  }
}

interface OfferRow {
  listing_id: string;
  supplier_id: string;
  product_id: string;
  listing_status: string;
  minimum_order_quantity: number;
  selling_price: string;
  mrp_reference: string | null;
  tax_rate: string | null;
  lead_time_minutes: number | null;
  supplier_status: string;
  supplier_verification_status: string;
  product_status: string;
  prescription_classification: string;
  inventory_id: string | null;
  available_quantity: number;
  reserved_quantity: number;
}


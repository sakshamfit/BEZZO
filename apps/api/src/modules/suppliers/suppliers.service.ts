/**
 * Supplier portal service: profile, compliance documents, listings and inventory.
 *
 * Tenant isolation is enforced in every statement: the supplier id always comes from the
 * authenticated actor, never from the request body (project rule §2 — a supplier can only ever see
 * and change its own catalog).
 *
 * Inventory writes use the canonical pattern from the database/locking specs:
 *   UPDATE inventories SET available_quantity = available_quantity + :delta
 *    WHERE id = :id AND available_quantity + :delta >= 0
 * and every change records an `inventory_transactions` row (append-only stock ledger).
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  DomainEventName,
  ErrorCode,
  InventoryTransactionType,
  ListingStatus,
  FulfillmentStatus,
  FulfillmentItemStatus,
  PackageStatus,
  PickupTaskStatus,
  assertTransition,
  FULFILLMENT_STATUS_TRANSITIONS,
  ReservationStatus,
  type SupplierFulfillmentSummaryResponse,
  type SupplierFulfillmentDetailResponse,
  type PackFulfillmentInput,
  type RejectFulfillmentInput,
} from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import type { Queryable } from '../../infrastructure/events/event-bus.service';
import { z } from 'zod';
import { DATABASE } from '../../infrastructure/database/database.module';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { SearchService } from '../../infrastructure/search/search.service';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';

export const packPackageSchema = z.object({
  packageType: z.enum(['STANDARD', 'FRAGILE', 'COLD_CHAIN', 'RESTRICTED']).default('STANDARD'),
  weightGrams: z.number().int().positive().max(50_000).optional(),
  sealNumber: z.string().trim().max(64).optional(),
  handlingNotes: z.string().trim().max(500).optional(),
});

export const packFulfillmentSchema = z.object({
  packages: z.array(packPackageSchema).min(1).max(50).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const rejectFulfillmentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const supplierProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(200).optional(),
  displayName: z.string().trim().min(2).max(200).optional(),
  businessType: z.string().trim().max(80).optional(),
  gstin: z.string().trim().max(20).optional(),
  pan: z.string().trim().max(12).optional(),
  pickupAddress: z.string().trim().max(300).optional(),
  locality: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(12).optional(),
  pickupLatitude: z.number().min(-90).max(90).optional(),
  pickupLongitude: z.number().min(-180).max(180).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
  operatingHours: z.record(z.string()).optional(),
});

export const listingCreateSchema = z.object({
  productId: z.string().uuid(),
  supplierSku: z.string().trim().max(64).optional(),
  sellingPrice: z.number().positive().max(10_000_000),
  mrpReference: z.number().positive().max(10_000_000).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  minimumOrderQuantity: z.number().int().min(1).max(10_000).default(1),
  leadTimeMinutes: z.number().int().min(0).max(20_160).optional(),
  /** Initial stock. Recorded as a STOCK_IN ledger entry. */
  openingQuantity: z.number().int().min(0).max(1_000_000).default(0),
  batchNumber: z.string().trim().max(64).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
});

export const listingUpdateSchema = z
  .object({
    sellingPrice: z.number().positive().max(10_000_000).optional(),
    mrpReference: z.number().positive().max(10_000_000).optional().nullable(),
    taxRate: z.number().min(0).max(100).optional(),
    minimumOrderQuantity: z.number().int().min(1).max(10_000).optional(),
    leadTimeMinutes: z.number().int().min(0).max(20_160).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'OUT_OF_STOCK']).optional(),
    supplierSku: z.string().trim().max(64).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

export const stockAdjustSchema = z.object({
  quantityDelta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, {
    message: 'quantityDelta must not be zero',
  }),
  transactionType: z
    .enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'BLOCK', 'UNBLOCK'])
    .default('ADJUSTMENT'),
  reason: z.string().trim().max(300).optional(),
  batchNumber: z.string().trim().max(64).optional().nullable(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional().nullable(),
});

export const stockSetSchema = z.object({
  availableQuantity: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().max(300).optional(),
  batchNumber: z.string().trim().max(64).optional().nullable(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const supplierDocumentSchema = z.object({
  documentType: z.enum([
    'WHOLESALE_DRUG_LICENSE',
    'GST_CERTIFICATE',
    'PAN',
    'BUSINESS_REGISTRATION',
    'PREMISES_PROOF',
    'AUTHORIZED_PERSON_PROOF',
    'QUALIFIED_PERSON_DOCUMENT',
    'BANK_DOCUMENT',
    'STORAGE_FACILITY_PROOF',
    'OTHER',
  ]),
  documentNumber: z.string().trim().max(64).optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fileName: z.string().trim().min(3).max(200),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  contentBase64: z.string().min(16).max(20_000_000),
});

export type SupplierProfileInput = z.infer<typeof supplierProfileSchema>;
export type ListingCreateInput = z.infer<typeof listingCreateSchema>;
export type ListingUpdateInput = z.infer<typeof listingUpdateSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
export type StockSetInput = z.infer<typeof stockSetSchema>;
export type SupplierDocumentInput = z.infer<typeof supplierDocumentSchema>;

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly search: SearchService,
  ) {}

  async requireSupplier(actor: AuthenticatedActor): Promise<SupplierRow> {
    if (!actor.supplierId) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'This account is not associated with a supplier profile');
    }
    const supplier = await this.database.row<SupplierRow>(`SELECT * FROM suppliers WHERE id = $1`, [actor.supplierId]);
    if (!supplier) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Supplier profile not found');
    return supplier;
  }

  /* --------------------------------- profile --------------------------------- */

  async getProfile(actor: AuthenticatedActor) {
    const supplier = await this.requireSupplier(actor);
    const stats = await this.database.row<{ listings: string; active_listings: string; low_stock: string }>(
      `SELECT
         (SELECT count(*)::TEXT FROM supplier_product_listings WHERE supplier_id = $1) AS listings,
         (SELECT count(*)::TEXT FROM supplier_product_listings WHERE supplier_id = $1 AND status = 'ACTIVE') AS active_listings,
         (SELECT count(*)::TEXT FROM inventories i
            WHERE i.supplier_id = $1
              AND i.low_stock_threshold IS NOT NULL
              AND i.available_quantity - i.reserved_quantity <= i.low_stock_threshold) AS low_stock`,
      [supplier.id],
    );
    return {
      ...this.serializeSupplier(supplier),
      stats: {
        listings: Number(stats?.listings ?? 0),
        activeListings: Number(stats?.active_listings ?? 0),
        lowStockItems: Number(stats?.low_stock ?? 0),
      },
    };
  }

  async updateProfile(actor: AuthenticatedActor, input: SupplierProfileInput) {
    const supplier = await this.requireSupplier(actor);
    const updated = await this.database.row<SupplierRow>(
      `UPDATE suppliers
          SET legal_name = COALESCE($2, legal_name),
              display_name = COALESCE($3, display_name),
              business_type = COALESCE($4, business_type),
              gstin = COALESCE($5, gstin),
              pan = COALESCE($6, pan),
              pickup_address = COALESCE($7, pickup_address),
              locality = COALESCE($8, locality),
              city = COALESCE($9, city),
              state = COALESCE($10, state),
              postal_code = COALESCE($11, postal_code),
              pickup_latitude = COALESCE($12, pickup_latitude),
              pickup_longitude = COALESCE($13, pickup_longitude),
              contact_phone = COALESCE($14, contact_phone),
              contact_email = COALESCE($15, contact_email),
              operating_hours = COALESCE($16::JSONB, operating_hours)
        WHERE id = $1
        RETURNING *`,
      [
        supplier.id,
        input.legalName ?? null,
        input.displayName ?? null,
        input.businessType ?? null,
        input.gstin ?? null,
        input.pan ?? null,
        input.pickupAddress ?? null,
        input.locality ?? null,
        input.city ?? null,
        input.state ?? null,
        input.postalCode ?? null,
        input.pickupLatitude ?? null,
        input.pickupLongitude ?? null,
        input.contactPhone ?? null,
        input.contactEmail ?? null,
        input.operatingHours ? JSON.stringify(input.operatingHours) : null,
      ],
    );
    await this.audit.record(this.database, {
      action: 'supplier.profile_updated',
      resourceType: 'supplier',
      resourceId: supplier.id,
      after: { ...input },
    });
    return this.serializeSupplier(updated as SupplierRow);
  }

  /** Submitting for verification locks the profile for review and notifies compliance. */
  async submitForVerification(actor: AuthenticatedActor) {
    const supplier = await this.requireSupplier(actor);
    const requiredDocuments = ['WHOLESALE_DRUG_LICENSE', 'GST_CERTIFICATE'];
    const uploaded = await this.database.rows<{ document_type: string }>(
      `SELECT DISTINCT document_type FROM supplier_documents WHERE supplier_id = $1 AND status <> 'REJECTED'`,
      [supplier.id],
    );
    const present = new Set(uploaded.map((row) => row.document_type));
    const missing = requiredDocuments.filter((type) => !present.has(type));
    if (missing.length > 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Required compliance documents are missing', {
        httpStatus: 422,
        details: { missingDocuments: missing },
      });
    }
    if (!supplier.pickup_latitude || !supplier.pickup_longitude || !supplier.pickup_address) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'A complete pickup address with coordinates is required', {
        httpStatus: 422,
      });
    }

    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE suppliers
            SET verification_status = 'UNDER_REVIEW', submitted_for_review_at = now()
          WHERE id = $1 AND verification_status IN ('REGISTERED','DOCUMENTS_PENDING','REJECTED')`,
        [supplier.id],
      );
      await client.query(
        `INSERT INTO verification_reviews (entity_type, entity_id, status, submitted_at)
         VALUES ('SUPPLIER', $1, 'PENDING', now())`,
        [supplier.id],
      );
      await this.events.emit(client, {
        eventName: DomainEventName.SupplierApplicationSubmitted,
        aggregateType: 'supplier',
        aggregateId: supplier.id,
        payload: { documents: [...present] },
      });
      await this.audit.record(client, {
        action: 'supplier.submitted_for_verification',
        resourceType: 'supplier',
        resourceId: supplier.id,
      });
    });

    return { verificationStatus: 'UNDER_REVIEW' };
  }

  /* -------------------------------- documents -------------------------------- */

  async listDocuments(actor: AuthenticatedActor) {
    const supplier = await this.requireSupplier(actor);
    const rows = await this.database.rows<DocumentRow>(
      `SELECT * FROM supplier_documents WHERE supplier_id = $1 ORDER BY created_at DESC`,
      [supplier.id],
    );
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        documentType: row.document_type,
        documentNumber: row.document_number,
        status: row.status,
        issuedAt: row.issued_at ? row.issued_at.toISOString().slice(0, 10) : null,
        expiresAt: row.expires_at ? row.expires_at.toISOString().slice(0, 10) : null,
        verifiedAt: row.verified_at?.toISOString() ?? null,
        rejectionReason: row.rejection_reason,
        downloadUrl: await this.safeSignedUrl(row.object_key),
        createdAt: row.created_at.toISOString(),
      })),
    );
  }

  async uploadDocument(actor: AuthenticatedActor, input: SupplierDocumentInput) {
    const supplier = await this.requireSupplier(actor);
    const content = Buffer.from(input.contentBase64, 'base64');
    if (content.byteLength === 0 || content.byteLength > MAX_DOCUMENT_BYTES) {
      throw new DomainError(ErrorCode.UPLOAD_REJECTED, 'The uploaded document is empty or exceeds the 10 MB limit');
    }
    const objectKey = this.storage.buildObjectKey(
      { type: 'SUPPLIER', id: supplier.id },
      input.fileName,
      'documents',
    );
    await this.storage.put({ objectKey, content, contentType: input.contentType, visibility: 'PRIVATE' });

    const document = await this.database.transaction(async (client) => {
      const inserted = await client.query<DocumentRow>(
        `INSERT INTO supplier_documents (supplier_id, document_type, document_number, object_key, file_name,
                                         content_type, file_size_bytes, status, issued_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8::DATE,$9::DATE)
         RETURNING *`,
        [
          supplier.id,
          input.documentType,
          input.documentNumber ?? null,
          objectKey,
          input.fileName,
          input.contentType,
          content.byteLength,
          input.issuedAt ?? null,
          input.expiresAt ?? null,
        ],
      );
      await client.query(
        `INSERT INTO files (object_key, file_name, content_type, size_bytes, owner_type, owner_id, visibility, status)
         VALUES ($1,$2,$3,$4,'SUPPLIER',$5,'PRIVATE','UPLOADED')
         ON CONFLICT (object_key) DO NOTHING`,
        [objectKey, input.fileName, input.contentType, content.byteLength, supplier.id],
      );
      await client.query(
        `UPDATE suppliers SET verification_status = 'DOCUMENTS_PENDING'
          WHERE id = $1 AND verification_status = 'REGISTERED'`,
        [supplier.id],
      );
      await this.events.emit(client, {
        eventName: DomainEventName.DocumentUploaded,
        aggregateType: 'supplier',
        aggregateId: supplier.id,
        payload: { documentType: input.documentType, documentId: inserted.rows[0]?.id },
      });
      return inserted.rows[0];
    });

    return { id: document?.id, documentType: document?.document_type, status: document?.status };
  }

  /* -------------------------------- listings --------------------------------- */

  async listListings(
    actor: AuthenticatedActor,
    filters: { status?: string; search?: string; page: number; pageSize: number; lowStockOnly?: boolean },
  ) {
    const supplier = await this.requireSupplier(actor);
    const params: unknown[] = [supplier.id];
    const conditions = ['l.supplier_id = $1'];
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`l.status = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}%`);
      conditions.push(`(p.normalized_name LIKE $${params.length} OR p.name ILIKE $${params.length})`);
    }
    if (filters.lowStockOnly) {
      conditions.push(
        `(i.low_stock_threshold IS NOT NULL AND i.available_quantity - i.reserved_quantity <= i.low_stock_threshold)`,
      );
    }

    const rows = await this.database.rows<ListingRow>(
      `SELECT l.*, p.name AS product_name, p.pack_size, p.strength, df.code AS dosage_form,
              m.name AS manufacturer_name, p.prescription_classification,
              i.id AS inventory_id, i.available_quantity, i.reserved_quantity, i.low_stock_threshold,
              i.status AS inventory_status, i.batch_number, i.expiry_date
         FROM supplier_product_listings l
         JOIN products p ON p.id = l.product_id
         LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
         LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY l.updated_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    );
    const count = await this.database.row<{ count: string }>(
      `SELECT count(*)::TEXT AS count
         FROM supplier_product_listings l
         JOIN products p ON p.id = l.product_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
        WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return { rows: rows.map((row) => this.serializeListing(row)), total: Number(count?.count ?? 0) };
  }

  async getListing(actor: AuthenticatedActor, listingId: string) {
    const supplier = await this.requireSupplier(actor);
    const row = await this.database.row<ListingRow>(
      `SELECT l.*, p.name AS product_name, p.pack_size, p.strength, df.code AS dosage_form,
              m.name AS manufacturer_name, p.prescription_classification,
              i.id AS inventory_id, i.available_quantity, i.reserved_quantity, i.low_stock_threshold,
              i.status AS inventory_status, i.batch_number, i.expiry_date
         FROM supplier_product_listings l
         JOIN products p ON p.id = l.product_id
         LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
         LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
        WHERE l.id = $1 AND l.supplier_id = $2`,
      [listingId, supplier.id],
    );
    if (!row) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Listing not found');
    return this.serializeListing(row);
  }

  async createListing(actor: AuthenticatedActor, input: ListingCreateInput) {
    const supplier = await this.requireSupplier(actor);
    if (supplier.verification_status === 'SUSPENDED' || supplier.status === 'SUSPENDED') {
      throw new DomainError(ErrorCode.FORBIDDEN, 'This supplier account is suspended');
    }
    if (input.mrpReference !== undefined && input.sellingPrice > input.mrpReference) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Selling price cannot exceed the MRP reference', {
        httpStatus: 422,
      });
    }

    const product = await this.database.row<{ id: string; status: string }>(
      `SELECT id, status FROM products WHERE id = $1`,
      [input.productId],
    );
    if (!product) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Product not found');
    if (product.status === 'BLOCKED' || product.status === 'ARCHIVED') {
      throw new DomainError(ErrorCode.FORBIDDEN, 'This product cannot be listed');
    }

    const existing = await this.database.row<{ id: string }>(
      `SELECT id FROM supplier_product_listings WHERE supplier_id = $1 AND product_id = $2`,
      [supplier.id, input.productId],
    );
    if (existing) {
      throw new DomainError(ErrorCode.CONFLICT, 'This product is already listed by your business', {
        details: { listingId: existing.id },
      });
    }

    const listing = await this.database.transaction(async (client) => {
      const inserted = await client.query<ListingRow>(
        `INSERT INTO supplier_product_listings
           (supplier_id, product_id, supplier_sku, selling_price, mrp_reference, tax_rate,
            minimum_order_quantity, lead_time_minutes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT')
         RETURNING *`,
        [
          supplier.id,
          input.productId,
          input.supplierSku ?? null,
          input.sellingPrice,
          input.mrpReference ?? null,
          input.taxRate ?? null,
          input.minimumOrderQuantity,
          input.leadTimeMinutes ?? null,
        ],
      );
      const created = inserted.rows[0];
      if (!created) throw new Error('Failed to create listing');

      await client.query(
        `INSERT INTO price_history (supplier_listing_id, price, mrp, changed_by) VALUES ($1,$2,$3,$4)`,
        [created.id, input.sellingPrice, input.mrpReference ?? null, actor.userId],
      );

      await client.query(
        `INSERT INTO inventories (supplier_listing_id, supplier_id, available_quantity, low_stock_threshold,
                                  batch_number, expiry_date, status)
         VALUES ($1,$2,$3,$4,$5,$6::DATE,$7)`,
        [
          created.id,
          supplier.id,
          input.openingQuantity,
          input.lowStockThreshold ?? null,
          input.batchNumber ?? null,
          input.expiryDate ?? null,
          input.openingQuantity > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
        ],
      );

      if (input.openingQuantity > 0) {
        const inventory = await client.query<{ id: string }>(
          `SELECT id FROM inventories WHERE supplier_listing_id = $1`,
          [created.id],
        );
        await this.recordInventoryTransaction(client, {
          inventoryId: inventory.rows[0]?.id as string,
          supplierId: supplier.id,
          transactionType: 'STOCK_IN',
          quantity: input.openingQuantity,
          beforeQuantity: 0,
          afterQuantity: input.openingQuantity,
          reason: 'Opening stock at listing creation',
          actorId: actor.userId,
        });
      }

      await this.events.emit(client, {
        eventName: DomainEventName.ListingCreated,
        aggregateType: 'supplier_listing',
        aggregateId: created.id,
        payload: { supplierId: supplier.id, productId: input.productId, sellingPrice: input.sellingPrice },
      });
      await this.audit.record(client, {
        action: 'supplier.listing_created',
        resourceType: 'supplier_listing',
        resourceId: created.id,
        after: { productId: input.productId, sellingPrice: input.sellingPrice },
      });
      await client.query(
        `INSERT INTO search_index_jobs (entity_type, entity_id, operation) VALUES ('PRODUCT', $1, 'UPSERT')
         ON CONFLICT (entity_type, entity_id) WHERE status IN ('PENDING','PROCESSING','FAILED') DO NOTHING`,
        [input.productId],
      );
      return created;
    });

    return this.getListing(actor, listing.id);
  }

  async updateListing(actor: AuthenticatedActor, listingId: string, input: ListingUpdateInput) {
    const supplier = await this.requireSupplier(actor);
    const current = await this.database.row<{ id: string; selling_price: string; mrp_reference: string | null; product_id: string }>(
      `SELECT id, selling_price, mrp_reference, product_id FROM supplier_product_listings WHERE id = $1 AND supplier_id = $2`,
      [listingId, supplier.id],
    );
    if (!current) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Listing not found');

    const effectiveMrp = input.mrpReference === undefined ? current.mrp_reference : input.mrpReference;
    const effectivePrice = input.sellingPrice ?? Number(current.selling_price);
    if (effectiveMrp !== null && effectivePrice > Number(effectiveMrp)) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Selling price cannot exceed the MRP reference', {
        httpStatus: 422,
      });
    }

    const priceChanged = input.sellingPrice !== undefined && Number(current.selling_price) !== input.sellingPrice;

    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE supplier_product_listings
            SET selling_price = COALESCE($3, selling_price),
                mrp_reference = CASE WHEN $4::BOOLEAN THEN $5::NUMERIC ELSE mrp_reference END,
                tax_rate = COALESCE($6, tax_rate),
                minimum_order_quantity = COALESCE($7, minimum_order_quantity),
                lead_time_minutes = COALESCE($8, lead_time_minutes),
                supplier_sku = COALESCE($9, supplier_sku),
                status = COALESCE($10, status)
          WHERE id = $1 AND supplier_id = $2`,
        [
          listingId,
          supplier.id,
          input.sellingPrice ?? null,
          input.mrpReference !== undefined,
          input.mrpReference ?? null,
          input.taxRate ?? null,
          input.minimumOrderQuantity ?? null,
          input.leadTimeMinutes ?? null,
          input.supplierSku ?? null,
          input.status ?? null,
        ],
      );

      if (priceChanged) {
        await client.query(`UPDATE price_history SET effective_to = now() WHERE supplier_listing_id = $1 AND effective_to IS NULL`, [
          listingId,
        ]);
        await client.query(
          `INSERT INTO price_history (supplier_listing_id, price, mrp, changed_by) VALUES ($1,$2,$3,$4)`,
          [listingId, input.sellingPrice, effectiveMrp, actor.userId],
        );
        await this.events.emit(client, {
          eventName: DomainEventName.ListingPriceChanged,
          aggregateType: 'supplier_listing',
          aggregateId: listingId,
          payload: { previousPrice: Number(current.selling_price), newPrice: input.sellingPrice },
        });
      }
      if (input.status && (input.status === 'ACTIVE' || input.status === 'PAUSED')) {
        await this.events.emit(client, {
          eventName: input.status === 'ACTIVE' ? DomainEventName.ListingCreated : 'ListingPaused',
          aggregateType: 'supplier_listing',
          aggregateId: listingId,
          payload: { status: input.status },
        });
      }
      await this.audit.record(client, {
        action: 'supplier.listing_updated',
        resourceType: 'supplier_listing',
        resourceId: listingId,
        after: { ...input },
      });
      await client.query(
        `INSERT INTO search_index_jobs (entity_type, entity_id, operation) VALUES ('PRODUCT', $1, 'UPSERT')
         ON CONFLICT (entity_type, entity_id) WHERE status IN ('PENDING','PROCESSING','FAILED') DO NOTHING`,
        [current.product_id],
      );
    });

    // Projection is asynchronous: the `search_index_jobs` row written in the transaction above is the
    // durable queue entry; the indexing worker projects it into OpenSearch. Nothing here blocks the
    // supplier's write on a search-engine round-trip (spec: search is a derived, rebuildable index).
    return this.getListing(actor, listingId);
  }

  /* -------------------------------- inventory -------------------------------- */

  async listInventory(
    actor: AuthenticatedActor,
    filters: { page: number; pageSize: number; status?: string; lowStockOnly?: boolean },
  ) {
    const supplier = await this.requireSupplier(actor);
    const params: unknown[] = [supplier.id];
    const conditions = ['i.supplier_id = $1'];
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (filters.lowStockOnly) {
      conditions.push(`(i.low_stock_threshold IS NOT NULL AND i.available_quantity - i.reserved_quantity <= i.low_stock_threshold)`);
    }
    const rows = await this.database.rows<InventoryRow>(
      `SELECT i.*, l.selling_price, p.name AS product_name, p.pack_size
         FROM inventories i
         JOIN supplier_product_listings l ON l.id = i.supplier_listing_id
         JOIN products p ON p.id = l.product_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY i.updated_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    );
    const count = await this.database.row<{ count: string }>(
      `SELECT count(*)::TEXT AS count FROM inventories i WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return {
      rows: rows.map((row) => this.serializeInventory(row)),
      total: Number(count?.count ?? 0),
    };
  }

  /** Apply a delta to available stock with the canonical guarded UPDATE. */
  async adjustStock(actor: AuthenticatedActor, inventoryId: string, input: StockAdjustInput) {
    const supplier = await this.requireSupplier(actor);
    const inventory = await this.database.row<{ id: string; available_quantity: number; product_id: string; supplier_listing_id: string }>(
      `SELECT i.id, i.available_quantity, l.product_id, i.supplier_listing_id
         FROM inventories i JOIN supplier_product_listings l ON l.id = i.supplier_listing_id
        WHERE i.id = $1 AND i.supplier_id = $2`,
      [inventoryId, supplier.id],
    );
    if (!inventory) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Inventory record not found');

    await this.database.transaction(async (client) => {
      const result = await client.query<{ available_quantity: number; reserved_quantity: number; status: string }>(
        `UPDATE inventories
            SET available_quantity = available_quantity + $3,
                version = version + 1,
                batch_number = COALESCE($4, batch_number),
                expiry_date = COALESCE($5::DATE, expiry_date),
                low_stock_threshold = COALESCE($6, low_stock_threshold),
                status = CASE
                  WHEN status IN ('QUARANTINED','BLOCKED','RECALLED','EXPIRED') THEN status
                  WHEN available_quantity + $3 - reserved_quantity <= 0 THEN 'OUT_OF_STOCK'
                  WHEN low_stock_threshold IS NOT NULL AND available_quantity + $3 - reserved_quantity <= low_stock_threshold THEN 'LOW_STOCK'
                  ELSE 'AVAILABLE'
                END
          WHERE id = $1 AND supplier_id = $2
            AND available_quantity + $3 >= reserved_quantity
            AND available_quantity + $3 >= 0
          RETURNING available_quantity, reserved_quantity, status`,
        [
          inventoryId,
          supplier.id,
          input.quantityDelta,
          input.batchNumber ?? null,
          input.expiryDate ?? null,
          input.lowStockThreshold ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new DomainError(
          ErrorCode.INSUFFICIENT_STOCK,
          'The adjustment would reduce available stock below the quantity already reserved by orders',
          { httpStatus: 409 },
        );
      }

      await this.recordInventoryTransaction(client, {
        inventoryId,
        supplierId: supplier.id,
        transactionType: input.transactionType as InventoryTransactionType,
        quantity: input.quantityDelta,
        beforeQuantity: inventory.available_quantity,
        afterQuantity: row.available_quantity,
        reason: input.reason ?? null,
        actorId: actor.userId,
      });

      await this.events.emit(client, {
        eventName: DomainEventName.InventoryUpdated,
        aggregateType: 'inventory',
        aggregateId: inventoryId,
        payload: {
          supplierId: supplier.id,
          delta: input.quantityDelta,
          availableQuantity: row.available_quantity,
          transactionType: input.transactionType,
        },
      });

      if (row.status === 'LOW_STOCK' || row.status === 'OUT_OF_STOCK') {
        await this.events.emit(client, {
          eventName: DomainEventName.InventoryLowStock,
          aggregateType: 'inventory',
          aggregateId: inventoryId,
          payload: { availableQuantity: row.available_quantity, status: row.status },
        });
      }
      return row;
    });

    // The UPDATE returns only the columns it touched. The response contract is the full inventory
    // position, so the canonical row (joined with its listing and product) is re-read inside the same
    // request — never reconstructed by hand, which is how `updatedAt` drifted out of the payload.
    const refreshed = await this.loadInventoryRow(supplier.id, inventoryId);
    if (!refreshed) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Inventory record not found');
    return this.serializeInventory(refreshed);
  }

  /** Canonical read of one inventory position, identical in shape to `listInventory`. */
  private async loadInventoryRow(supplierId: string, inventoryId: string): Promise<InventoryRow | null> {
    return this.database.row<InventoryRow>(
      `SELECT i.*, l.selling_price, p.name AS product_name, p.pack_size
         FROM inventories i
         JOIN supplier_product_listings l ON l.id = i.supplier_listing_id
         JOIN products p ON p.id = l.product_id
        WHERE i.id = $1 AND i.supplier_id = $2`,
      [inventoryId, supplierId],
    );
  }

  /** Set available stock to an absolute value (stock-take). Reserved quantity is preserved. */
  async setStock(actor: AuthenticatedActor, inventoryId: string, input: StockSetInput) {
    const supplier = await this.requireSupplier(actor);
    const inventory = await this.database.row<{ available_quantity: number }>(
      `SELECT available_quantity FROM inventories WHERE id = $1 AND supplier_id = $2`,
      [inventoryId, supplier.id],
    );
    if (!inventory) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Inventory record not found');
    const delta = input.availableQuantity - inventory.available_quantity;
    if (delta === 0) {
      const row = await this.loadInventoryRow(supplier.id, inventoryId);
      if (!row) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Inventory record not found');
      return this.serializeInventory(row);
    }
    return this.adjustStock(actor, inventoryId, {
      quantityDelta: delta,
      transactionType: 'ADJUSTMENT',
      reason: input.reason ?? 'Stock-take adjustment',
      batchNumber: input.batchNumber ?? null,
      expiryDate: input.expiryDate ?? null,
    });
  }

  async listStockLedger(actor: AuthenticatedActor, inventoryId: string, page: number, pageSize: number) {
    const supplier = await this.requireSupplier(actor);
    const owned = await this.database.row<{ id: string }>(
      `SELECT id FROM inventories WHERE id = $1 AND supplier_id = $2`,
      [inventoryId, supplier.id],
    );
    if (!owned) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Inventory record not found');

    const rows = await this.database.rows<{
      id: string;
      transaction_type: string;
      quantity: number;
      before_quantity: number;
      after_quantity: number;
      reason: string | null;
      reference_type: string | null;
      reference_id: string | null;
      created_at: Date;
    }>(
      `SELECT id, transaction_type, quantity, before_quantity, after_quantity, reason, reference_type, reference_id, created_at
         FROM inventory_transactions WHERE inventory_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [inventoryId, pageSize, (page - 1) * pageSize],
    );
    return rows.map((row) => ({
      id: row.id,
      transactionType: row.transaction_type,
      quantity: row.quantity,
      beforeQuantity: row.before_quantity,
      afterQuantity: row.after_quantity,
      reason: row.reason,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /* -------------------------------- helpers ---------------------------------- */

  private async recordInventoryTransaction(
    queryable: Queryable,
    input: {
      inventoryId: string;
      supplierId: string;
      transactionType: InventoryTransactionType;
      quantity: number;
      beforeQuantity: number;
      afterQuantity: number;
      reason: string | null;
      actorId?: string | null;
      referenceType?: string | null;
      referenceId?: string | null;
    },
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO inventory_transactions
         (inventory_id, supplier_id, transaction_type, quantity, before_quantity, after_quantity, reason,
          reference_type, reference_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.inventoryId,
        input.supplierId,
        input.transactionType,
        input.quantity,
        input.beforeQuantity,
        input.afterQuantity,
        input.reason,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.actorId ?? null,
      ],
    );
  }

  private async safeSignedUrl(objectKey: string): Promise<string | null> {
    try {
      return await this.storage.signedUrl(objectKey, 'GET');
    } catch {
      return null;
    }
  }

  private serializeSupplier(row: SupplierRow) {
    return {
      id: row.id,
      legalName: row.legal_name,
      displayName: row.display_name,
      businessType: row.business_type,
      gstin: row.gstin,
      pan: row.pan,
      status: row.status,
      verificationStatus: row.verification_status,
      pickupAddress: row.pickup_address,
      locality: row.locality,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      latitude: row.pickup_latitude ? Number(row.pickup_latitude) : null,
      longitude: row.pickup_longitude ? Number(row.pickup_longitude) : null,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      operatingHours: row.operating_hours,
      verifiedAt: row.verified_at?.toISOString() ?? null,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at.toISOString(),
    };
  }

  private serializeListing(row: ListingRow) {
    const available = row.available_quantity ?? 0;
    const reserved = row.reserved_quantity ?? 0;
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      packSize: row.pack_size,
      strength: row.strength,
      dosageForm: row.dosage_form,
      manufacturerName: row.manufacturer_name,
      prescriptionClassification: row.prescription_classification,
      supplierSku: row.supplier_sku,
      sellingPrice: Number(row.selling_price),
      mrpReference: row.mrp_reference ? Number(row.mrp_reference) : null,
      taxRate: row.tax_rate ? Number(row.tax_rate) : null,
      minimumOrderQuantity: row.minimum_order_quantity,
      leadTimeMinutes: row.lead_time_minutes,
      status: row.status,
      inventoryId: row.inventory_id,
      availableQuantity: available,
      reservedQuantity: reserved,
      sellableQuantity: Math.max(available - reserved, 0),
      lowStockThreshold: row.low_stock_threshold,
      inventoryStatus: row.inventory_status,
      batchNumber: row.batch_number,
      expiryDate: row.expiry_date ? row.expiry_date.toISOString().slice(0, 10) : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private serializeInventory(row: InventoryRow) {
    return {
      id: row.id,
      listingId: row.supplier_listing_id,
      productName: row.product_name ?? null,
      packSize: row.pack_size ?? null,
      sellingPrice: row.selling_price ? Number(row.selling_price) : null,
      availableQuantity: row.available_quantity,
      reservedQuantity: row.reserved_quantity,
      sellableQuantity: Math.max(row.available_quantity - row.reserved_quantity, 0),
      damagedQuantity: row.damaged_quantity,
      expiredQuantity: row.expired_quantity,
      blockedQuantity: row.blocked_quantity,
      lowStockThreshold: row.low_stock_threshold,
      status: row.status,
      batchNumber: row.batch_number,
      expiryDate: row.expiry_date ? row.expiry_date.toISOString().slice(0, 10) : null,
      version: row.version,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /* ------------------------------- fulfillments ------------------------------ */

  async listFulfillments(
    actor: AuthenticatedActor,
    query: {
      page: number;
      pageSize: number;
      status?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
    },
  ): Promise<{ rows: SupplierFulfillmentSummaryResponse[]; total: number }> {
    const supplier = await this.requireSupplier(actor);
    const conditions: string[] = ['f.supplier_id = $1'];
    const params: unknown[] = [supplier.id];

    if (query.status) {
      params.push(query.status);
      conditions.push(`f.status = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search.trim()}%`);
      conditions.push(`(f.fulfillment_reference ILIKE $${params.length} OR o.order_number ILIKE $${params.length})`);
    }

    if (query.fromDate) {
      params.push(query.fromDate);
      conditions.push(`f.created_at >= $${params.length}::timestamptz`);
    }

    if (query.toDate) {
      params.push(query.toDate);
      conditions.push(`f.created_at <= $${params.length}::timestamptz`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await this.database.row<{ count: string }>(
      `SELECT count(*)::text as count
         FROM fulfillments f
         JOIN orders o ON o.id = f.order_id
        WHERE ${whereClause}`,
      params,
    );
    const total = Number(countResult?.count ?? 0);

    const offset = (query.page - 1) * query.pageSize;
    const selectParams = [...params, query.pageSize, offset];

    const rows = await this.database.rows<{
      id: string;
      order_id: string;
      order_number: string;
      fulfillment_reference: string;
      status: FulfillmentStatus;
      subtotal: string;
      tax_total: string;
      delivery_allocation: string;
      total: string;
      package_count: number;
      item_count: string;
      buyer_trade_name: string;
      delivery_locality: string | null;
      delivery_city: string | null;
      delivery_slot_name: string | null;
      accepted_at: Date | null;
      packed_at: Date | null;
      ready_at: Date | null;
      collected_at: Date | null;
      delivered_at: Date | null;
      created_at: Date;
    }>(
      `SELECT f.id,
              f.order_id,
              o.order_number,
              f.fulfillment_reference,
              f.status,
              f.subtotal,
              f.tax_total,
              f.delivery_allocation,
              f.total,
              f.package_count,
              (SELECT coalesce(sum(fi.quantity), 0)::text FROM fulfillment_items fi WHERE fi.fulfillment_id = f.id) AS item_count,
              coalesce(b.trade_name, 'Retailer') AS buyer_trade_name,
              coalesce(o.shipping_address_snapshot->>'locality', '') AS delivery_locality,
              coalesce(o.shipping_address_snapshot->>'city', '') AS delivery_city,
              ds.name AS delivery_slot_name,
              f.accepted_at,
              f.packed_at,
              f.ready_at,
              f.collected_at,
              f.delivered_at,
              f.created_at
         FROM fulfillments f
         JOIN orders o ON o.id = f.order_id
         LEFT JOIN buyers b ON b.id = o.buyer_id
         LEFT JOIN delivery_slots ds ON ds.id = o.delivery_slot_id
        WHERE ${whereClause}
        ORDER BY f.created_at DESC
        LIMIT $${selectParams.length - 1} OFFSET $${selectParams.length}`,
      selectParams,
    );

    return {
      rows: rows.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        orderNumber: r.order_number,
        fulfillmentReference: r.fulfillment_reference,
        status: r.status,
        subtotal: Number(r.subtotal),
        taxTotal: Number(r.tax_total),
        deliveryAllocation: Number(r.delivery_allocation),
        total: Number(r.total),
        packageCount: r.package_count,
        itemCount: Number(r.item_count),
        buyerTradeName: r.buyer_trade_name,
        deliveryLocality: r.delivery_locality || null,
        deliveryCity: r.delivery_city || null,
        deliverySlotName: r.delivery_slot_name || null,
        acceptedAt: r.accepted_at?.toISOString() ?? null,
        packedAt: r.packed_at?.toISOString() ?? null,
        readyAt: r.ready_at?.toISOString() ?? null,
        collectedAt: r.collected_at?.toISOString() ?? null,
        deliveredAt: r.delivered_at?.toISOString() ?? null,
        createdAt: r.created_at.toISOString(),
      })),
      total,
    };
  }

  async getFulfillment(actor: AuthenticatedActor, fulfillmentId: string): Promise<SupplierFulfillmentDetailResponse> {
    const supplier = await this.requireSupplier(actor);

    const fRow = await this.database.row<{
      id: string;
      order_id: string;
      order_number: string;
      fulfillment_reference: string;
      status: FulfillmentStatus;
      subtotal: string;
      tax_total: string;
      delivery_allocation: string;
      total: string;
      package_count: number;
      buyer_id: string;
      buyer_trade_name: string;
      buyer_drug_licence: string | null;
      buyer_phone: string | null;
      shipping_address: Record<string, unknown> | null;
      delivery_slot_name: string | null;
      accepted_at: Date | null;
      packed_at: Date | null;
      ready_at: Date | null;
      collected_at: Date | null;
      delivered_at: Date | null;
      created_at: Date;
    }>(
      `SELECT f.id,
              f.order_id,
              o.order_number,
              f.fulfillment_reference,
              f.status,
              f.subtotal,
              f.tax_total,
              f.delivery_allocation,
              f.total,
              f.package_count,
              b.id AS buyer_id,
              coalesce(b.trade_name, 'Retailer') AS buyer_trade_name,
              b.drug_licence_number AS buyer_drug_licence,
              b.contact_phone AS buyer_phone,
              o.shipping_address_snapshot AS shipping_address,
              ds.name AS delivery_slot_name,
              f.accepted_at,
              f.packed_at,
              f.ready_at,
              f.collected_at,
              f.delivered_at,
              f.created_at
         FROM fulfillments f
         JOIN orders o ON o.id = f.order_id
         LEFT JOIN buyers b ON b.id = o.buyer_id
         LEFT JOIN delivery_slots ds ON ds.id = o.delivery_slot_id
        WHERE f.id = $1 AND f.supplier_id = $2`,
      [fulfillmentId, supplier.id],
    );

    if (!fRow) {
      throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Fulfillment not found or belongs to another supplier');
    }

    const itemRows = await this.database.rows<{
      id: string;
      order_item_id: string;
      product_id: string;
      product_name: string;
      dosage_form: string;
      pack_size: string | null;
      sku: string | null;
      batch_number: string | null;
      expiry_date: Date | null;
      unit_price: string;
      quantity: number;
      line_total: string;
      status: FulfillmentItemStatus;
      short_picked_quantity: number;
    }>(
      `SELECT fi.id,
              fi.order_item_id,
              oi.product_id,
              coalesce(oi.product_name, p.name) AS product_name,
              coalesce(p.dosage_form, 'TABLET') AS dosage_form,
              p.pack_size,
              p.sku,
              oi.batch_number,
              oi.expiry_date,
              oi.unit_price,
              fi.quantity,
              oi.line_total,
              fi.status,
              fi.short_picked_quantity
         FROM fulfillment_items fi
         JOIN order_items oi ON oi.id = fi.order_item_id
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE fi.fulfillment_id = $1
        ORDER BY fi.created_at ASC`,
      [fulfillmentId],
    );

    const packageRows = await this.database.rows<{
      id: string;
      package_code: string;
      status: PackageStatus;
      package_type: string;
      weight_grams: number | null;
      seal_number: string | null;
      handling_notes: string | null;
      pickup_task_id: string | null;
      collected_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, package_code, status, package_type, weight_grams, seal_number,
              handling_notes, pickup_task_id, collected_at, created_at
         FROM pickup_packages
        WHERE fulfillment_id = $1
        ORDER BY created_at ASC`,
      [fulfillmentId],
    );

    const timelineRows = await this.database.rows<{
      id: string;
      from_status: string | null;
      to_status: string;
      reason: string | null;
      actor_type: string;
      created_at: Date;
    }>(
      `SELECT id, from_status, to_status, reason, actor_type, created_at
         FROM fulfillment_status_history
        WHERE fulfillment_id = $1
        ORDER BY created_at ASC`,
      [fulfillmentId],
    );

    const taskRow = await this.database.row<{
      id: string;
      task_code: string;
      status: PickupTaskStatus;
      priority: string;
      pickup_window_start: Date | null;
      pickup_window_end: Date | null;
      picker_name: string | null;
      picker_phone: string | null;
      created_at: Date;
    }>(
      `SELECT pt.id, pt.task_code, pt.status, pt.priority,
              pt.pickup_window_start, pt.pickup_window_end,
              u.full_name AS picker_name, u.phone AS picker_phone,
              pt.created_at
         FROM pickup_task_orders pto
         JOIN pickup_tasks pt ON pt.id = pto.pickup_task_id
         LEFT JOIN pickers pck ON pck.id = pt.assigned_picker_id
         LEFT JOIN users u ON u.id = pck.user_id
        WHERE pto.fulfillment_id = $1
        ORDER BY pto.created_at DESC
        LIMIT 1`,
      [fulfillmentId],
    );

    const addr = fRow.shipping_address as Record<string, unknown> | null;
    const deliveryAddress = addr
      ? {
          addressLine1: String(addr.addressLine1 ?? addr.address_line_1 ?? ''),
          addressLine2: addr.addressLine2 ? String(addr.addressLine2) : null,
          locality: String(addr.locality ?? ''),
          city: String(addr.city ?? ''),
          state: String(addr.state ?? ''),
          postalCode: String(addr.postalCode ?? addr.postal_code ?? ''),
        }
      : null;

    const totalItemCount = itemRows.reduce((sum, item) => sum + item.quantity, 0);

    return {
      id: fRow.id,
      orderId: fRow.order_id,
      orderNumber: fRow.order_number,
      fulfillmentReference: fRow.fulfillment_reference,
      status: fRow.status,
      subtotal: Number(fRow.subtotal),
      taxTotal: Number(fRow.tax_total),
      deliveryAllocation: Number(fRow.delivery_allocation),
      total: Number(fRow.total),
      packageCount: fRow.package_count,
      itemCount: totalItemCount,
      buyerTradeName: fRow.buyer_trade_name,
      deliveryLocality: deliveryAddress?.locality ?? null,
      deliveryCity: deliveryAddress?.city ?? null,
      deliverySlotName: fRow.delivery_slot_name,
      acceptedAt: fRow.accepted_at?.toISOString() ?? null,
      packedAt: fRow.packed_at?.toISOString() ?? null,
      readyAt: fRow.ready_at?.toISOString() ?? null,
      collectedAt: fRow.collected_at?.toISOString() ?? null,
      deliveredAt: fRow.delivered_at?.toISOString() ?? null,
      createdAt: fRow.created_at.toISOString(),
      buyer: {
        id: fRow.buyer_id,
        tradeName: fRow.buyer_trade_name,
        drugLicenceNumber: fRow.buyer_drug_licence,
        contactPhone: fRow.buyer_phone,
      },
      deliveryAddress,
      items: itemRows.map((it) => ({
        id: it.id,
        orderItemId: it.order_item_id,
        productId: it.product_id,
        productName: it.product_name,
        dosageForm: it.dosage_form,
        packSize: it.pack_size,
        sku: it.sku,
        batchNumber: it.batch_number,
        expiryDate: it.expiry_date ? it.expiry_date.toISOString().slice(0, 10) : null,
        unitPrice: Number(it.unit_price),
        quantity: it.quantity,
        lineTotal: Number(it.line_total),
        status: it.status,
        shortPickedQuantity: it.short_picked_quantity,
      })),
      packages: packageRows.map((p) => ({
        id: p.id,
        packageCode: p.package_code,
        status: p.status,
        packageType: p.package_type,
        weightGrams: p.weight_grams,
        sealNumber: p.seal_number,
        handlingNotes: p.handling_notes,
        pickupTaskId: p.pickup_task_id,
        collectedAt: p.collected_at?.toISOString() ?? null,
        createdAt: p.created_at.toISOString(),
      })),
      timeline: timelineRows.map((tl) => ({
        id: tl.id,
        fromStatus: tl.from_status,
        toStatus: tl.to_status,
        reason: tl.reason,
        actorType: tl.actor_type,
        createdAt: tl.created_at.toISOString(),
      })),
      pickupTask: taskRow
        ? {
            id: taskRow.id,
            taskCode: taskRow.task_code,
            status: taskRow.status,
            priority: taskRow.priority,
            pickupWindowStart: taskRow.pickup_window_start?.toISOString() ?? null,
            pickupWindowEnd: taskRow.pickup_window_end?.toISOString() ?? null,
            assignedPickerName: taskRow.picker_name,
            assignedPickerPhone: taskRow.picker_phone,
            createdAt: taskRow.created_at.toISOString(),
          }
        : null,
    };
  }

  async acceptFulfillment(
    actor: AuthenticatedActor,
    fulfillmentId: string,
  ): Promise<{ success: boolean; status: string }> {
    const supplier = await this.requireSupplier(actor);

    return this.database.transaction(async (client) => {
      const locked = await client.query<{
        id: string;
        status: FulfillmentStatus;
        fulfillment_reference: string;
        order_id: string;
      }>(
        `SELECT id, status, fulfillment_reference, order_id
           FROM fulfillments
          WHERE id = $1 AND supplier_id = $2
          FOR UPDATE`,
        [fulfillmentId, supplier.id],
      );
      const fulfillment = locked.rows[0];
      if (!fulfillment) {
        throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Fulfillment not found');
      }

      if (fulfillment.status === FulfillmentStatus.ALLOCATED || fulfillment.status === FulfillmentStatus.PICKING) {
        return { success: true, status: fulfillment.status };
      }

      assertTransition('fulfillment', FULFILLMENT_STATUS_TRANSITIONS, fulfillment.status, FulfillmentStatus.ALLOCATED);

      await client.query(
        `UPDATE fulfillments
            SET status = $2, accepted_at = now(), updated_at = now()
          WHERE id = $1`,
        [fulfillment.id, FulfillmentStatus.ALLOCATED],
      );

      await client.query(
        `UPDATE fulfillment_items
            SET status = $2, updated_at = now()
          WHERE fulfillment_id = $1 AND status = $3`,
        [fulfillment.id, FulfillmentItemStatus.ALLOCATED, FulfillmentItemStatus.PENDING],
      );

      await client.query(
        `INSERT INTO fulfillment_status_history
           (fulfillment_id, from_status, to_status, reason, actor_type, actor_id)
         VALUES ($1, $2, $3, $4, 'SUPPLIER', $5)`,
        [fulfillment.id, fulfillment.status, FulfillmentStatus.ALLOCATED, 'Accepted by supplier', actor.userId],
      );

      await this.events.emit(client, {
        eventName: DomainEventName.FulfillmentAccepted,
        aggregateType: 'fulfillment',
        aggregateId: fulfillment.id,
        payload: {
          fulfillmentId: fulfillment.id,
          fulfillmentReference: fulfillment.fulfillment_reference,
          orderId: fulfillment.order_id,
          acceptedAt: new Date().toISOString(),
        },
      });

      await this.audit.record(client, {
        action: 'supplier.fulfillment_accepted',
        resourceType: 'fulfillment',
        resourceId: fulfillment.id,
        actorUserId: actor.userId,
        metadata: { fulfillmentReference: fulfillment.fulfillment_reference },
      });

      return { success: true, status: FulfillmentStatus.ALLOCATED };
    });
  }

  async packFulfillment(
    actor: AuthenticatedActor,
    fulfillmentId: string,
    input: PackFulfillmentInput,
  ): Promise<{ success: boolean; status: string; packageCount: number }> {
    const supplier = await this.requireSupplier(actor);

    return this.database.transaction(async (client) => {
      const locked = await client.query<{
        id: string;
        status: FulfillmentStatus;
        fulfillment_reference: string;
        order_id: string;
        hub_id: string | null;
      }>(
        `SELECT id, status, fulfillment_reference, order_id, hub_id
           FROM fulfillments
          WHERE id = $1 AND supplier_id = $2
          FOR UPDATE`,
        [fulfillmentId, supplier.id],
      );
      const fulfillment = locked.rows[0];
      if (!fulfillment) {
        throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Fulfillment not found');
      }

      if (fulfillment.status === FulfillmentStatus.PACKED) {
        const existingCount = await client.query<{ count: string }>(
          `SELECT count(*)::text as count FROM pickup_packages WHERE fulfillment_id = $1`,
          [fulfillment.id],
        );
        return {
          success: true,
          status: FulfillmentStatus.PACKED,
          packageCount: Number(existingCount.rows[0]?.count ?? 1),
        };
      }

      assertTransition('fulfillment', FULFILLMENT_STATUS_TRANSITIONS, fulfillment.status, FulfillmentStatus.PACKED);

      const packagesToCreate =
        input.packages && input.packages.length > 0 ? input.packages : [{ packageType: 'STANDARD' as const }];

      let hubId = fulfillment.hub_id;
      if (!hubId) {
        const hubRes = await client.query<{ id: string }>(`SELECT id FROM collection_hubs LIMIT 1`);
        hubId = hubRes.rows[0]?.id ?? null;
      }

      await client.query(`DELETE FROM pickup_packages WHERE fulfillment_id = $1 AND status = 'CREATED'`, [
        fulfillment.id,
      ]);

      for (let i = 0; i < packagesToCreate.length; i++) {
        const pkg = packagesToCreate[i]!;
        const packageCode = `PKG-${fulfillment.fulfillment_reference}-${String(i + 1).padStart(2, '0')}`;
        await client.query(
          `INSERT INTO pickup_packages
             (package_code, order_id, fulfillment_id, supplier_id, expected_hub_id,
              status, package_type, weight_grams, seal_number, handling_notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (package_code) DO UPDATE
             SET weight_grams = EXCLUDED.weight_grams,
                 seal_number = EXCLUDED.seal_number,
                 handling_notes = EXCLUDED.handling_notes`,
          [
            packageCode,
            fulfillment.order_id,
            fulfillment.id,
            supplier.id,
            hubId,
            PackageStatus.WITH_SUPPLIER,
            pkg.packageType ?? 'STANDARD',
            pkg.weightGrams ?? null,
            pkg.sealNumber ?? null,
            pkg.handlingNotes ?? null,
          ],
        );
      }

      await client.query(
        `UPDATE fulfillments
            SET status = $2, package_count = $3, packed_at = now(), updated_at = now()
          WHERE id = $1`,
        [fulfillment.id, FulfillmentStatus.PACKED, packagesToCreate.length],
      );

      await client.query(
        `UPDATE fulfillment_items
            SET status = $2, updated_at = now()
          WHERE fulfillment_id = $1 AND status IN ($3, $4)`,
        [fulfillment.id, FulfillmentItemStatus.PACKED, FulfillmentItemStatus.ALLOCATED, FulfillmentItemStatus.PENDING],
      );

      await client.query(
        `INSERT INTO fulfillment_status_history
           (fulfillment_id, from_status, to_status, reason, actor_type, actor_id)
         VALUES ($1, $2, $3, $4, 'SUPPLIER', $5)`,
        [fulfillment.id, fulfillment.status, FulfillmentStatus.PACKED, 'Order packed with physical packages', actor.userId],
      );

      await this.events.emit(client, {
        eventName: DomainEventName.FulfillmentPacked,
        aggregateType: 'fulfillment',
        aggregateId: fulfillment.id,
        payload: {
          fulfillmentId: fulfillment.id,
          packageCount: packagesToCreate.length,
          packedAt: new Date().toISOString(),
        },
      });

      await this.audit.record(client, {
        action: 'supplier.fulfillment_packed',
        resourceType: 'fulfillment',
        resourceId: fulfillment.id,
        actorUserId: actor.userId,
        metadata: { packageCount: packagesToCreate.length },
      });

      return { success: true, status: FulfillmentStatus.PACKED, packageCount: packagesToCreate.length };
    });
  }

  async readyFulfillment(
    actor: AuthenticatedActor,
    fulfillmentId: string,
  ): Promise<{ success: boolean; status: string; pickupTaskId: string; taskCode: string }> {
    const supplier = await this.requireSupplier(actor);

    return this.database.transaction(async (client) => {
      const locked = await client.query<{
        id: string;
        status: FulfillmentStatus;
        fulfillment_reference: string;
        order_id: string;
        package_count: number;
        hub_id: string | null;
      }>(
        `SELECT id, status, fulfillment_reference, order_id, package_count, hub_id
           FROM fulfillments
          WHERE id = $1 AND supplier_id = $2
          FOR UPDATE`,
        [fulfillmentId, supplier.id],
      );
      const fulfillment = locked.rows[0];
      if (!fulfillment) {
        throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Fulfillment not found');
      }

      if (fulfillment.status === FulfillmentStatus.READY_FOR_PICKUP) {
        const existingTask = await client.query<{ id: string; task_code: string }>(
          `SELECT pt.id, pt.task_code
             FROM pickup_task_orders pto
             JOIN pickup_tasks pt ON pt.id = pto.pickup_task_id
            WHERE pto.fulfillment_id = $1 AND pto.status = 'ACTIVE'`,
          [fulfillment.id],
        );
        const task = existingTask.rows[0];
        return {
          success: true,
          status: FulfillmentStatus.READY_FOR_PICKUP,
          pickupTaskId: task?.id ?? '',
          taskCode: task?.task_code ?? '',
        };
      }

      if (
        fulfillment.status === FulfillmentStatus.CREATED ||
        fulfillment.status === FulfillmentStatus.ALLOCATED ||
        fulfillment.status === FulfillmentStatus.PICKING
      ) {
        await client.query(
          `INSERT INTO pickup_packages
             (package_code, order_id, fulfillment_id, supplier_id, status, package_type)
           VALUES ($1, $2, $3, $4, $5, 'STANDARD')
           ON CONFLICT DO NOTHING`,
          [
            `PKG-${fulfillment.fulfillment_reference}-01`,
            fulfillment.order_id,
            fulfillment.id,
            supplier.id,
            PackageStatus.WITH_SUPPLIER,
          ],
        );
        await client.query(
          `UPDATE fulfillments SET package_count = GREATEST(package_count, 1), packed_at = now() WHERE id = $1`,
          [fulfillment.id],
        );
      }

      assertTransition('fulfillment', FULFILLMENT_STATUS_TRANSITIONS, fulfillment.status, FulfillmentStatus.READY_FOR_PICKUP);

      let hubId = fulfillment.hub_id;
      if (!hubId) {
        const supHub = await client.query<{ hub_id: string | null }>(`SELECT hub_id FROM suppliers WHERE id = $1`, [
          supplier.id,
        ]);
        hubId = supHub.rows[0]?.hub_id ?? null;
        if (!hubId) {
          const firstHub = await client.query<{ id: string }>(`SELECT id FROM collection_hubs LIMIT 1`);
          hubId = firstHub.rows[0]?.id ?? null;
        }
      }

      const countRes = await client.query<{ count: string }>(`SELECT count(*)::text as count FROM pickup_tasks`);
      const nextSeq = (Number(countRes.rows[0]?.count ?? 0) + 1).toString().padStart(6, '0');
      const taskCode = `PT-${new Date().getFullYear()}-${nextSeq}`;

      const pkgCount = Math.max(fulfillment.package_count, 1);

      const taskInsert = await client.query<{ id: string; task_code: string }>(
        `INSERT INTO pickup_tasks
           (task_code, supplier_id, hub_id, status, priority, pickup_window_start, pickup_window_end, order_count, package_count)
         VALUES ($1, $2, $3, 'CREATED', 'NORMAL', now(), now() + interval '2 hours', 1, $4)
         RETURNING id, task_code`,
        [taskCode, supplier.id, hubId, pkgCount],
      );
      const pickupTask = taskInsert.rows[0]!;

      await client.query(
        `INSERT INTO pickup_task_orders
           (pickup_task_id, order_id, fulfillment_id, package_count, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (pickup_task_id, fulfillment_id) DO UPDATE SET package_count = EXCLUDED.package_count`,
        [pickupTask.id, fulfillment.order_id, fulfillment.id, pkgCount],
      );

      await client.query(
        `UPDATE pickup_packages
            SET pickup_task_id = $1, status = $2, expected_hub_id = coalesce(expected_hub_id, $3), updated_at = now()
          WHERE fulfillment_id = $4`,
        [pickupTask.id, PackageStatus.READY_FOR_PICKUP, hubId, fulfillment.id],
      );

      await client.query(
        `UPDATE fulfillments
            SET status = $2, ready_at = now(), hub_id = coalesce(hub_id, $3), updated_at = now()
          WHERE id = $1`,
        [fulfillment.id, FulfillmentStatus.READY_FOR_PICKUP, hubId],
      );

      await client.query(
        `INSERT INTO fulfillment_status_history
           (fulfillment_id, from_status, to_status, reason, actor_type, actor_id)
         VALUES ($1, $2, $3, $4, 'SUPPLIER', $5)`,
        [
          fulfillment.id,
          fulfillment.status,
          FulfillmentStatus.READY_FOR_PICKUP,
          `Ready for pickup. Pickup task ${pickupTask.task_code} dispatched to collection pool`,
          actor.userId,
        ],
      );

      await this.events.emit(client, {
        eventName: DomainEventName.FulfillmentReadyForPickup,
        aggregateType: 'fulfillment',
        aggregateId: fulfillment.id,
        payload: {
          fulfillmentId: fulfillment.id,
          pickupTaskId: pickupTask.id,
          taskCode: pickupTask.task_code,
          packageCount: pkgCount,
          readyAt: new Date().toISOString(),
        },
      });

      await this.events.emit(client, {
        eventName: DomainEventName.PickupTaskCreated,
        aggregateType: 'pickup_task',
        aggregateId: pickupTask.id,
        payload: {
          taskId: pickupTask.id,
          taskCode: pickupTask.task_code,
          supplierId: supplier.id,
          hubId,
          packageCount: pkgCount,
        },
      });

      await this.audit.record(client, {
        action: 'supplier.fulfillment_ready_for_pickup',
        resourceType: 'fulfillment',
        resourceId: fulfillment.id,
        actorUserId: actor.userId,
        metadata: { pickupTaskId: pickupTask.id, taskCode: pickupTask.task_code },
      });

      return {
        success: true,
        status: FulfillmentStatus.READY_FOR_PICKUP,
        pickupTaskId: pickupTask.id,
        taskCode: pickupTask.task_code,
      };
    });
  }

  async rejectFulfillment(
    actor: AuthenticatedActor,
    fulfillmentId: string,
    reason: string,
  ): Promise<{ success: boolean; status: string; releasedUnits: number }> {
    const supplier = await this.requireSupplier(actor);

    return this.database.transaction(async (client) => {
      const locked = await client.query<{
        id: string;
        status: FulfillmentStatus;
        fulfillment_reference: string;
        order_id: string;
      }>(
        `SELECT id, status, fulfillment_reference, order_id
           FROM fulfillments
          WHERE id = $1 AND supplier_id = $2
          FOR UPDATE`,
        [fulfillmentId, supplier.id],
      );
      const fulfillment = locked.rows[0];
      if (!fulfillment) {
        throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Fulfillment not found');
      }

      if (fulfillment.status === FulfillmentStatus.CANCELLED) {
        return { success: true, status: FulfillmentStatus.CANCELLED, releasedUnits: 0 };
      }

      if (
        fulfillment.status === FulfillmentStatus.COLLECTED ||
        fulfillment.status === FulfillmentStatus.AT_HUB ||
        fulfillment.status === FulfillmentStatus.IN_TRANSIT ||
        fulfillment.status === FulfillmentStatus.DELIVERED
      ) {
        throw new DomainError(
          ErrorCode.CONFLICT,
          `Cannot reject fulfillment in ${fulfillment.status} state. Order is already in logistics custody.`,
        );
      }

      const released = await client.query<{ inventory_id: string; quantity: number }>(
        `UPDATE inventory_reservations
            SET status = $2, released_at = now(), release_reason = $3, updated_at = now()
          WHERE order_id = $1
            AND inventory_id IN (
              SELECT oi.inventory_id
                FROM fulfillment_items fi
                JOIN order_items oi ON oi.id = fi.order_item_id
               WHERE fi.fulfillment_id = $4
            )
            AND status IN ($5, $6)
         RETURNING inventory_id, quantity`,
        [
          fulfillment.order_id,
          ReservationStatus.RELEASED,
          `Supplier rejected fulfillment: ${reason}`,
          fulfillment.id,
          ReservationStatus.ACTIVE,
          ReservationStatus.CONFIRMED,
        ],
      );

      let releasedUnits = 0;
      for (const res of released.rows) {
        await client.query(
          `UPDATE inventories
              SET reserved_quantity = reserved_quantity - $2, updated_at = now()
            WHERE id = $1 AND reserved_quantity >= $2`,
          [res.inventory_id, res.quantity],
        );
        releasedUnits += res.quantity;
      }

      await client.query(
        `UPDATE fulfillment_items
            SET status = $2, updated_at = now()
          WHERE fulfillment_id = $1 AND status <> $2`,
        [fulfillment.id, FulfillmentItemStatus.CANCELLED],
      );

      await client.query(
        `UPDATE pickup_task_orders
            SET status = 'CANCELLED', updated_at = now()
          WHERE fulfillment_id = $1 AND status = 'ACTIVE'`,
        [fulfillment.id],
      );

      await client.query(
        `UPDATE fulfillments
            SET status = $2, cancelled_at = now(), cancellation_reason = $3, rejection_reason = $3, updated_at = now()
          WHERE id = $1`,
        [fulfillment.id, FulfillmentStatus.CANCELLED, reason],
      );

      await client.query(
        `INSERT INTO fulfillment_status_history
           (fulfillment_id, from_status, to_status, reason, actor_type, actor_id)
         VALUES ($1, $2, $3, $4, 'SUPPLIER', $5)`,
        [fulfillment.id, fulfillment.status, FulfillmentStatus.CANCELLED, reason, actor.userId],
      );

      await this.events.emit(client, {
        eventName: DomainEventName.FulfillmentRejected,
        aggregateType: 'fulfillment',
        aggregateId: fulfillment.id,
        payload: {
          fulfillmentId: fulfillment.id,
          fulfillmentReference: fulfillment.fulfillment_reference,
          orderId: fulfillment.order_id,
          reason,
          releasedUnits,
        },
      });

      if (releasedUnits > 0) {
        await this.events.emit(client, {
          eventName: DomainEventName.InventoryReservationReleased,
          aggregateType: 'order',
          aggregateId: fulfillment.order_id,
          payload: {
            orderId: fulfillment.order_id,
            fulfillmentId: fulfillment.id,
            reason: `Supplier rejection: ${reason}`,
            releasedUnits,
          },
        });
      }

      await this.audit.record(client, {
        action: 'supplier.fulfillment_rejected',
        resourceType: 'fulfillment',
        resourceId: fulfillment.id,
        actorUserId: actor.userId,
        metadata: { reason, releasedUnits },
      });

      return { success: true, status: FulfillmentStatus.CANCELLED, releasedUnits };
    });
  }
}

interface SupplierRow {
  id: string;
  user_id: string;
  legal_name: string;
  display_name: string;
  business_type: string | null;
  gstin: string | null;
  pan: string | null;
  status: string;
  verification_status: string;
  pickup_address: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  pickup_latitude: string | null;
  pickup_longitude: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  operating_hours: Record<string, unknown>;
  verified_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
}

interface DocumentRow {
  id: string;
  document_type: string;
  document_number: string | null;
  object_key: string;
  status: string;
  issued_at: Date | null;
  expires_at: Date | null;
  verified_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
}

interface ListingRow {
  id: string;
  supplier_id: string;
  product_id: string;
  supplier_sku: string | null;
  selling_price: string;
  mrp_reference: string | null;
  tax_rate: string | null;
  minimum_order_quantity: number;
  lead_time_minutes: number | null;
  status: ListingStatus | string;
  product_name?: string;
  pack_size?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  manufacturer_name?: string | null;
  prescription_classification?: string;
  inventory_id?: string | null;
  available_quantity?: number | null;
  reserved_quantity?: number | null;
  low_stock_threshold?: number | null;
  inventory_status?: string | null;
  batch_number?: string | null;
  expiry_date?: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface InventoryRow {
  id: string;
  supplier_listing_id: string;
  available_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
  expired_quantity: number;
  blocked_quantity: number;
  low_stock_threshold: number | null;
  status: string;
  batch_number: string | null;
  expiry_date: Date | null;
  version: number;
  updated_at: Date;
  product_name?: string | null;
  pack_size?: string | null;
  selling_price?: string | null;
}

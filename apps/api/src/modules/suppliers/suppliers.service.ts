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
import { DomainEventName, ErrorCode, InventoryTransactionType, ListingStatus } from '@bezzo/contracts';
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

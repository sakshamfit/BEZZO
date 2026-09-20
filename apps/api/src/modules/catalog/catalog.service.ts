/**
 * Public catalog service.
 *
 * Responsibilities:
 *  - categories, manufacturers and dosage forms for navigation and filters;
 *  - product detail enriched with live supplier offers (price, MOQ, sellable quantity);
 *  - marketplace search delegated to the SearchService (OpenSearch with a bounded DB fallback).
 *
 * Performance rules honoured here: pagination is always bounded, offer aggregation is a single
 * grouped query (no N+1), and search never falls back to unbounded LIKE scans of the whole catalog.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, PrescriptionClassification } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { DATABASE } from '../../infrastructure/database/database.module';
import { SearchService, type ProductSearchQuery } from '../../infrastructure/search/search.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { DomainError } from '../../common/errors/domain-error';

export interface CatalogProductQuery extends Omit<ProductSearchQuery, 'page' | 'pageSize'> {
  page: number;
  pageSize: number;
}

const CATEGORY_CACHE_TTL_SECONDS = 300;

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly search: SearchService,
    private readonly cache: CacheService,
  ) {}

  async listCategories() {
    const cached = await this.cache.getJson<
      Array<{ id: string; name: string; slug: string; parentId: string | null; productCount: number }>
    >('catalog:categories');
    if (cached) return cached;

    const rows = await this.database.rows<{
      id: string;
      name: string;
      slug: string;
      parent_id: string | null;
      sort_order: number;
      product_count: string;
    }>(
      `SELECT c.id, c.name, c.slug, c.parent_id, c.sort_order,
              (SELECT count(*)::TEXT FROM products p WHERE p.category_id = c.id AND p.status = 'PUBLISHED') AS product_count
         FROM categories c
        WHERE c.status = 'ACTIVE'
        ORDER BY c.sort_order, c.name`,
    );
    const categories = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parent_id,
      productCount: Number(row.product_count),
    }));
    await this.cache.setJson('catalog:categories', categories, CATEGORY_CACHE_TTL_SECONDS);
    return categories;
  }

  async listManufacturers() {
    const rows = await this.database.rows<{ id: string; name: string; product_count: string }>(
      `SELECT m.id, m.name, count(p.id)::TEXT AS product_count
         FROM manufacturers m
         LEFT JOIN products p ON p.manufacturer_id = m.id AND p.status = 'PUBLISHED'
        WHERE m.status = 'ACTIVE'
        GROUP BY m.id, m.name
        ORDER BY m.name
        LIMIT 500`,
    );
    return rows.map((row) => ({ id: row.id, name: row.name, productCount: Number(row.product_count) }));
  }

  async listDosageForms() {
    const rows = await this.database.rows<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM dosage_forms WHERE status = 'ACTIVE' ORDER BY sort_order, name`,
    );
    return rows;
  }

  async searchProducts(query: CatalogProductQuery) {
    const result = await this.search.search(query);
    const productIds = result.hits.map((hit) => hit.productId);

    // One grouped query for the offer summary of every hit on the page (no N+1).
    const offerRows = productIds.length
      ? await this.database.rows<{
          product_id: string;
          supplier_count: string;
          min_price: string | null;
          max_price: string | null;
          sellable_quantity: string;
        }>(
          `SELECT l.product_id, count(DISTINCT l.supplier_id)::TEXT AS supplier_count,
                  min(l.selling_price)::TEXT AS min_price, max(l.selling_price)::TEXT AS max_price,
                  COALESCE(sum(i.available_quantity - i.reserved_quantity), 0)::TEXT AS sellable_quantity
             FROM supplier_product_listings l
             LEFT JOIN inventories i ON i.supplier_listing_id = l.id AND i.status IN ('AVAILABLE','LOW_STOCK')
            WHERE l.product_id = ANY($1::UUID[]) AND l.status = 'ACTIVE'
            GROUP BY l.product_id`,
          [productIds],
        )
      : [];
    const offers = new Map(offerRows.map((row) => [row.product_id, row]));

    const items = result.hits.map((hit) => {
      const offer = offers.get(hit.productId);
      return {
        id: hit.productId,
        name: hit.document.name,
        genericName: hit.document.genericName,
        brandName: hit.document.brandName,
        manufacturerName: hit.document.manufacturerName,
        categoryId: hit.document.categoryId,
        dosageForm: hit.document.dosageForm,
        strength: hit.document.strength,
        packSize: hit.document.packSize,
        prescriptionClassification: hit.document.prescriptionClassification,
        supplierCount: Number(offer?.supplier_count ?? 0),
        minPrice: offer?.min_price ? Number(offer.min_price) : null,
        maxPrice: offer?.max_price ? Number(offer.max_price) : null,
        sellableQuantity: Number(offer?.sellable_quantity ?? 0),
        inStock: Number(offer?.sellable_quantity ?? 0) > 0,
      };
    });

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.total,
        totalPages: Math.max(Math.ceil(result.total / query.pageSize), 1),
      },
      meta: { provider: result.provider, degraded: result.degraded },
    };
  }

  async getProduct(productId: string, buyerContext: { buyerId: string | null }) {
    const product = await this.database.row<{
      id: string;
      name: string;
      slug: string;
      generic_name: string | null;
      brand_name: string | null;
      composition_summary: string | null;
      strength: string | null;
      pack_size: string | null;
      pack_unit: string | null;
      prescription_classification: PrescriptionClassification | string;
      storage_requirements: string | null;
      description: string | null;
      status: string;
      category_id: string;
      category_name: string;
      manufacturer_name: string | null;
      dosage_form: string | null;
      updated_at: Date;
    }>(
      `SELECT p.id, p.name, p.slug, p.generic_name, p.brand_name, p.composition_summary, p.strength, p.pack_size,
              p.pack_unit, p.prescription_classification, p.storage_requirements, p.description, p.status,
              p.category_id, c.name AS category_name, m.name AS manufacturer_name, df.code AS dosage_form,
              p.updated_at
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
        WHERE p.id = $1`,
      [productId],
    );
    if (!product) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Product not found');

    // Prescription-only products expose availability but require a verified buyer to order later.
    const isRestricted =
      product.prescription_classification === PrescriptionClassification.CONTROLLED_SCHEDULE ||
      product.prescription_classification === PrescriptionClassification.NARCOTIC;
    if (isRestricted && !buyerContext.buyerId) {
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        genericName: product.generic_name,
        brandName: product.brand_name,
        compositionSummary: product.composition_summary,
        strength: product.strength,
        packSize: product.pack_size,
        packUnit: product.pack_unit,
        prescriptionClassification: product.prescription_classification,
        storageRequirements: product.storage_requirements,
        description: product.description,
        category: { id: product.category_id, name: product.category_name },
        manufacturerName: product.manufacturer_name,
        dosageForm: product.dosage_form,
        offers: [],
        restricted: true,
        updatedAt: product.updated_at.toISOString(),
      };
    }

    const offers = await this.database.rows<{
      listing_id: string;
      supplier_id: string;
      supplier_name: string;
      supplier_city: string | null;
      selling_price: string;
      mrp_reference: string | null;
      tax_rate: string | null;
      minimum_order_quantity: number;
      lead_time_minutes: number | null;
      available_quantity: number;
      reserved_quantity: number;
      batch_number: string | null;
      expiry_date: Date | null;
    }>(
      `SELECT l.id AS listing_id, s.id AS supplier_id, s.display_name AS supplier_name, s.city AS supplier_city,
              l.selling_price, l.mrp_reference, l.tax_rate, l.minimum_order_quantity, l.lead_time_minutes,
              COALESCE(i.available_quantity, 0) AS available_quantity, COALESCE(i.reserved_quantity, 0) AS reserved_quantity,
              i.batch_number, i.expiry_date
         FROM supplier_product_listings l
         JOIN suppliers s ON s.id = l.supplier_id
         LEFT JOIN inventories i ON i.supplier_listing_id = l.id
        WHERE l.product_id = $1
          AND l.status = 'ACTIVE'
          AND s.status = 'ACTIVE'
          AND s.verification_status = 'VERIFIED'
          AND COALESCE(i.available_quantity, 0) - COALESCE(i.reserved_quantity, 0) > 0
        ORDER BY l.selling_price ASC, COALESCE(i.available_quantity - i.reserved_quantity, 0) DESC
        LIMIT 50`,
      [productId],
    );

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      genericName: product.generic_name,
      brandName: product.brand_name,
      compositionSummary: product.composition_summary,
      strength: product.strength,
      packSize: product.pack_size,
      packUnit: product.pack_unit,
      prescriptionClassification: product.prescription_classification,
      storageRequirements: product.storage_requirements,
      description: product.description,
      category: { id: product.category_id, name: product.category_name },
      manufacturerName: product.manufacturer_name,
      dosageForm: product.dosage_form,
      restricted: false,
      offers: offers.map((offer) => ({
        listingId: offer.listing_id,
        supplierId: offer.supplier_id,
        supplierName: offer.supplier_name,
        supplierCity: offer.supplier_city,
        sellingPrice: Number(offer.selling_price),
        mrpReference: offer.mrp_reference ? Number(offer.mrp_reference) : null,
        taxRate: offer.tax_rate ? Number(offer.tax_rate) : null,
        minimumOrderQuantity: offer.minimum_order_quantity,
        leadTimeMinutes: offer.lead_time_minutes,
        sellableQuantity: Math.max(offer.available_quantity - offer.reserved_quantity, 0),
        batchNumber: offer.batch_number,
        expiryDate: offer.expiry_date ? offer.expiry_date.toISOString().slice(0, 10) : null,
      })),
      updatedAt: product.updated_at.toISOString(),
    };
  }

  /** Type-ahead suggestions — served from the search projection, never a full table scan. */
  async suggest(term: string, limit: number) {
    const result = await this.search.search({ q: term, page: 1, pageSize: Math.min(limit, 20), sort: 'relevance' });
    return result.hits.map((hit) => ({
      id: hit.productId,
      name: hit.document.name,
      strength: hit.document.strength,
      packSize: hit.document.packSize,
      manufacturerName: hit.document.manufacturerName,
    }));
  }

  async listDeliverySlots() {
    const rows = await this.database.rows<{
      id: string;
      name: string;
      start_time: string;
      end_time: string;
      max_capacity: number | null;
    }>(
      `SELECT id, name, start_time, end_time, max_capacity
         FROM delivery_slots WHERE active ORDER BY sort_order, start_time`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
      maxCapacity: row.max_capacity,
    }));
  }
}

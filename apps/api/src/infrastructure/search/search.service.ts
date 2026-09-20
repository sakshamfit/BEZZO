/**
 * Search infrastructure.
 *
 * Specification rules:
 *  - OpenSearch is the marketplace search engine; PostgreSQL must not be the primary search path for
 *    large catalogs (project rule §18);
 *  - the index is DERIVED: PostgreSQL stays authoritative and the projection is rebuilt from
 *    outbox-backed `search_index_jobs` rows (DB design §31);
 *  - when OpenSearch is unavailable the marketplace degrades to a bounded, indexed database query
 *    instead of failing browsing (project rule §42).
 *
 * The provider abstraction keeps `@opensearch-project/opensearch` out of every business module: a
 * future move to a hosted search service changes only the provider implementation.
 */
import { Inject, Injectable, Module, Global } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import type { AppConfig } from '@bezzo/config';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { ErrorCode } from '@bezzo/contracts';
import { APP_CONFIG } from '../config/config.module';
import { DATABASE } from '../database/database.module';
import { InjectLogger, BEZZO_LOGGER, type BezzoLogger } from '../logger/logger.module';

export interface ProductSearchDocument {
  productId: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  manufacturerName: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  dosageForm: string | null;
  strength: string | null;
  packSize: string | null;
  composition: string[];
  prescriptionClassification: string;
  status: string;
  supplierIds: string[];
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  sellableQuantity: number;
  updatedAt: string;
}

export interface ProductSearchQuery {
  q?: string;
  categoryId?: string;
  manufacturerId?: string;
  dosageForm?: string;
  strength?: string;
  packSize?: string;
  supplierId?: string;
  prescriptionClassification?: string;
  inStockOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'created_desc';
  page: number;
  pageSize: number;
}

export interface ProductSearchHit {
  productId: string;
  score: number | null;
  document: ProductSearchDocument;
}

export interface ProductSearchResult {
  hits: ProductSearchHit[];
  total: number;
  provider: 'opensearch' | 'database-fallback';
  degraded: boolean;
}

export interface SearchProvider {
  readonly name: 'opensearch' | 'database-fallback';
  available(): boolean;
  index(document: ProductSearchDocument): Promise<void>;
  remove(productId: string): Promise<void>;
  search(query: ProductSearchQuery): Promise<ProductSearchResult>;
  recreateIndex(): Promise<void>;
}

/** Index mapping: analysed text fields for discovery plus the filters the marketplace UI exposes. */
export const PRODUCT_INDEX_MAPPING = {
  settings: {
    analysis: {
      analyzer: {
        bezzo_text: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] },
      },
    },
  },
  mappings: {
    properties: {
      productId: { type: 'keyword' },
      name: { type: 'text', analyzer: 'bezzo_text', fields: { keyword: { type: 'keyword' } } },
      genericName: { type: 'text', analyzer: 'bezzo_text' },
      brandName: { type: 'text', analyzer: 'bezzo_text' },
      manufacturerName: { type: 'text', analyzer: 'bezzo_text', fields: { keyword: { type: 'keyword' } } },
      categoryId: { type: 'keyword' },
      categorySlug: { type: 'keyword' },
      dosageForm: { type: 'keyword' },
      strength: { type: 'keyword' },
      packSize: { type: 'keyword' },
      composition: { type: 'text', analyzer: 'bezzo_text' },
      prescriptionClassification: { type: 'keyword' },
      status: { type: 'keyword' },
      supplierIds: { type: 'keyword' },
      minPrice: { type: 'double' },
      maxPrice: { type: 'double' },
      inStock: { type: 'boolean' },
      sellableQuantity: { type: 'integer' },
      updatedAt: { type: 'date' },
    },
  },
} as const;

/**
 * Narrow view over the generated OpenSearch client.
 *
 * The official client publishes an overload per API version, which makes call sites ambiguous to the
 * compiler while the runtime shape is stable. We narrow it to the operations BEZZO uses and re-type
 * responses explicitly at this boundary.
 */
interface OpenSearchTransport {
  ping(): Promise<unknown>;
  index(params: Record<string, unknown>): Promise<unknown>;
  delete(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  search(params: Record<string, unknown>): Promise<{ body: unknown }>;
  indices: {
    create(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    delete(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  };
}

export class OpenSearchProvider implements SearchProvider {
  readonly name = 'opensearch' as const;
  private client: OpenSearchTransport;
  private healthy = false;

  constructor(
    private readonly options: { node: string; index: string; username?: string; password?: string },
    private readonly logger: BezzoLogger,
  ) {
    this.client = new Client({
      node: options.node,
      ...(options.username && options.password
        ? { auth: { username: options.username, password: options.password } }
        : {}),
      requestTimeout: 5_000,
      maxRetries: 1,
    }) as unknown as OpenSearchTransport;
  }

  available(): boolean {
    return this.healthy;
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      this.healthy = true;
    } catch (error) {
      this.healthy = false;
      this.logger.warnWith({ error: (error as Error).message }, 'opensearch unreachable — search degraded');
    }
    return this.healthy;
  }

  async recreateIndex(): Promise<void> {
    await this.client.indices.delete({ index: this.options.index }, { ignore: [404] });
    await this.client.indices.create({
      index: this.options.index,
      body: PRODUCT_INDEX_MAPPING as unknown as Record<string, unknown>,
    });
  }

  async index(document: ProductSearchDocument): Promise<void> {
    await this.client.index({
      index: this.options.index,
      id: document.productId,
      body: document,
      refresh: false,
    });
    this.healthy = true;
  }

  async remove(productId: string): Promise<void> {
    await this.client.delete({ index: this.options.index, id: productId }, { ignore: [404] });
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    const filters: Record<string, unknown>[] = [];
    if (query.categoryId) filters.push({ term: { categoryId: query.categoryId } });
    if (query.dosageForm) filters.push({ term: { dosageForm: query.dosageForm } });
    if (query.strength) filters.push({ term: { strength: query.strength } });
    if (query.packSize) filters.push({ term: { packSize: query.packSize } });
    if (query.supplierId) filters.push({ term: { supplierIds: query.supplierId } });
    if (query.prescriptionClassification) {
      filters.push({ term: { prescriptionClassification: query.prescriptionClassification } });
    }
    if (query.inStockOnly) filters.push({ term: { inStock: true } });
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filters.push({
        range: {
          minPrice: {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          },
        },
      });
    }
    filters.push({ term: { status: 'PUBLISHED' } });

    const must = query.q
      ? [
          {
            multi_match: {
              query: query.q,
              fields: [
                'name^4',
                'name.keyword^6',
                'genericName^3',
                'brandName^3',
                'composition^2',
                'manufacturerName^2',
                'packSize',
              ],
              fuzziness: 'AUTO',
              type: 'best_fields',
            },
          },
        ]
      : [{ match_all: {} }];

    const sort: unknown[] = [];
    switch (query.sort) {
      case 'price_asc':
        sort.push({ minPrice: 'asc' });
        break;
      case 'price_desc':
        sort.push({ minPrice: 'desc' });
        break;
      case 'name_asc':
        sort.push({ 'name.keyword': 'asc' });
        break;
      case 'created_desc':
        sort.push({ updatedAt: 'desc' });
        break;
      default:
        sort.push({ _score: 'desc' }, { sellableQuantity: 'desc' });
    }

    const response = await this.client.search({
      index: this.options.index,
      body: {
        query: { bool: { must, filter: filters } },
        sort,
        from: (query.page - 1) * query.pageSize,
        size: query.pageSize,
        track_total_hits: true,
      },
    });

    const body = response.body as unknown as {
      hits: {
        total: { value: number } | number;
        hits: Array<{ _id: string; _score: number | null; _source: ProductSearchDocument }>;
      };
    };
    const total = typeof body.hits.total === 'number' ? body.hits.total : body.hits.total.value;
    return {
      hits: body.hits.hits.map((hit) => ({
        productId: hit._source.productId ?? hit._id,
        score: hit._score,
        document: hit._source,
      })),
      total,
      provider: 'opensearch',
      degraded: false,
    };
  }
}

/**
 * Database fallback — an explicitly degraded mode.
 *
 * It is bounded, uses the `pg_trgm` index on `products.normalized_name` and returns the same document
 * shape, which keeps browsing and the web/mobile clients working during an OpenSearch outage.
 */
export class DatabaseSearchProvider implements SearchProvider {
  readonly name = 'database-fallback' as const;

  constructor(private readonly database: DatabaseType) {}

  available(): boolean {
    return true;
  }

  async index(): Promise<void> {
    // No projection: the fallback reads canonical rows directly.
  }

  async remove(): Promise<void> {
    // No projection.
  }

  async recreateIndex(): Promise<void> {
    // No projection.
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    const params: unknown[] = [];
    const conditions: string[] = [`p.status = 'PUBLISHED'`];

    if (query.q) {
      params.push(query.q.toLowerCase().replace(/[^a-z0-9]/g, ''));
      conditions.push(
        `(p.normalized_name LIKE '%' || $${params.length} || '%'
           OR COALESCE(p.normalized_generic_name,'') LIKE '%' || $${params.length} || '%'
           OR similarity(p.normalized_name, $${params.length}) > 0.25)`,
      );
    }
    if (query.categoryId) {
      params.push(query.categoryId);
      conditions.push(`p.category_id = $${params.length}::UUID`);
    }
    if (query.dosageForm) {
      params.push(query.dosageForm);
      conditions.push(`df.code = $${params.length}`);
    }
    if (query.strength) {
      params.push(query.strength);
      conditions.push(`p.strength = $${params.length}`);
    }
    if (query.packSize) {
      params.push(query.packSize);
      conditions.push(`p.pack_size = $${params.length}`);
    }
    if (query.supplierId) {
      params.push(query.supplierId);
      conditions.push(
        `EXISTS (SELECT 1 FROM supplier_product_listings l2
                  WHERE l2.product_id = p.id AND l2.supplier_id = $${params.length}::UUID AND l2.status = 'ACTIVE')`,
      );
    }
    if (query.prescriptionClassification) {
      params.push(query.prescriptionClassification);
      conditions.push(`p.prescription_classification = $${params.length}`);
    }
    if (query.inStockOnly) conditions.push(`agg.sellable_quantity > 0`);
    if (query.minPrice !== undefined) {
      params.push(query.minPrice);
      conditions.push(`agg.min_price >= $${params.length}::NUMERIC`);
    }
    if (query.maxPrice !== undefined) {
      params.push(query.maxPrice);
      conditions.push(`agg.min_price <= $${params.length}::NUMERIC`);
    }

    const orderBy =
      query.sort === 'price_asc'
        ? 'agg.min_price ASC NULLS LAST'
        : query.sort === 'price_desc'
          ? 'agg.min_price DESC NULLS LAST'
          : query.sort === 'name_asc'
            ? 'p.name ASC'
            : query.sort === 'created_desc'
              ? 'p.created_at DESC'
              : query.q
                ? 'rank DESC, agg.sellable_quantity DESC'
                : 'agg.sellable_quantity DESC, p.updated_at DESC';

    const rows = await this.database.rows<{
      product_id: string;
      name: string;
      generic_name: string | null;
      brand_name: string | null;
      manufacturer_name: string | null;
      category_id: string;
      dosage_form: string | null;
      strength: string | null;
      pack_size: string | null;
      prescription_classification: string;
      min_price: string | null;
      max_price: string | null;
      sellable_quantity: string;
      supplier_ids: string[] | null;
      updated_at: Date;
      total_count: string;
      rank: number | null;
    }>(
      `SELECT p.id AS product_id, p.name, p.generic_name, p.brand_name, m.name AS manufacturer_name,
              p.category_id, df.code AS dosage_form, p.strength, p.pack_size, p.prescription_classification,
              agg.min_price, agg.max_price, agg.sellable_quantity, agg.supplier_ids, p.updated_at,
              count(*) OVER () AS total_count,
              ${query.q ? `similarity(p.normalized_name, $1)` : 'NULL'}::DOUBLE PRECISION AS rank
         FROM products p
         LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
         LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
         JOIN (
           SELECT l.product_id,
                  min(l.selling_price) AS min_price,
                  max(l.selling_price) AS max_price,
                  COALESCE(sum(i.available_quantity - i.reserved_quantity), 0) AS sellable_quantity,
                  array_agg(DISTINCT l.supplier_id::TEXT) AS supplier_ids
             FROM supplier_product_listings l
             LEFT JOIN inventories i ON i.supplier_listing_id = l.id AND i.status IN ('AVAILABLE','LOW_STOCK')
            WHERE l.status = 'ACTIVE'
            GROUP BY l.product_id
         ) agg ON agg.product_id = p.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    );

    return {
      hits: rows.map((row) => ({
        productId: row.product_id,
        score: row.rank,
        document: {
          productId: row.product_id,
          name: row.name,
          genericName: row.generic_name,
          brandName: row.brand_name,
          manufacturerName: row.manufacturer_name,
          categoryId: row.category_id,
          categorySlug: null,
          dosageForm: row.dosage_form,
          strength: row.strength,
          packSize: row.pack_size,
          composition: [],
          prescriptionClassification: row.prescription_classification,
          status: 'PUBLISHED',
          supplierIds: row.supplier_ids ?? [],
          minPrice: row.min_price ? Number(row.min_price) : null,
          maxPrice: row.max_price ? Number(row.max_price) : null,
          inStock: Number(row.sellable_quantity) > 0,
          sellableQuantity: Number(row.sellable_quantity),
          updatedAt: row.updated_at.toISOString(),
        },
      })),
      total: Number(rows[0]?.total_count ?? 0),
      provider: 'database-fallback',
      degraded: true,
    };
  }
}

@Injectable()
export class SearchService {
  private readonly provider: SearchProvider;
  private readonly fallbackProvider: SearchProvider;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseType,
    @InjectLogger() private readonly logger: BezzoLogger,
  ) {
    const fallback = new DatabaseSearchProvider(database);
    this.fallbackProvider = fallback;

    if (config.SEARCH_ENABLED && config.OPENSEARCH_NODE) {
      const openSearch = new OpenSearchProvider(
        {
          node: config.OPENSEARCH_NODE,
          index: config.OPENSEARCH_PRODUCT_INDEX,
          username: config.OPENSEARCH_USERNAME,
          password: config.OPENSEARCH_PASSWORD,
        },
        logger,
      );
      this.provider = openSearch;
      void openSearch
        .ping()
        .then((healthy) => {
          if (!healthy && !config.SEARCH_FALLBACK_ENABLED) {
            this.logger.errorWith({}, 'OpenSearch is unreachable and SEARCH_FALLBACK_ENABLED=false');
          }
        })
        .catch(() => undefined);
    } else {
      this.provider = fallback;
      this.logger.warnWith({}, 'SEARCH_ENABLED=false — the degraded database search path is active');
    }
  }

  status(): { provider: string; available: boolean; fallbackEnabled: boolean } {
    return {
      provider: this.provider.name,
      available: this.provider.available(),
      fallbackEnabled: this.config.SEARCH_FALLBACK_ENABLED,
    };
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    if (this.provider.name === 'opensearch' && this.provider.available()) {
      try {
        return await this.provider.search(query);
      } catch (error) {
        this.logger.warnWith({ error: (error as Error).message }, 'opensearch query failed — using fallback');
        if (!this.config.SEARCH_FALLBACK_ENABLED) throw error;
      }
    }
    return this.fallbackProvider.search(query);
  }

  /** Best-effort projection: failures enqueue a job instead of corrupting canonical data. */
  async indexProduct(document: ProductSearchDocument): Promise<void> {
    if (this.provider.name !== 'opensearch') return;
    try {
      await this.provider.index(document);
    } catch (error) {
      this.logger.warnWith(
        { productId: document.productId, error: (error as Error).message },
        'product indexing failed — queued for retry',
      );
      await this.enqueue({ entityType: 'PRODUCT', entityId: document.productId, operation: 'UPSERT' });
      throw error;
    }
  }

  async removeProduct(productId: string): Promise<void> {
    if (this.provider.name !== 'opensearch') return;
    try {
      await this.provider.remove(productId);
    } catch {
      await this.enqueue({ entityType: 'PRODUCT', entityId: productId, operation: 'DELETE' });
    }
  }

  /** Durable projection queue: the worker drains this table into OpenSearch. */
  async enqueue(input: {
    entityType: 'PRODUCT' | 'LISTING' | 'SUPPLIER';
    entityId: string;
    operation: 'UPSERT' | 'DELETE';
  }): Promise<void> {
    // The partial unique index (`... WHERE status IN ('PENDING','PROCESSING','FAILED')`) makes this
    // idempotent: queueing the same projection twice while one is outstanding is a no-op.
    await this.database.query(
      `INSERT INTO search_index_jobs (entity_type, entity_id, operation)
       VALUES ($1, $2, $3)
       ON CONFLICT (entity_type, entity_id) WHERE status IN ('PENDING','PROCESSING','FAILED') DO NOTHING`,
      [input.entityType, input.entityId, input.operation],
    );
  }

  async pendingCount(): Promise<number> {
    const row = await this.database.row<{ count: string }>(
      `SELECT count(*)::TEXT AS count FROM search_index_jobs WHERE status IN ('PENDING','FAILED')`,
    );
    return Number(row?.count ?? 0);
  }

  async recreateIndex(): Promise<void> {
    if (this.provider.name !== 'opensearch') {
      throw new Error(`${ErrorCode.SERVICE_UNAVAILABLE}: OpenSearch is not the active search provider`);
    }
    await this.provider.recreateIndex();
  }
}

@Global()
@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

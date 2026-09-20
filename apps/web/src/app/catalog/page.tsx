import Link from 'next/link';
import { serverGet } from '../../lib/api';
import { formatMoney, formatNumber, prescriptionLabel } from '../../lib/format';
import type { Category, Paginated } from '../../lib/types';
import { CatalogFilters } from './catalog-filters';

export const dynamic = 'force-dynamic';

interface CatalogProduct {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  manufacturerName: string | null;
  dosageForm: string | null;
  strength: string | null;
  packSize: string | null;
  prescriptionClassification: string;
  supplierCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  sellableQuantity: number;
  inStock: boolean;
}

interface CatalogResponse extends Paginated<CatalogProduct> {
  meta?: { provider?: string; degraded?: boolean };
}

interface SearchParams {
  q?: string;
  categoryId?: string;
  sort?: string;
  page?: string;
  inStockOnly?: string;
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1) || 1, 1);
  const sort = params.sort ?? 'relevance';
  const inStockOnly = params.inStockOnly === 'true';

  const [catalogEnvelope, categoriesEnvelope] = await Promise.all([
    serverGet<CatalogResponse>('/catalog/products', {
      query: {
        q: params.q,
        categoryId: params.categoryId,
        sort,
        page,
        pageSize: 24,
        inStockOnly: inStockOnly ? 'true' : undefined,
      },
    }),
    serverGet<Category[]>('/catalog/categories', { revalidateSeconds: 300 }),
  ]);

  const catalog = catalogEnvelope?.data ?? null;
  const categories = categoriesEnvelope?.data ?? [];
  const products = catalog?.items ?? [];
  const pagination = catalog?.pagination;
  const degraded = catalog?.meta?.degraded ?? false;
  const provider = catalog?.meta?.provider ?? (catalogEnvelope ? 'unknown' : 'unreachable');

  function pageHref(target: number): string {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.categoryId) query.set('categoryId', params.categoryId);
    if (sort !== 'relevance') query.set('sort', sort);
    if (inStockOnly) query.set('inStockOnly', 'true');
    query.set('page', String(target));
    return `/catalog?${query.toString()}`;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Catalogue</h1>
          <p>
            Published products from verified wholesalers. Prices, stock and batch details are re-read on
            every request — the catalogue never shows a cached price.
          </p>
        </div>
        <div className="row">
          <span className={`badge ${degraded ? 'warn' : 'ok'}`} title={`Search provider: ${provider}`}>
            {degraded ? 'search: database fallback' : 'search: opensearch'}
          </span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 280px) 1fr', alignItems: 'start' }}>
        <CatalogFilters
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            productCount: category.productCount ?? 0,
          }))}
          initial={{
            q: params.q ?? '',
            categoryId: params.categoryId ?? '',
            sort,
            inStockOnly,
          }}
        />

        <section className="stack">
          {!catalogEnvelope && (
            <div className="alert error">
              The catalogue could not be loaded. The API is unreachable from the web server — check the
              platform status page and try again.
            </div>
          )}

          {catalogEnvelope && products.length === 0 && (
            <div className="empty">
              <p style={{ marginBottom: 'var(--space-2)' }}>
                <strong>No products matched.</strong>
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                {params.q
                  ? `Nothing published matches “${params.q}”. Try a generic name, a brand or a composition.`
                  : 'The catalogue is empty. Products appear here once a Bezzo operator publishes them.'}
              </p>
            </div>
          )}

          {products.length > 0 && (
            <>
              <div className="spread">
                <span className="small muted">
                  {formatNumber(pagination?.totalItems ?? products.length)} product
                  {(pagination?.totalItems ?? products.length) === 1 ? '' : 's'} · page {pagination?.page ?? page} of{' '}
                  {pagination?.totalPages ?? 1}
                </span>
                <span className="small faint">Sorted by {sort.replace(/_/g, ' ')}</span>
              </div>

              <div className="grid grid-3">
                {products.map((product) => (
                  <article className="card tight" key={product.id}>
                    <div className="spread" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <Link href={`/catalog/${product.id}`} className="product-name">
                          {product.name}
                        </Link>
                        <div className="small muted">
                          {[product.strength, product.packSize].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      <span className={`badge ${product.inStock ? 'ok' : 'danger'}`}>
                        {product.inStock ? 'in stock' : 'out of stock'}
                      </span>
                    </div>

                    <div className="small faint" style={{ marginTop: 'var(--space-2)' }}>
                      {product.manufacturerName ?? 'Manufacturer not recorded'}
                      {product.dosageForm ? ` · ${product.dosageForm}` : ''}
                    </div>

                    <div className="spread" style={{ marginTop: 'var(--space-3)' }}>
                      <div>
                        <div className="price">
                          {product.minPrice !== null ? formatMoney(product.minPrice) : '—'}
                          {product.maxPrice !== null && product.maxPrice !== product.minPrice ? (
                            <span className="small muted"> – {formatMoney(product.maxPrice)}</span>
                          ) : null}
                        </div>
                        <div className="small faint">
                          {product.supplierCount} supplier{product.supplierCount === 1 ? '' : 's'} ·{' '}
                          {formatNumber(product.sellableQuantity)} sellable
                        </div>
                      </div>
                      <Link className="btn small" href={`/catalog/${product.id}`}>
                        View offers
                      </Link>
                    </div>

                    <div className="pill-row" style={{ marginTop: 'var(--space-3)' }}>
                      <span className="badge">{prescriptionLabel(product.prescriptionClassification)}</span>
                    </div>
                  </article>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <nav className="row" aria-label="Pagination">
                  {page > 1 && (
                    <Link className="btn small" href={pageHref(page - 1)}>
                      ← Previous
                    </Link>
                  )}
                  <span className="small muted">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  {page < pagination.totalPages && (
                    <Link className="btn small" href={pageHref(page + 1)}>
                      Next →
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

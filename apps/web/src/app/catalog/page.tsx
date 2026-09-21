import Link from 'next/link';
import { serverGet } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import type { Category, Paginated, ProductSummary } from '../../lib/types';
import { ProductCard } from '../../components/product-card';
import { CatalogToolbar } from './catalog-toolbar';
import { ChevronLeft, ChevronRight, SearchIcon } from '../../components/icons';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  categoryId?: string;
  sort?: string;
  page?: string;
  inStockOnly?: string;
}

/**
 * Catalogue / search results — the marketplace's product surface.
 *
 * Results stay server-rendered from the platform search (OpenSearch, degraded
 * DB fallback): prices and stock are re-read per request, the URL carries the
 * whole query (shareable, back-button safe), and quick-add works from the card
 * itself. The API never paginates more than asked; this page asks for 24.
 */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1) || 1, 1);
  const sort = params.sort ?? 'relevance';
  const inStockOnly = params.inStockOnly === 'true';
  const query = (params.q ?? '').trim();

  const [catalogEnvelope, categoriesEnvelope] = await Promise.all([
    serverGet<Paginated<ProductSummary>>('/catalog/products', {
      query: {
        q: query || undefined,
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
  const activeCategory = categories.find((category) => category.id === params.categoryId) ?? null;

  function pageHref(target: number): string {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (params.categoryId) search.set('categoryId', params.categoryId);
    if (sort !== 'relevance') search.set('sort', sort);
    if (inStockOnly) search.set('inStockOnly', 'true');
    search.set('page', String(target));
    return `/catalog?${search.toString()}`;
  }

  const title = query
    ? `Results for “${query}”`
    : activeCategory
      ? activeCategory.name
      : 'Catalogue';

  return (
    <div className="container">
      <header style={{ marginBottom: 'var(--space-md)' }}>
        <nav className="small muted" style={{ marginBottom: 6 }} aria-label="Breadcrumb">
          <Link href="/">Home</Link> · <Link href="/categories">Categories</Link> · <span>{title}</span>
        </nav>
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h1 style={{ fontSize: '1.375rem', margin: 0 }}>{title}</h1>
          {pagination && (
            <span className="small muted">
              {formatNumber(pagination.totalItems)} product{pagination.totalItems === 1 ? '' : 's'} ·{' '}
              page {pagination.page} of {pagination.totalPages}
            </span>
          )}
        </div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          {query
            ? 'Matched on medicine name, brand, generic and composition. Prices and stock are live.'
            : 'Published products from verified wholesalers. Prices and stock are re-read on every request.'}
        </p>
      </header>

      <div className="catalog-layout">
        {/* Desktop filter rail. Same URL state the mobile toolbar drives — this
            is pure navigation, the server stays the source of truth. */}
        <aside className="cat-side" aria-label="Filter by category">
          <div className="cs-head">Categories</div>
          <ul>
            <li>
              <Link
                href={`/catalog?${new URLSearchParams({
                  ...(query ? { q: query } : {}),
                  ...(sort !== 'relevance' ? { sort } : {}),
                  ...(inStockOnly ? { inStockOnly: 'true' } : {}),
                  page: '1',
                }).toString()}`}
                className={!params.categoryId ? 'active' : undefined}
              >
                All products
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/catalog?${new URLSearchParams({
                    ...(query ? { q: query } : {}),
                    ...(sort !== 'relevance' ? { sort } : {}),
                    ...(inStockOnly ? { inStockOnly: 'true' } : {}),
                    categoryId: category.id,
                    page: '1',
                  }).toString()}`}
                  className={params.categoryId === category.id ? 'active' : undefined}
                >
                  <span>{category.name}</span>
                  {typeof category.productCount === 'number' && (
                    <span className="cs-count">{formatNumber(category.productCount)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          <CatalogToolbar
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              productCount: category.productCount ?? 0,
            }))}
            state={{
              q: query,
              categoryId: params.categoryId ?? '',
              sort,
              inStockOnly,
            }}
          />

      {!catalogEnvelope && (
        <div className="empty-card">
          <span className="ec-icon">
            <SearchIcon size={24} />
          </span>
          <span className="ec-title">The catalogue could not be loaded</span>
          <p className="ec-body">
            The API is unreachable from the web server right now. Check the platform status page and
            try again — nothing is cached in your browser.
          </p>
          <div className="ec-actions">
            <Link className="btn small" href="/status">
              Platform status
            </Link>
            <Link className="btn primary small" href="/">
              Back to home
            </Link>
          </div>
        </div>
      )}

      {catalogEnvelope && products.length === 0 && (
        <div className="empty-card">
          <span className="ec-icon">
            <SearchIcon size={24} />
          </span>
          <span className="ec-title">
            {query ? `No medicines found for “${query}”` : 'No products matched these filters'}
          </span>
          <p className="ec-body">
            {query
              ? 'Try a generic name (e.g. paracetamol), a brand, or a composition. Check the spelling, or clear the filters and browse by category.'
              : 'Try clearing the in-stock filter or choosing a different category.'}
          </p>
          <div className="ec-actions">
            <Link className="btn small" href="/catalog">
              Clear filters
            </Link>
            <Link className="btn primary small" href="/categories">
              Browse categories
            </Link>
          </div>
        </div>
      )}

      {products.length > 0 && (
        <>
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <nav className="row" aria-label="Pagination" style={{ marginTop: 'var(--space-lg)', justifyContent: 'center' }}>
              {page > 1 && (
                <Link className="btn small" href={pageHref(page - 1)} rel="prev">
                  <ChevronLeft size={14} /> Previous
                </Link>
              )}
              <span className="small muted nowrap">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              {page < pagination.totalPages && (
                <Link className="btn small" href={pageHref(page + 1)} rel="next">
                  Next <ChevronRight size={14} />
                </Link>
              )}
            </nav>
          )}
        </>
      )}
        </div>
      </div>
    </div>
  );
}

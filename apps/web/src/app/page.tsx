import Link from 'next/link';
import { serverGet } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { Category, Paginated, ProductSummary } from '../lib/types';
import { HomeIntro } from '../components/home-intro';
import { QuickOrderRail, RecentlyOrderedRail } from '../components/buyer-rails';
import { ProductCard } from '../components/product-card';
import { CategoryVisual } from '../components/category-visual';
import { ChevronRight, HubIcon, ShieldIcon, TruckIcon } from '../components/icons';

export const dynamic = 'force-dynamic';

/**
 * Marketplace home — the retailer's primary surface.
 *
 * Server-rendered rails from real endpoints: categories (cached 5 minutes),
 * widely-stocked products and the newest catalogue entries. Buyer-personal
 * rails (quick order, order again) hydrate client-side from the order history.
 * The catalogue is public with uniform trade prices, so a signed-out visitor
 * sees the same honest marketplace — with a sign-in prompt, not a paywall.
 */
export default async function HomePage() {
  const [categoriesEnvelope, stockedEnvelope, newestEnvelope] = await Promise.all([
    serverGet<Category[]>('/catalog/categories', { revalidateSeconds: 300 }),
    serverGet<Paginated<ProductSummary>>('/catalog/products', { query: { pageSize: 24 } }),
    serverGet<Paginated<ProductSummary>>('/catalog/products', {
      query: { pageSize: 18, sort: 'created_desc' },
    }),
  ]);

  const categories = (categoriesEnvelope?.data ?? []).slice(0, 10);
  const stocked = stockedEnvelope?.data?.items ?? [];
  const newest = newestEnvelope?.data?.items ?? [];

  // "Widely stocked": several verified suppliers compete on this line — the
  // honest version of a "recommended" rail.
  const multiSupplier = stocked.filter((product) => product.supplierCount >= 2).slice(0, 10);
  const stockedRail = multiSupplier.length >= 4 ? multiSupplier : stocked.slice(0, 10);
  const apiReachable = Boolean(stockedEnvelope);

  return (
    <div className="container container-narrow" style={{ paddingTop: 'var(--space-md)' }}>
      <HomeIntro />

      {!apiReachable && (
        <div className="alert error" role="alert" style={{ marginBottom: 'var(--space-md)' }}>
          The catalogue could not be loaded just now. Check the{' '}
          <Link className="link" href="/status">
            platform status
          </Link>{' '}
          and refresh — prices and stock are never cached by the browser.
        </div>
      )}

      <section className="mk-section">
        <div className="section-head">
          <div>
            <h2>Shop by category</h2>
            <p className="sub">The catalogue, organised the way you stock it</p>
          </div>
          <Link className="see-all" href="/categories">
            All categories <ChevronRight size={14} />
          </Link>
        </div>
        <div className="cat-rail">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/catalog?categoryId=${category.id}`}
              className="cat-tile"
              aria-label={`${category.name}${typeof category.productCount === 'number' ? ` — ${category.productCount} products` : ''}`}
            >
              <CategoryVisual categoryKey={category.id} name={category.name} />
              <span className="ct-name">{category.name}</span>
              {typeof category.productCount === 'number' && (
                <span className="ct-count">{formatNumber(category.productCount)} items</span>
              )}
            </Link>
          ))}
        </div>
      </section>

      <QuickOrderRail />

      {stockedRail.length > 0 && (
        <section className="mk-section">
          <div className="section-head">
            <div>
              <h2>Stocked by several suppliers</h2>
              <p className="sub">Compare verified wholesalers on the same line</p>
            </div>
            <Link className="see-all" href="/catalog">
              Full catalogue <ChevronRight size={14} />
            </Link>
          </div>
          <div className="rail">
            {stockedRail.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {newest.length > 0 && (
        <section className="mk-section">
          <div className="section-head">
            <div>
              <h2>New in the catalogue</h2>
              <p className="sub">Recently published by verified wholesalers</p>
            </div>
            <Link className="see-all" href="/catalog?sort=created_desc">
              See new arrivals <ChevronRight size={14} />
            </Link>
          </div>
          <div className="rail">
            {newest.slice(0, 10).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <RecentlyOrderedRail />

      <section className="mk-section" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="section-head">
          <div>
            <h2>Why pharmacies order on BEZZO</h2>
          </div>
        </div>
        <div className="trust-grid">
          <div className="trust-card">
            <span className="tc-icon">
              <ShieldIcon size={20} />
            </span>
            <div>
              <div className="tc-title">Verified on both sides</div>
              <p className="tc-body">
                Every wholesaler is licence-checked before a single unit is sellable, and only verified
                medical stores can place orders.
              </p>
            </div>
          </div>
          <div className="trust-card">
            <span className="tc-icon">
              <HubIcon size={20} />
            </span>
            <div>
              <div className="tc-title">One order, audited stages</div>
              <p className="tc-body">
                A picker collects from each supplier, every package is scanned into the Bezzo hub, and
                discrepancies stay visible — never a vague “processing”.
              </p>
            </div>
          </div>
          <div className="trust-card">
            <span className="tc-icon">
              <TruckIcon size={20} />
            </span>
            <div>
              <div className="tc-title">Prices you can act on</div>
              <p className="tc-body">
                Trade prices, stock and batch details are re-read from live supplier inventory on every
                request — no stale offers, no surprise invoices.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import Link from 'next/link';
import { serverGet } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import type { Category } from '../../lib/types';
import { CategoryVisual } from '../../components/category-visual';
import { ChevronRight } from '../../components/icons';

export const dynamic = 'force-dynamic';

/**
 * Categories hub — the visual index of the catalogue.
 *
 * Compact cards: glyph, category name, live product count. No oversized empty
 * tiles; if the API is unreachable the page says so instead of rendering a
 * hollow grid.
 */
export default async function CategoriesPage() {
  const envelope = await serverGet<Category[]>('/catalog/categories', { revalidateSeconds: 300 });
  const categories = envelope?.data ?? [];

  return (
    <div className="container container-narrow">
      <header className="page-head" style={{ marginBottom: 'var(--space-md)' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem' }}>Categories</h1>
          <p style={{ fontSize: '0.875rem' }}>
            The catalogue organised by dosage form and therapy area. Counts are live — they reflect
            what verified wholesalers have published right now.
          </p>
        </div>
      </header>

      {!envelope && (
        <div className="alert error" role="alert">
          Categories could not be loaded. Check the{' '}
          <Link className="link" href="/status">
            platform status
          </Link>{' '}
          and try again.
        </div>
      )}

      {envelope && categories.length === 0 && (
        <div className="empty-card">
          <span className="ec-title">No categories yet</span>
          <p className="ec-body">
            Categories appear here as soon as a Bezzo operator publishes products to the catalogue.
          </p>
          <div className="ec-actions">
            <Link className="btn small" href="/catalog">
              Browse everything
            </Link>
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div className="cat-grid">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/catalog?categoryId=${category.id}`}
              className="cat-card"
              aria-label={`${category.name}${typeof category.productCount === 'number' ? ` — ${category.productCount} products` : ''}`}
            >
              <CategoryVisual categoryKey={category.id} name={category.name} />
              <span className="cc-body">
                <span className="cc-name">{category.name}</span>
                <span className="cc-count">
                  {typeof category.productCount === 'number'
                    ? `${formatNumber(category.productCount)} product${category.productCount === 1 ? '' : 's'}`
                    : 'Browse'}
                </span>
              </span>
              <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)', flex: '0 0 auto' }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

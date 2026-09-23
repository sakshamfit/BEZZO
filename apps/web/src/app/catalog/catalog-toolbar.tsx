'use client';

/**
 * Catalogue toolbar — filters that read like controls, not a form.
 *
 * Category, sort and stock filters update the URL (server-rendered results
 * stay the source of truth, shareable and back-button safe). Every control is
 * a labelled, keyboard-reachable native element.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface ToolbarCategory {
  id: string;
  name: string;
  productCount: number;
}

const SORTS: Array<{ value: string; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'created_desc', label: 'Newest' },
];

export function CatalogToolbar({
  categories,
  state,
}: {
  categories: ToolbarCategory[];
  state: { q: string; categoryId: string; sort: string; inStockOnly: boolean };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function apply(patch: Partial<typeof state>) {
    const next = { ...state, ...patch };
    const query = new URLSearchParams();
    if (next.q) query.set('q', next.q);
    if (next.categoryId) query.set('categoryId', next.categoryId);
    if (next.sort && next.sort !== 'relevance') query.set('sort', next.sort);
    if (next.inStockOnly) query.set('inStockOnly', 'true');
    query.set('page', '1');
    setPending(true);
    router.push(`/catalog${query.toString() ? `?${query.toString()}` : ''}`, { scroll: false });
  }

  return (
    <div className="catalog-toolbar" role="search" aria-label="Catalogue filters">
      <div className="field ct-cat-field" style={{ flex: '1 1 190px' }}>
        <label htmlFor="ct-category" className="sr-only">
          Filter by category
        </label>
        <select
          id="ct-category"
          value={state.categoryId}
          disabled={pending}
          onChange={(event) => apply({ categoryId: event.target.value })}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} ({category.productCount})
            </option>
          ))}
        </select>
      </div>

      <div className="field" style={{ flex: '1 1 190px' }}>
        <label htmlFor="ct-sort" className="sr-only">
          Sort results
        </label>
        <select
          id="ct-sort"
          value={state.sort}
          disabled={pending}
          onChange={(event) => apply({ sort: event.target.value })}
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </div>

      <span className="ct-spacer" />

      <label className="toggle">
        <input
          type="checkbox"
          checked={state.inStockOnly}
          disabled={pending}
          onChange={(event) => apply({ inStockOnly: event.target.checked })}
        />
        In stock only
      </label>
    </div>
  );
}

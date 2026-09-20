'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiRequest } from '../../lib/api';

interface Category {
  id: string;
  name: string;
  productCount: number;
}

interface Suggestion {
  id: string;
  name: string;
  strength: string | null;
  packSize: string | null;
  manufacturerName: string | null;
}

/**
 * Catalogue filters.
 *
 * The URL is the source of truth: filters live in the query string, so a filtered catalogue is
 * shareable, bookmarkable and rendered on the server (no filtering of a full table in the browser).
 * Type-ahead is a progressive enhancement over the dedicated suggestion endpoint — search never
 * depends on it, and a failed suggestion request stays silent.
 */
export function CatalogFilters({
  categories,
  initial,
}: {
  categories: Category[];
  initial: { q: string; categoryId: string; sort: string; inStockOnly: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [term, setTerm] = useState(initial.q);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  useEffect(() => {
    setTerm(initial.q);
  }, [initial.q]);

  // Debounced type-ahead (250 ms) with request cancellation; failures degrade to no suggestions.
  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiRequest<Suggestion[]>(`/catalog/products/suggest?q=${encodeURIComponent(query)}&limit=6`, {
        signal: controller.signal,
        headers: { 'x-quiet': '1' },
      })
        .then((results) => setSuggestions(results.slice(0, 6)))
        .catch(() => setSuggestions([]));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  function apply(next: Record<string, string | undefined>) {
    const query = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) query.delete(key);
      else query.set(key, value);
    }
    query.delete('page');
    startTransition(() => router.push(query.size ? `${pathname}?${query.toString()}` : pathname));
  }

  return (
    <aside className="card tight">
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setSuggestionsOpen(false);
          apply({ q: term.trim() || undefined });
        }}
      >
        <div className="field" style={{ position: 'relative' }}>
          <label htmlFor="q">Search</label>
          <input
            id="q"
            value={term}
            placeholder="Brand, generic or composition"
            autoComplete="off"
            onChange={(event) => {
              setTerm(event.target.value);
              setSuggestionsOpen(true);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
          />
          {suggestionsOpen && suggestions.length > 0 && (
            <ul
              className="list"
              style={{
                marginTop: 'var(--space-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-2)',
                background: 'var(--bg-elevated)',
                boxShadow: 'var(--elevation-2)',
              }}
            >
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    className="btn link small"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setTerm(suggestion.name);
                      setSuggestionsOpen(false);
                      apply({ q: suggestion.name });
                    }}
                  >
                    {suggestion.name}
                    {suggestion.strength ? ` · ${suggestion.strength}` : ''}
                    {suggestion.manufacturerName ? ` — ${suggestion.manufacturerName}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="hint">Search covers published products only.</span>
        </div>

        <div className="field">
          <label htmlFor="categoryId">Category</label>
          <select
            id="categoryId"
            defaultValue={initial.categoryId}
            onChange={(event) => apply({ categoryId: event.target.value || undefined })}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.productCount})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sort">Sort</label>
          <select id="sort" defaultValue={initial.sort} onChange={(event) => apply({ sort: event.target.value })}>
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="created_desc">Recently added</option>
          </select>
        </div>

        <div className="checkbox">
          <input
            id="inStockOnly"
            type="checkbox"
            defaultChecked={initial.inStockOnly}
            onChange={(event) => apply({ inStockOnly: event.target.checked ? 'true' : undefined })}
          />
          <label htmlFor="inStockOnly">Only offers with sellable stock</label>
        </div>

        <div className="row">
          <button className="btn primary small" type="submit" disabled={pending}>
            {pending ? 'Filtering…' : 'Apply'}
          </button>
          {(initial.q || initial.categoryId || initial.inStockOnly || initial.sort !== 'relevance') && (
            <button
              type="button"
              className="btn small"
              onClick={() => startTransition(() => router.push(pathname))}
              disabled={pending}
            >
              Reset
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}

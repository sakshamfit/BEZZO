'use client';

/**
 * Search — the marketplace's primary interaction.
 *
 * Feels instant, stays honest:
 * - 250ms debounce + `AbortController` + a 60s client-side result cache, so
 *   typing emits one cheap request per pause, not one per keystroke.
 * - Suggestions come from the platform's own suggest endpoint (name, strength,
 *   pack, manufacturer); selecting one goes to the product page.
 * - Empty state shows *recent searches* (local, private to this device) and the
 *   live category list — never invented "trending" terms.
 * - Full combobox semantics: aria-activedescendant, arrow keys, Enter, Escape.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ChevronRight, ClockIcon, CloseIcon, SearchIcon } from './icons';
import { ProductVisual } from './product-visual';
import type { Category, ProductSuggestion } from '../lib/types';

const DEBOUNCE_MS = 250;
const CACHE_TTL_MS = 60_000;
const RECENT_KEY = 'bezzo.search.recent.v1';
const RECENT_LIMIT = 6;
const MIN_QUERY = 2;

const suggestionCache = new Map<string, { at: number; data: ProductSuggestion[] }>();
let categoriesPromise: Promise<Category[]> | null = null;

function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY) return;
  const next = [trimmed, ...loadRecent().filter((item) => item !== trimmed)].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private-mode storage failures must never break search.
  }
}

async function fetchCategories(): Promise<Category[]> {
  if (!categoriesPromise) {
    categoriesPromise = fetch('/api/v1/catalog/categories', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        const payload = (await response.json()) as { success: boolean; data?: Category[] };
        return payload.success && Array.isArray(payload.data) ? payload.data : [];
      })
      .catch(() => [] as Category[]);
  }
  return categoriesPromise;
}

async function fetchSuggestions(query: string, signal: AbortSignal): Promise<ProductSuggestion[]> {
  const cached = suggestionCache.get(query);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const response = await fetch(
    `/api/v1/catalog/products/suggest?q=${encodeURIComponent(query)}&limit=8`,
    { signal, headers: { accept: 'application/json' } },
  );
  const payload = (await response.json()) as { success: boolean; data?: ProductSuggestion[] };
  const data = payload.success && Array.isArray(payload.data) ? payload.data : [];
  suggestionCache.set(query, { at: Date.now(), data });
  return data;
}

function highlight(name: string, query: string) {
  const index = name.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark>{name.slice(index, index + query.length)}</mark>
      {name.slice(index + query.length)}
    </>
  );
}

export function SearchBar({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = useId();

  // Recent + categories for the resting state of the panel.
  useEffect(() => {
    setRecent(loadRecent());
    void fetchCategories().then(setCategories);
  }, []);

  // Debounced suggestion fetch with cancellation.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      abortRef.current?.abort();
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void fetchSuggestions(trimmed, controller.signal)
        .then((data) => {
          setSuggestions(data);
          setActiveIndex(-1);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click / touch.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const submit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      saveRecent(trimmed);
      setRecent(loadRecent());
      setOpen(false);
      inputRef.current?.blur();
      router.push(`/catalog?q=${encodeURIComponent(trimmed)}`);
    },
    [router],
  );

  const optionCount = query.trim().length >= MIN_QUERY ? suggestions.length : 0;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) {
        setOpen(true);
        return;
      }
      event.preventDefault();
      setActiveIndex((current) => {
        if (optionCount === 0) return -1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        return (current + delta + optionCount) % optionCount;
      });
      return;
    }
    if (event.key === 'Enter') {
      const active = activeIndex >= 0 ? suggestions[activeIndex] : null;
      if (active) {
        saveRecent(query.trim());
        setRecent(loadRecent());
        setOpen(false);
        router.push(`/catalog/${active.id}`);
      } else {
        submit(query);
      }
    }
  }

  const showPanel = open;
  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY;
  const topCategories = useMemo(() => categories.slice(0, 6), [categories]);

  return (
    <div className="searchbar" ref={rootRef}>
      <div className="sb-field">
        <span className="sb-icon">
          <SearchIcon size={19} />
        </span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
          placeholder="Search medicines, brands, compositions"
          value={query}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="sb-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="search-panel" role="listbox" id={listId}>
          {searching ? (
            <>
              <div className="search-group-label">
                <span>{loading ? 'Searching…' : suggestions.length > 0 ? 'Products' : 'No direct match'}</span>
              </div>
              {suggestions.map((suggestion, index) => (
                <Link
                  key={suggestion.id}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  href={`/catalog/${suggestion.id}`}
                  className="suggest-item"
                  onMouseDown={() => {
                    saveRecent(trimmed);
                    setRecent(loadRecent());
                    setOpen(false);
                  }}
                >
                  <span className="si-visual">
                    <ProductVisual
                      productId={suggestion.id}
                      dosageForm={null}
                      size="sm"
                      label={suggestion.name}
                    />
                  </span>
                  <span className="si-body">
                    <span className="si-name">{highlight(suggestion.name, trimmed)}</span>
                    <span className="si-meta">
                      {[suggestion.strength, suggestion.packSize, suggestion.manufacturerName]
                        .filter(Boolean)
                        .join(' · ') || 'View product'}
                    </span>
                  </span>
                  <span className="si-chevron">
                    <ChevronRight size={16} />
                  </span>
                </Link>
              ))}
              {!loading && suggestions.length === 0 && (
                <p className="small muted" style={{ margin: 0, padding: '0.625rem 0.75rem' }}>
                  No medicines matched “{trimmed}”. Try a generic name, a brand or a composition —
                  or search the full catalogue below.
                </p>
              )}
              <button type="button" className="search-see-all" onClick={() => submit(query)}>
                <span>See all results for “{trimmed}”</span>
                <ChevronRight size={16} />
              </button>
            </>
          ) : (
            <>
              {recent.length > 0 && (
                <>
                  <div className="search-group-label">
                    <span>Recent searches</span>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          window.localStorage.removeItem(RECENT_KEY);
                        } catch {
                          // ignore
                        }
                        setRecent([]);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  {recent.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className="suggest-item"
                      onClick={() => submit(item)}
                    >
                      <span className="sb-icon" style={{ color: 'var(--text-faint)' }}>
                        <ClockIcon size={16} />
                      </span>
                      <span className="si-body">
                        <span className="si-name">{item}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {topCategories.length > 0 && (
                <>
                  <div className="search-group-label">
                    <span>Browse categories</span>
                  </div>
                  {topCategories.map((category) => (
                    <Link
                      key={category.id}
                      href={`/catalog?categoryId=${category.id}`}
                      className="suggest-item"
                      onMouseDown={() => setOpen(false)}
                    >
                      <span className="si-body">
                        <span className="si-name">{category.name}</span>
                        <span className="si-meta">
                          {typeof category.productCount === 'number'
                            ? `${category.productCount} products`
                            : 'Browse'}
                        </span>
                      </span>
                      <span className="si-chevron">
                        <ChevronRight size={16} />
                      </span>
                    </Link>
                  ))}
                </>
              )}
              {recent.length === 0 && topCategories.length === 0 && (
                <p className="small muted" style={{ margin: 0, padding: '0.625rem 0.75rem' }}>
                  Search by medicine name, brand, generic or composition.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

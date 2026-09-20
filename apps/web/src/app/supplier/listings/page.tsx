'use client';

/**
 * Supplier listings.
 *
 * Publish and maintain the offers buyers can order: price (which may never exceed the printed MRP — the
 * database enforces it), minimum order quantity, batch/expiry and sale status. Creating a listing also
 * writes opening stock through the stock ledger, so a listing is never sellable without a traced quantity.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { formatDate, formatMoney, humanise, prescriptionLabel, statusTone } from '../../../lib/format';
import type { Paginated, ProductSuggestion, SupplierListing } from '../../../lib/types';

const STATUS_FILTERS = ['', 'ACTIVE', 'PAUSED', 'DRAFT', 'OUT_OF_STOCK'] as const;

const EMPTY_FORM = {
  productId: '',
  productName: '',
  supplierSku: '',
  sellingPrice: '',
  mrpReference: '',
  taxRate: '12',
  minimumOrderQuantity: '1',
  leadTimeMinutes: '60',
  openingQuantity: '0',
  batchNumber: '',
  expiryDate: '',
  lowStockThreshold: '20',
};

export default function SupplierListingsPage() {
  const { ready, principal, request } = useAuth();
  const [listings, setListings] = useState<Paginated<SupplierListing> | null>(null);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);

  const isSupplier = Boolean(principal?.supplier);

  const load = useCallback(async () => {
    if (!principal || !isSupplier) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status) query.set('status', status);
      if (search.trim()) query.set('search', search.trim());
      setListings(await request<Paginated<SupplierListing>>(`/supplier/listings?${query.toString()}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Listings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [principal, isSupplier, page, status, search, request]);

  useEffect(() => {
    if (!ready) return;
    if (!principal || !isSupplier) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, isSupplier, load]);

  async function patch(listing: SupplierListing, body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request(`/supplier/listings/${listing.id}`, { method: 'PATCH', body });
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The listing could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function searchProducts(term: string) {
    if (term.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      setSuggestions(
        await request<ProductSuggestion[]>(`/catalog/products/suggest?q=${encodeURIComponent(term.trim())}&limit=8`),
      );
    } catch {
      setSuggestions([]);
    }
  }

  if (!ready || loading) return <p className="muted">Loading listings…</p>;

  if (!principal || !isSupplier) {
    return (
      <section className="stack">
        <h1>Listings</h1>
        <p className="muted">This workspace is available to wholesaler accounts.</p>
        <Link className="btn" href="/login?next=%2Fsupplier%2Flistings">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Listings</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Every row is one offer: a product, your price, and the stock position that backs it.
          </p>
        </div>
        <button type="button" className="btn primary small" onClick={() => setShowForm((open) => !open)}>
          {showForm ? 'Close' : 'New listing'}
        </button>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}

      {showForm && (
        <form
          className="card stack"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            void request('/supplier/listings', {
              method: 'POST',
              body: {
                productId: form.productId,
                supplierSku: form.supplierSku || undefined,
                sellingPrice: Number(form.sellingPrice),
                mrpReference: form.mrpReference ? Number(form.mrpReference) : undefined,
                taxRate: Number(form.taxRate),
                minimumOrderQuantity: Number(form.minimumOrderQuantity),
                leadTimeMinutes: Number(form.leadTimeMinutes),
                openingQuantity: Number(form.openingQuantity),
                batchNumber: form.batchNumber || undefined,
                expiryDate: form.expiryDate || undefined,
                lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : undefined,
              },
            })
              .then(async () => {
                setNotice(`Listing published for ${form.productName}.`);
                setForm(EMPTY_FORM);
                setShowForm(false);
                await load();
              })
              .catch((caught: unknown) =>
                setError(caught instanceof ApiError ? caught.message : 'The listing could not be published.'),
              )
              .finally(() => setBusy(false));
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Publish an offer</h2>

          <label className="field">
            <span>Product *</span>
            <input
              required
              placeholder="Search the master catalogue (min. 2 characters)"
              value={form.productName}
              onChange={(event) => {
                setForm((current) => ({ ...current, productName: event.target.value, productId: '' }));
                void searchProducts(event.target.value);
              }}
            />
          </label>
          {form.productId === '' && suggestions.length > 0 && (
            <ul className="suggestion-list">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        productId: suggestion.id,
                        productName: suggestion.name,
                      }));
                      setSuggestions([]);
                    }}
                  >
                    {suggestion.name}
                    <span className="faint small">
                      {' '}
                      {[suggestion.strength, suggestion.packSize, suggestion.manufacturerName]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="form-grid">
            <label className="field">
              <span>Selling price (₹) *</span>
              <input
                required
                inputMode="decimal"
                value={form.sellingPrice}
                onChange={(event) => setForm((current) => ({ ...current, sellingPrice: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>MRP reference (₹)</span>
              <input
                inputMode="decimal"
                value={form.mrpReference}
                onChange={(event) => setForm((current) => ({ ...current, mrpReference: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>GST rate (%)</span>
              <input
                inputMode="decimal"
                value={form.taxRate}
                onChange={(event) => setForm((current) => ({ ...current, taxRate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Minimum order quantity</span>
              <input
                inputMode="numeric"
                value={form.minimumOrderQuantity}
                onChange={(event) =>
                  setForm((current) => ({ ...current, minimumOrderQuantity: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Lead time (minutes)</span>
              <input
                inputMode="numeric"
                value={form.leadTimeMinutes}
                onChange={(event) => setForm((current) => ({ ...current, leadTimeMinutes: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Opening stock</span>
              <input
                inputMode="numeric"
                value={form.openingQuantity}
                onChange={(event) => setForm((current) => ({ ...current, openingQuantity: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Batch number</span>
              <input
                value={form.batchNumber}
                onChange={(event) => setForm((current) => ({ ...current, batchNumber: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Expiry (YYYY-MM-DD)</span>
              <input
                value={form.expiryDate}
                onChange={(event) => setForm((current) => ({ ...current, expiryDate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Low stock threshold</span>
              <input
                inputMode="numeric"
                value={form.lowStockThreshold}
                onChange={(event) => setForm((current) => ({ ...current, lowStockThreshold: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Your SKU</span>
              <input
                value={form.supplierSku}
                onChange={(event) => setForm((current) => ({ ...current, supplierSku: event.target.value }))}
              />
            </label>
          </div>

          <button className="btn primary" type="submit" disabled={busy || !form.productId} style={{ alignSelf: 'flex-start' }}>
            {busy ? 'Publishing…' : 'Publish listing'}
          </button>
        </form>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter || 'ALL'}
                type="button"
                className={status === filter ? 'btn primary small' : 'btn small'}
                onClick={() => {
                  setStatus(filter);
                  setPage(1);
                }}
              >
                {filter ? humanise(filter) : 'All'}
              </button>
            ))}
          </div>
          <form
            className="row"
            style={{ gap: 6 }}
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              void load();
            }}
          >
            <input
              placeholder="Search your listings"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search listings"
            />
            <button className="btn small" type="submit">
              Search
            </button>
          </form>
        </div>

        <table className="table" style={{ marginTop: 'var(--space-3)' }}>
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: 150 }}>Price</th>
              <th style={{ width: 110 }}>Stock</th>
              <th style={{ width: 190 }}>Sale status</th>
              <th style={{ width: 120 }}>Batch</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {(listings?.items ?? []).map((listing) => (
              <tr key={listing.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{listing.productName}</div>
                  <div className="small faint">
                    {[listing.strength, listing.packSize, listing.manufacturerName].filter(Boolean).join(' · ')}
                  </div>
                  <span className="badge">{prescriptionLabel(listing.prescriptionClassification)}</span>
                </td>
                <td>
                  <div>{formatMoney(listing.sellingPrice)}</div>
                  <div className="small faint">
                    MRP {formatMoney(listing.mrpReference)} · GST {listing.taxRate ?? '—'}%
                  </div>
                  <div className="small faint">
                    Min {listing.minimumOrderQuantity} · lead {listing.leadTimeMinutes ?? '—'} min
                  </div>
                </td>
                <td>
                  <div>{listing.sellableQuantity} sellable</div>
                  <div className="small faint">
                    {listing.availableQuantity} on hand · {listing.reservedQuantity} reserved
                  </div>
                </td>
                <td>
                  <select
                    value={listing.status}
                    disabled={busy}
                    aria-label={`Sale status for ${listing.productName}`}
                    onChange={(event) =>
                      void patch(
                        listing,
                        { status: event.target.value },
                        `${listing.productName} set to ${humanise(event.target.value)}.`,
                      )
                    }
                  >
                    {['ACTIVE', 'PAUSED', 'DRAFT', 'OUT_OF_STOCK'].map((option) => (
                      <option value={option} key={option}>
                        {humanise(option)}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${statusTone(listing.status)}`}>{humanise(listing.status)}</span>
                  </div>
                </td>
                <td className="small faint">
                  <div>{listing.batchNumber ?? '—'}</div>
                  <div>exp {formatDate(listing.expiryDate)}</div>
                </td>
                <td>
                  <Link className="btn small" href={`/supplier/inventory?listing=${listing.id}`}>
                    Stock
                  </Link>
                </td>
              </tr>
            ))}
            {(listings?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No listings match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {listings && listings.pagination.totalPages > 1 && (
          <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button
              type="button"
              className="btn small"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span className="small muted">
              Page {listings.pagination.page} of {listings.pagination.totalPages} ·{' '}
              {listings.pagination.totalItems} listings
            </span>
            <button
              type="button"
              className="btn small"
              disabled={page >= listings.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

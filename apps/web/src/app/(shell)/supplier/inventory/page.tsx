'use client';

/**
 * Supplier inventory.
 *
 * Stock is the scarce resource in this marketplace, so this screen is deliberately transactional: a
 * "stock in / stock out" adjustment sends a signed delta that the API applies with the guarded
 * `available_quantity = available_quantity + :delta` update, and every change is visible in the
 * append-only ledger underneath. A stock-take sets an absolute figure, which the API turns into a delta.
 */
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import { formatDateTime, formatMoney, humanise, statusTone } from '../../../../lib/format';
import type { InventoryLedgerEntry, Paginated, SupplierInventoryItem } from '../../../../lib/types';

const TRANSACTION_TYPES = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'BLOCK', 'UNBLOCK'] as const;
const STATUS_FILTERS = ['', 'AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;

/** `useSearchParams` requires a Suspense boundary, so the view is wrapped by the page below. */
function SupplierInventoryView() {
  const { ready, principal, request } = useAuth();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Paginated<SupplierInventoryItem> | null>(null);
  const [status, setStatus] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [delta, setDelta] = useState<Record<string, { amount: string; type: string; reason: string; target: string }>>({});

  const isSupplier = Boolean(principal?.supplier);
  const focusInventoryId = searchParams.get('focus');

  const load = useCallback(async () => {
    if (!principal || !isSupplier) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status) query.set('status', status);
      if (lowStockOnly) query.set('lowStockOnly', 'true');
      setItems(await request<Paginated<SupplierInventoryItem>>(`/supplier/inventory?${query.toString()}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Inventory could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [principal, isSupplier, page, status, lowStockOnly, request]);

  useEffect(() => {
    if (!ready) return;
    if (!principal || !isSupplier) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, isSupplier, load]);

  const draftFor = useCallback(
    (id: string) => delta[id] ?? { amount: '', type: 'STOCK_IN', reason: '', target: 'delta' },
    [delta],
  );
  const updateDraft = useCallback((id: string, patch: Partial<{ amount: string; type: string; reason: string; target: string }>) => {
    setDelta((current) => ({ ...current, [id]: { ...draftFor(id), ...patch } }));
  }, [draftFor]);

  async function openLedger(inventoryId: string) {
    if (ledgerFor === inventoryId) {
      setLedgerFor(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setLedger(await request<InventoryLedgerEntry[]>(`/supplier/inventory/${inventoryId}/ledger?page=1&pageSize=25`));
      setLedgerFor(inventoryId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The stock ledger could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  async function apply(item: SupplierInventoryItem) {
    const draft = draftFor(item.id);
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      setError('Enter a non-zero quantity.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (draft.target === 'delta') {
        const signed = draft.type === 'STOCK_OUT' ? -Math.abs(amount) : Math.abs(amount);
        await request(`/supplier/inventory/${item.id}/adjust`, {
          method: 'POST',
          body: {
            quantityDelta: signed,
            transactionType: draft.type,
            reason: draft.reason || undefined,
          },
        });
        setNotice(
          `${item.productName}: ${signed > 0 ? '+' : ''}${signed} applied. The movement is recorded in the ledger.`,
        );
      } else {
        await request(`/supplier/inventory/${item.id}/set`, {
          method: 'POST',
          body: { availableQuantity: Math.abs(amount), reason: draft.reason || undefined },
        });
        setNotice(`${item.productName}: stock-take set available stock to ${Math.abs(amount)}.`);
      }
      setDelta((current) => ({ ...current, [item.id]: { amount: '', type: draft.type, reason: '', target: draft.target } }));
      await load();
      if (ledgerFor === item.id) await openLedger(item.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The stock change was not accepted.');
    } finally {
      setBusy(false);
    }
  }

  const focusedItem = useMemo(
    () => items?.items.find((item) => item.id === focusInventoryId) ?? null,
    [items, focusInventoryId],
  );

  if (!ready || loading) return <p className="muted">Loading inventory…</p>;

  if (!principal || !isSupplier) {
    return (
      <section className="stack">
        <h1>Inventory</h1>
        <p className="muted">This workspace is available to wholesaler accounts.</p>
        <Link className="btn" href="/login?next=%2Fsupplier%2Finventory">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Inventory</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Sellable = available − reserved. Reserved stock belongs to placed orders and cannot be edited here.
          </p>
        </div>
        <Link className="btn small" href="/supplier/listings">
          Listings
        </Link>
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
      {focusedItem && (
        <div className="alert" role="status">
          Focused on {focusedItem.productName} — {focusedItem.sellableQuantity} sellable, threshold{' '}
          {focusedItem.lowStockThreshold ?? '—'}.
        </div>
      )}

      <div className="card">
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
              {filter ? humanise(filter) : 'All statuses'}
            </button>
          ))}
          <label className="row small" style={{ gap: 6, marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(event) => {
                setLowStockOnly(event.target.checked);
                setPage(1);
              }}
            />
            Low stock only
          </label>
        </div>

        <table className="table" style={{ marginTop: 'var(--space-3)' }}>
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: 150 }}>Stock</th>
              <th style={{ width: 150 }}>Quarantined</th>
              <th style={{ width: 300 }}>Adjust</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {(items?.items ?? []).map((item) => {
              const draft = draftFor(item.id);
              return (
                <tr key={item.id} style={item.id === focusInventoryId ? { background: 'var(--bg-subtle)' } : undefined}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.productName}</div>
                    <div className="small faint">
                      {item.packSize ?? '—'} · {formatMoney(item.sellingPrice)}
                    </div>
                    <div className="small faint">
                      {item.batchNumber ? `batch ${item.batchNumber} · ` : ''}
                      {item.expiryDate ? `exp ${item.expiryDate}` : 'expiry not recorded'}
                    </div>
                    <span className={`badge ${statusTone(item.status)}`}>{humanise(item.status)}</span>
                  </td>
                  <td>
                    <div>
                      <strong>{item.sellableQuantity}</strong> sellable
                    </div>
                    <div className="small faint">
                      {item.availableQuantity} available · {item.reservedQuantity} reserved
                    </div>
                    <div className="small faint">threshold {item.lowStockThreshold ?? '—'}</div>
                  </td>
                  <td className="small">
                    <div>damaged {item.damagedQuantity}</div>
                    <div>expired {item.expiredQuantity}</div>
                    <div>blocked {item.blockedQuantity}</div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <select
                        value={draft.target}
                        aria-label={`Adjustment mode for ${item.productName}`}
                        onChange={(event) => updateDraft(item.id, { target: event.target.value })}
                      >
                        <option value="delta">Delta</option>
                        <option value="set">Stock-take</option>
                      </select>
                      {draft.target === 'delta' && (
                        <select
                          value={draft.type}
                          aria-label={`Movement type for ${item.productName}`}
                          onChange={(event) => updateDraft(item.id, { type: event.target.value })}
                        >
                          {TRANSACTION_TYPES.map((type) => (
                            <option value={type} key={type}>
                              {humanise(type)}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        style={{ width: 84 }}
                        inputMode="numeric"
                        placeholder={draft.target === 'set' ? 'New qty' : 'Qty'}
                        value={draft.amount}
                        aria-label={`Quantity for ${item.productName}`}
                        onChange={(event) => updateDraft(item.id, { amount: event.target.value })}
                      />
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                      <input
                        placeholder="Reason (audited)"
                        value={draft.reason}
                        aria-label={`Reason for ${item.productName}`}
                        onChange={(event) => updateDraft(item.id, { reason: event.target.value })}
                      />
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={busy}
                        onClick={() => void apply(item)}
                      >
                        Apply
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small"
                      disabled={busy}
                      onClick={() => void openLedger(item.id)}
                    >
                      {ledgerFor === item.id ? 'Hide ledger' : 'Ledger'}
                    </button>
                    <div className="small faint">v{item.version}</div>
                  </td>
                </tr>
              );
            })}
            {(items?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No inventory positions match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {items && items.pagination.totalPages > 1 && (
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
              Page {items.pagination.page} of {items.pagination.totalPages} · {items.pagination.totalItems}{' '}
              positions
            </span>
            <button
              type="button"
              className="btn small"
              disabled={page >= items.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {ledgerFor && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Stock ledger</h2>
            <span className="small faint">Append-only · latest 25 movements</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>Movement</th>
                <th style={{ width: 90 }}>Qty</th>
                <th style={{ width: 140 }}>Before → after</th>
                <th>Reason</th>
                <th style={{ width: 160 }}>When</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id}>
                  <td>{humanise(entry.transactionType)}</td>
                  <td>
                    <span className={`badge ${entry.quantity >= 0 ? 'ok' : 'danger'}`}>
                      {entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}
                    </span>
                  </td>
                  <td>
                    {entry.beforeQuantity} → {entry.afterQuantity}
                  </td>
                  <td className="small">
                    {entry.reason ?? humanise(entry.referenceType)}
                    {entry.referenceId ? <div className="faint">{entry.referenceId.slice(0, 8)}</div> : null}
                  </td>
                  <td className="small faint">{formatDateTime(entry.createdAt)}</td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No stock movements recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function SupplierInventoryPage() {
  return (
    <Suspense fallback={<p className="muted">Loading inventory…</p>}>
      <SupplierInventoryView />
    </Suspense>
  );
}

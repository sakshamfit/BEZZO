'use client';

/**
 * Supplier fulfillment dashboard & orders pipeline.
 *
 * Each buyer order produces one fulfillment record per supplier. Wholesalers inspect
 * incoming line items, accept the order, pack goods into numbered barcoded packages,
 * and mark them ready for BEZZO pickers to collect.
 */
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import { formatDateTime, formatMoney, humanise, statusTone } from '../../../../lib/format';
import type { SupplierFulfillmentSummary } from '../../../../lib/types';

const STATUS_TABS = [
  { label: 'All Orders', value: '' },
  { label: 'New / Action Required', value: 'CREATED' },
  { label: 'Accepted / Picking', value: 'ALLOCATED' },
  { label: 'Packed', value: 'PACKED' },
  { label: 'Ready for Pickup', value: 'READY_FOR_PICKUP' },
  { label: 'Collected / In Transit', value: 'COLLECTED' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled / Rejected', value: 'CANCELLED' },
] as const;

function SupplierFulfillmentsView() {
  const { ready, principal, request } = useAuth();
  const searchParams = useSearchParams();

  const [fulfillments, setFulfillments] = useState<SupplierFulfillmentSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>(searchParams.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Pack modal state
  const [packModalTarget, setPackModalTarget] = useState<SupplierFulfillmentSummary | null>(null);
  const [packType, setPackType] = useState<'STANDARD' | 'FRAGILE' | 'COLD_CHAIN' | 'RESTRICTED'>('STANDARD');
  const [packWeight, setPackWeight] = useState<string>('500');
  const [packSeal, setPackSeal] = useState<string>('');
  const [packNotes, setPackNotes] = useState<string>('');

  // Reject modal state
  const [rejectModalTarget, setRejectModalTarget] = useState<SupplierFulfillmentSummary | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const isSupplier = Boolean(principal?.supplier);

  const load = useCallback(async () => {
    if (!principal || !isSupplier) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (status) query.set('status', status);
      if (search.trim()) query.set('search', search.trim());

      const res = await request<{ rows: SupplierFulfillmentSummary[]; total: number }>(
        `/supplier/fulfillments?${query.toString()}`,
      );
      setFulfillments(res.rows);
      setTotalCount(res.total);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Orders could not be loaded.');
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

  const handleAccept = async (f: SupplierFulfillmentSummary) => {
    setActionInProgress(f.id);
    setError(null);
    try {
      await request(`/supplier/fulfillments/${f.id}/accept`, { method: 'POST' });
      setNotice(`Order ${f.fulfillmentReference} accepted successfully.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to accept order.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePackSubmit = async () => {
    if (!packModalTarget) return;
    setActionInProgress(packModalTarget.id);
    setError(null);
    try {
      await request(`/supplier/fulfillments/${packModalTarget.id}/pack`, {
        method: 'POST',
        body: {
          packages: [
            {
              packageType: packType,
              weightGrams: packWeight ? Number(packWeight) : undefined,
              sealNumber: packSeal.trim() || undefined,
              handlingNotes: packNotes.trim() || undefined,
            },
          ],
        },
      });
      setNotice(`Order ${packModalTarget.fulfillmentReference} packed successfully.`);
      setPackModalTarget(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to pack order.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReady = async (f: SupplierFulfillmentSummary) => {
    setActionInProgress(f.id);
    setError(null);
    try {
      const res = await request<{ pickupTaskId: string; taskCode: string }>(
        `/supplier/fulfillments/${f.id}/ready`,
        { method: 'POST' },
      );
      setNotice(`Order marked ready! Pickup task ${res.taskCode} dispatched to collection pool.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to mark ready for pickup.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectModalTarget) return;
    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejecting this fulfillment.');
      return;
    }
    setActionInProgress(rejectModalTarget.id);
    setError(null);
    try {
      await request(`/supplier/fulfillments/${rejectModalTarget.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() },
      });
      setNotice(`Order ${rejectModalTarget.fulfillmentReference} rejected and inventory released.`);
      setRejectModalTarget(null);
      setRejectReason('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to reject order.');
    } finally {
      setActionInProgress(null);
    }
  };

  if (!ready || (loading && fulfillments.length === 0)) {
    return <p className="muted">Loading fulfillment orders…</p>;
  }

  if (!principal || !isSupplier) {
    return (
      <section className="stack">
        <h1>Orders & Fulfillment</h1>
        <p className="muted">Wholesaler account required to view and fulfill orders.</p>
        <Link className="btn primary" href="/login?next=%2Fsupplier%2Ffulfillments">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ margin: 0 }}>Orders & Fulfillment</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Prepare, pack and dispatch orders for collection by BEZZO hub pickers.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn small" href="/supplier">
            Dashboard
          </Link>
          <Link className="btn small" href="/supplier/inventory">
            Inventory
          </Link>
        </div>
      </header>

      {notice && (
        <div className="alert success" role="status">
          {notice}
          <button className="btn small text" onClick={() => setNotice(null)} style={{ float: 'right' }}>
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="alert danger" role="alert">
          {error}
          <button className="btn small text" onClick={() => setError(null)} style={{ float: 'right' }}>
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              className={`btn small ${isActive ? 'primary' : 'secondary'}`}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="row" style={{ gap: 8 }}>
        <input
          type="search"
          placeholder="Search by fulfillment ref or order #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              void load();
            }
          }}
          style={{ maxWidth: 360 }}
        />
        <button className="btn secondary small" onClick={() => { setPage(1); void load(); }}>
          Search
        </button>
        <span className="small muted" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
          {totalCount} {totalCount === 1 ? 'order' : 'orders'} found
        </span>
      </div>

      {/* Orders Table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {fulfillments.length === 0 ? (
          <div style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              No fulfillments match the current filter.
            </p>
          </div>
        ) : (
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Order / Reference</th>
                <th>Retailer & Delivery</th>
                <th style={{ width: 90 }}>Items</th>
                <th style={{ width: 110 }}>Total</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 150 }}>Placed At</th>
                <th style={{ width: 220, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fulfillments.map((f) => {
                const isBusy = actionInProgress === f.id;
                return (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/supplier/fulfillments/${f.id}`} style={{ fontWeight: 600 }}>
                        {f.fulfillmentReference}
                      </Link>
                      <div className="small faint">Order #{f.orderNumber}</div>
                      {f.packageCount > 0 && (
                        <div className="small faint">
                          📦 {f.packageCount} {f.packageCount === 1 ? 'package' : 'packages'}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{f.buyerTradeName}</div>
                      <div className="small faint">
                        {[f.deliveryLocality, f.deliveryCity].filter(Boolean).join(', ') || 'Direct drop'}
                        {f.deliverySlotName ? ` · ${f.deliverySlotName}` : ''}
                      </div>
                    </td>
                    <td>
                      <strong>{f.itemCount}</strong> units
                    </td>
                    <td>
                      <strong>{formatMoney(f.total)}</strong>
                    </td>
                    <td>
                      <span className={`badge ${statusTone(f.status)}`}>{humanise(f.status)}</span>
                    </td>
                    <td className="small faint">
                      {formatDateTime(f.createdAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {f.status === 'CREATED' && (
                          <>
                            <button
                              className="btn small primary"
                              disabled={isBusy}
                              onClick={() => void handleAccept(f)}
                            >
                              {isBusy ? '...' : 'Accept'}
                            </button>
                            <button
                              className="btn small danger"
                              disabled={isBusy}
                              onClick={() => setRejectModalTarget(f)}
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {(f.status === 'ALLOCATED' || f.status === 'PICKING') && (
                          <button
                            className="btn small primary"
                            disabled={isBusy}
                            onClick={() => setPackModalTarget(f)}
                          >
                            Pack Order
                          </button>
                        )}

                        {f.status === 'PACKED' && (
                          <button
                            className="btn small primary"
                            disabled={isBusy}
                            onClick={() => void handleReady(f)}
                          >
                            {isBusy ? 'Dispatching...' : 'Ready for Pickup'}
                          </button>
                        )}

                        <Link className="btn small secondary" href={`/supplier/fulfillments/${f.id}`}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalCount > 15 && (
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <button
            className="btn small secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="small muted" style={{ alignSelf: 'center' }}>
            Page {page} of {Math.ceil(totalCount / 15)}
          </span>
          <button
            className="btn small secondary"
            disabled={page >= Math.ceil(totalCount / 15)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Pack Modal */}
      {packModalTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div className="card stack" style={{ maxWidth: 460, width: '100%', background: 'var(--surface, #fff)' }}>
            <h2 style={{ margin: 0 }}>Pack Order {packModalTarget.fulfillmentReference}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Enter parcel packaging specifications. A QR barcoded package code will be generated for the collection hub receipt.
            </p>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Package Type</span>
              <select
                value={packType}
                onChange={(e) => setPackType(e.target.value as typeof packType)}
              >
                <option value="STANDARD">Standard Carton / Box</option>
                <option value="FRAGILE">Fragile (Glass / Liquid)</option>
                <option value="COLD_CHAIN">Cold Chain (2°C - 8°C Insulated)</option>
                <option value="RESTRICTED">Restricted / High Value</option>
              </select>
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Estimated Weight (Grams)</span>
              <input
                type="number"
                min={1}
                max={50000}
                value={packWeight}
                onChange={(e) => setPackWeight(e.target.value)}
                placeholder="e.g. 800"
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Tamper-evident Seal Number (Optional)</span>
              <input
                type="text"
                value={packSeal}
                onChange={(e) => setPackSeal(e.target.value)}
                placeholder="e.g. SEAL-98412"
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Handling Notes (Optional)</span>
              <input
                type="text"
                value={packNotes}
                onChange={(e) => setPackNotes(e.target.value)}
                placeholder="e.g. Keep upright, fragile ampoules inside"
              />
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                className="btn secondary small"
                type="button"
                disabled={actionInProgress !== null}
                onClick={() => setPackModalTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn primary small"
                type="button"
                disabled={actionInProgress !== null}
                onClick={() => void handlePackSubmit()}
              >
                {actionInProgress !== null ? 'Saving...' : 'Confirm Packed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div className="card stack" style={{ maxWidth: 440, width: '100%', background: 'var(--surface, #fff)' }}>
            <h2 style={{ margin: 0 }}>Reject Order {rejectModalTarget.fulfillmentReference}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Rejecting will cancel this fulfillment and release the reserved stock back to your active sellable inventory.
            </p>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Reason for rejection *</span>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Stock batch damaged during inspection / unable to fulfill batch requirement"
              />
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                className="btn secondary small"
                type="button"
                disabled={actionInProgress !== null}
                onClick={() => setRejectModalTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn danger small"
                type="button"
                disabled={actionInProgress !== null || !rejectReason.trim()}
                onClick={() => void handleRejectSubmit()}
              >
                {actionInProgress !== null ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SupplierFulfillmentsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading fulfillments…</p>}>
      <SupplierFulfillmentsView />
    </Suspense>
  );
}

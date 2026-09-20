'use client';

/**
 * Order history.
 *
 * The list is read straight from `GET /orders` — the API scopes every row to the signed-in buyer, so the
 * screen never filters for authorization. Fulfilment statuses are shown per order because one order can
 * span several suppliers, each with its own physical state machine (created → picking → collected →
 * at hub → delivered), which is why a single "order status" is never the whole story.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { formatDate, formatDateTime, formatMoney, humanise, statusTone } from '../../lib/format';
import type { OrderSummary } from '../../lib/types';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'PARTIALLY_FULFILLED', label: 'Partially fulfilled' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const { ready, principal, requestEnvelope } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) query.set('status', status);
      const envelope = await requestEnvelope<OrderSummary[]>(`/orders?${query.toString()}`);
      setOrders(envelope.data);
      setTotalItems(envelope.meta?.pagination?.totalItems ?? envelope.data.length);
      setTotalPages(envelope.meta?.pagination?.totalPages ?? 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Your orders could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [principal, requestEnvelope, page, status]);

  useEffect(() => {
    if (!ready) return;
    if (!principal) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  if (!ready || loading) return <p className="muted">Loading your orders…</p>;

  if (!principal) {
    return (
      <section className="stack">
        <h1>Orders</h1>
        <p className="muted">Sign in with your retailer account to see your purchase history.</p>
        <Link className="btn primary" href="/login?next=%2Forders">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Purchasing</p>
          <h1 style={{ marginBottom: 4 }}>Your orders</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {totalItems} order{totalItems === 1 ? '' : 's'} placed from this account. Each order may be fulfilled by
            several wholesalers, and each fulfilment travels its own path from the shelf to your counter.
          </p>
        </div>
        <Link className="btn small" href="/catalog">
          Continue purchasing
        </Link>
      </header>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <div className="filters">
        {STATUS_FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.value || 'all'}
            className={`chip${status === filter.value ? ' ok' : ' plain'}`}
            onClick={() => {
              setStatus(filter.value);
              setPage(1);
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="empty">
          <h2 className="card-title">Nothing here yet</h2>
          <p className="muted small">
            {status
              ? 'No order matches this filter.'
              : 'Once you place an order it appears here with its per-supplier fulfilment status.'}
          </p>
          <Link className="btn primary" href="/catalog">
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          {orders.map((order) => (
            <Link className="card interactive" key={order.id} href={`/orders/${order.id}`}>
              <div className="row spread" style={{ alignItems: 'baseline' }}>
                <div>
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {order.orderNumber}
                  </span>
                  <span className="small faint" style={{ marginLeft: 10 }}>
                    placed {formatDateTime(order.placedAt)}
                  </span>
                </div>
                <span className="price mono">{formatMoney(order.grandTotal, order.currency)}</span>
              </div>

              <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${statusTone(order.status)}`}>{humanise(order.status)}</span>
                <span className={`badge ${statusTone(order.paymentStatus)}`}>
                  Payment {humanise(order.paymentStatus)}
                </span>
                <span className="chip plain">
                  {order.supplierCount} supplier{order.supplierCount === 1 ? '' : 's'}
                </span>
                <span className="chip plain">
                  {order.unitCount} unit{order.unitCount === 1 ? '' : 's'}
                </span>
                {order.deliveryDate && <span className="chip plain">{formatDate(order.deliveryDate)}</span>}
              </div>

              <div className="row small faint" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {order.fulfillmentStatuses.map((fulfilmentStatus) => (
                  <span key={fulfilmentStatus} className={`chip ${statusTone(fulfilmentStatus)}`}>
                    {humanise(fulfilmentStatus)}
                  </span>
                ))}
              </div>
            </Link>
          ))}

          {totalPages > 1 && (
            <div className="row spread">
              <button type="button" className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </button>
              <span className="small faint">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn small"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Older
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

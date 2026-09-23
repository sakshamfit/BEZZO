'use client';

/**
 * Order history v2 — scannable cards with real progress.
 *
 * Rows come from `GET /orders` (server-scoped to the buyer). Each card shows
 * the commercial facts plus a progress meter derived from the fulfilment state
 * machines — never a single fake "percentage": a partially delivered multi-
 * supplier order reads as exactly that.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { OrderProgressMeter } from '../../components/order-tracking';
import { ChevronRight, ReceiptIcon, RefreshIcon } from '../../components/icons';
import { formatDate, formatMoney, humanise, statusTone } from '../../lib/format';
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

  const load = useCallback(
    async (silent = false) => {
      if (!principal) return;
      if (!silent) setLoading(true);
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
    },
    [principal, requestEnvelope, page, status],
  );

  useEffect(() => {
    if (!ready) return;
    if (!principal) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  if (!ready) {
    return (
      <div className="container container-narrow" aria-busy="true">
        <div className="skeleton" style={{ height: 28, width: 160, marginBottom: 16 }} />
        {Array.from({ length: 3 }, (_, index) => (
          <div className="skeleton" key={index} style={{ height: 120, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <ReceiptIcon size={24} />
          </span>
          <span className="ec-title">Your orders will appear here</span>
          <p className="ec-body">
            Sign in with your retailer account to see your purchase history and track every stage to
            your counter.
          </p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/login?next=%2Forders">
              Sign in
            </Link>
            <Link className="btn small" href="/catalog">
              Browse the catalogue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container container-narrow">
      <header className="spread" style={{ marginBottom: 'var(--space-md)', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', margin: 0 }}>Your orders</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {totalItems} order{totalItems === 1 ? '' : 's'} · each order may be fulfilled by several
            wholesalers, each with its own physical journey
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn small" disabled={loading} onClick={() => void load(true)}>
            <RefreshIcon size={14} /> Refresh
          </button>
          <Link className="btn small" href="/catalog">
            Continue purchasing
          </Link>
        </div>
      </header>

      <div className="chip-row" role="tablist" aria-label="Filter orders by status" style={{ marginBottom: 'var(--space-4)' }}>
        {STATUS_FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.value || 'all'}
            role="tab"
            aria-selected={status === filter.value}
            className={`chip-btn${status === filter.value ? ' on' : ''}`}
            onClick={() => {
              setStatus(filter.value);
              setPage(1);
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          {error}
        </div>
      )}

      {loading && (
        <div aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="skeleton" key={index} style={{ height: 120, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
          ))}
        </div>
      )}

      {!loading && orders.length === 0 && !error && (
        <div className="empty-card">
          <span className="ec-icon">
            <ReceiptIcon size={24} />
          </span>
          <span className="ec-title">
            {status ? `No ${STATUS_FILTERS.find((f) => f.value === status)?.label.toLowerCase() ?? ''} orders` : 'No orders yet'}
          </span>
          <p className="ec-body">
            {status
              ? 'Orders with this status will appear here.'
              : 'Your first order will appear here with live tracking from the supplier shelf to your counter.'}
          </p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/catalog">
              Start an order
            </Link>
          </div>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          {orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`} className="order-card">
              <div className="spread" style={{ alignItems: 'baseline' }}>
                <span className="oc-number">{order.orderNumber}</span>
                <span className="small faint nowrap">{formatDate(order.placedAt)}</span>
              </div>
              <div className="pill-row" style={{ marginTop: 6 }}>
                <span className={`badge ${statusTone(order.status)}`}>{humanise(order.status)}</span>
                <span className={`badge ${statusTone(order.paymentStatus)}`}>
                  Payment {humanise(order.paymentStatus)}
                </span>
                <span className="chip plain">{order.deliveryMode === 'INSTANT' ? 'Instant' : 'Scheduled'}</span>
              </div>
              <div style={{ margin: '10px 0 6px' }}>
                <OrderProgressMeter
                  fulfillments={order.fulfillmentStatuses.map((fulfillmentStatus) => ({ status: fulfillmentStatus }))}
                />
              </div>
              <div className="spread" style={{ alignItems: 'baseline', marginTop: 4 }}>
                <span className="small muted">
                  {order.unitCount} unit{order.unitCount === 1 ? '' : 's'} · {order.supplierCount}{' '}
                  supplier{order.supplierCount === 1 ? '' : 's'}
                  {order.fulfillmentStatuses.length > 0
                    ? ` · ${order.fulfillmentStatuses.map(humanise).join(', ')}`
                    : ''}
                </span>
                <span className="oc-total">
                  {formatMoney(order.grandTotal, order.currency)} <ChevronRight size={15} />
                </span>
              </div>
            </Link>
          ))}

          {totalPages > 1 && (
            <nav className="row" aria-label="Pagination" style={{ justifyContent: 'center', marginTop: 8 }}>
              {page > 1 && (
                <button type="button" className="btn small" onClick={() => setPage(page - 1)}>
                  ← Previous
                </button>
              )}
              <span className="small muted nowrap">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <button type="button" className="btn small" onClick={() => setPage(page + 1)}>
                  Next →
                </button>
              )}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

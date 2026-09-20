'use client';

/**
 * Payments backoffice — the money trail, with refunds.
 *
 * Two separate authorities are mirrored here, exactly as the API splits them:
 *
 *  - `admin.payment.read` lets an operator search payments and open one to see its attempts, its refunds
 *    and the webhook evidence log (digest-verified, signature-validity recorded, processing status);
 *  - `admin.payment.review` is what the refund command demands, so a support agent can investigate a
 *    failed payment without being able to move money.
 *
 * The screen never decides a payment's state: `PAID` is written by the gateway's signed webhook reaching
 * the API, and a refund only changes `refunded_amount` once the gateway answers. Everything shown here
 * is read back from the server after each command.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { ApiError } from '../../../../lib/api';
import { formatDateTime, formatMoney, humanise, statusTone } from '../../../../lib/format';
import type {
  AdminPaymentDetail,
  AdminPaymentList,
  AdminPaymentRow,
  PaymentRefundResult,
} from '../../../../lib/types';

const STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'CANCELLED',
] as const;

const REFUNDABLE = new Set(['PAID', 'PARTIALLY_REFUNDED']);

export default function AdminPaymentsPage() {
  const { ready, principal, hasPermission, request } = useAuth();
  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
  const [pagination, setPagination] = useState<AdminPaymentList['pagination'] | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canRead = hasPermission('admin.payment.read');
  const canRefund = hasPermission('admin.payment.review');

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (status) query.set('status', status);
      if (search.trim()) query.set('q', search.trim());
      query.set('page', String(page));
      query.set('pageSize', '25');
      const result = await request<AdminPaymentList>(`/admin/payments?${query.toString()}`);
      setRows(result.payments);
      setPagination(result.pagination);
    } catch (caught) {
      setError(caught instanceof ApiError ? `${caught.code}: ${caught.message}` : 'Could not load payments');
    } finally {
      setLoading(false);
    }
  }, [canRead, page, request, search, status]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  async function openDetail(paymentId: string) {
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request<AdminPaymentDetail>(`/admin/payments/${paymentId}`);
      setDetail(result);
      setRefundAmount(result.payment.refundableAmount.toFixed(2));
      setRefundReason('');
    } catch (caught) {
      setError(caught instanceof ApiError ? `${caught.code}: ${caught.message}` : 'Could not load the payment');
    } finally {
      setDetailLoading(false);
    }
  }

  async function refund() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request<PaymentRefundResult>(`/payments/${detail.payment.id}/refund`, {
        method: 'POST',
        body: { amount: refundAmount.trim() || undefined, reason: refundReason.trim() || undefined },
      });
      setNotice(`${formatMoney(result.amount, result.currency)} → ${humanise(result.status)}. ${result.message}`);
      await Promise.all([openDetail(detail.payment.id), load()]);
    } catch (caught) {
      setError(caught instanceof ApiError ? `${caught.code}: ${caught.message}` : 'The refund failed');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="muted">Loading…</p>;

  if (!principal) {
    return (
      <section className="stack">
        <h1>Payments</h1>
        <p className="muted">Sign in with a backoffice account to search the payment trail.</p>
        <Link className="btn primary" href="/login?next=%2Fadmin%2Fpayments">
          Sign in
        </Link>
      </section>
    );
  }

  if (!canRead) {
    return (
      <section className="stack">
        <h1>Payments</h1>
        <div className="alert warn" role="status">
          Your role does not include <span className="mono">admin.payment.read</span>. Ask an administrator if you
          need access to the money trail.
        </div>
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Backoffice</p>
          <h1 style={{ marginBottom: 6 }}>Payments</h1>
          <p className="muted small" style={{ margin: 0, maxWidth: '68ch' }}>
            Every row is canonical server state. A capture is only ever written by the gateway&apos;s signed
            webhook (or by reconciliation polling the gateway), and a refund only moves{' '}
            <span className="mono">refunded_amount</span> once the gateway answers.
          </p>
        </div>
        {pagination && (
          <span className="chip plain">
            {pagination.totalItems} payment{pagination.totalItems === 1 ? '' : 's'}
          </span>
        )}
      </header>

      {notice && (
        <div className="alert ok" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <div className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Any status</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {humanise(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="q">Order, buyer or reference</label>
            <input
              id="q"
              type="search"
              value={search}
              placeholder="BZ-2026-000123"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button type="button" className="btn small" onClick={() => void load()} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Buyer</th>
                <th>Method</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Refunded</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="mono">{row.orderNumber}</span>
                    <div className="small faint">{humanise(row.orderStatus)}</div>
                  </td>
                  <td className="small">{row.buyerName ?? '—'}</td>
                  <td className="small">
                    {humanise(row.method)}
                    <div className="small faint mono">{row.gateway}</div>
                  </td>
                  <td>
                    <span className={`badge ${statusTone(row.status)}`}>{humanise(row.status)}</span>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {formatMoney(row.amount, row.currency)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {row.refundedAmount > 0 ? formatMoney(row.refundedAmount, row.currency) : '—'}
                  </td>
                  <td className="small faint">{formatDateTime(row.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn link small"
                      onClick={() => void openDetail(row.id)}
                      disabled={detailLoading}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <p className="muted small" style={{ margin: 0 }}>
                      No payments match this filter.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="row spread" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn small"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span className="small faint">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              className="btn small"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {detail && (
        <div className="card stack" style={{ gap: 'var(--space-4)' }}>
          <div className="row spread" style={{ alignItems: 'baseline' }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              {detail.payment.orderNumber} · {humanise(detail.payment.status)}
            </h2>
            <button type="button" className="btn link small" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>

          <div className="grid grid-2">
            <div className="stack tight" style={{ gap: 6 }}>
              <span className="row spread small">
                <span className="muted">Buyer</span>
                <span>{detail.payment.buyerName ?? '—'}</span>
              </span>
              <span className="row spread small">
                <span className="muted">Gateway</span>
                <span className="mono">
                  {detail.payment.gateway} · {detail.payment.providerReference ?? 'no reference'}
                </span>
              </span>
              <span className="row spread small">
                <span className="muted">Captured</span>
                <span className="mono">{formatMoney(detail.payment.amount, detail.payment.currency)}</span>
              </span>
              <span className="row spread small">
                <span className="muted">Refunded</span>
                <span className="mono">
                  {formatMoney(detail.payment.refundedAmount, detail.payment.currency)}
                </span>
              </span>
              <span className="row spread small">
                <span className="muted">Refundable now</span>
                <span className="mono">
                  {formatMoney(detail.payment.refundableAmount, detail.payment.currency)}
                </span>
              </span>
              {detail.payment.lastReconciledAt && (
                <span className="row spread small">
                  <span className="muted">Last reconciled</span>
                  <span className="small faint">{formatDateTime(detail.payment.lastReconciledAt)}</span>
                </span>
              )}
              {detail.payment.failureMessage && <p className="hint">{detail.payment.failureMessage}</p>}
            </div>

            <div className="stack tight" style={{ gap: 6 }}>
              <h3 className="label-md" style={{ margin: 0 }}>
                {canRefund ? 'Refund' : 'Refund (permission required)'}
              </h3>
              {canRefund && REFUNDABLE.has(detail.payment.status) ? (
                <>
                  <div className="field full">
                    <label htmlFor="refundAmount">Amount</label>
                    <input
                      id="refundAmount"
                      type="text"
                      inputMode="decimal"
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(event.target.value)}
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="refundReason">Reason</label>
                    <input
                      id="refundReason"
                      type="text"
                      maxLength={300}
                      value={refundReason}
                      placeholder="Damaged in transit"
                      onChange={(event) => setRefundReason(event.target.value)}
                    />
                  </div>
                  <button type="button" className="btn danger" disabled={busy} onClick={() => void refund()}>
                    {busy ? 'Calling the gateway…' : 'Refund'}
                  </button>
                  <p className="hint" style={{ margin: 0 }}>
                    The refund row is written before the gateway is called, so an unanswered call leaves evidence.
                  </p>
                </>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  {canRefund
                    ? 'Only a captured payment can be refunded. Cash on delivery is settled offline.'
                    : 'Your role can inspect payments but not move money. Refunds need admin.payment.review.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="label-md">Attempts</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="mono">{attempt.attemptNumber}</td>
                      <td>
                        <span className={`badge ${statusTone(attempt.status)}`}>{humanise(attempt.status)}</span>
                        {attempt.failureMessage && <div className="small faint">{attempt.failureMessage}</div>}
                      </td>
                      <td className="small mono">{attempt.providerReference ?? '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {formatMoney(attempt.amount, detail.payment.currency)}
                      </td>
                      <td className="small faint">{formatDateTime(attempt.createdAt)}</td>
                    </tr>
                  ))}
                  {detail.attempts.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <p className="muted small" style={{ margin: 0 }}>
                          No attempt recorded yet.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="label-md">Refunds</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Reason</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.refunds.map((refund) => (
                    <tr key={refund.id}>
                      <td className="mono">{formatMoney(refund.amount, refund.currency)}</td>
                      <td>
                        <span className={`badge ${statusTone(refund.status)}`}>{humanise(refund.status)}</span>
                      </td>
                      <td className="small mono">{refund.gatewayRefundReference ?? '—'}</td>
                      <td className="small">{refund.reason ?? '—'}</td>
                      <td className="small faint">{formatDateTime(refund.createdAt)}</td>
                    </tr>
                  ))}
                  {detail.refunds.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <p className="muted small" style={{ margin: 0 }}>
                          Nothing has been refunded on this payment.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="label-md">Webhook evidence</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Every inbound call is stored before it is interpreted — including calls whose signature did not
              verify. A duplicate delivery is recorded as such and changes nothing.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Signature</th>
                    <th>Processing</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.webhookEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <span className="mono small">{event.externalEventId}</span>
                        <div className="small faint">{event.eventType}</div>
                      </td>
                      <td>
                        <span className={`badge ${event.signatureValid ? 'ok' : 'danger'}`}>
                          {event.signatureValid ? 'Verified' : 'Invalid'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${statusTone(event.processingStatus)}`}>
                          {humanise(event.processingStatus)}
                        </span>
                        <div className="small faint">
                          {event.processingAttempts} attempt(s)
                          {event.processingError ? ` · ${event.processingError}` : ''}
                        </div>
                      </td>
                      <td className="small faint">{formatDateTime(event.receivedAt)}</td>
                    </tr>
                  ))}
                  {detail.webhookEvents.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <p className="muted small" style={{ margin: 0 }}>
                          No webhook has ever referenced this payment — the state above came from reconciliation or
                          from order placement.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

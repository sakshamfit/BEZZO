'use client';

/**
 * Order detail.
 *
 * Shows the three distinct things the domain keeps separate and must never collapse into one status:
 *
 *  - the **order** (the buyer's commercial commitment, one order number, one payment);
 *  - its **fulfilments** (one per supplier, each with its own physical state machine);
 *  - the **timeline** (who moved it, when, and why — server-recorded, never reconstructed by the UI).
 *
 * Cancelling is offered only while the server says the order can still be cancelled; the button is a
 * convenience, and the API re-checks the state, the payment status and the reservation release under a
 * row lock. A paid order is refused here exactly as it is refused by the API.
 *
 * Payment actions are the same story: the screen shows what the server says (the payment row, its
 * failures and its refunds) and offers a retry while the order is still payable. Nothing is published as
 * paid from the browser — the only thing that moves a payment to PAID is the gateway's signed webhook
 * reaching the API.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { formatDate, formatDateTime, formatMoney, humanise, statusTone } from '../../../lib/format';
import type {
  MockWebhookOutcome,
  OrderDetail,
  OrderRefund,
  PaymentRetryIntent,
} from '../../../lib/types';

const CANCELLABLE = new Set(['PENDING_PAYMENT', 'CONFIRMED']);

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { ready, principal, request } = useAuth();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refunds, setRefunds] = useState<OrderRefund[]>([]);
  const [paymentBusy, setPaymentBusy] = useState<'retry' | 'simulate' | null>(null);

  useEffect(() => {
    void params.then((resolved) => setOrderId(resolved.orderId));
  }, [params]);

  const load = useCallback(async () => {
    if (!principal || !orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, refundRows] = await Promise.all([
        request<OrderDetail>(`/orders/${orderId}`),
        request<OrderRefund[]>(`/orders/${orderId}/refunds`).catch(() => [] as OrderRefund[]),
      ]);
      setOrder(detail);
      setRefunds(refundRows);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That order could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [principal, orderId, request]);

  useEffect(() => {
    if (!ready) return;
    if (!principal) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  async function cancel() {
    if (!order) return;
    setCancelling(true);
    setError(null);
    setNotice(null);
    try {
      const cancelled = await request<OrderDetail>(`/orders/${order.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() || undefined },
      });
      setOrder(cancelled);
      setNotice(
        `Order cancelled. ${cancelled.cancellation?.releasedUnits ?? 0} reserved unit(s) went back to the suppliers' shelves.`,
      );
      setReason('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The order could not be cancelled.');
    } finally {
      setCancelling(false);
    }
  }

  /**
   * Asks the API for a fresh gateway intent for this payment.
   *
   * The browser never talks to the gateway to *confirm* anything: it only obtains the reference the
   * provider's own checkout needs. Confirmation arrives server-side, as a signed webhook.
   */
  async function retryPayment() {
    if (!order?.payment) return;
    setPaymentBusy('retry');
    setError(null);
    setNotice(null);
    try {
      const intent = await request<PaymentRetryIntent>(`/payments/${order.payment.id}/retry`, {
        method: 'POST',
        body: {},
      });
      setNotice(
        `Attempt ${intent.attemptNumber} created with ${intent.gateway} (reference ${intent.providerReference ?? '—'}). ` +
          'The order stays payable until the gateway confirms the capture against the API.',
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'A new payment attempt could not be created.');
    } finally {
      setPaymentBusy(null);
    }
  }

  /**
   * Development-only shortcut that exercises the real webhook path.
   *
   * It exists because the mock gateway has no checkout page to send the buyer to. The API signs the
   * body with the provider's own signer and re-enters the production handler, so this button walks the
   * same signature check, evidence row, dedupe and state transition a live gateway would.
   */
  async function simulate(outcome: 'PAID' | 'FAILED') {
    if (!order?.payment) return;
    setPaymentBusy('simulate');
    setError(null);
    setNotice(null);
    try {
      const result = await request<MockWebhookOutcome>(
        `/dev/payments/${order.payment.id}/mock-webhook`,
        { method: 'POST', body: { outcome } },
      );
      setNotice(
        result.applied
          ? `The gateway reported ${outcome} and the platform applied it (event ${result.eventId}).`
          : `The gateway reported ${outcome}; the platform recorded it as ${result.status} and changed nothing.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The simulated webhook could not be delivered.');
    } finally {
      setPaymentBusy(null);
    }
  }

  if (!ready || loading) return <p className="muted">Loading the order…</p>;

  if (!principal) {
    return (
      <section className="stack">
        <h1>Order</h1>
        <p className="muted">Sign in to see this order.</p>
        <Link className="btn primary" href="/login?next=%2Forders">
          Sign in
        </Link>
      </section>
    );
  }

  if (error && !order) {
    return (
      <section className="stack">
        <h1>Order</h1>
        <div className="alert error" role="alert">
          {error}
        </div>
        <Link className="btn" href="/orders">
          Back to orders
        </Link>
      </section>
    );
  }

  if (!order) return <p className="muted">Order not found.</p>;

  const canCancel = CANCELLABLE.has(order.status) && !['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus);
  const payment = order.payment;
  const retryable =
    order.status === 'PENDING_PAYMENT' &&
    payment !== null &&
    ['PENDING', 'FAILED', 'CANCELLED'].includes(payment.status);
  const isSimulatedGateway = payment?.gateway === 'mock';
  const address = order.shippingAddress;

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link className="link" href="/orders">
              Orders
            </Link>{' '}
            / {order.orderNumber}
          </p>
          <h1 style={{ marginBottom: 6 }}>{order.orderNumber}</h1>
          <div className="pill-row">
            <span className={`badge ${statusTone(order.status)}`}>{humanise(order.status)}</span>
            <span className={`badge ${statusTone(order.paymentStatus)}`}>
              Payment {humanise(order.paymentStatus)}
            </span>
            <span className="chip plain">{order.deliveryMode === 'INSTANT' ? 'Instant' : 'Scheduled'}</span>
            {order.deliveryDate && <span className="chip plain">{formatDate(order.deliveryDate)}</span>}
            {order.activeReservations > 0 && (
              <span className="chip info">{order.activeReservations} active reservation(s)</span>
            )}
          </div>
        </div>
        <span className="small faint">Placed {formatDateTime(order.placedAt)}</span>
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

      <div className="grid grid-sidebar">
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card">
            <h2 className="card-title">Items</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Supplier</th>
                    <th style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 100 }}>Price</th>
                    <th style={{ width: 110 }}>Line total</th>
                    <th style={{ width: 120 }}>Line status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="product-name">{item.productName}</div>
                        <div className="small faint">
                          {[item.manufacturerName, item.packSize, item.composition].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="small">{item.supplierName ?? '—'}</td>
                      <td className="mono">{item.quantity}</td>
                      <td className="mono">{formatMoney(item.unitPrice, order.currency)}</td>
                      <td className="mono">{formatMoney(item.lineTotal, order.currency)}</td>
                      <td>
                        <span className={`badge ${statusTone(item.status)}`}>{humanise(item.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Fulfilments</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              One fulfilment per wholesaler: the order is a single commercial contract, but the goods are picked,
              packed and moved by each supplier independently.
            </p>
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              {order.fulfillments.map((fulfilment) => (
                <div className="card tight" key={fulfilment.id}>
                  <div className="row spread" style={{ alignItems: 'baseline' }}>
                    <div>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {fulfilment.fulfillmentReference}
                      </span>
                      <span className="small faint" style={{ marginLeft: 10 }}>
                        {fulfilment.supplierName ?? 'Supplier'} · {fulfilment.unitCount} unit(s)
                      </span>
                    </div>
                    <span className={`badge ${statusTone(fulfilment.status)}`}>{humanise(fulfilment.status)}</span>
                  </div>
                  <div className="row small" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="faint">Goods {formatMoney(fulfilment.subtotal, order.currency)}</span>
                    <span className="faint">Tax {formatMoney(fulfilment.taxTotal, order.currency)}</span>
                    <span className="faint">
                      Delivery share {formatMoney(fulfilment.deliveryAllocation, order.currency)}
                    </span>
                    <span className="mono">{formatMoney(fulfilment.total, order.currency)}</span>
                  </div>
                  <div className="row small faint" style={{ gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    {fulfilment.acceptedAt && <span>accepted {formatDateTime(fulfilment.acceptedAt)}</span>}
                    {fulfilment.packedAt && <span>packed {formatDateTime(fulfilment.packedAt)}</span>}
                    {fulfilment.readyAt && <span>ready {formatDateTime(fulfilment.readyAt)}</span>}
                    {fulfilment.collectedAt && <span>collected {formatDateTime(fulfilment.collectedAt)}</span>}
                    {fulfilment.deliveredAt && <span>delivered {formatDateTime(fulfilment.deliveredAt)}</span>}
                    {fulfilment.cancelledAt && <span>cancelled {formatDateTime(fulfilment.cancelledAt)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Timeline</h2>
            <ol className="list" style={{ marginTop: 0 }}>
              {order.timeline.map((entry, index) => (
                <li className="list-item" key={`${entry.toStatus}-${index}`}>
                  <div className="row spread" style={{ alignItems: 'baseline' }}>
                    <span>
                      {entry.fromStatus ? `${humanise(entry.fromStatus)} → ` : ''}
                      <strong>{humanise(entry.toStatus)}</strong>
                    </span>
                    <span className="small faint">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <div className="small faint">
                    {entry.reason ?? 'Status change recorded by the platform'} · by {humanise(entry.actorType)}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <aside className="stack" style={{ gap: 'var(--space-4)', alignSelf: 'start' }}>
          <div className="card stack" style={{ gap: 6 }}>
            <h2 className="card-title">Payment</h2>
            {payment ? (
              <>
                <span className="row spread small">
                  <span className="muted">Status</span>
                  <span className={`badge ${statusTone(payment.status)}`}>{humanise(payment.status)}</span>
                </span>
                <span className="row spread small">
                  <span className="muted">Method</span>
                  <span>{humanise(payment.method)}</span>
                </span>
                <span className="row spread small">
                  <span className="muted">Gateway</span>
                  <span className="mono">{payment.gateway}</span>
                </span>
                {payment.providerReference && (
                  <span className="row spread small">
                    <span className="muted">Reference</span>
                    <span className="mono">{payment.providerReference.slice(0, 20)}…</span>
                  </span>
                )}
                <div className="divider" />
                <span className="row spread">
                  <span className="label-md">Amount</span>
                  <span className="price mono">{formatMoney(payment.amount, payment.currency)}</span>
                </span>
                {payment.refundedAmount > 0 && (
                  <span className="row spread small">
                    <span className="muted">Refunded</span>
                    <span className="mono">{formatMoney(payment.refundedAmount, payment.currency)}</span>
                  </span>
                )}
                {payment.failureMessage && (
                  <p className="hint" style={{ margin: 0 }}>
                    {payment.failureMessage} — the order stands; the payment can be retried.
                  </p>
                )}

                {retryable && (
                  <>
                    <div className="divider" />
                    <p className="hint" style={{ margin: 0 }}>
                      {humanise(payment.method)} payments are confirmed by the gateway, never by this screen. The
                      order is confirmed the moment the gateway&apos;s signed webhook reaches the API.
                    </p>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={paymentBusy !== null}
                      onClick={() => void retryPayment()}
                    >
                      {paymentBusy === 'retry' ? 'Creating an attempt…' : 'Retry payment'}
                    </button>
                  </>
                )}

                {isSimulatedGateway && retryable && (
                  <div className="stack tight" style={{ gap: 6 }}>
                    <span className="chip warn" style={{ alignSelf: 'flex-start' }}>
                      Development gateway
                    </span>
                    <p className="hint" style={{ margin: 0 }}>
                      No live gateway is configured, so these buttons ask the API to sign a webhook body with the
                      mock provider&apos;s own signer and deliver it through the production webhook handler.
                    </p>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn accent small"
                        disabled={paymentBusy !== null}
                        onClick={() => void simulate('PAID')}
                      >
                        Simulate capture
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        disabled={paymentBusy !== null}
                        onClick={() => void simulate('FAILED')}
                      >
                        Simulate failure
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                No payment record on this order.
              </p>
            )}
          </div>

          {refunds.length > 0 && (
            <div className="card stack" style={{ gap: 6 }}>
              <h2 className="card-title">Refunds</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Recorded</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((refund) => (
                      <tr key={refund.id}>
                        <td className="mono">{formatMoney(refund.amount, order.currency)}</td>
                        <td>
                          <span className={`badge ${statusTone(refund.status)}`}>{humanise(refund.status)}</span>
                        </td>
                        <td className="small faint">{formatDateTime(refund.createdAt)}</td>
                        <td className="small mono faint">
                          {refund.gatewayRefundReference ? `${refund.gatewayRefundReference.slice(0, 16)}…` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                A refund only moves the payment once the gateway answers; the record above is written first, so a
                gateway that never replies leaves evidence rather than silence.
              </p>
            </div>
          )}

          <div className="card stack" style={{ gap: 6 }}>
            <h2 className="card-title">Totals</h2>
            <span className="row spread small">
              <span className="muted">Subtotal</span>
              <span className="mono">{formatMoney(order.subtotal, order.currency)}</span>
            </span>
            <span className="row spread small">
              <span className="muted">Tax</span>
              <span className="mono">{formatMoney(order.taxTotal, order.currency)}</span>
            </span>
            <span className="row spread small">
              <span className="muted">Delivery</span>
              <span className="mono">{formatMoney(order.deliveryFee, order.currency)}</span>
            </span>
            <div className="divider" />
            <span className="row spread">
              <span className="label-md">Grand total</span>
              <span className="price mono">{formatMoney(order.grandTotal, order.currency)}</span>
            </span>
          </div>

          <div className="card stack" style={{ gap: 6 }}>
            <h2 className="card-title">Delivery</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {[address.contactName, address.contactPhone].filter(Boolean).join(' · ')}
              <br />
              {[address.addressLine1, address.addressLine2, address.landmark, address.city, address.state]
                .filter(Boolean)
                .join(', ')}{' '}
              <span className="mono">{address.postalCode}</span>
            </p>
            {order.buyerNote && <p className="hint">Note: {order.buyerNote}</p>}
            <p className="hint" style={{ margin: 0 }}>
              The address is the snapshot taken when the order was placed — editing it later does not rewrite history.
            </p>
          </div>

          {canCancel && (
            <div className="card stack" style={{ gap: 8 }}>
              <h2 className="card-title">Cancel this order</h2>
              <p className="muted small" style={{ margin: 0 }}>
                Allowed only while nothing has been picked and nothing has been paid. The release is idempotent, so a
                retried cancel cannot restock twice.
              </p>
              <div className="field full">
                <label htmlFor="reason">Reason (optional)</label>
                <input
                  id="reason"
                  type="text"
                  maxLength={300}
                  value={reason}
                  placeholder="Ordered by mistake"
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <button type="button" className="btn danger" disabled={cancelling} onClick={() => void cancel()}>
                {cancelling ? 'Cancelling…' : 'Cancel order'}
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

'use client';

/**
 * Checkout screen.
 *
 * The flow is deliberately two-step and server-authoritative:
 *
 *  1. **Review** — `POST /checkout/quote` re-reads the basket from live inventory, checks the address,
 *     delivery mode, slot and supplier serviceability, and returns the priced order with any blocking
 *     issue. It writes nothing: a preview must never hold the last unit.
 *  2. **Place order** — `POST /orders` runs the same validation again inside the order transaction,
 *     reserves stock, splits the basket into one fulfilment per supplier and creates the payment.
 *
 * The client never computes a total and never decides whether an order succeeded: it renders the
 * server's own totals and issues. A checkout that loses the final unit comes back as
 * `INSUFFICIENT_STOCK` with the remaining sellable quantity, and the screen re-quotes instead of
 * pretending the order went through.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { formatMoney, humanise, statusTone } from '../../lib/format';
import type { BuyerAddress, CheckoutQuote, DeliverySlot, OrderDetail } from '../../lib/types';

const PAYMENT_METHODS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'COD', label: 'Cash on delivery', hint: 'Pay the delivery agent when the order arrives.' },
  { value: 'UPI', label: 'UPI', hint: 'Pay now through the payment gateway.' },
  { value: 'CARD', label: 'Card', hint: 'Pay now through the payment gateway.' },
  { value: 'NET_BANKING', label: 'Net banking', hint: 'Pay now through the payment gateway.' },
];

/** Local calendar date in the business timezone — the API rejects a date in the past. */
function todayInBusinessTimezone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function CheckoutPage() {
  const router = useRouter();
  const { ready, principal, request, requestEnvelope } = useAuth();
  const [addresses, setAddresses] = useState<BuyerAddress[]>([]);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [addressId, setAddressId] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('SCHEDULED');
  const [deliveryDate, setDeliveryDate] = useState(addDays(todayInBusinessTimezone(), 1));
  const [slotId, setSlotId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [buyerNote, setBuyerNote] = useState('');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBuyer = Boolean(principal?.buyer);
  const deliveryBody = useMemo(
    () => ({
      deliveryAddressId: addressId,
      deliveryMode,
      deliveryDate: deliveryMode === 'INSTANT' ? undefined : deliveryDate,
      deliverySlotId: deliveryMode === 'INSTANT' ? undefined : slotId || undefined,
    }),
    [addressId, deliveryMode, deliveryDate, slotId],
  );

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setError(null);
    try {
      const [addressEnvelope, slotsEnvelope] = await Promise.all([
        requestEnvelope<BuyerAddress[]>('/buyer/addresses'),
        requestEnvelope<DeliverySlot[]>('/catalog/delivery-slots'),
      ]);
      setAddresses(addressEnvelope.data);
      setSlots(slotsEnvelope.data);
      const preferred = addressEnvelope.data.find((address) => address.isDefault) ?? addressEnvelope.data[0];
      if (preferred) setAddressId(preferred.id);
      if (slotsEnvelope.data[0]) setSlotId(slotsEnvelope.data[0].id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Checkout could not be prepared.');
    } finally {
      setLoading(false);
    }
  }, [principal, requestEnvelope]);

  useEffect(() => {
    if (!ready) return;
    if (!principal) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  async function review() {
    setQuoting(true);
    setError(null);
    try {
      setQuote(await request<CheckoutQuote>('/checkout/quote', { method: 'POST', body: deliveryBody }));
    } catch (caught) {
      setQuote(null);
      setError(caught instanceof ApiError ? caught.message : 'The basket could not be priced.');
    } finally {
      setQuoting(false);
    }
  }

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    try {
      const order = await request<OrderDetail>('/orders', {
        method: 'POST',
        body: { ...deliveryBody, paymentMethod, buyerNote: buyerNote.trim() || undefined },
      });
      router.push(`/orders/${order.id}?placed=1`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.code === 'INSUFFICIENT_STOCK' || caught.code === 'CHECKOUT_VALIDATION_FAILED'
            ? `${caught.message} — review the basket and try again.`
            : caught.message,
        );
        // The basket changed under the buyer: re-quote so the screen shows the live position.
        if (caught.code === 'INSUFFICIENT_STOCK' || caught.code === 'CHECKOUT_VALIDATION_FAILED') {
          await review();
        }
      } else {
        setError('The order could not be placed.');
      }
    } finally {
      setPlacing(false);
    }
  }

  if (!ready || loading) return <p className="muted">Preparing checkout…</p>;

  if (!principal) {
    return (
      <section className="stack">
        <h1>Checkout</h1>
        <p className="muted">Sign in with your retailer account to place an order.</p>
        <Link className="btn primary" href="/login?next=%2Fcheckout">
          Sign in
        </Link>
      </section>
    );
  }

  if (!isBuyer) {
    return (
      <section className="stack">
        <h1>Checkout</h1>
        <p className="muted">Only retailer (medical store) accounts can place marketplace orders.</p>
        <Link className="btn" href="/account">
          Go to account
        </Link>
      </section>
    );
  }

  const blocked = quote !== null && !quote.placeable;

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Checkout</p>
          <h1 style={{ marginBottom: 4 }}>Delivery and payment</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Stock is reserved only when you place the order, and the price you are charged is the price the
            server returns — never one sent by this screen.
          </p>
        </div>
        <Link className="btn small" href="/cart">
          Back to cart
        </Link>
      </header>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {addresses.length === 0 && (
        <div className="alert warn" role="status">
          No delivery address is saved yet. Add one in your account, then come back to checkout.
        </div>
      )}

      <div className="grid grid-sidebar">
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card">
            <h2 className="card-title">1. Delivery address</h2>
            <div className="choice-grid">
              {addresses.map((address) => (
                <label className={`choice${addressId === address.id ? ' selected' : ''}`} key={address.id}>
                  <input
                    type="radio"
                    name="address"
                    className="checkbox"
                    checked={addressId === address.id}
                    onChange={() => {
                      setAddressId(address.id);
                      setQuote(null);
                    }}
                  />
                  <span>
                    <span className="title">
                      {address.label ?? 'Address'} {address.isDefault && <span className="badge ok">Default</span>}
                    </span>
                    <span className="desc">
                      {[address.contactName, address.contactPhone].filter(Boolean).join(' · ')}
                      <br />
                      {[address.addressLine1, address.addressLine2, address.landmark, address.city, address.state]
                        .filter(Boolean)
                        .join(', ')}{' '}
                      <span className="mono">{address.postalCode}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="hint">
              Delivering to a postal code a supplier has not declared serviceable is reported as an issue, never
              silently dropped. Manage addresses under <Link className="link" href="/account">Account</Link>.
            </p>
          </div>

          <div className="card">
            <h2 className="card-title">2. Delivery window</h2>
            <div className="choice-grid">
              <label className={`choice${deliveryMode === 'SCHEDULED' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  className="checkbox"
                  checked={deliveryMode === 'SCHEDULED'}
                  onChange={() => {
                    setDeliveryMode('SCHEDULED');
                    setQuote(null);
                  }}
                />
                <span>
                  <span className="title">Scheduled</span>
                  <span className="desc">
                    Delivered on the date and slot you choose, after the wholesalers prepare and the hub receives the
                    goods.
                  </span>
                </span>
              </label>
              <label className={`choice${deliveryMode === 'INSTANT' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  className="checkbox"
                  checked={deliveryMode === 'INSTANT'}
                  onChange={() => {
                    setDeliveryMode('INSTANT');
                    setQuote(null);
                  }}
                />
                <span>
                  <span className="title">Instant</span>
                  <span className="desc">
                    Expedited handling, dispatched within the hour. Availability depends on the suppliers that cover
                    your postal code.
                  </span>
                </span>
              </label>
            </div>

            {deliveryMode === 'SCHEDULED' && (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="deliveryDate">Delivery date</label>
                  <input
                    id="deliveryDate"
                    type="date"
                    min={todayInBusinessTimezone()}
                    value={deliveryDate}
                    onChange={(event) => {
                      setDeliveryDate(event.target.value);
                      setQuote(null);
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="deliverySlot">Slot</label>
                  <select
                    id="deliverySlot"
                    value={slotId}
                    onChange={(event) => {
                      setSlotId(event.target.value);
                      setQuote(null);
                    }}
                  >
                    {slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.name} ({slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="card-title">3. Payment method</h2>
            <div className="choice-grid">
              {PAYMENT_METHODS.map((method) => (
                <label className={`choice${paymentMethod === method.value ? ' selected' : ''}`} key={method.value}>
                  <input
                    type="radio"
                    name="payment"
                    className="checkbox"
                    checked={paymentMethod === method.value}
                    onChange={() => setPaymentMethod(method.value)}
                  />
                  <span>
                    <span className="title">{method.label}</span>
                    <span className="desc">{method.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="field full">
              <label htmlFor="buyerNote">Note for the wholesalers (optional)</label>
              <textarea
                id="buyerNote"
                rows={2}
                maxLength={500}
                value={buyerNote}
                placeholder="Landmark, receiving hours, licence reference…"
                onChange={(event) => setBuyerNote(event.target.value)}
              />
            </div>
            <p className="hint">
              Online payments are authorised by the gateway after the order is committed. If the gateway cannot be
              reached the order still exists and the payment is marked failed, so you can retry paying instead of
              re-ordering.
            </p>
          </div>
        </div>

        <aside className="card stack" style={{ gap: 'var(--space-3)', alignSelf: 'start' }}>
          <h2 className="card-title">Order summary</h2>

          {!quote ? (
            <>
              <p className="muted small" style={{ margin: 0 }}>
                Review the order to see the live price, the delivery fee and anything blocking checkout.
              </p>
              <button
                type="button"
                className="btn primary"
                disabled={quoting || !addressId}
                onClick={() => void review()}
              >
                {quoting ? 'Pricing…' : 'Review order'}
              </button>
            </>
          ) : (
            <>
              <div className="stack" style={{ gap: 6 }}>
                <span className="row spread small">
                  <span className="muted">Items</span>
                  <span className="mono">{quote.itemCount}</span>
                </span>
                <span className="row spread small">
                  <span className="muted">Suppliers</span>
                  <span className="mono">{quote.supplierCount}</span>
                </span>
                <span className="row spread small">
                  <span className="muted">Subtotal</span>
                  <span className="mono">{formatMoney(quote.subtotal, quote.currency)}</span>
                </span>
                <span className="row spread small">
                  <span className="muted">Tax</span>
                  <span className="mono">{formatMoney(quote.taxTotal, quote.currency)}</span>
                </span>
                <span className="row spread small">
                  <span className="muted">
                    Delivery {quote.deliveryMode === 'INSTANT' ? '(instant)' : '(scheduled)'}
                  </span>
                  <span className="mono">{formatMoney(quote.deliveryFee, quote.currency)}</span>
                </span>
                <div className="divider" />
                <span className="row spread">
                  <span className="label-md">Payable</span>
                  <span className="price mono">{formatMoney(quote.grandTotal, quote.currency)}</span>
                </span>
              </div>

              {quote.issues.length > 0 && (
                <div className="alert warn" role="status">
                  <strong>Before this order can be placed</strong>
                  <ul className="list">
                    {quote.issues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                className="btn primary"
                disabled={placing || blocked}
                onClick={() => void placeOrder()}
              >
                {placing ? 'Placing order…' : `Place order · ${formatMoney(quote.grandTotal, quote.currency)}`}
              </button>
              <button type="button" className="btn link" disabled={quoting} onClick={() => void review()}>
                {quoting ? 'Re-pricing…' : 'Re-price'}
              </button>
            </>
          )}
        </aside>
      </div>

      {quote && quote.lines.length > 0 && (
        <div className="card">
          <h2 className="card-title">Priced lines</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Supplier</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th style={{ width: 110 }}>Unit price</th>
                  <th style={{ width: 110 }}>Line total</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((line) => (
                  <tr key={line.supplierProductId}>
                    <td>
                      <div className="product-name">{line.productName}</div>
                      <div className="small faint">
                        {[line.manufacturerName, line.packSize].filter(Boolean).join(' · ')}
                      </div>
                      {line.issue && <span className="badge danger">{humanise(line.issue)}</span>}
                    </td>
                    <td className="small">{line.supplierName}</td>
                    <td className="mono">{line.quantity}</td>
                    <td className="mono">{formatMoney(line.unitPrice, quote.currency)}</td>
                    <td className="mono">{formatMoney(line.lineTotal, quote.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Reserved stock is held for a limited window and released automatically if the order is cancelled or the
            payment never completes — see <Link className="link" href="/status">platform status</Link> for the
            reservation policy in this environment.
          </p>
        </div>
      )}

      <div className="pill-row">
        <span className={`chip ${statusTone(paymentMethod)}`}>{humanise(paymentMethod)}</span>
        <span className="chip plain">{branchLabel(deliveryMode)}</span>
      </div>
    </section>
  );
}

function branchLabel(mode: string): string {
  return mode === 'INSTANT' ? 'Instant handling' : 'Scheduled slot';
}

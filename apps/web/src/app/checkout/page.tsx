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

  if (!ready || loading) {
    return (
      <div className="container container-narrow" aria-busy="true">
        <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 170, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 170, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 170, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-title">Sign in to place an order</span>
          <p className="ec-body">Sign in with your retailer account to continue to checkout.</p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/login?next=%2Fcheckout">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isBuyer) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-title">Only retailer accounts can place marketplace orders</span>
          <p className="ec-body">Your account is signed in with a different role.</p>
          <div className="ec-actions">
            <Link className="btn small" href="/account">
              Go to account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const blocked = quote !== null && !quote.placeable;

  return (
    <div className="container container-narrow page-footroom">
      <header className="spread" style={{ marginBottom: 'var(--space-md)', alignItems: 'baseline' }}>
        <div>
          <nav className="small muted" style={{ marginBottom: 4 }}>
            <Link href="/cart">Cart</Link> · <span>Checkout</span>
          </nav>
          <h1 style={{ fontSize: '1.375rem', margin: 0 }}>Delivery and payment</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Stock is reserved only when you place the order, and the price you are charged is the price
            the server returns — never one sent by this screen.
          </p>
        </div>
        <Link className="btn small" href="/cart">
          Back to cart
        </Link>
      </header>

      {error && (
        <div className="alert error" role="alert" style={{ marginBottom: 'var(--space-md)' }}>
          {error}
        </div>
      )}

      {addresses.length === 0 && (
        <div className="alert warn" role="status" style={{ marginBottom: 'var(--space-md)' }}>
          No delivery address is saved yet. Add one in your account, then come back to checkout.
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', alignItems: 'start' }}>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <section className="card">
            <StepHead step={1} title="Delivery address" hint="Where the hub should deliver" />
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
            <p className="hint" style={{ marginBottom: 0 }}>
              Delivering to a postal code a supplier has not declared serviceable is reported as an
              issue, never silently dropped. Manage addresses under{' '}
              <Link className="link" href="/account">
                Account
              </Link>
              .
            </p>
          </section>

          <section className="card">
            <StepHead step={2} title="Delivery window" hint="Quick or scheduled — the choice stays visible" />
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
                  <span className="title">
                    <TruckIconInline /> Scheduled
                  </span>
                  <span className="desc">
                    Delivered on the date and slot you choose, after the wholesalers prepare and the hub
                    receives the goods.
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
                  <span className="title">
                    <BoltIconInline /> Instant
                  </span>
                  <span className="desc">
                    Expedited handling, dispatched within the hour. Availability depends on the suppliers
                    that cover your postal code.
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
          </section>

          <section className="card">
            <StepHead step={3} title="Payment" hint="Online payments are authorised by the gateway after the order commits" />
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
            <p className="hint" style={{ marginBottom: 0 }}>
              If the gateway cannot be reached the order still exists and the payment is marked failed,
              so you can retry paying instead of re-ordering.
            </p>
          </section>
        </div>

        <aside className="card tight" style={{ position: 'sticky', top: 84 }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 var(--space-3)' }}>Order summary</h2>

          {!quote ? (
            <>
              <p className="muted small" style={{ margin: 0 }}>
                Review the order to see the live price, the delivery fee and anything blocking
                checkout.
              </p>
              <button
                type="button"
                className="btn primary block"
                style={{ marginTop: 'var(--space-3)' }}
                disabled={quoting || !addressId}
                onClick={() => void review()}
              >
                {quoting ? 'Pricing…' : 'Review order'}
              </button>
            </>
          ) : (
            <>
              <div className="stack tight">
                <span className="row spread small" style={{ flexWrap: 'nowrap' }}>
                  <span className="muted">Items</span>
                  <span className="mono">{quote.itemCount}</span>
                </span>
                <span className="row spread small" style={{ flexWrap: 'nowrap' }}>
                  <span className="muted">Suppliers</span>
                  <span className="mono">{quote.supplierCount}</span>
                </span>
                <span className="row spread small" style={{ flexWrap: 'nowrap' }}>
                  <span className="muted">Subtotal</span>
                  <span className="mono">{formatMoney(quote.subtotal, quote.currency)}</span>
                </span>
                <span className="row spread small" style={{ flexWrap: 'nowrap' }}>
                  <span className="muted">Tax</span>
                  <span className="mono">{formatMoney(quote.taxTotal, quote.currency)}</span>
                </span>
                <span className="row spread small" style={{ flexWrap: 'nowrap' }}>
                  <span className="muted">
                    Delivery {quote.deliveryMode === 'INSTANT' ? '(instant)' : '(scheduled)'}
                  </span>
                  <span className="mono">{formatMoney(quote.deliveryFee, quote.currency)}</span>
                </span>
                <div className="divider" style={{ margin: '6px 0' }} />
                <span className="row spread" style={{ flexWrap: 'nowrap' }}>
                  <span className="label-md">Payable</span>
                  <span className="price mono" style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
                    {formatMoney(quote.grandTotal, quote.currency)}
                  </span>
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
                className="btn accent block"
                disabled={placing || blocked}
                onClick={() => void placeOrder()}
              >
                {placing
                  ? 'Placing order…'
                  : `Place order · ${formatMoney(quote.grandTotal, quote.currency)}`}
              </button>
              <button type="button" className="btn link" disabled={quoting} onClick={() => void review()}>
                {quoting ? 'Re-pricing…' : 'Re-price'}
              </button>
            </>
          )}
        </aside>
      </div>

      {quote && quote.lines.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
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
          <p className="hint" style={{ marginBottom: 0 }}>
            Reserved stock is held for a limited window and released automatically if the order is
            cancelled or the payment never completes.
          </p>
        </div>
      )}

      {/* Sticky mobile action bar — mirrors the aside's primary action */}
      <div className="stickybar">
        <div className="container stickybar-inner">
          <div className="sb-info">
            <span className="sb-title">
              {quote ? formatMoney(quote.grandTotal, quote.currency) : 'Ready to price'}
            </span>
            <span className="sb-sub">
              {quote
                ? `${quote.itemCount} items · ${quote.supplierCount} supplier${quote.supplierCount === 1 ? '' : 's'}`
                : 'Review for the live price'}
            </span>
          </div>
          {quote ? (
            <button
              type="button"
              className="btn accent"
              disabled={placing || blocked}
              onClick={() => void placeOrder()}
            >
              {placing ? 'Placing…' : 'Place order'}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={quoting || !addressId}
              onClick={() => void review()}
            >
              {quoting ? 'Pricing…' : 'Review order'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHead({ step, title, hint }: { step: number; title: string; hint: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-3)' }}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 'var(--radius-full)',
          background: 'var(--primary)',
          color: 'var(--on-primary)',
          fontSize: '0.8125rem',
          fontWeight: 800,
          flex: '0 0 auto',
        }}
      >
        {step}
      </span>
      <div>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>{title}</h2>
        <p className="hint" style={{ margin: 0 }}>
          {hint}
        </p>
      </div>
    </div>
  );
}

function TruckIconInline() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }}>
      <path d="M2.5 6.5h11v10h-11z" />
      <path d="M13.5 10h4l3 3v3.5h-7z" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </svg>
  );
}

function BoltIconInline() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }}>
      <path d="M13 2.5 5.5 13.5H11l-1 8L18.5 10H13z" />
    </svg>
  );
}

function branchLabel(mode: string): string {
  return mode === 'INSTANT' ? 'Instant handling' : 'Scheduled slot';
}

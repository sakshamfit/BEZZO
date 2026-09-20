'use client';

/**
 * Cart screen.
 *
 * The cart is *intent*, not a reservation: every read re-prices from live inventory, so a line can come
 * back with issues (stock moved, listing paused, supplier no longer verified). This screen renders what
 * the API returns and never edits the cart optimistically — a failed mutation leaves the previous,
 * server-confirmed cart on screen together with the API's own error message.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { formatMoney, humanise, statusTone } from '../../lib/format';
import type { Cart } from '../../lib/types';

const ISSUE_LABELS: Record<string, string> = {
  LISTING_UNAVAILABLE: 'No longer listed for sale',
  SUPPLIER_NOT_VERIFIED: 'Supplier is not verified',
  PRODUCT_UNAVAILABLE: 'Product withdrawn',
  INSUFFICIENT_STOCK: 'Not enough stock right now',
  BELOW_MINIMUM_QUANTITY: 'Below the supplier minimum order quantity',
  BATCH_EXPIRING: 'Batch is close to expiry',
  BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM: 'Your licence verification is required for this item',
};

export default function CartPage() {
  const { ready, principal, request } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBuyer = Boolean(principal?.buyer);

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setError(null);
    try {
      setCart(await request<Cart>('/cart'));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The cart could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [principal, request]);

  useEffect(() => {
    if (!ready) return;
    if (!principal) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  async function mutate(path: string, method: string, body?: unknown, lineId?: string) {
    setBusyLine(lineId ?? 'cart');
    setError(null);
    try {
      setCart(await request<Cart>(path, { method, body }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That change was not accepted.');
    } finally {
      setBusyLine(null);
    }
  }

  if (!ready || loading) {
    return <p className="muted">Loading your cart…</p>;
  }

  if (!principal) {
    return (
      <section className="stack">
        <h1>Your cart</h1>
        <p className="muted">Sign in with your retailer account to build a purchase cart.</p>
        <Link className="btn primary" href="/login?next=%2Fcart">
          Sign in
        </Link>
      </section>
    );
  }

  if (!isBuyer) {
    return (
      <section className="stack">
        <h1>Your cart</h1>
        <p className="muted">
          Only retailer (medical store) accounts hold a purchasing cart. Your account is signed in with a
          different role.
        </p>
        <Link className="btn" href="/account">
          Go to account
        </Link>
      </section>
    );
  }

  const items = cart?.items ?? [];
  const suppliers = Array.from(new Set(items.map((item) => item.supplierName)));

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Your cart</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Prices and availability are re-read from live supplier inventory on every load. Nothing is
            reserved until checkout.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            className="btn small"
            disabled={clearing || busyLine !== null}
            onClick={async () => {
              setClearing(true);
              await mutate('/cart', 'DELETE');
              setClearing(false);
            }}
          >
            {clearing ? 'Clearing…' : 'Clear cart'}
          </button>
        )}
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {cart?.hasIssues && items.length > 0 && (
        <div className="alert" role="status">
          Some lines need attention before checkout — they are marked below.
        </div>
      )}

      {items.length === 0 ? (
        <div className="card stack">
          <h2 style={{ margin: 0 }}>Nothing here yet</h2>
          <p className="muted" style={{ margin: 0 }}>
            Browse the catalogue and add offers from verified wholesalers.
          </p>
          <Link className="btn primary" href="/catalog" style={{ alignSelf: 'flex-start' }}>
            Browse catalogue
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {suppliers.map((supplier) => {
            const lines = items.filter((item) => item.supplierName === supplier);
            const city = lines[0]?.supplierCity ?? null;
            return (
              <div className="card" key={supplier}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{supplier}</h2>
                  <span className="small faint">{city ? `Ships from ${city}` : 'Supplier fulfilment'}</span>
                </div>

                <table className="table" style={{ marginTop: 'var(--space-3)' }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ width: 96 }}>Price</th>
                      <th style={{ width: 168 }}>Quantity</th>
                      <th style={{ width: 110 }}>Line total</th>
                      <th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const busy = busyLine === line.id;
                      const max = Math.max(line.sellableQuantity, line.minimumOrderQuantity);
                      return (
                        <tr key={line.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{line.productName}</div>
                            <div className="small faint">
                              {[line.strength, line.packSize].filter(Boolean).join(' · ')}
                              {line.batchNumber ? ` · batch ${line.batchNumber}` : ''}
                              {line.expiryDate ? ` · exp ${line.expiryDate}` : ''}
                            </div>
                            <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                              <span className={`badge ${statusTone(line.prescriptionClassification)}`}>
                                {humanise(line.prescriptionClassification)}
                              </span>
                              {!line.available && <span className="badge danger">Unavailable</span>}
                              {line.issues.map((issue) => (
                                <span className="badge warn" key={issue}>
                                  {ISSUE_LABELS[issue] ?? humanise(issue)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div>{formatMoney(line.unitPrice)}</div>
                            <div className="small faint">
                              {line.taxRate !== null ? `+${line.taxRate}% GST` : 'GST at invoice'}
                            </div>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              <button
                                type="button"
                                className="btn small"
                                aria-label={`Decrease quantity of ${line.productName}`}
                                disabled={busy || line.quantity <= line.minimumOrderQuantity}
                                onClick={() =>
                                  void mutate(
                                    `/cart/items/${line.id}`,
                                    'PATCH',
                                    { quantity: line.quantity - 1 },
                                    line.id,
                                  )
                                }
                              >
                                −
                              </button>
                              <span style={{ minWidth: 32, textAlign: 'center' }}>{line.quantity}</span>
                              <button
                                type="button"
                                className="btn small"
                                aria-label={`Increase quantity of ${line.productName}`}
                                disabled={busy || line.quantity >= max}
                                onClick={() =>
                                  void mutate(
                                    `/cart/items/${line.id}`,
                                    'PATCH',
                                    { quantity: line.quantity + 1 },
                                    line.id,
                                  )
                                }
                              >
                                +
                              </button>
                            </div>
                            <div className="small faint">
                              Min {line.minimumOrderQuantity} · {line.sellableQuantity} sellable
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{formatMoney(line.lineTotal)}</div>
                            <div className="small faint">incl. {formatMoney(line.lineTax)}</div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn small"
                              aria-label={`Remove ${line.productName}`}
                              disabled={busy}
                              onClick={() => void mutate(`/cart/items/${line.id}`, 'DELETE', undefined, line.id)}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="card stack" style={{ gap: 'var(--space-2)' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Order summary</h2>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Subtotal ({cart?.unitCount} units)</span>
              <span>{formatMoney(cart?.estimatedSubtotal ?? 0, cart?.currency)}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Estimated GST</span>
              <span>{formatMoney(cart?.estimatedTax ?? 0, cart?.currency)}</span>
            </div>
            <div
              className="row"
              style={{ justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}
            >
              <strong>Estimated total</strong>
              <strong>{formatMoney(cart?.estimatedTotal ?? 0, cart?.currency)}</strong>
            </div>
            <p className="small faint" style={{ margin: 0 }}>
              {cart?.supplierCount ?? 0} supplier(s) will fulfil this cart. Each supplier becomes a separate
              fulfilment, and an order may combine several fulfilments with independent pickup, hub receipt
              and delivery tracking.
            </p>
            <div className="alert" role="status">
              Checkout is not enabled yet: the order, payment and fulfilment modules are built in later
              phases. This cart is saved server-side and survives sign-out.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

'use client';

/**
 * Cart screen v2 — fast, compact, honest.
 *
 * Same server-authoritative contract as before (the cart is intent, not a
 * reservation; every read re-prices from live inventory), now through the
 * shared cart context so the header badge and this screen are one state. Line
 * edits show a pending state instead of freezing the whole screen; failures
 * roll back to the server's last confirmed cart with a toast.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../components/cart-context';
import { QuantityStepper } from '../../components/quantity-stepper';
import { ProductVisual } from '../../components/product-visual';
import {
  AlertIcon,
  CartIcon,
  ChevronRight,
  HubIcon,
  InfoIcon,
  TrashIcon,
} from '../../components/icons';
import { formatMoney } from '../../lib/format';
import type { CartLine } from '../../lib/types';

const ISSUE_LABELS: Record<string, string> = {
  LISTING_UNAVAILABLE: 'No longer listed for sale',
  SUPPLIER_NOT_VERIFIED: 'Supplier is not verified',
  PRODUCT_UNAVAILABLE: 'Product withdrawn',
  INSUFFICIENT_STOCK: 'Not enough stock right now',
  BELOW_MINIMUM_QUANTITY: 'Below the supplier minimum order quantity',
  BATCH_EXPIRING: 'Batch is close to expiry',
  BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM: 'Your licence verification is required for this item',
};

function LineRow({ line }: { line: CartLine }) {
  const { setQuantity, removeLine } = useCart();
  const [busy, setBusy] = useState(false);
  const max = Math.max(line.sellableQuantity, line.minimumOrderQuantity);

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cart-line" style={line.available ? undefined : { background: 'var(--danger-bg)' }}>
      <Link href={`/catalog/${line.productId}`} className="cl-visual" aria-label={`View ${line.productName}`}>
        <ProductVisual
          productId={line.productId}
          dosageForm={null}
          size="sm"
          label={line.productName}
        />
      </Link>

      <div className="cl-body">
        <Link href={`/catalog/${line.productId}`} className="cl-name" title={line.productName}>
          {line.productName}
        </Link>
        <div className="cl-meta">
          {[line.strength, line.packSize].filter(Boolean).join(' · ') || '—'}
          {line.batchNumber ? ` · batch ${line.batchNumber}` : ''}
          {line.expiryDate ? ` · exp ${line.expiryDate}` : ''}
        </div>
        <div className="cl-flags">
          {!line.available && <span className="badge danger">Unavailable</span>}
          {line.issues.map((issue) => (
            <span className="badge warn" key={issue}>
              {ISSUE_LABELS[issue] ?? issue}
            </span>
          ))}
        </div>

        <div className="cl-actions">
          <QuantityStepper
            compact
            label={line.productName}
            value={line.quantity}
            min={line.minimumOrderQuantity}
            max={max}
            pending={busy}
            onDecrease={() =>
              void run(() =>
                line.quantity - 1 < line.minimumOrderQuantity
                  ? removeLine(line.id)
                  : setQuantity(line.id, line.quantity - 1),
              )
            }
            onIncrease={() => void run(() => setQuantity(line.id, line.quantity + 1))}
          />
          <span className="cl-min">
            Min {line.minimumOrderQuantity} · {line.sellableQuantity} sellable
          </span>
          <button
            type="button"
            className="cl-remove"
            aria-label={`Remove ${line.productName} from cart`}
            disabled={busy}
            onClick={() => void run(() => removeLine(line.id))}
          >
            <TrashIcon size={14} /> Remove
          </button>
        </div>
      </div>

      <div className="cl-price">
        <span className="cl-unit">
          {formatMoney(line.unitPrice)}
          {line.taxRate !== null ? <span className="small faint"> +{line.taxRate}% GST</span> : null}
        </span>
        <span className="cl-total">{formatMoney(line.lineTotal)}</span>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { ready, principal } = useAuth();
  const { cart, isBuyer, ready: cartReady, clear } = useCart();
  const [clearing, setClearing] = useState(false);

  const items = cart?.items ?? [];
  const groups = useMemo(() => {
    const bySupplier = new Map<string, { supplierId: string; supplierName: string; city: string | null; lines: CartLine[] }>();
    for (const line of items) {
      const group = bySupplier.get(line.supplierId) ?? {
        supplierId: line.supplierId,
        supplierName: line.supplierName,
        city: line.supplierCity,
        lines: [],
      };
      group.lines.push(line);
      bySupplier.set(line.supplierId, group);
    }
    return [...bySupplier.values()];
  }, [items]);

  if (!ready) {
    return (
      <div className="container" aria-busy="true">
        <div className="skeleton" style={{ height: 28, width: 180, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <CartIcon size={24} />
          </span>
          <span className="ec-title">Sign in to build your purchase cart</span>
          <p className="ec-body">
            Your cart holds offers from verified wholesalers with live trade prices — sign in with your
            retailer account to start.
          </p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/login?next=%2Fcart">
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

  if (!isBuyer) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <InfoIcon size={24} />
          </span>
          <span className="ec-title">Only retailer accounts hold a purchasing cart</span>
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

  if (!cartReady && !cart) {
    return (
      <div className="container" aria-busy="true">
        <div className="skeleton" style={{ height: 28, width: 180, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <CartIcon size={24} />
          </span>
          <span className="ec-title">Your cart is empty</span>
          <p className="ec-body">
            Add medicines from the catalogue — prices and availability are live from verified
            wholesalers.
          </p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/catalog">
              Browse the catalogue
            </Link>
            <Link className="btn small" href="/">
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container container-narrow page-footroom">
      <header className="spread" style={{ marginBottom: 'var(--space-md)', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', margin: 0 }}>Your cart</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {cart?.unitCount ?? 0} unit{(cart?.unitCount ?? 0) === 1 ? '' : 's'} · {cart?.supplierCount ?? 0}{' '}
            supplier{(cart?.supplierCount ?? 0) === 1 ? '' : 's'} · re-priced from live inventory on every
            change
          </p>
        </div>
        <button
          type="button"
          className="btn small"
          disabled={clearing}
          onClick={async () => {
            setClearing(true);
            try {
              await clear();
            } finally {
              setClearing(false);
            }
          }}
        >
          {clearing ? 'Clearing…' : 'Clear cart'}
        </button>
      </header>

      {cart?.hasIssues && (
        <div className="alert warn" role="status" style={{ marginBottom: 'var(--space-md)' }}>
          <AlertIcon size={16} />
          <span>Some lines need attention before checkout — they are marked below.</span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', alignItems: 'start' }}>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {groups.map((group) => (
            <section className="card tight" key={group.supplierId}>
              <header
                className="spread"
                style={{ alignItems: 'baseline', borderBottom: '1px solid var(--bg-inset)', paddingBottom: 10, marginBottom: 10 }}
              >
                <strong style={{ fontSize: '0.9375rem', color: 'var(--primary)' }}>{group.supplierName}</strong>
                <span className="small faint">
                  {group.city ? `Ships from ${group.city}` : 'Supplier fulfilment'}
                </span>
              </header>
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                {group.lines.map((line) => (
                  <LineRow key={line.id} line={line} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="stack tight">
          <div className="card tight bill-card">
            <h2 style={{ fontSize: '1rem', margin: '0 0 var(--space-3)' }}>Bill details</h2>
            <div className="bill-rows">
              <div className="cart-total-row">
                <span className="muted">Subtotal ({cart?.unitCount} units)</span>
                <span>{formatMoney(cart?.estimatedSubtotal ?? 0, cart?.currency)}</span>
              </div>
              <div className="cart-total-row">
                <span className="muted">Estimated GST</span>
                <span>{formatMoney(cart?.estimatedTax ?? 0, cart?.currency)}</span>
              </div>
              <div className="cart-total-row">
                <span className="muted">Delivery</span>
                <span className="muted small">Priced at checkout</span>
              </div>
              <div className="cart-total-row total">
                <span>Estimated total</span>
                <span>{formatMoney(cart?.estimatedTotal ?? 0, cart?.currency)}</span>
              </div>
            </div>
            <Link
              className="btn accent block"
              href="/checkout"
              aria-disabled={cart?.hasIssues ? 'true' : undefined}
              style={cart?.hasIssues ? { opacity: 0.6 } : undefined}
              onClick={(event) => {
                // The checkout screen re-validates everything; blocking here would only
                // hide the reason a line cannot be ordered. The warning stays visible.
                if (cart?.hasIssues) event.preventDefault();
              }}
            >
              Proceed to checkout <ChevronRight size={16} />
            </Link>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              Stock is reserved only when the order is placed, and the reservation is released
              automatically if the order is cancelled or the payment never completes.
            </p>
          </div>

          <div className="card tight">
            <h3 style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <HubIcon size={16} /> One order, several fulfilments
            </h3>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              Each supplier above becomes a separate fulfilment with its own pickup, hub receipt and
              delivery tracking — so a delay at one wholesaler never hides behind a single status.
            </p>
          </div>
        </aside>
      </div>

      {/* Sticky mobile checkout bar */}
      <div className="stickybar">
        <div className="container stickybar-inner">
          <div className="sb-info">
            <span className="sb-title">{formatMoney(cart?.estimatedTotal ?? 0, cart?.currency)}</span>
            <span className="sb-sub">
              {cart?.unitCount ?? 0} units · {cart?.supplierCount ?? 0} supplier
              {(cart?.supplierCount ?? 0) === 1 ? '' : 's'}
            </span>
          </div>
          <Link className="btn accent" href="/checkout" aria-disabled={cart?.hasIssues ? 'true' : undefined}>
            Checkout <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}

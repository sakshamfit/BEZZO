'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import type { Cart } from '../../../lib/types';

/**
 * Add-to-cart control.
 *
 * The button reflects the server's rules, not the client's opinion: the stepper is bounded by the MOQ
 * and the sellable quantity the API reported, and every failure (stock moved, listing paused, licence
 * required) is shown with the API's own message. Nothing is optimistically added to the cart — the
 * returned cart is the truth.
 */
export function AddToCart({
  listingId,
  productName,
  supplierName,
  minimumOrderQuantity,
  sellableQuantity,
  unitPrice,
  restricted,
}: {
  listingId: string;
  productName: string;
  supplierName: string;
  minimumOrderQuantity: number;
  sellableQuantity: number;
  unitPrice: number;
  restricted: boolean;
}) {
  const { principal, request } = useAuth();
  const router = useRouter();
  const [quantity, setQuantity] = useState(minimumOrderQuantity);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const isBuyer = Boolean(principal?.buyer);

  if (!principal) {
    return (
      <Link className="btn small" href={`/login?next=${encodeURIComponent('/catalog')}`}>
        Sign in to order
      </Link>
    );
  }

  if (!isBuyer) {
    return <span className="small faint">Only retailer accounts can order</span>;
  }

  if (restricted) {
    return <span className="badge warn">Verified licence required</span>;
  }

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const cart = await request<Cart>('/cart/items', {
        method: 'POST',
        body: { supplierProductId: listingId, quantity },
      });
      setMessage({
        kind: 'ok',
        text: `${productName} added — cart now holds ${cart.unitCount} unit(s) from ${cart.supplierCount} supplier(s).`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'The item could not be added. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-2)', alignItems: 'flex-end' }}>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="btn small"
          aria-label="Decrease quantity"
          disabled={quantity <= minimumOrderQuantity}
          onClick={() => setQuantity((current) => Math.max(minimumOrderQuantity, current - 1))}
        >
          −
        </button>
        <input
          aria-label={`Quantity of ${productName} from ${supplierName}`}
          style={{ width: 72, textAlign: 'center' }}
          inputMode="numeric"
          value={quantity}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value.replace(/[^0-9]/g, ''), 10);
            setQuantity(Number.isNaN(parsed) ? minimumOrderQuantity : parsed);
          }}
          onBlur={() => setQuantity((current) => Math.min(Math.max(current, minimumOrderQuantity), sellableQuantity))}
        />
        <button
          type="button"
          className="btn small"
          aria-label="Increase quantity"
          disabled={quantity >= sellableQuantity}
          onClick={() => setQuantity((current) => Math.min(sellableQuantity, current + 1))}
        >
          +
        </button>
      </div>

      <button className="btn primary small" type="button" onClick={add} disabled={busy}>
        {busy ? 'Adding…' : `Add ${quantity} · ₹${(unitPrice * quantity).toFixed(2)}`}
      </button>

      {message && (
        <p
          className={`small ${message.kind === 'error' ? '' : 'muted'}`}
          style={{ margin: 0, color: message.kind === 'error' ? 'var(--danger)' : undefined, maxWidth: 260, textAlign: 'right' }}
          role={message.kind === 'error' ? 'alert' : undefined}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

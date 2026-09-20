'use client';

/**
 * Buyer rails — "Quick order" and "Order again".
 *
 * Both rails are derived from the buyer's real order history (the only honest
 * source of "frequently ordered" BEZZO has): order summaries are fetched once,
 * the recent orders are opened in parallel, and the lines are ranked by how
 * often they recur. Each card re-adds the *exact listing* bought before, so a
 * one-tap reorder is a real, server-validated cart mutation.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { ReorderCard } from './product-card';
import { ProductCardSkeleton } from './product-card';
import { ChevronRight, RefreshIcon } from './icons';
import type { OrderDetail, OrderSummary } from '../lib/types';

export interface BuyerOrderLine {
  key: string;
  productId: string;
  listingId: string;
  name: string;
  packSize: string | null;
  supplierName: string | null;
  unitPrice: number;
  quantity: number;
  orderNumber: string;
  placedAt: string | null;
}

interface RailState {
  loading: boolean;
  lines: BuyerOrderLine[];
  error: boolean;
}

/** Shared cache so both rails cost one fetch, not two. Keyed by principal. */
const cacheByPrincipal = new Map<string, Promise<BuyerOrderLine[]>>();
const HISTORY_PAGES = 8;
const DETAIL_DEPTH = 4;

async function loadLines(principalId: string, request: <T>(path: string) => Promise<T>): Promise<BuyerOrderLine[]> {
  const cached = cacheByPrincipal.get(principalId);
  if (cached) return cached;
  const promise = (async () => {
    const summaries = await request<OrderSummary[]>(`/orders?page=1&pageSize=${HISTORY_PAGES}`);
    const recent = summaries.slice(0, DETAIL_DEPTH);
    const details = await Promise.all(
      recent.map((summary) => request<OrderDetail>(`/orders/${summary.id}`).catch(() => null)),
    );
    const lines: BuyerOrderLine[] = [];
    details.forEach((detail, index) => {
      if (!detail) return;
      for (const item of detail.items) {
        lines.push({
          key: `${item.id}-${index}`,
          productId: item.productId,
          listingId: item.supplierProductId,
          name: item.productName,
          packSize: item.packSize,
          supplierName: item.supplierName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          orderNumber: detail.orderNumber,
          placedAt: detail.placedAt ?? detail.createdAt,
        });
      }
    });
    return lines;
  })();
  cacheByPrincipal.set(principalId, promise);
  promise.catch(() => cacheByPrincipal.delete(principalId));
  return promise;
}

function useBuyerOrderLines(limit: number): RailState & { signedOut: boolean; notBuyer: boolean } {
  const { ready, principal, request } = useAuth();
  const [state, setState] = useState<RailState>({ loading: true, lines: [], error: false });

  useEffect(() => {
    if (!ready) return;
    if (!principal?.buyer) {
      setState({ loading: false, lines: [], error: false });
      return;
    }
    let cancelled = false;
    setState({ loading: true, lines: [], error: false });
    void loadLines(principal.id, request)
      .then((lines) => {
        if (!cancelled) setState({ loading: false, lines: lines.slice(0, limit), error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, lines: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [ready, principal, request, limit]);

  return {
    ...state,
    signedOut: ready && !principal,
    notBuyer: ready && Boolean(principal) && !principal?.buyer,
  };
}

function RailSkeleton() {
  return (
    <div className="rail" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}

function RailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="alert warn" role="status" style={{ margin: 0 }}>
      <span>Your recent orders could not be loaded.</span>
      <button type="button" className="btn small" onClick={onRetry} style={{ marginLeft: 'auto' }}>
        <RefreshIcon size={14} /> Try again
      </button>
    </div>
  );
}

function retry(principalId: string): void {
  cacheByPrincipal.delete(principalId);
}

/** "Quick order" — the lines this store buys most often, one tap to re-add. */
export function QuickOrderRail() {
  const { ready, principal } = useAuth();
  const rail = useBuyerOrderLines(10);

  if (rail.notBuyer) return null;

  // Auth unknown (SSR / pre-hydration): paint the skeleton so the page's final
  // structure is stable instead of shifting once the session resolves.
  if (!ready || rail.loading) {
    return (
      <section className="mk-section">
        <div className="section-head">
          <div>
            <h2>Quick order</h2>
            <p className="sub">Your regular lines, one tap away</p>
          </div>
        </div>
        <RailSkeleton />
      </section>
    );
  }

  if (rail.signedOut) {
    return (
      <section className="mk-section">
        <div className="section-head">
          <div>
            <h2>Quick order</h2>
            <p className="sub">Your regular lines, one tap away</p>
          </div>
        </div>
        <div className="empty-card">
          <span className="ec-title">Sign in to reorder in seconds</span>
          <p className="ec-body">
            Your frequently ordered medicines appear here, with the exact supplier lines you bought
            before — ready to re-add to the cart.
          </p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/login?next=%2F">
              Sign in
            </Link>
            <Link className="btn small" href="/apply">
              Apply as a medical store
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (rail.loading) {
    return (
      <section className="mk-section">
        <div className="section-head">
          <div>
            <h2>Quick order</h2>
            <p className="sub">Loading your regular lines…</p>
          </div>
        </div>
        <RailSkeleton />
      </section>
    );
  }

  if (rail.error) {
    return (
      <section className="mk-section">
        <div className="section-head">
          <div>
            <h2>Quick order</h2>
            <p className="sub">Your regular lines, one tap away</p>
          </div>
        </div>
        <RailError onRetry={() => principal && retry(principal.id)} />
      </section>
    );
  }

  // Rank by recurrence (how many orders contain the line), keep the most recent entry.
  const byListing = new Map<string, BuyerOrderLine>();
  const counts = new Map<string, number>();
  for (const line of rail.lines) {
    counts.set(line.listingId, (counts.get(line.listingId) ?? 0) + 1);
    byListing.set(line.listingId, line);
  }
  const ranked = [...byListing.values()]
    .sort((a, b) => (counts.get(b.listingId) ?? 0) - (counts.get(a.listingId) ?? 0))
    .slice(0, 8);

  if (ranked.length === 0) {
    return (
      <section className="mk-section">
        <div className="section-head">
          <div>
            <h2>Quick order</h2>
            <p className="sub">Your regular lines, one tap away</p>
          </div>
        </div>
        <div className="empty-card">
          <span className="ec-title">No orders yet</span>
          <p className="ec-body">
            Once you place your first order, the medicines you buy regularly appear here for one-tap
            reordering.
          </p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/catalog">
              Browse the catalogue
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mk-section">
      <div className="section-head">
        <div>
          <h2>Quick order</h2>
          <p className="sub">
            Based on your last {HISTORY_PAGES > rail.lines.length ? rail.lines.length : DETAIL_DEPTH} orders
          </p>
        </div>
        <Link className="see-all" href="/orders">
          Order history <ChevronRight size={14} />
        </Link>
      </div>
      <div className="rail">
        {ranked.map((line) => (
          <ReorderCard
            key={line.key}
            productId={line.productId}
            listingId={line.listingId}
            name={line.name}
            packSize={line.packSize}
            supplierName={line.supplierName ?? 'Previous supplier'}
            unitPrice={line.unitPrice}
            quantity={line.quantity}
            href={`/catalog/${line.productId}`}
          />
        ))}
      </div>
    </section>
  );
}

/** "Order again" — exactly what the most recent order contained. */
export function RecentlyOrderedRail() {
  const { ready, principal } = useAuth();
  const rail = useBuyerOrderLines(24);

  if (!ready || rail.signedOut || rail.notBuyer || rail.error) return null;

  if (rail.loading) {
    return (
      <section className="mk-section">
        <div className="section-head">
          <div>
            <h2>Order again</h2>
            <p className="sub">From your last order</p>
          </div>
        </div>
        <RailSkeleton />
      </section>
    );
  }

  const lastOrderNumber = rail.lines[0]?.orderNumber;
  const seen = new Set<string>();
  const unique = rail.lines.filter((line) => {
    if (seen.has(line.listingId)) return false;
    seen.add(line.listingId);
    return true;
  });

  if (unique.length === 0) return null;

  return (
    <section className="mk-section">
      <div className="section-head">
        <div>
          <h2>Order again</h2>
          <p className="sub">{lastOrderNumber ? `From order ${lastOrderNumber}` : 'From your last order'}</p>
        </div>
        {lastOrderNumber && (
          <Link className="see-all" href="/orders">
            All orders <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <div className="rail">
        {unique.slice(0, 8).map((line) => (
          <ReorderCard
            key={line.key}
            productId={line.productId}
            listingId={line.listingId}
            name={line.name}
            packSize={line.packSize}
            supplierName={line.supplierName ?? 'Previous supplier'}
            unitPrice={line.unitPrice}
            quantity={line.quantity}
            href={`/catalog/${line.productId}`}
          />
        ))}
      </div>
    </section>
  );
}

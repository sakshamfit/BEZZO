'use client';

/**
 * Supplier workspace dashboard v2 — an operational command centre, not a
 * storefront.
 *
 * The wholesaler's day in one screen: what needs action right now (new
 * fulfilments), what is ready for Bezzo pickup, stock positions that need
 * restocking, and the state of the catalogue. All figures come from the API;
 * nothing about eligibility is computed here.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { formatDateTime, formatMoney, humanise, statusTone } from '../../../lib/format';
import {
  BoxIcon,
  ChevronRight,
  HubIcon,
  ScanIcon,
  ShieldIcon,
  TruckIcon,
} from '../../../components/icons';
import type {
  Paginated,
  SupplierFulfillmentSummary,
  SupplierInventoryItem,
  SupplierListing,
  SupplierProfile,
} from '../../../lib/types';

interface FulfillmentQueueResponse {
  rows: SupplierFulfillmentSummary[];
  total: number;
}

export default function SupplierWorkspacePage() {
  const { ready, principal, request } = useAuth();
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [listings, setListings] = useState<Paginated<SupplierListing> | null>(null);
  const [lowStock, setLowStock] = useState<SupplierInventoryItem[]>([]);
  const [queue, setQueue] = useState<FulfillmentQueueResponse | null>(null);
  const [newCount, setNewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSupplier = Boolean(principal?.supplier);

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setError(null);
    try {
      const [profileResult, listingResult, lowStockResult, queueResult, newCountResult] =
        await Promise.all([
          request<SupplierProfile>('/supplier/profile'),
          request<Paginated<SupplierListing>>('/supplier/listings?page=1&pageSize=8'),
          request<Paginated<SupplierInventoryItem>>('/supplier/inventory?page=1&pageSize=8&lowStockOnly=true'),
          request<FulfillmentQueueResponse>('/supplier/fulfillments?page=1&pageSize=6').catch(() => null),
          request<FulfillmentQueueResponse>('/supplier/fulfillments?page=1&pageSize=1&status=CREATED').catch(
            () => null,
          ),
        ]);
      setProfile(profileResult);
      setListings(listingResult);
      setLowStock(lowStockResult.items);
      setQueue(queueResult);
      setNewCount(newCountResult?.total ?? null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The supplier workspace could not be loaded.');
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

  if (!ready || loading) {
    return (
      <section className="stack" aria-busy="true">
        <div className="skeleton" style={{ height: 30, width: 260, marginBottom: 14 }} />
        <div className="stat-grid" style={{ marginBottom: 14 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton" key={index} style={{ height: 96, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 220, borderRadius: 'var(--radius-lg)' }} />
      </section>
    );
  }

  if (!principal) {
    return (
      <section className="stack">
        <h1>Supplier workspace</h1>
        <p className="muted">Sign in with a wholesaler account to manage listings, stock and pickups.</p>
        <Link className="btn primary" href="/login?next=%2Fsupplier">
          Sign in
        </Link>
      </section>
    );
  }

  if (!principal.supplier) {
    return (
      <section className="stack">
        <h1>Supplier workspace</h1>
        <p className="muted">
          This account is not linked to a wholesaler organisation. Your roles:{' '}
          {principal.roles.map(humanise).join(', ')}.
        </p>
        <Link className="btn" href="/account">
          Go to account
        </Link>
      </section>
    );
  }

  const verified = profile?.verificationStatus === 'VERIFIED';
  const stats = profile?.stats;

  const actions: Array<{ href: string; title: string; body: string; icon: React.ReactNode }> = [
    {
      href: '/supplier/fulfillments?status=CREATED',
      title: 'Orders to accept',
      body: 'New retailer orders routed to you — accept or reject before the cut-off',
      icon: <ScanIcon size={20} />,
    },
    {
      href: '/supplier/fulfillments?status=READY_FOR_PICKUP',
      title: 'Ready for pickup',
      body: 'Packed fulfilments waiting for the Bezzo picker',
      icon: <HubIcon size={20} />,
    },
    {
      href: '/supplier/inventory',
      title: 'Inventory',
      body: 'Stock positions, thresholds and adjustments',
      icon: <BoxIcon size={20} />,
    },
    {
      href: '/supplier/listings',
      title: 'Listings',
      body: 'Publish offers, prices and pack details',
      icon: <TruckIcon size={20} />,
    },
  ];

  return (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <header className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ margin: 0 }}>{profile?.displayName ?? 'Supplier workspace'}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {profile?.legalName} ·{' '}
            {[profile?.locality, profile?.city, profile?.state].filter(Boolean).join(', ') ||
              'pickup address not set'}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn primary small" href="/supplier/fulfillments">
            Fulfilment workbench <ChevronRight size={14} />
          </Link>
        </div>
      </header>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {!verified && (
        <div className="alert warn" role="alert">
          <ShieldIcon size={16} />
          <span>
            Your organisation is <strong>{humanise(profile?.verificationStatus)}</strong>. Buyers cannot
            see or order your offers until BEZZO operations verifies the account and its licences.
            {profile?.rejectionReason ? ` Reviewer note: ${profile.rejectionReason}` : ''}
          </span>
        </div>
      )}

      {/* Operational metrics */}
      <div className="stat-grid">
        <div className="card stat">
          <span className="stat-label">Orders to accept</span>
          <strong className="stat-value">{newCount ?? '—'}</strong>
          <span className="small faint">New fulfilments routed to you</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Listings</span>
          <strong className="stat-value">{stats?.listings ?? 0}</strong>
          <span className="small faint">{stats?.activeListings ?? 0} buyable right now</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Low stock</span>
          <strong className="stat-value">{stats?.lowStockItems ?? 0}</strong>
          <span className="small faint">At or below threshold</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Pickup window</span>
          <strong className="stat-value" style={{ fontSize: '1.1rem' }}>
            {profile?.operatingHours?.mon_sat ?? '—'}
          </strong>
          <span className="small faint">
            Sunday {profile?.operatingHours?.sun ?? '—'} · pickers collect here
          </span>
        </div>
      </div>

      {/* Quick action tiles */}
      <div className="cat-grid">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="cat-card">
            <span className="ct-visual" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>
              {action.icon}
            </span>
            <span className="cc-body">
              <span className="cc-name">{action.title}</span>
              <span className="cc-count">{action.body}</span>
            </span>
            <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)', flex: '0 0 auto' }} />
          </Link>
        ))}
      </div>

      {/* Fulfilment queue */}
      <div className="card stack">
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Fulfilment queue</h2>
          <Link className="btn small" href="/supplier/fulfillments">
            Open workbench
          </Link>
        </div>
        {queue === null ? (
          <p className="muted small" style={{ margin: 0 }}>
            The fulfilment queue could not be loaded right now — open the workbench to retry.
          </p>
        ) : queue.rows.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No fulfilments yet. When a retailer order includes your lines, it appears here as a
            fulfilment to accept, pack and hand to the Bezzo picker.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Buyer</th>
                  <th style={{ width: 90 }}>Units</th>
                  <th style={{ width: 120 }}>Total</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 140 }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {queue.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className="link mono" href={`/supplier/fulfillments/${row.id}`}>
                        {row.fulfillmentReference}
                      </Link>
                    </td>
                    <td className="small">
                      {row.buyerTradeName}
                      <div className="small faint">
                        {[row.deliveryLocality, row.deliveryCity].filter(Boolean).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="mono">{row.itemCount}</td>
                    <td className="mono">{formatMoney(row.total)}</td>
                    <td>
                      <span className={`badge ${statusTone(row.status)}`}>{humanise(row.status)}</span>
                    </td>
                    <td className="small faint">
                      {formatDateTime(row.readyAt ?? row.packedAt ?? row.acceptedAt ?? row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Low stock */}
      <div className="card stack">
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Needs attention</h2>
          <Link className="btn small" href="/supplier/inventory">
            Manage inventory
          </Link>
        </div>
        {lowStock.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No positions are at or below their low-stock threshold.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 110 }}>Sellable</th>
                  <th style={{ width: 110 }}>Threshold</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {lowStock.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div className="small faint">
                        {item.packSize ?? '—'}
                        {item.batchNumber ? ` · batch ${item.batchNumber}` : ''}
                        {item.expiryDate ? ` · exp ${item.expiryDate}` : ''}
                      </div>
                    </td>
                    <td>{item.sellableQuantity}</td>
                    <td>{item.lowStockThreshold ?? '—'}</td>
                    <td>
                      <span className={`badge ${statusTone(item.status)}`}>{humanise(item.status)}</span>
                    </td>
                    <td>
                      <Link className="btn small" href={`/supplier/inventory?focus=${item.id}`}>
                        Restock
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent listings */}
      <div className="card stack">
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Recent listings</h2>
          <Link className="btn small" href="/supplier/listings">
            All listings
          </Link>
        </div>
        {listings && listings.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 110 }}>Price</th>
                  <th style={{ width: 110 }}>Sellable</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 140 }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {listings.items.map((listing) => (
                  <tr key={listing.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{listing.productName}</div>
                      <div className="small faint">
                        {[listing.strength, listing.packSize].filter(Boolean).join(' · ')}
                        {listing.supplierSku ? ` · SKU ${listing.supplierSku}` : ''}
                      </div>
                    </td>
                    <td>
                      <div>{formatMoney(listing.sellingPrice)}</div>
                      <div className="small faint">MRP {formatMoney(listing.mrpReference)}</div>
                    </td>
                    <td>{listing.sellableQuantity}</td>
                    <td>
                      <span className={`badge ${statusTone(listing.status)}`}>{humanise(listing.status)}</span>
                    </td>
                    <td className="small faint">{formatDateTime(listing.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            No listings yet — publish an offer to appear in the marketplace.
          </p>
        )}
      </div>
    </section>
  );
}

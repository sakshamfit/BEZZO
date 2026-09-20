'use client';

/**
 * Supplier workspace dashboard.
 *
 * The wholesaler's home: verification state (which gates every listing being buyable), catalogue size,
 * low-stock positions that need action, and the pickup readiness that BEZZO hubs depend on. Figures come
 * from the API; the page computes nothing about eligibility.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { formatDateTime, formatMoney, humanise, statusTone } from '../../lib/format';
import type {
  Paginated,
  SupplierInventoryItem,
  SupplierListing,
  SupplierProfile,
} from '../../lib/types';

export default function SupplierWorkspacePage() {
  const { ready, principal, request } = useAuth();
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [listings, setListings] = useState<Paginated<SupplierListing> | null>(null);
  const [lowStock, setLowStock] = useState<SupplierInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setError(null);
    try {
      const [profileResult, listingResult, lowStockResult] = await Promise.all([
        request<SupplierProfile>('/supplier/profile'),
        request<Paginated<SupplierListing>>('/supplier/listings?page=1&pageSize=8'),
        request<Paginated<SupplierInventoryItem>>('/supplier/inventory?page=1&pageSize=8&lowStockOnly=true'),
      ]);
      setProfile(profileResult);
      setListings(listingResult);
      setLowStock(lowStockResult.items);
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

  if (!ready || loading) return <p className="muted">Loading supplier workspace…</p>;

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

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{profile?.displayName ?? 'Supplier workspace'}</h1>
        <p className="muted small" style={{ margin: 0 }}>
          {profile?.legalName} ·{' '}
          {[profile?.locality, profile?.city, profile?.state].filter(Boolean).join(', ') || 'pickup address not set'}
        </p>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {!verified && (
        <div className="alert" role="alert">
          Your organisation is <strong>{humanise(profile?.verificationStatus)}</strong>. Buyers cannot see or
          order your offers until BEZZO operations verifies the account and its licences.
          {profile?.rejectionReason ? ` Reviewer note: ${profile.rejectionReason}` : ''}
        </div>
      )}

      <div className="stat-grid">
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
          <span className="stat-label">Verification</span>
          <strong className="stat-value" style={{ fontSize: '1.1rem' }}>
            {humanise(profile?.verificationStatus)}
          </strong>
          <span className="small faint">Verified {formatDateTime(profile?.verifiedAt)}</span>
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

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
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
        )}
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Recent listings</h2>
          <Link className="btn small" href="/supplier/listings">
            All listings
          </Link>
        </div>
        {listings && listings.items.length > 0 ? (
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
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            No listings yet — publish an offer to appear in the marketplace.
          </p>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>How fulfilment works for you</h2>
        <p className="small muted" style={{ margin: 0 }}>
          An order from a retailer becomes one <strong>fulfilment</strong> per supplier. You prepare and pack
          that fulfilment; a BEZZO <strong>picker</strong> then collects it from this pickup address and takes
          it to the collection hub, where it is received package by package. Delivery to the retailer happens
          from the hub — the picker is not the final delivery driver.
        </p>
      </div>
    </section>
  );
}

'use client';

/**
 * Supplier fulfillment detail view.
 *
 * Provides a comprehensive pick-pack-dispatch workbench for a single order fulfillment:
 * - Line item picking checklist with batch & expiry information
 * - Packaging specification and barcode registry
 * - Dispatch & pickup task status (showing the assigned BEZZO collection picker)
 * - Complete audit timeline of status transitions
 */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import { formatDateTime, formatMoney, humanise, statusTone } from '../../../../lib/format';
import type { SupplierFulfillmentDetail } from '../../../../lib/types';

export default function SupplierFulfillmentDetailPage() {
  const { ready, principal, request } = useAuth();
  const params = useParams();
  const router = useRouter();
  const fulfillmentId = String(params.id);

  const [detail, setDetail] = useState<SupplierFulfillmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Packing form modal
  const [isPackModalOpen, setIsPackModalOpen] = useState(false);
  const [packType, setPackType] = useState<'STANDARD' | 'FRAGILE' | 'COLD_CHAIN' | 'RESTRICTED'>('STANDARD');
  const [packWeight, setPackWeight] = useState<string>('500');
  const [packSeal, setPackSeal] = useState<string>('');
  const [packNotes, setPackNotes] = useState<string>('');

  // Reject modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!principal?.supplier) return;
    setLoading(true);
    setError(null);
    try {
      const data = await request<SupplierFulfillmentDetail>(`/supplier/fulfillments/${fulfillmentId}`);
      setDetail(data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Fulfillment details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [principal, fulfillmentId, request]);

  useEffect(() => {
    if (!ready) return;
    if (!principal?.supplier) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  const handleAccept = async () => {
    setBusyAction('accept');
    setError(null);
    try {
      await request(`/supplier/fulfillments/${fulfillmentId}/accept`, { method: 'POST' });
      setNotice('Fulfillment accepted. You can now prepare and pack the items.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to accept fulfillment.');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePackSubmit = async () => {
    setBusyAction('pack');
    setError(null);
    try {
      await request(`/supplier/fulfillments/${fulfillmentId}/pack`, {
        method: 'POST',
        body: {
          packages: [
            {
              packageType: packType,
              weightGrams: packWeight ? Number(packWeight) : undefined,
              sealNumber: packSeal.trim() || undefined,
              handlingNotes: packNotes.trim() || undefined,
            },
          ],
        },
      });
      setNotice('Packages registered and fulfillment marked PACKED.');
      setIsPackModalOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to pack fulfillment.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleReady = async () => {
    setBusyAction('ready');
    setError(null);
    try {
      const res = await request<{ pickupTaskId: string; taskCode: string }>(
        `/supplier/fulfillments/${fulfillmentId}/ready`,
        { method: 'POST' },
      );
      setNotice(`Ready for pickup! Task ${res.taskCode} dispatched to collection pool.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to mark ready for pickup.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      setError('Please specify the reason for rejecting.');
      return;
    }
    setBusyAction('reject');
    setError(null);
    try {
      await request(`/supplier/fulfillments/${fulfillmentId}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() },
      });
      setNotice('Fulfillment cancelled and reserved inventory units released.');
      setIsRejectModalOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to reject fulfillment.');
    } finally {
      setBusyAction(null);
    }
  };

  if (!ready || loading) {
    return <p className="muted">Loading fulfillment order details…</p>;
  }

  if (!principal?.supplier) {
    return (
      <section className="stack">
        <h1>Fulfillment Detail</h1>
        <p className="muted">Wholesaler credentials required.</p>
        <Link className="btn primary" href="/login">
          Sign In
        </Link>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="stack">
        <h1>Fulfillment Not Found</h1>
        <p className="muted">The requested fulfillment could not be found or belongs to another supplier.</p>
        <Link className="btn secondary" href="/supplier/fulfillments">
          Back to Fulfillments
        </Link>
      </section>
    );
  }

  const isCreated = detail.status === 'CREATED';
  const isAllocated = detail.status === 'ALLOCATED' || detail.status === 'PICKING';
  const isPacked = detail.status === 'PACKED';

  return (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      {/* Breadcrumb & Navigation */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <Link className="btn small secondary" href="/supplier/fulfillments">
            ← Fulfillments
          </Link>
          <span className="small muted">/</span>
          <span className="small" style={{ fontWeight: 600 }}>
            {detail.fulfillmentReference}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn small secondary" onClick={() => window.print()}>
            🖨️ Print Pick List
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert success" role="status">
          {notice}
          <button className="btn small text" onClick={() => setNotice(null)} style={{ float: 'right' }}>
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="alert danger" role="alert">
          {error}
          <button className="btn small text" onClick={() => setError(null)} style={{ float: 'right' }}>
            ✕
          </button>
        </div>
      )}

      {/* Main Header Banner */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{detail.fulfillmentReference}</h1>
            <span className={`badge ${statusTone(detail.status)}`}>{humanise(detail.status)}</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Order #{detail.orderNumber} · Placed on {formatDateTime(detail.createdAt)} · Subtotal:{' '}
            {formatMoney(detail.subtotal)} (+ Tax: {formatMoney(detail.taxTotal)}) ={' '}
            <strong>{formatMoney(detail.total)}</strong>
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="row" style={{ gap: 8 }}>
          {isCreated && (
            <>
              <button
                className="btn primary"
                disabled={busyAction !== null}
                onClick={() => void handleAccept()}
              >
                {busyAction === 'accept' ? 'Accepting...' : 'Accept Order'}
              </button>
              <button
                className="btn danger"
                disabled={busyAction !== null}
                onClick={() => setIsRejectModalOpen(true)}
              >
                Reject
              </button>
            </>
          )}

          {isAllocated && (
            <button
              className="btn primary"
              disabled={busyAction !== null}
              onClick={() => setIsPackModalOpen(true)}
            >
              Pack Order Items
            </button>
          )}

          {isPacked && (
            <button
              className="btn primary"
              disabled={busyAction !== null}
              onClick={() => void handleReady()}
            >
              {busyAction === 'ready' ? 'Dispatching...' : 'Mark Ready for Pickup'}
            </button>
          )}
        </div>
      </div>

      {/* Grid: Buyer Info & Delivery vs. Logistics Pickup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Buyer & Destination */}
        <div className="card stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Retailer & Destination</h2>
          <div className="stack" style={{ gap: 4 }}>
            <div style={{ fontWeight: 600 }}>{detail.buyer.tradeName}</div>
            {detail.buyer.drugLicenceNumber && (
              <div className="small faint">DL: {detail.buyer.drugLicenceNumber}</div>
            )}
            {detail.buyer.contactPhone && (
              <div className="small faint">Contact: {detail.buyer.contactPhone}</div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div className="small muted" style={{ fontWeight: 600 }}>
              Final Delivery Address
            </div>
            {detail.deliveryAddress ? (
              <p className="small" style={{ margin: '4px 0 0 0' }}>
                {detail.deliveryAddress.addressLine1}
                {detail.deliveryAddress.addressLine2 ? `, ${detail.deliveryAddress.addressLine2}` : ''}
                <br />
                {detail.deliveryAddress.locality}, {detail.deliveryAddress.city} - {detail.deliveryAddress.postalCode}
              </p>
            ) : (
              <p className="small faint" style={{ margin: '4px 0 0 0' }}>
                Delivery address snapshot not available.
              </p>
            )}
            {detail.deliverySlotName && (
              <div className="small faint" style={{ marginTop: 4 }}>
                Delivery Window: <strong>{detail.deliverySlotName}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Pickup & Logistics Hub Task */}
        <div className="card stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Logistics & Pickup Task</h2>
          {detail.pickupTask ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="small muted">Pickup Task Code:</span>
                <strong className="small">{detail.pickupTask.taskCode}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="small muted">Task Status:</span>
                <span className={`badge ${statusTone(detail.pickupTask.status)} small`}>
                  {humanise(detail.pickupTask.status)}
                </span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="small muted">Pickup Window:</span>
                <span className="small">
                  {detail.pickupTask.pickupWindowStart
                    ? formatDateTime(detail.pickupTask.pickupWindowStart)
                    : 'Scheduled'}
                </span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="small muted">Assigned Collector:</span>
                <span className="small">
                  {detail.pickupTask.assignedPickerName ? (
                    <strong>
                      {detail.pickupTask.assignedPickerName}{' '}
                      {detail.pickupTask.assignedPickerPhone && `(${detail.pickupTask.assignedPickerPhone})`}
                    </strong>
                  ) : (
                    <em className="faint">Pool dispatch / awaiting picker</em>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              <p className="small muted" style={{ margin: 0 }}>
                Pickup task is automatically generated and dispatched to local BEZZO hub pickers once you mark the
                packages <strong>Ready for Pickup</strong>.
              </p>
              <div className="small faint">
                Collection hub receives individual scanned barcode parcels directly from the picker.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Items Pick List */}
      <div className="card stack" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px 12px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Items to Pick & Pack ({detail.items.length})</h2>
          <p className="small muted" style={{ margin: '2px 0 0 0' }}>
            Verify drug batch numbers and expiry dates against physical inventory before boxing.
          </p>
        </div>

        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Product Details</th>
              <th style={{ width: 130 }}>Batch & Expiry</th>
              <th style={{ width: 90 }}>Qty</th>
              <th style={{ width: 110 }}>Unit Price</th>
              <th style={{ width: 110 }}>Line Total</th>
              <th style={{ width: 110 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item, idx) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{item.productName}</div>
                  <div className="small faint">
                    {item.dosageForm} · {item.packSize ?? 'Standard pack'}
                    {item.sku ? ` · SKU: ${item.sku}` : ''}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{item.batchNumber ?? '—'}</div>
                  <div className="small faint">Exp: {item.expiryDate ?? '—'}</div>
                </td>
                <td>
                  <strong style={{ fontSize: '1.05rem' }}>{item.quantity}</strong>
                </td>
                <td>{formatMoney(item.unitPrice)}</td>
                <td>
                  <strong>{formatMoney(item.lineTotal)}</strong>
                </td>
                <td>
                  <span className={`badge ${statusTone(item.status)}`}>{humanise(item.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Packages Section */}
      <div className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Registered Packages ({detail.packages.length})</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Physical barcoded packages to be handed over to the BEZZO collection picker.
            </p>
          </div>
          {isAllocated && (
            <button className="btn small primary" onClick={() => setIsPackModalOpen(true)}>
              + Configure Packages
            </button>
          )}
        </div>

        {detail.packages.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            No packages registered yet. Click &quot;Pack Order Items&quot; when the medicines are sealed in cartons.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Package Code</th>
                <th>Type</th>
                <th>Estimated Weight</th>
                <th>Seal #</th>
                <th>Handling Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.packages.map((pkg) => (
                <tr key={pkg.id}>
                  <td>
                    <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>{pkg.packageCode}</strong>
                  </td>
                  <td>{humanise(pkg.packageType)}</td>
                  <td>{pkg.weightGrams ? `${pkg.weightGrams} g` : '—'}</td>
                  <td>{pkg.sealNumber ? <span className="badge neutral">{pkg.sealNumber}</span> : '—'}</td>
                  <td className="small faint">{pkg.handlingNotes ?? 'Standard handling'}</td>
                  <td>
                    <span className={`badge ${statusTone(pkg.status)}`}>{humanise(pkg.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Timeline Section */}
      {detail.timeline && detail.timeline.length > 0 && (
        <div className="card stack" style={{ gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Fulfillment History & Timeline</h2>
          <div className="stack" style={{ gap: 8, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
            {detail.timeline.map((step) => (
              <div key={step.id} className="stack" style={{ gap: 2 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${statusTone(step.toStatus)} small`}>{humanise(step.toStatus)}</span>
                  <span className="small faint">{formatDateTime(step.createdAt)}</span>
                  <span className="small muted">by {step.actorType}</span>
                </div>
                {step.reason && (
                  <p className="small muted" style={{ margin: 0, paddingLeft: 4 }}>
                    {step.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pack Modal */}
      {isPackModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div className="card stack" style={{ maxWidth: 460, width: '100%', background: 'var(--surface, #fff)' }}>
            <h2 style={{ margin: 0 }}>Pack Order {detail.fulfillmentReference}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Specify parcels for this fulfillment. Codes will be printed on labels for the collection picker.
            </p>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Package Type</span>
              <select
                value={packType}
                onChange={(e) => setPackType(e.target.value as typeof packType)}
              >
                <option value="STANDARD">Standard Carton / Box</option>
                <option value="FRAGILE">Fragile (Glass / Liquid)</option>
                <option value="COLD_CHAIN">Cold Chain (2°C - 8°C Insulated)</option>
                <option value="RESTRICTED">Restricted / High Value</option>
              </select>
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Estimated Weight (Grams)</span>
              <input
                type="number"
                min={1}
                max={50000}
                value={packWeight}
                onChange={(e) => setPackWeight(e.target.value)}
                placeholder="e.g. 800"
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Tamper-evident Seal Number (Optional)</span>
              <input
                type="text"
                value={packSeal}
                onChange={(e) => setPackSeal(e.target.value)}
                placeholder="e.g. SEAL-98412"
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Handling Notes (Optional)</span>
              <input
                type="text"
                value={packNotes}
                onChange={(e) => setPackNotes(e.target.value)}
                placeholder="e.g. Handle with care, fragile ampoules"
              />
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                className="btn secondary small"
                type="button"
                disabled={busyAction !== null}
                onClick={() => setIsPackModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn primary small"
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handlePackSubmit()}
              >
                {busyAction !== null ? 'Saving...' : 'Confirm Packed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div className="card stack" style={{ maxWidth: 440, width: '100%', background: 'var(--surface, #fff)' }}>
            <h2 style={{ margin: 0 }}>Reject Order {detail.fulfillmentReference}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Rejecting will cancel this fulfillment and release the reserved stock back to your inventory.
            </p>

            <label className="stack" style={{ gap: 4 }}>
              <span className="small">Reason for rejection *</span>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Damaged inventory batch / unable to supply required batch specification"
              />
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                className="btn secondary small"
                type="button"
                disabled={busyAction !== null}
                onClick={() => setIsRejectModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn danger small"
                type="button"
                disabled={busyAction !== null || !rejectReason.trim()}
                onClick={() => void handleRejectSubmit()}
              >
                {busyAction !== null ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

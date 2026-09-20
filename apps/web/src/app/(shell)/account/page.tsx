'use client';

/**
 * Account screen.
 *
 * One page for what the signed-in user owns: their business profile (retailer or wholesaler), delivery
 * addresses, compliance documents, active sessions and recent security events. Every mutation goes to
 * the API; the screen never decides whether a document is valid or whether an address is default.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { formatDate, formatDateTime, formatRelative, humanise, statusTone } from '../../../lib/format';
import type {
  BuyerAddress,
  BuyerDocument,
  BuyerProfile,
  SecurityOverview,
  StaffSession,
  SupplierProfile,
} from '../../../lib/types';

type Tab = 'profile' | 'addresses' | 'documents' | 'security';

const ADDRESS_EMPTY = {
  label: 'Main Store',
  contactName: '',
  contactPhone: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  postalCode: '',
  isDefault: false,
};

export default function AccountPage() {
  const { ready, principal, request, refreshPrincipal } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null>(null);
  const [supplierProfile, setSupplierProfile] = useState<SupplierProfile | null>(null);
  const [addresses, setAddresses] = useState<BuyerAddress[]>([]);
  const [documents, setDocuments] = useState<BuyerDocument[]>([]);
  const [sessions, setSessions] = useState<StaffSession[]>([]);
  const [security, setSecurity] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(ADDRESS_EMPTY);
  const [saving, setSaving] = useState(false);

  const isBuyer = Boolean(principal?.buyer);
  const isSupplier = Boolean(principal?.supplier);

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setError(null);
    const safe = async <T,>(path: string): Promise<T | null> => {
      try {
        return await request<T>(path);
      } catch {
        return null;
      }
    };
    try {
      const [sessionsResult, securityResult] = await Promise.all([
        safe<StaffSession[]>('/auth/sessions'),
        safe<SecurityOverview>('/me/security'),
      ]);
      setSessions(sessionsResult ?? []);
      setSecurity(securityResult);

      if (isBuyer) {
        const [profile, addressList, documentList] = await Promise.all([
          safe<BuyerProfile>('/buyer/profile'),
          safe<BuyerAddress[]>('/buyer/addresses'),
          safe<BuyerDocument[]>('/buyer/documents'),
        ]);
        setBuyerProfile(profile);
        setAddresses(addressList ?? []);
        setDocuments(documentList ?? []);
      }
      if (isSupplier) {
        setSupplierProfile(await safe<SupplierProfile>('/supplier/profile'));
      }
    } finally {
      setLoading(false);
    }
  }, [principal, request, isBuyer, isSupplier]);

  useEffect(() => {
    if (!ready) return;
    if (!principal) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That change was not accepted.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) return <p className="muted">Loading your account…</p>;

  if (!principal) {
    return (
      <section className="stack">
        <h1>Account</h1>
        <p className="muted">Sign in to see your business profile, addresses and compliance documents.</p>
        <Link className="btn primary" href="/login?next=%2Faccount">
          Sign in
        </Link>
      </section>
    );
  }

  const tabs: Array<{ id: Tab; label: string; visible: boolean }> = [
    { id: 'profile', label: 'Business profile', visible: true },
    { id: 'addresses', label: 'Addresses', visible: isBuyer },
    { id: 'documents', label: 'Documents', visible: isBuyer },
    { id: 'security', label: 'Security', visible: true },
  ];

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>Account</h1>
        <p className="muted small" style={{ margin: 0 }}>
          {principal.displayName} · {principal.email ?? principal.phone} ·{' '}
          {principal.roles.map(humanise).join(', ')}
          {principal.organization?.name ? ` · ${principal.organization.name}` : ''}
        </p>
      </header>

      <nav className="row" style={{ gap: 'var(--space-2)' }} aria-label="Account sections">
        {tabs
          .filter((entry) => entry.visible)
          .map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? 'btn primary small' : 'btn small'}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
      </nav>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}

      {tab === 'profile' && (
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {buyerProfile && (
            <div className="card stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{buyerProfile.businessName}</h2>
                <span className={`badge ${statusTone(buyerProfile.verificationStatus)}`}>
                  {humanise(buyerProfile.verificationStatus)}
                </span>
              </div>
              <dl className="definition-grid">
                <div>
                  <dt>Store</dt>
                  <dd>{buyerProfile.storeName}</dd>
                </div>
                <div>
                  <dt>Business type</dt>
                  <dd>{humanise(buyerProfile.businessType)}</dd>
                </div>
                <div>
                  <dt>GSTIN</dt>
                  <dd>{buyerProfile.gstin ?? '—'}</dd>
                </div>
                <div>
                  <dt>Drug licence reference</dt>
                  <dd>{buyerProfile.licenseReference ?? '—'}</dd>
                </div>
                <div>
                  <dt>Credit terms</dt>
                  <dd>{buyerProfile.creditTermsDays} day(s)</dd>
                </div>
                <div>
                  <dt>Verified</dt>
                  <dd>{formatDate(buyerProfile.verifiedAt)}</dd>
                </div>
              </dl>
              <p className="small faint" style={{ margin: 0 }}>
                Business identity changes are reviewed by BEZZO operations; the API owns that workflow.
              </p>
            </div>
          )}

          {supplierProfile && (
            <div className="card stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{supplierProfile.displayName}</h2>
                <span className={`badge ${statusTone(supplierProfile.verificationStatus)}`}>
                  {humanise(supplierProfile.verificationStatus)}
                </span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {supplierProfile.legalName}
                {supplierProfile.rejectionReason ? ` · rejected: ${supplierProfile.rejectionReason}` : ''}
              </p>
              <dl className="definition-grid">
                <div>
                  <dt>GSTIN</dt>
                  <dd>{supplierProfile.gstin ?? '—'}</dd>
                </div>
                <div>
                  <dt>PAN</dt>
                  <dd>{supplierProfile.pan ?? '—'}</dd>
                </div>
                <div>
                  <dt>Pickup address</dt>
                  <dd>
                    {[supplierProfile.pickupAddress, supplierProfile.locality, supplierProfile.city]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{supplierProfile.contactPhone ?? supplierProfile.contactEmail ?? '—'}</dd>
                </div>
                <div>
                  <dt>Listings</dt>
                  <dd>
                    {supplierProfile.stats.listings} total · {supplierProfile.stats.activeListings} active
                  </dd>
                </div>
                <div>
                  <dt>Low stock</dt>
                  <dd>{supplierProfile.stats.lowStockItems}</dd>
                </div>
              </dl>
              <Link className="btn small" href="/supplier" style={{ alignSelf: 'flex-start' }}>
                Open supplier workspace
              </Link>
            </div>
          )}

          <div className="card stack">
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Roles and permissions</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Effective permissions on this session — every API call is authorized against this list plus
              object ownership and resource state.
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {principal.roles.map((role) => (
                <span className="badge info" key={role}>
                  {humanise(role)}
                </span>
              ))}
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {principal.permissions.map((permission) => (
                <span className="badge" key={permission}>
                  {permission}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="btn small"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void run(refreshPrincipal, 'Roles refreshed from the server.')}
            >
              Refresh from server
            </button>
          </div>
        </div>
      )}

      {tab === 'addresses' && isBuyer && (
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Contact</th>
                  <th style={{ width: 140 }}>Flags</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {addresses.map((address) => (
                  <tr key={address.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{address.label ?? 'Address'}</div>
                      <div className="small faint">
                        {[address.addressLine1, address.addressLine2, address.landmark].filter(Boolean).join(', ')}
                      </div>
                      <div className="small faint">
                        {[address.city, address.state, address.postalCode, address.country].filter(Boolean).join(', ')}
                      </div>
                    </td>
                    <td>
                      <div>{address.contactName}</div>
                      <div className="small faint">{address.contactPhone}</div>
                    </td>
                    <td>
                      {address.isDefault && <span className="badge ok">Default</span>}
                      {address.latitude !== null && <div className="small faint">Geocoded</div>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small"
                        disabled={saving}
                        onClick={() =>
                          void run(
                            () => request(`/buyer/addresses/${address.id}`, { method: 'DELETE' }),
                            'Address removed.',
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {addresses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No delivery addresses saved yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form
            className="card stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  request('/buyer/addresses', {
                    method: 'POST',
                    body: {
                      ...form,
                      addressLine2: form.addressLine2 || null,
                      landmark: form.landmark || null,
                      country: 'IN',
                    },
                  }),
                'Address saved.',
              ).then(() => setForm(ADDRESS_EMPTY));
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Add a delivery address</h2>
            <div className="form-grid">
              {(
                [
                  ['label', 'Label', true],
                  ['contactName', 'Contact name', true],
                  ['contactPhone', 'Contact phone', true],
                  ['addressLine1', 'Address line 1', true],
                  ['addressLine2', 'Address line 2', false],
                  ['landmark', 'Landmark', false],
                  ['city', 'City', true],
                  ['state', 'State', true],
                  ['postalCode', 'PIN code', true],
                ] as Array<[keyof typeof ADDRESS_EMPTY, string, boolean]>
              ).map(([field, label, required]) => (
                <label className="field" key={field}>
                  <span>
                    {label} {required && <span className="faint">*</span>}
                  </span>
                  <input
                    required={required}
                    value={String(form[field] ?? '')}
                    onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  />
                </label>
              ))}
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
                />
                <span>Use as my default delivery address</span>
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? 'Saving…' : 'Save address'}
            </button>
          </form>
        </div>
      )}

      {tab === 'documents' && isBuyer && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th style={{ width: 150 }}>Number</th>
                <th style={{ width: 130 }}>Status</th>
                <th style={{ width: 130 }}>Expiry</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>{humanise(document.documentType)}</td>
                  <td>{document.documentNumber ?? '—'}</td>
                  <td>
                    <span className={`badge ${statusTone(document.status)}`}>{humanise(document.status)}</span>
                    {document.rejectionReason && <div className="small faint">{document.rejectionReason}</div>}
                  </td>
                  <td>{formatDate(document.expiresAt)}</td>
                  <td>
                    {document.downloadUrl ? (
                      <a className="btn small" href={document.downloadUrl} rel="noreferrer" target="_blank">
                        View
                      </a>
                    ) : (
                      <span className="small faint">No file</span>
                    )}
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No compliance documents on file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="small faint" style={{ marginTop: 'var(--space-3)' }}>
            Documents are reviewed by BEZZO operations. Uploading replaces the previous submission and moves
            the account back into review.
          </p>
        </div>
      )}

      {tab === 'security' && (
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card stack">
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Active sessions</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th style={{ width: 160 }}>Signed in</th>
                  <th style={{ width: 160 }}>Expires</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <div>{session.deviceName ?? humanise(session.deviceType) ?? 'Unknown device'}</div>
                      <div className="small faint">
                        {session.authenticationMethod} · {session.ipAddress ?? 'ip unavailable'}
                        {session.current ? ' · this session' : ''}
                      </div>
                    </td>
                    <td>{formatRelative(session.createdAt)}</td>
                    <td>{formatDateTime(session.expiresAt)}</td>
                    <td>
                      {!session.current && (
                        <button
                          type="button"
                          className="btn small"
                          disabled={saving}
                          onClick={() =>
                            void run(
                              () => request(`/auth/sessions/${session.id}`, { method: 'DELETE' }),
                              'Session revoked.',
                            )
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card stack">
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Recent security events</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Account locked until {formatDateTime(security?.lockedUntil)} · password last changed{' '}
              {formatDate(security?.passwordUpdatedAt)}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th style={{ width: 200 }}>Identifier</th>
                  <th style={{ width: 140 }}>IP</th>
                  <th style={{ width: 150 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {(security?.recentEvents ?? []).map((event, index) => (
                  <tr key={`${event.eventType}-${event.createdAt}-${index}`}>
                    <td>
                      <span className={`badge ${event.success ? 'ok' : 'danger'}`}>
                        {event.success ? 'Success' : 'Failed'}
                      </span>{' '}
                      {event.eventType}
                      {event.reason ? <div className="small faint">{event.reason}</div> : null}
                    </td>
                    <td>{event.identifier ?? '—'}</td>
                    <td>{event.ipAddress ?? '—'}</td>
                    <td>{formatDateTime(event.createdAt)}</td>
                  </tr>
                ))}
                {(security?.recentEvents ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No recent security events.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

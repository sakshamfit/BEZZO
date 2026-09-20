'use client';

/**
 * Partner-application queue — the operations side of the public apply form.
 *
 * Every application the WhatsApp line receives is also a row here, so nothing depends on someone
 * scrolling a chat at the right moment. The queue is permission-gated on the server
 * (`admin.application.read`); this screen only mirrors that decision and never assumes authority.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { ApiError } from '../../../../lib/api';
import { formatDateTime, humanise } from '../../../../lib/format';
import type { ApplicationStatusCounts, PartnerApplication, PartnerApplicationStatus } from '../../../../lib/types';

const STATUSES: PartnerApplicationStatus[] = ['NEW', 'CONTACTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE'];
const TYPES = ['SUPPLIER', 'RETAILER', 'PICKER', 'PARTNER'] as const;

/** Status → chip variant, so the queue reads at a glance. */
const CHIP: Record<PartnerApplicationStatus, string> = {
  NEW: 'info',
  CONTACTED: 'warn',
  IN_REVIEW: 'warn',
  APPROVED: 'ok',
  REJECTED: 'danger',
  DUPLICATE: 'plain',
};

interface ApplicationSummary {
  statusCounts: ApplicationStatusCounts;
  total: number;
  awaitingReview: string | null;
  whatsappNumber: string;
}

export default function AdminApplicationsPage() {
  const { ready, principal, hasPermission, request } = useAuth();
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [statusCounts, setStatusCounts] = useState<ApplicationStatusCounts>({});
  const [summary, setSummary] = useState<ApplicationSummary | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [applicationType, setApplicationType] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const allowed = hasPermission('admin.application.read');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (status) query.set('status', status);
      if (applicationType) query.set('applicationType', applicationType);
      if (search.trim()) query.set('search', search.trim());
      query.set('pageSize', '50');
      // `request` unwraps the envelope; pagination and the status counters arrive separately, which is
      // why the counters are read from the list payload's own endpoint shape.
      const [rows, summary] = await Promise.all([
        request<PartnerApplication[]>(`/admin/applications?${query.toString()}`),
        request<ApplicationSummary>('/admin/applications/summary').catch(() => null),
      ]);
      setApplications(rows);
      setSummary(summary);
      setTotalItems(summary?.total ?? rows.length);
      setStatusCounts(summary?.statusCounts ?? {});
    } catch (caught) {
      setError(caught instanceof ApiError ? `${caught.code}: ${caught.message}` : 'Could not load applications');
    } finally {
      setLoading(false);
    }
  }, [allowed, applicationType, request, search, status]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const move = useCallback(
    async (applicationId: string, nextStatus: PartnerApplicationStatus) => {
      setBusyId(applicationId);
      try {
        await request(`/admin/applications/${applicationId}`, {
          method: 'PATCH',
          body: { status: nextStatus, reviewNotes: notes.trim() || undefined },
        });
        setNotes('');
        setOpenId(null);
        await load();
      } catch (caught) {
        setError(caught instanceof ApiError ? `${caught.code}: ${caught.message}` : 'Update failed');
      } finally {
        setBusyId(null);
      }
    },
    [load, notes, request],
  );

  const counters = useMemo(() => {
    const entries = Object.entries(statusCounts).filter(([, value]) => value > 0);
    return entries.length > 0 ? entries : [['NEW', applications.filter((row) => row.status === 'NEW').length] as const];
  }, [applications, statusCounts]);

  if (!ready) {
    return <p className="muted">Restoring your session…</p>;
  }

  if (!principal || !allowed) {
    return (
      <div className="card feature stack">
        <h1>Operations access required</h1>
        <p className="muted">
          The partner-application queue is limited to BEZZO operations and administrators
          (<span className="mono">admin.application.read</span>). Signed in as{' '}
          {principal ? principal.displayName : 'a guest'}.
        </p>
        <div className="row">
          <Link className="btn primary" href="/login?next=%2Fadmin%2Fapplications">
            Sign in
          </Link>
          <Link className="btn" href="/apply">
            Open the public apply form
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Partner applications</h1>
          <p>
            Every submission from the apply form lands here <em>and</em> on the operations WhatsApp line, so a
            person can follow up without losing the record.
          </p>
        </div>
        <div className="row">
          {counters.map(([key, value]) => (
            <span key={key} className={`chip ${CHIP[key as PartnerApplicationStatus] ?? 'plain'}`}>
              {humanise(key)} {value}
            </span>
          ))}
        </div>
      </div>

      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card tight">
        <div className="filters">
          <label className="field">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, business, name or phone"
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {humanise(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select value={applicationType} onChange={(event) => setApplicationType(event.target.value)}>
              <option value="">All types</option>
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {humanise(value)}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {applications.length === 0 ? (
          <p className="muted">
            {loading ? 'Loading applications…' : 'No applications match these filters yet.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Applicant</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Received</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id}>
                    <td>
                      <div className="mono small">{application.reference}</div>
                      <div className="chip plain">{humanise(application.applicationType)}</div>
                    </td>
                    <td>
                      <strong>{application.businessName}</strong>
                      <div className="small muted">{application.applicantName}</div>
                      {application.gstin || application.licenceReference ? (
                        <div className="small faint mono">
                          {application.gstin ?? '—'} · {application.licenceReference ?? 'no licence on file'}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="small">{application.contactPhone}</div>
                      <div className="row" style={{ gap: 'var(--space-2)' }}>
                        <a className="link small" href={application.whatsappUrl} target="_blank" rel="noreferrer">
                          WhatsApp
                        </a>
                        <a className="link small" href={`tel:${application.contactPhone}`}>
                          Call
                        </a>
                      </div>
                    </td>
                    <td className="small">
                      {application.city}, {application.state}
                      {application.postalCode ? <div className="faint mono">{application.postalCode}</div> : null}
                    </td>
                    <td className="small">{formatDateTime(application.createdAt)}</td>
                    <td>
                      <span className={`chip ${CHIP[application.status] ?? 'plain'}`}>
                        {humanise(application.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          setOpenId(openId === application.id ? null : application.id);
                          setNotes(application.reviewNotes ?? '');
                        }}
                      >
                        {openId === application.id ? 'Close' : 'Review'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {applications.length > 0 ? (
          <p className="small faint" style={{ marginTop: 'var(--space-sm)' }}>
            {applications.length} of {totalItems} application(s){status ? ` · filtered to ${humanise(status)}` : ''}
            {summary?.awaitingReview
              ? ` · oldest unreviewed ${formatDateTime(summary.awaitingReview)}`
              : ' · queue is clear'}
          </p>
        ) : null}
      </div>

      {openId
        ? (() => {
            const application = applications.find((row) => row.id === openId);
            if (!application) return null;
            return (
              <div className="card feature stack">
                <div className="spread">
                  <div>
                    <p className="eyebrow">Review</p>
                    <h2>
                      {application.reference} · {application.businessName}
                    </h2>
                    <p className="muted small" style={{ maxWidth: '70ch' }}>
                      {application.message ?? 'The applicant left no additional note.'}
                    </p>
                  </div>
                  <span className={`chip ${CHIP[application.status]}`}>{humanise(application.status)}</span>
                </div>

                <div className="definition-grid">
                  <dt>Applicant</dt>
                  <dd>{application.applicantName}</dd>
                  <dt>Phone</dt>
                  <dd className="mono">{application.contactPhone}</dd>
                  <dt>Email</dt>
                  <dd>{application.contactEmail ?? '—'}</dd>
                  <dt>GSTIN</dt>
                  <dd className="mono">{application.gstin ?? '—'}</dd>
                  <dt>Drug licence</dt>
                  <dd className="mono">{application.licenceReference ?? '—'}</dd>
                  <dt>Years in business</dt>
                  <dd>{application.yearsInBusiness ?? '—'}</dd>
                  <dt>Expected volume</dt>
                  <dd>{application.monthlyVolume ?? '—'}</dd>
                  <dt>Routed to</dt>
                  <dd className="mono">{application.routedToDisplay}</dd>
                </div>

                <label className="field">
                  <span>Review notes (kept with the audit trail)</span>
                  <textarea
                    value={notes}
                    maxLength={1000}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Documents requested, call outcome, reason for rejection…"
                  />
                </label>

                <div className="row">
                  {STATUSES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn small${value === 'APPROVED' ? ' accent' : ''}`}
                      disabled={busyId === application.id || value === application.status}
                      onClick={() => void move(application.id, value)}
                    >
                      {humanise(value)}
                    </button>
                  ))}
                </div>
                <p className="small faint" style={{ margin: 0 }}>
                  Approving an application does not create an account: verification documents are still collected
                  and reviewed before onboarding.
                </p>
              </div>
            );
          })()
        : null}
    </div>
  );
}

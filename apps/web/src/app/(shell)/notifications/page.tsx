'use client';

/**
 * Notifications screen.
 *
 * In-app notifications are the channel that always works (the infrastructure spec makes IN_APP the
 * guaranteed delivery path and treats unconfigured channels as FAILED rather than silently successful).
 * Read state is owned by the API; this screen only asks for the transition.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { formatRelative, humanise, statusTone } from '../../../lib/format';
import type { NotificationItem, NotificationPreference, Paginated } from '../../../lib/types';

export default function NotificationsPage() {
  const { ready, principal, request } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [pagination, setPagination] = useState<Paginated<NotificationItem>['pagination'] | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setError(null);
    try {
      const result = await request<Paginated<NotificationItem>>(
        `/notifications?page=${page}&pageSize=20${unreadOnly ? '&unreadOnly=true' : ''}`,
      );
      setItems(result.items);
      setPagination(result.pagination);
      setPreferences(await request<NotificationPreference[]>('/notification-preferences'));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Notifications could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [principal, request, page, unreadOnly]);

  useEffect(() => {
    if (!ready) return;
    if (!principal) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, principal, load]);

  async function act(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : failure);
    } finally {
      setBusy(false);
    }
  }

  if (!ready || loading) return <p className="muted">Loading notifications…</p>;

  if (!principal) {
    return (
      <section className="stack">
        <h1>Notifications</h1>
        <p className="muted">Sign in to see order, pickup and compliance updates addressed to you.</p>
        <Link className="btn primary" href="/login?next=%2Fnotifications">
          Sign in
        </Link>
      </section>
    );
  }

  const unreadCount = items.filter((item) => !item.read).length;

  return (
    <section className="stack" style={{ gap: 'var(--space-4)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Notifications</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {pagination ? `${pagination.totalItems} total` : ''} {unreadCount > 0 ? `· ${unreadCount} unread on this page` : ''}
          </p>
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <label className="row small" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => {
                setUnreadOnly(event.target.checked);
                setPage(1);
              }}
            />
            Unread only
          </label>
          <button
            type="button"
            className="btn small"
            disabled={busy || unreadCount === 0}
            onClick={() =>
              void act(() => request('/notifications/read-all', { method: 'POST' }), 'Could not mark all as read.')
            }
          >
            Mark all read
          </button>
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {items.map((item) => (
          <article className={`card stack ${item.read ? '' : 'unread'}`} key={item.id} style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{item.title}</strong>
              <span className="small faint">{formatRelative(item.createdAt)}</span>
            </div>
            <p className="small" style={{ margin: 0 }}>
              {item.body}
            </p>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="badge">{humanise(item.type)}</span>
              <span className={`badge ${statusTone(item.status)}`}>{humanise(item.status)}</span>
              <span className="badge">{item.channel}</span>
              {item.referenceType && (
                <span className="badge info">
                  {humanise(item.referenceType)}
                  {item.referenceId ? ` · ${item.referenceId.slice(0, 8)}` : ''}
                </span>
              )}
              {!item.read && (
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () => request(`/notifications/${item.id}/read`, { method: 'PATCH' }),
                      'Could not mark that notification as read.',
                    )
                  }
                >
                  Mark read
                </button>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && (
          <div className="card muted">
            Nothing to show{unreadOnly ? ' — no unread notifications.' : ' yet.'} Order confirmations, pickup
            milestones, hub receipts and delivery updates appear here.
          </div>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn small"
            disabled={page <= 1 || busy}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="small muted">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            className="btn small"
            disabled={page >= pagination.totalPages || busy}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      )}

      {preferences.length > 0 && (
        <div className="card stack">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Channel preferences</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th style={{ width: 120 }}>Channel</th>
                <th style={{ width: 110 }}>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {preferences.map((preference) => (
                <tr key={`${preference.eventType}-${preference.channel}`}>
                  <td>{humanise(preference.eventType)}</td>
                  <td>{preference.channel}</td>
                  <td>
                    <span className={`badge ${preference.enabled ? 'ok' : ''}`}>
                      {preference.enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

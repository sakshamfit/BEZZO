'use client';

/**
 * Operations home — the admin's launch pad.
 *
 * Tiles to every operations surface that exists today (applications queue,
 * payments backoffice, platform status), with an honest picture of coverage:
 * no tile is shown for a tool that does not exist yet. Access to each surface
 * is still decided server-side from role and permission.
 */
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { humanise } from '../../lib/format';
import { ChevronRight, ReceiptIcon, ShieldIcon, TagIcon } from '../../components/icons';

export default function AdminHomePage() {
  const { ready, principal } = useAuth();

  if (!ready) {
    return (
      <div className="container" aria-busy="true">
        <div className="skeleton" style={{ height: 30, width: 240, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <ShieldIcon size={24} />
          </span>
          <span className="ec-title">Operations sign-in required</span>
          <div className="ec-actions">
            <Link className="btn primary small" href="/login?next=%2Fadmin">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tiles = [
    {
      href: '/admin/applications',
      title: 'Applications',
      body: 'Partner intake queue — suppliers, stores and pickers awaiting human verification.',
      icon: <TagIcon size={20} />,
    },
    {
      href: '/admin/payments',
      title: 'Payments',
      body: 'Payment backoffice — attempts, webhook evidence, refunds and reconciliation.',
      icon: <ReceiptIcon size={20} />,
    },
    {
      href: '/status',
      title: 'Platform status',
      body: 'Health of the API, database, search and provider adapters.',
      icon: <ShieldIcon size={20} />,
    },
  ];

  return (
    <div className="container">
      <header style={{ marginBottom: 'var(--space-4)' }}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Operations
        </p>
        <h1 style={{ fontSize: '1.375rem', margin: 0 }}>BEZZO operations centre</h1>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          {principal.displayName} · {principal.roles.map(humanise).join(', ')}
        </p>
      </header>

      <div className="cat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="cat-card">
            <span className="ct-visual" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>
              {tile.icon}
            </span>
            <span className="cc-body">
              <span className="cc-name">{tile.title}</span>
              <span className="cc-count">{tile.body}</span>
            </span>
            <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)', flex: '0 0 auto' }} />
          </Link>
        ))}
      </div>

      <p className="hint" style={{ marginTop: 'var(--space-4)' }}>
        Each surface re-authorizes every request server-side; this page only organizes the entry
        points. More operational surfaces (pickup dispatch, hubs, disputes, audit logs) appear here as
        the platform ships them.
      </p>
    </div>
  );
}

import Link from 'next/link';
import { serverGet } from '../lib/api';
import type { HealthSnapshot, VersionSnapshot } from '../lib/types';

export const dynamic = 'force-dynamic';

/**
 * Landing page.
 *
 * Server-rendered so the platform's own health is visible even before a browser signs in, and so the
 * page never shows a blank screen when the API is unavailable: a failed fetch degrades to an explicit
 * "status unavailable" panel.
 */
export default async function HomePage() {
  const [healthEnvelope, versionEnvelope] = await Promise.all([
    serverGet<HealthSnapshot>('/health'),
    serverGet<VersionSnapshot>('/version'),
  ]);

  const health = healthEnvelope?.data ?? null;
  const version = versionEnvelope?.data ?? null;

  const stages = [
    { title: 'Order', detail: 'The retailer places a single order; pricing and stock are validated server-side.' },
    { title: 'Fulfilment', detail: 'One order splits into one fulfilment per supplier — never a generic order state.' },
    { title: 'Pickup', detail: 'A picker is offered the collection task; exactly one picker can claim it.' },
    { title: 'Hub receiving', detail: 'Every package is scanned into the Bezzo hub; discrepancies stay visible.' },
    { title: 'Delivery', detail: 'The hub dispatches to the retailer through the logistics provider adapter.' },
  ];

  const audiences = [
    {
      title: 'Medical stores',
      body: 'Source from verified wholesalers, see live trade prices and stock, and track every stage to your counter.',
      href: '/catalog',
      cta: 'Browse the catalogue',
    },
    {
      title: 'Wholesalers',
      body: 'Publish offers and stock, receive pickup tasks before the cut-off, and reconcile settlements.',
      href: '/supplier',
      cta: 'Open the supplier workspace',
    },
    {
      title: 'Pickers',
      body: 'Claim collection tasks, scan packages at the supplier and hand them over at the hub.',
      href: '/login',
      cta: 'Sign in to the picker app',
    },
    {
      title: 'Operations',
      body: 'Verify suppliers and stores, resolve discrepancies, and watch platform health and queues.',
      href: '/status',
      cta: 'View platform status',
    },
  ];

  return (
    <>
      <section className="hero">
        <h1>Verified wholesalers. Verified pharmacies. One controlled supply chain.</h1>
        <p>
          BEZZO is the B2B pharmaceutical marketplace between licensed wholesalers and licensed medical
          stores, with Bezzo-collected pickups, hub receiving and final delivery tracked as separate,
          auditable stages.
        </p>
        <div className="row">
          <Link className="btn primary" href="/catalog">
            Browse the catalogue
          </Link>
          <Link className="btn" href="/register">
            Register your business
          </Link>
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid grid-4" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="kpi">
          <div className="label">Platform</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>
            {health ? (
              <span className={`badge ${health.status === 'ok' ? 'ok' : 'warn'}`}>{health.status.toUpperCase()}</span>
            ) : (
              <span className="badge danger">UNAVAILABLE</span>
            )}
          </div>
          <div className="small muted">{version ? `v${version.version} · ${version.environment}` : 'API not reachable'}</div>
        </div>
        <div className="kpi">
          <div className="label">Database</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>
            {health?.dependencies?.database ? (
              <span className={`badge ${health.dependencies.database.status === 'ok' ? 'ok' : 'danger'}`}>
                {health.dependencies.database.status.toUpperCase()}
              </span>
            ) : (
              <span className="badge">—</span>
            )}
          </div>
          <div className="small muted">
            {health?.dependencies?.database?.latencyMs !== undefined
              ? `${health.dependencies.database.latencyMs} ms round-trip`
              : 'source of truth'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Search</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>
            {version ? (
              version.features?.search ? (
                <span className="badge ok">OPENSEARCH</span>
              ) : (
                <span className="badge warn">DEGRADED</span>
              )
            ) : (
              <span className="badge">—</span>
            )}
          </div>
          <div className="small muted">
            {version ? (version.features?.search ? 'primary search path' : 'database fallback in use') : '—'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Providers</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>
            {version ? (
              <span className="badge info">
                {String(version.features?.payments ?? '—').toUpperCase()} / {String(version.features?.logistics ?? '—').toUpperCase()}
              </span>
            ) : (
              <span className="badge">—</span>
            )}
          </div>
          <div className="small muted">payments / logistics adapters</div>
        </div>
      </section>

      <section style={{ marginBottom: 'var(--space-6)' }}>
        <div className="page-head">
          <div>
            <h2>One order, controlled stages</h2>
            <p>
              BEZZO never collapses physical movement into a single status. Each stage has its own entity,
              its own state machine and its own audit trail.
            </p>
          </div>
        </div>
        <div className="grid grid-3">
          {stages.map((stage, index) => (
            <div className="card" key={stage.title}>
              <div className="badge info">Stage {index + 1}</div>
              <h3 style={{ marginTop: 'var(--space-3)' }}>{stage.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {stage.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="page-head">
          <div>
            <h2>Built for every role on the platform</h2>
            <p>Access is decided server-side from role, permission, ownership and resource state.</p>
          </div>
        </div>
        <div className="grid grid-4">
          {audiences.map((audience) => (
            <div className="card" key={audience.title}>
              <h3>{audience.title}</h3>
              <p className="muted small">{audience.body}</p>
              <Link className="btn small" href={audience.href}>
                {audience.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {version && (
        <section style={{ marginTop: 'var(--space-6)' }}>
          <div className="card tight">
            <div className="spread">
              <span className="small muted">
                API base path <span className="mono">{version.apiBasePath}</span> · worker{' '}
                {version.features?.worker ? 'enabled' : 'disabled'} · storage{' '}
                {String(version.features?.storage ?? '—')}
              </span>
              <span className="small muted">
                Interactive API reference is available at{' '}
                <a href="/api/v1/../.." className="mono" style={{ pointerEvents: 'none' }}>
                  the API origin
                </a>{' '}
                <span className="faint">/docs (non-production)</span>
              </span>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

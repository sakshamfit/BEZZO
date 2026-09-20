/**
 * Platform status.
 *
 * A server component on purpose: it reads `/health` and `/version` over the private network, so the page
 * tells the truth about the running deployment even when the browser cannot reach the API directly. A
 * dependency that is unavailable renders as unavailable — never as "all good".
 */
import { formatDateTime } from '../../../lib/format';
import type { HealthSnapshot, VersionSnapshot } from '../../../lib/types';

export const dynamic = 'force-dynamic';

const ROOT_API_URL = process.env.BEZZO_API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

async function fetchRoot<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${ROOT_API_URL}${path}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: T } | T;
    return payload && typeof payload === 'object' && 'data' in payload
      ? ((payload as { data?: T }).data ?? null)
      : (payload as T);
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const [health, version] = await Promise.all([
    fetchRoot<HealthSnapshot>('/health'),
    fetchRoot<VersionSnapshot>('/version'),
  ]);

  return (
    <section className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>Platform status</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Live readiness of the BEZZO API and the infrastructure it depends on. Degraded modes are shown as
          degraded: the marketplace keeps serving canonical data, it does not pretend the missing dependency
          is healthy.
        </p>
      </header>

      {!health && (
        <div className="alert" role="alert">
          The API health endpoint could not be reached from this deployment. Nothing else on this page can be
          verified.
        </div>
      )}

      {health && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
              {health.service} · {health.version}
            </h2>
            <span className={`badge ${health.status === 'ok' ? 'ok' : 'warn'}`}>{health.status.toUpperCase()}</span>
          </div>
          <dl className="definition-grid">
            <div>
              <dt>Environment</dt>
              <dd>{health.environment}</dd>
            </div>
            <div>
              <dt>Uptime</dt>
              <dd>{Math.floor(health.uptimeSeconds / 60)} min</dd>
            </div>
            <div>
              <dt>Background workers</dt>
              <dd>{health.worker?.enabled ? 'Running' : 'Disabled in this deployment'}</dd>
            </div>
            <div>
              <dt>Checked at</dt>
              <dd>{formatDateTime(health.timestamp)}</dd>
            </div>
          </dl>
        </div>
      )}

      {health && (
        <div className="card">
          <h2 style={{ fontSize: '1.05rem' }}>Dependencies</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Dependency</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 110 }}>Latency</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(health.dependencies ?? {}).map(([name, dependency]) => (
                <tr key={name}>
                  <td style={{ fontWeight: 600 }}>{name}</td>
                  <td>
                    <span className={`badge ${dependency.status === 'ok' ? 'ok' : 'warn'}`}>
                      {dependency.status}
                    </span>
                  </td>
                  <td>{dependency.latencyMs !== undefined ? `${dependency.latencyMs} ms` : '—'}</td>
                  <td className="small faint">
                    {[
                      dependency.driver,
                      dependency.provider ? `provider: ${dependency.provider}` : null,
                      dependency.degraded ? 'degraded mode' : null,
                      dependency.usedInMemoryFallback ? 'in-process fallback' : null,
                      dependency.pendingJobs !== undefined ? `${dependency.pendingJobs} pending jobs` : null,
                      dependency.pool
                        ? `pool ${dependency.pool.total} total / ${dependency.pool.idle} idle / ${dependency.pool.waiting} waiting`
                        : null,
                      dependency.error,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {version && (
        <div className="card stack">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Build and feature flags</h2>
          <p className="small muted" style={{ margin: 0 }}>
            API base path {version.apiBasePath} · {version.environment}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Capability</th>
                <th style={{ width: 220 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(version.features ?? {}).map(([feature, value]) => (
                <tr key={feature}>
                  <td>{feature}</td>
                  <td>
                    <span className={`badge ${value === true ? 'ok' : value === false ? '' : 'info'}`}>
                      {String(value)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Not yet shipped</h2>
        <p className="small muted" style={{ margin: 0 }}>
          This page reports what is actually running. Order placement, payments, picker collection, hub
          receiving, delivery dispatch and the admin console are separate vertical slices; until a slice is
          implemented its screens are deliberately absent rather than mocked.
        </p>
      </div>
    </section>
  );
}

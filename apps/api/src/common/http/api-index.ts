/**
 * API index page (`GET /`).
 *
 * The API is a machine interface: every route lives under the versioned base path and speaks the
 * standard envelope. A bare `GET /` would otherwise answer with a 404 envelope, which is a poor
 * signal for operators, load-balancer checks and anyone opening the service in a browser.
 *
 * This page is intentionally data-free: it exposes only what `/health`, `/version` and the published
 * documentation already expose — no configuration values, no connections strings, no secrets.
 */

export interface ApiIndexOptions {
  serviceName: string;
  version: string;
  environment: string;
  basePath: string;
  docsEnabled: boolean;
}

export function renderApiIndex(options: ApiIndexOptions): string {
  const docsLink = options.docsEnabled
    ? `<li><a href="/docs">/docs</a> — interactive OpenAPI reference (Swagger UI)</li>`
    : '<li><em>OpenAPI reference is disabled in this environment</em></li>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.serviceName}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; padding: 2.5rem 1.25rem;
        font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        max-width: 46rem; margin-inline: auto;
      }
      h1 { font-size: 1.6rem; margin: 0 0 .25rem; letter-spacing: -.02em; }
      .sub { margin: 0 0 1.75rem; opacity: .75; font-size: .95rem; }
      code { background: rgba(127,127,127,.16); padding: .1rem .35rem; border-radius: 4px; font-size: .9em; }
      ul { padding-left: 1.15rem; }
      li { margin: .35rem 0; }
      a { color: inherit; }
      .grid { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1rem; margin: 1.25rem 0; }
      .grid dt { opacity: .7; }
      .grid dd { margin: 0; }
      footer { margin-top: 2.25rem; padding-top: 1rem; border-top: 1px solid rgba(127,127,127,.3); font-size: .85rem; opacity: .7; }
    </style>
  </head>
  <body>
    <h1>${options.serviceName} API</h1>
    <p class="sub">B2B pharmaceutical marketplace — server-authoritative marketplace, pickup and delivery workflows.</p>

    <dl class="grid">
      <dt>Environment</dt><dd><code>${options.environment}</code></dd>
      <dt>Version</dt><dd><code>${options.version}</code></dd>
      <dt>Base path</dt><dd><code>${options.basePath}</code></dd>
    </dl>

    <h2>Entry points</h2>
    <ul>
      <li><a href="/health">/health</a> — liveness, readiness and dependency status</li>
      <li><a href="/health/ready">/health/ready</a> — readiness gate (database, queue, providers)</li>
      <li><a href="/version">/version</a> — build metadata and enabled capabilities</li>
      ${docsLink}
      <li><code>${options.basePath}/…</code> — authenticated domain endpoints (bearer token)</li>
    </ul>

    <footer>
      Responses use the standard envelope: <code>{ success, data, meta }</code> and
      <code>{ success, error, meta }</code>. Mutations accept an <code>Idempotency-Key</code> header.
    </footer>
  </body>
</html>`;
}

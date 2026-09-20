# BEZZO — local development (sandbox / workstation)

This document records the exact, reproducible way to run BEZZO locally. It complements
`.env.example` (the documented configuration template) and `docs/00-repository-assessment.md`.

## 1. Prerequisites

| Component | Version used in this environment | Notes |
| --- | --- | --- |
| Node.js | 22.x | `node --version` |
| pnpm | 12.5.1 via `corepack pnpm` | the workspace pins the package manager |
| PostgreSQL | 17.x | required — PostgreSQL is the transactional source of truth |
| Redis | optional locally | when `REDIS_URL` is unset the platform runs an in-process cache fallback and reports it in `/health` |
| OpenSearch | optional locally | when `SEARCH_ENABLED=false` the degraded database search path is used and reported in `/health` |

Both fallbacks are deliberate degraded modes: the canonical data always lives in PostgreSQL.

## 2. Configuration

```bash
cp .env.example .env      # then edit; .env is gitignored and MUST NOT be committed
```

Rules enforced by the code:

- never commit real credentials — `.env` is gitignored, `.env.example` is the only template;
- the loader (`loadEnvFile`, exported by `@bezzo/config`) searches `.env` from the working directory
  upwards, so running from `apps/api` still picks up the repository-level file;
- a variable already present in the process environment always wins over `.env` (containers, CI and
  the secret manager take precedence);
- `loadConfig()` validates everything at boot and refuses to start on invalid or unsafe values.

## 3. Database

```bash
corepack pnpm db:migrate            # apply pending migrations (0013 + …)
corepack pnpm db:status             # applied vs pending
corepack pnpm db:seed               # reference + development seed data
corepack pnpm db:verify             # schema, constraints and seed expectations
corepack pnpm db:reset              # drop and recreate the schema (development only)
```

`DATABASE_URL` selects the environment database
(`bezzo_local` / `bezzo_test` / `bezzo_staging` / `bezzo_production`). Migration checksums are
verified on every run — an edited, already-applied migration is refused instead of silently applied.

Seeded development sign-ins (development seed only, never production):

| Role | Email | Password |
| --- | --- | --- |
| Super admin | `admin@bezzo.local` | `Bezzo@12345` |
| Operations | `ops@bezzo.local` | `Bezzo@12345` |
| Suppliers | `supplier1-3@bezzo.local` | `Bezzo@12345` |
| Retailers | `buyer1-2@bezzo.local` | `Bezzo@12345` |
| Pickers | `picker1-3@bezzo.local` | `Bezzo@12345` |

## 4. Build and run

```bash
corepack pnpm build                              # turbo: contracts → config → crypto → database → api → web
corepack pnpm --filter @bezzo/api start          # node dist/main.js
# or, with reload on change:
corepack pnpm --filter @bezzo/api dev
```

### Web application (`apps/web`)

Next.js 15 (App Router, React 19, TypeScript strict). It is a pure API consumer:

```bash
corepack pnpm --filter @bezzo/web dev      # next dev -H 0.0.0.0 -p 3000
corepack pnpm --filter @bezzo/web build    # production build (route-by-route type checking)
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `BEZZO_API_INTERNAL_URL` | `http://127.0.0.1:4000` | server-side base URL the web server proxies to |
| `BEZZO_API_BASE_PATH` | `/api/v1` | API version prefix |
| `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` | unset | shows the seeded demo logins on `/login` (development convenience only) |

The browser **never** talks to the API host directly. Every call is same-origin
(`/api/v1/...`) and `next.config.mjs` rewrites it to the internal URL, so the same build works behind
a sandbox proxy, a preview URL or the production CDN. `/health` and `/version` are proxied too, which
is what `/status` renders.

Host/origin notes for containerised and preview environments: both servers bind `0.0.0.0`, the API
reflects the request origin for CORS, and `allowedDevOrigins` in `next.config.mjs` accepts the
dynamic preview hosts. The API's own HTML pages (`/`, `/docs`) are deliberately embeddable — helmet's
`xFrameOptions` is disabled, while CSP and framing restrictions stay at the CDN/WAF layer.

The API binds `API_HOST`/`API_PORT` (default `0.0.0.0:4000`) and exposes:

| Path | Purpose |
| --- | --- |
| `/` | API index (service, environment, entry points) |
| `/health`, `/health/live`, `/health/ready` | liveness/readiness plus dependency status |
| `/version` | build metadata and enabled capabilities |
| `/metrics` | Prometheus metrics (`bezzo_*`) |
| `/docs` | interactive OpenAPI reference (non-production only) |
| `/api/v1/…` | the versioned domain API |

Smoke test with the seeded admin account:

```bash
curl -s -X POST http://127.0.0.1:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"admin@bezzo.local","password":"Bezzo@12345"}' | head -c 400
```

## 5. OpenAPI document

```bash
corepack pnpm openapi:export        # writes apps/api/openapi/bezzo-api.json
```

The exporter builds the real module graph from `dist/`, so the document always matches the deployed
application.

## 6. Conventions

- every response uses the standard envelope (`{ success, data, meta }` / `{ success, error, meta }`);
- routes marked `@Idempotent(...)` **require** an `Idempotency-Key` header (8–255 chars) and are
  enforced by `IdempotencyInterceptor`: the first request wins, a concurrent retry gets
  `IDEMPOTENCY_KEY_CONFLICT` (409), a completed retry replays the stored response, and reusing a key
  with a different body is rejected. The web client mints a key per logical mutation and reuses it
  across its own retries;
- empty JSON bodies are accepted: posting `content-type: application/json` with no body is treated as
  "no body" instead of a parse error, which is what mobile SDKs do on `DELETE`;
- clients identify themselves with `X-Client-Platform` (`web` / `android` / `ios` / `admin`);
- authorization is always re-evaluated server-side from role + permission + ownership + resource
  state; the client is never trusted.

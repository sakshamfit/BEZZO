# BEZZO — local development (sandbox / workstation)

This document records the exact, reproducible way to run BEZZO locally. It complements
`.env.example` (the documented configuration template) and `docs/00-repository-assessment.md`.

## 1. Prerequisites

| Component | Version used in this environment | Notes |
| --- | --- | --- |
| Node.js | 22.x | `node --version` |
| npm | 10.8.2 | pinned by the root `packageManager` field |
| PostgreSQL | 17.x | required — PostgreSQL is the transactional source of truth |
| Redis | optional locally | when `REDIS_URL` is unset the platform runs an in-process cache fallback and reports it in `/health` |
| OpenSearch | optional locally | when `SEARCH_ENABLED=false` the degraded database search path is used and reported in `/health` |

Both fallbacks are deliberate degraded modes: the canonical data always lives in PostgreSQL.
The committed `package-lock.json` is the dependency source of truth; run `npm ci` after checkout.
The supported runtime is Node.js 22.15 or newer (the current workstation Node 20.19 is below the
declared engine and cannot exercise Zstandard compression).

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
npm run migrate --workspace=@bezzo/database
npm run status --workspace=@bezzo/database
npm run seed --workspace=@bezzo/database
npm run verify --workspace=@bezzo/database
npm run reset --workspace=@bezzo/database   # destructive: development only
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
npm run build --workspace=@bezzo/contracts
npm run build --workspace=@bezzo/config
npm run build --workspace=@bezzo/crypto
npm run build --workspace=@bezzo/database
npm run build --workspace=@bezzo/api
npm run build --workspace=@bezzo/web
npm run start --workspace=@bezzo/api            # node dist/main.js
# or, with reload on change:
npm run dev --workspace=@bezzo/api
```

### Web application (`apps/web`)

Next.js 15 (App Router, React 19, TypeScript strict). It is a pure API consumer:

```bash
npm run dev --workspace=@bezzo/web      # next dev -H 0.0.0.0 -p 3000
npm run build --workspace=@bezzo/web    # production build (route-by-route type checking)
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

## 4b. Integration tests

The integration suite is **black-box**: it drives a booted API over HTTP instead of booting the Nest
application inside Jest. That is deliberate — the guards, the raw-body capture that webhook signatures
depend on, the request-context hook and the global filters are all installed by the bootstrap, so an
in-process test would exercise a slightly different wiring than the one that ships.

```bash
# 1. the API must be running (see above); point the suite elsewhere with BEZZO_API_URL
curl -s http://127.0.0.1:4000/health

# 2. run everything (~50 s: one test waits a full 30 s job cycle on purpose)
npm run test:integration --workspace=@bezzo/api

# one file
npm run test:integration --workspace=@bezzo/api -- test/security/rbac.spec.ts
```

| File | What it proves |
| --- | --- |
| `test/security/rbac.spec.ts` | The negative RBAC matrix: no non-admin role reaches an admin surface, no buyer reaches supplier surfaces, no token-less caller reaches anything. It exists because a metadata-key bug had made every `@Roles`/`@RequirePermissions` inert. |
| `test/payments/payments.spec.ts` | Capture confirms the order, a duplicate delivery is answered `DUPLICATE` and changes nothing, a forged signature is refused with 400 for both a new and an already-seen event id, failure keeps the order payable, retry captures, full/partial refunds move the state, over-refund and buyer refund are refused, and the backoffice trail is readable only with the permission. |
| `test/orders/reservation-commitment.spec.ts` | A cash-on-delivery reservation is committed with no expiry, survives a real expiry-job cycle, and returns its units when the order is cancelled; a prepaid reservation is committed by the capture. |

The suite uses the seeded development accounts (`Bezzo@12345`) and mutates real data, so run it against a
development database — never against staging or production.

### End-to-end verification scripts

Two scripts print the whole exchange rather than asserting it, which is what you want when a failure has
to be *read*. Both live in `scripts/verify/`, both take `BEZZO_API_URL` (default `http://127.0.0.1:4000`)
and both read `DATABASE_URL` from `.env` when the environment does not set it.

```bash
python3 scripts/verify/payments-e2e.py        # 33 assertions: capture, duplicate, forged signature, retry, refunds
python3 scripts/verify/reservations-e2e.py    # 10 assertions, ~60 s: committed COD hold survives a real job cycle
```

`reservations-e2e.py` waits for a full `reservations.expire` cycle (30 s cadence) on purpose — the claim
is a negative one, that a committed reservation is *not* released, so it must observe the real job.

## 5. OpenAPI document

```bash
npm run openapi:export --workspace=@bezzo/api  # writes apps/api/openapi/bezzo-api.json
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

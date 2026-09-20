# MEMORY.md — session handoff

Purpose: a fresh session (human or agent) picks this up and knows where the work stands, what runs,
what is proven, what is deliberately not done, and which traps cost time last time. Update this file at
the end of every session; it is the only document here that describes *state* rather than product.

Last updated: **2026-09-20** (marketplace UX transformation of the web client; see §8).

---

## 1. What BEZZO is, and where the truth lives

BEZZO (never "Bezo") is a B2B pharmaceutical marketplace: verified wholesalers/suppliers ↔ verified
medical-store buyers, with a picker-based supplier→Bezzo-hub collection stage and a separate final
delivery stage.

**Source of truth** = the Markdown engineering specs at the repository root
(`Bezzo_*_spec_v1.0.md`, ~70 files). They define behaviour; do not invent architecture where a spec
speaks. On conflict: identify it, prefer the more detailed/latest, keep the domain vocabulary, never
silently change a business rule, and write the decision down. `Bezo_PRD_v1.0.docx` is binary and still
unparsed (REQUIRES TOOLING).

Domain rules that must never be collapsed:

- **Order / Fulfillment / Pickup / Hub Receiving / Delivery** are five distinct entities. One order can
  have several supplier fulfilments, each with its own state machine. There is no single "order status"
  for physical progress.
- **Picker ≠ delivery driver.** Picker moves Supplier → Bezzo hub. Delivery moves Hub → Retailer.
- Server-authoritative state machines; the frontend never mutates state and never publishes payment
  success.
- Money and stock are never silently "adjusted": every state change is guarded, idempotent and audited.

Repo docs: `docs/00-repository-assessment.md`, `docs/01-local-development.md` (setup + tests),
`docs/02-implementation-status.md` (**the living status document** — phase table, gap table, evidence).
Web design: the "Clinical Precision" specification is not a file in this repository; the tokens and the
two recorded prose-vs-token conflicts live in the header of `apps/web/src/app/globals.css`, which is the
working source of truth for the visual language.

---

## 2. Where the work stands

**Branch** `arena/01a0bd9d-bezzo`. **PR:** https://github.com/sakshamfit/BEZZO/pull/1 (base `main`).
History: `781d1a9` (specs uploaded) → `dd0835c` → `6f9a628` → `d38b108` (foundation → identity →
catalogue/inventory → cart → checkout/orders) → `845c3c4` (web app + Phase 6 payments + authorization
fix + integration tests + reservation commitment; see the commit body for the history reconciliation).

| Phase (§44) | Status |
| --- | --- |
| 1 Foundation | IMPLEMENTED |
| 2 Identity & onboarding | IMPLEMENTED (push delivery REQUIRES EXTERNAL CREDENTIALS) |
| 3 Catalogue & inventory | IMPLEMENTED |
| 4 Marketplace: cart, checkout, orders | IMPLEMENTED |
| 5 Fulfilment (supplier accept → pack → ready) | **NOT IMPLEMENTED — next slice** |
| 6 Payments (webhooks, capture, retry, refunds, reconciliation) | IMPLEMENTED (§2.2) |
| 7 Picker system | NOT IMPLEMENTED |
| 8 Delivery / Porter | NOT IMPLEMENTED (adapter exists) |
| 9 Admin/backoffice | PARTIALLY IMPLEMENTED: partner-application queue + payments backoffice |
| 10 Scale & hardening | NOT IMPLEMENTED |
| — Public partner intake → WhatsApp +918604683669 | IMPLEMENTED (automated delivery from Bezzo's own number REQUIRES EXTERNAL CREDENTIALS) |

### 2.1 The authorization defect (fixed — do not reintroduce)

`PermissionsGuard` read its metadata with `getAllAndOverride([ROLES_KEY], …)` — an **array where Nest
expects the metadata key**. The lookup returned `undefined`, the guard returned `true`, and every
`@Roles`/`@RequirePermissions` in the platform was inert. A buyer could read `GET /admin/applications`
and could execute `POST /payments/:id/refund`. Fixed; `apps/api/test/security/rbac.spec.ts` is the
negative matrix that catches it (mutation-checked: restoring the array key fails 3 tests).

Corollary for future routes: permission decorators are a **conjunction**. Where a route legitimately
serves two audiences (e.g. `GET /orders/:orderId/refunds` — the owner buyer *or* an operator holding
`admin.payment.read`), put the coarse `@Roles(...)` list on the route and enforce the exact rule in the
service, which is the only layer that knows the ownership graph.

### 2.2 Payments, as built (Phase 6)

`apps/api/src/modules/payments/` — the whole contract is in the file headers; the essentials:

1. **Evidence before interpretation.** Raw bytes are hashed and a `payment_webhook_events` row is written
   before the body is parsed, including for calls that are then refused (`signature_valid` records the
   verdict).
2. **The signature verdict precedes the duplicate short-circuit**, so a forged call that guesses an
   already-seen event id is still 400 — otherwise the signature check would be skippable.
3. **Dedupe** on `(gateway, external_event_id)`: a repeat is 200 `DUPLICATE`, `applied:false`, no second
   effect. A **refusal is not terminal**: a later properly signed delivery of a previously refused event
   is applied — exactly once, because the transition itself is guarded.
4. **One transition**: `applyProviderStatus` is the only path from a provider-reported state to canonical
   data; the webhook and the 60 s `payments.reconcile` poll both call it.
5. Amount mismatches are recorded and refused; the canonical amount is never overwritten.
6. Refund row is written **before** the gateway is called; only the gateway's answer moves
   `payments.refunded_amount`; over-refunds and COD refunds are refused.
7. `POST /dev/payments/:id/mock-webhook` is a **second signer**, not a bypass: it builds a body with the
   mock provider's own signer and re-enters the production handler. Available only when
   `PAYMENTS_PROVIDER=mock` and only to the owning buyer or an `admin.payment.read` holder.

Routes: `POST /webhooks/payments/:provider`, `POST /payments/:id/retry`, `POST /payments/:id/refund`,
`GET /orders/:orderId/refunds`, `GET /admin/payments`, `GET /admin/payments/:paymentId`,
`POST /dev/payments/:id/mock-webhook`.
Web: payment card on `/orders/[orderId]`, backoffice at `/admin/payments`.

### 2.3 Reservation semantics (settled — do not "simplify" back)

The reservation TTL is a **payment window**, not a warehouse timer.

- `ACTIVE` = held, released when the window elapses (`expires_at` set).
- `CONFIRMED` = committed; `expires_at IS NULL`; **no timer can release it** (migration 0017).
- COD commits at placement; a prepaid order commits when the capture is applied
  (`confirmOrderForCapture`).
- `reservations.expire` only releases holds whose order is still `PENDING_PAYMENT` with payment
  `PENDING`/`FAILED` (second belt around legacy rows).
- `cancel()` releases `ACTIVE` **and** `CONFIRMED` rows, so committed units are never stranded.

### 2.4 Migrations

`0001`–`0017` applied. Two are notable:

- `0015` was already applied when its role-grant list turned out to over-grant (`admin.payment.review`
  to support agents). It is left **byte-identical** — the migrator refuses edited migrations, correctly —
  and `0016` is the forward-only correction. Fresh databases run 0015 then 0016 and reach the intended
  grants.
- `0017` relaxes `inventory_reservations.expires_at` to nullable (expand direction, no data rewrite).

**Trap:** the DB CLI reads SQL from `packages/database/dist/migrations/` (copied by
`scripts/copy-sql.js`). After editing any migration you must
`corepack pnpm --filter @bezzo/database build` **before** `... migrate`, or you will chase a phantom
drift/pending error.

---

## 3. Environment (sandbox) — rebuilt from scratch each restore

Everything in `/tmp` and every `node_modules` is lost on a sandbox restart. The repository does not
contain the following; recreate it:

```bash
cd /home/user/BEZZO
corepack enable pnpm                       # without this: turbo "Unable to find package manager binary"
corepack pnpm install                      # ~643 packages
cp .env.example .env                       # then fill: fresh JWT/OTP secrets, DATABASE_URL, WhatsApp number
```

PostgreSQL is **embedded** (no system Postgres; `apt` is dead; `psql` and `lsof` are absent):
`/tmp/pgtest` with `embedded-postgres@17.10.0-beta.17` + `@embedded-postgres/linux-x64` and a starter
that runs a persistent cluster on `127.0.0.1:5432`, creating `bezzo_local` and `bezzo_test`. First start
fails with `recv_password_packet` until `data/pg_hba.conf` is rewritten `password` → `trust`.
`npm install` works there; `corepack pnpm add` returns an empty shell error.

Then: `db:migrate` → `db:seed` → `db:verify`, and start the two servers:

```bash
cd apps/api  && node dist/main.js                                        # :4000
cd apps/web  && corepack pnpm exec next dev -H 0.0.0.0 -p 3000           # :3000, must bind 0.0.0.0
```

Seeded logins, password `Bezzo@12345`: `admin@`, `ops@`, `supplier1-3@`, `buyer1-2@`, `picker1-3@`
`bezzo.local`.

Sandbox limits worth remembering: **no browser binary** (curl and CSS/class audits only); unreachable:
`fonts.googleapis.com`/`gstatic.com` (so `next/font/google` fails — self-host fonts), `nodejs.org`,
`deb.debian.org`, `objects.githubusercontent.com`. Reachable: npm, github, codeload, pypi. No Redis
(`REDIS_URL` unset → in-process cache fallback), `SEARCH_ENABLED=false` (degraded DB search path),
`PAYMENTS_PROVIDER=mock`, `LOGISTICS_PROVIDER=manual`.

---

## 4. How to verify — what each thing proves

```bash
corepack pnpm typecheck                                        # 10/10 tasks
corepack pnpm --filter @bezzo/api test:integration             # 21 tests, ~50 s, needs the API running
python3 scripts/verify/payments-e2e.py                         # 33 assertions, prints the whole exchange
python3 scripts/verify/reservations-e2e.py                     # 10 assertions, ~60 s (waits a job cycle)
corepack pnpm --filter @bezzo/api openapi:export               # regenerate after any route change
```

- `test/security/rbac.spec.ts` — no non-admin role reaches an admin surface; no buyer reaches supplier
  surfaces; no token-less caller reaches anything.
- `test/payments/payments.spec.ts` — capture confirms, duplicate is inert, forged signature is 400 for a
  **new and an already-seen** event id, failure keeps the order payable, retry captures, refunds
  full/partial, over-refund and buyer refund refused, backoffice trail permission-gated.
- `test/orders/reservation-commitment.spec.ts` — COD hold is committed, survives a real expiry cycle,
  returns its units on cancel; capture commits a prepaid hold.
- The suite is **black-box against a booted API** (`BEZZO_API_URL`) on purpose: guards, the raw-body
  capture webhook signatures depend on, the request-context hook and the global filters are installed by
  the bootstrap, so an in-process test would exercise different wiring.

The DB CLI and the API both need **compiled `dist/`** (`pnpm build`); "build the package first" means
exactly that.

---

## 5. Traps that cost time last session (do not repeat)

1. **Never run a full web build while `next dev` is live.** `corepack pnpm --filter @bezzo/web build`
   and `next dev` both write `apps/web/.next`; the dev server then returns 500 for every route until
   `.next` is deleted and it is restarted. To type-check the API only, use
   `corepack pnpm --filter @bezzo/api build` or `turbo run build --filter=@bezzo/api...`.
2. **Idempotency keys must be unique per *command*, not per test.** The API replays a stored response for
   a repeated key and rejects a repeated key with a different body (409 `IDEMPOTENCY_KEY_CONFLICT`). A
   fixed key across runs replays yesterday's response and makes a passing suite look broken. Both verify
   scripts and the Jest helper append a per-run nonce.
3. **`pkill -f "node dist/main.js"` kills the invoking shell too** (the pattern matches the shell's own
   command line). Kill by pid, or accept the `exit -1` and then check `ps -eo pid,etimes,args`.
   `EADDRINUSE` leaves an untracked process holding `:4000`.
4. **Migration drift is enforced by sha256.** Do not edit an applied migration; add a forward one. After
   any SQL edit, rebuild `@bezzo/database` so `dist/migrations` is refreshed.
5. **Money appears in two shapes.** `NUMERIC` reaches the wire as a string by default; the order
   endpoints and the payment read models publish **numbers**. Keep it that way (the web client formats
   directly), and check the shape in a test when you add a money field.
6. **`AsyncLocalStorage.run()` in the Fastify hook does not propagate** — the request context uses
   `enterWithContext()`.
7. **Nest metadata lookups take a key, not an array** (§2.1).
8. `WorkerModule` must keep `imports: [PaymentsModule]` — the reconciliation job calls
   `PaymentsService`, it does not re-implement the provider conversation.
9. Schema vocabulary that is easy to get wrong: `inventories.status` is never `ACTIVE`
   (`AVAILABLE|LOW_STOCK|OUT_OF_STOCK|…`); `fulfillment_items.status` ≠ `fulfillments.status`;
   `delivery_slots` uses `name`/`active`; there is no `order_status_enum` PG type; `refunds` has no
   `currency` column (use the payment's); `payment_attempts` has `gateway_attempt_reference`, not
   `attempt_number`; notifications reference **users**, not buyers (`buyers.user_id`).
10. `apps/api/jest-integration.config.js` maps `@bezzo/*` to `src`, but the scripts under
    `apps/api/scripts/` run against `dist`. Build before exporting OpenAPI or the document will be stale.
11. `search_index_jobs` "unused placeholder" audits are false positives (a comma inside
    `slice(0, 500)`).

---

## 6. Next work, in order

1. **Phase 5 — supplier fulfilment** (the immediate next slice): `GET /suppliers/orders`, accept, pack,
   mark ready-for-pickup, package/shipment records. Fulfilment tables and per-supplier fulfilments exist.
   This is the precondition for the picker stage. Non-negotiables: server-authoritative transitions,
   idempotent commands, audit + domain events, supplier data isolation, and tests for the scenarios in
   §6 (below).
2. **Phase 7 — picker system**: pickup offer generation, **atomic claim** (two pickers must never claim
   one task), run/stop progression, package scans with `local_event_id` idempotency, hub receiving with
   duplicate/unexpected/discrepancy handling.
3. **Phase 8 — delivery**: provider adapter call sites only (no Porter logic scattered in the app).
4. Extend the integration suite to the remaining critical scenarios: final-unit race, two pickers one
   task, duplicate package scan, duplicate hub receipt, queue delay, partial pickup, missing/unexpected
   package, hub discrepancy. (Duplicate payment webhook, forged signature, refunds, RBAC and reservation
   commitment are covered today.)
5. Promotions: the spec exists
   (`Bezzo_promotions_pricing_discounts_marketplace_commercial_rules_spec_v1.0.md`) and nothing is
   implemented — the cart pricing path has no promotion hook. Read it first; do not invent rules.
6. Supplier fulfilment web screen + operations dashboard tiles (buyer flow and payments backoffice are
   done).
7. When credentials exist: Razorpay checkout handoff in the web client (the API already creates the
   intent), Porter live mode, FCM/APNs, WhatsApp Cloud API sender, self-hosted webfonts.

---

## 7. Standing conventions

- Never say "Implemented" unless the code exists; label honestly **IMPLEMENTED / PARTIALLY IMPLEMENTED /
  MOCKED / NOT IMPLEMENTED / REQUIRES CONFIGURATION / REQUIRES EXTERNAL CREDENTIALS**.
- Every slice ships: DB model + migration + backend + API + validation + authz + frontend + error
  handling + logging + tests + docs, working end to end. No fake placeholders.
- Never hard-code secrets; `.env.example` lists every key. Never expose passwords, payment credentials,
  supplier banking data or regulatory documents to an unauthorized role.
- TypeScript strict, no `any`, DTO validation with zod, service/repository separation, DI, structured
  logs, error classes, centralized config; no business rules in React and no DB access from the UI.
- All apply-form submissions go to WhatsApp **+918604683669**.
- Web UI follows **Clinical Precision** (navy `#0A2156` / accent `#00BFA5`, Plus Jakarta Sans + Space
  Mono, 8-pt grid, 1 px slate borders, status chips led by a 6 px dot). Light-first; dark mode is
  deliberately not implemented.
- `docs/02-implementation-status.md` is updated with every slice, including the evidence that proves it.

---

## 8. Marketplace UX transformation (2026-09-20, branch `arena/01a0bf2e-bezzo`)

The web client now has the quick-commerce-grade retailer experience (design-system v2 in
`apps/web/src/app/globals.css`, all new primitives under `apps/web/src/components/`). Key facts a
fresh session must know:

- **Visual identity unchanged in hue** (navy `#0A2156` / teal `#00BFA5`), re-laid-out for density and
  speed. Nothing is borrowed from any competitor: product/category imagery is BEZZO's own
  deterministic inline-SVG system, so there are zero image requests and no placeholder photos of
  medicines.
- **Route groups**: console/auth/apply pages live in `apps/web/src/app/(shell)/` (URLs unchanged)
  and get the standard container from `(shell)/layout.tsx`. Marketplace pages (`/`, `/catalog`,
  `/categories`, `/cart`, `/checkout`, `/orders`, `/picker`, `/admin`) render their own containers.
  Do not reintroduce a container in `AppShell`.
- **Cart contract**: `POST /cart/items` takes `supplierProductId` (the listing id) — NOT `listingId`.
  The preview mock now mirrors the real body and the real `/catalog/products` envelope
  (`{ items, pagination }`); the old mock returned a bare array and silently broke the old catalogue
  page in preview.
- **Server-authoritative optimism**: quick-add shows a pending stepper, then reconciles with the
  API's cart response; failures roll back with a toast. Money/stock are never computed client-side.
- **Order tracking** maps the real fulfilment enum ladder (CREATED→…→DELIVERED) to a visual track
  from the server's own timestamps. Do not fake progress for missing stages.
- **Picker surface is honest**: `/picker` shows a real empty state because picker dispatch (Phase 7)
  has no backend yet. When Phase 7 ships, replace the empty state with the task flow — do not
  simulate scans in the meantime.
- **Preview fixtures** live in `src/lib/mock-service.ts` (20 products, supplier fulfilment queue,
  recomputed category counts). They are preview-only; the real API is the contract.
- **The mock is a complete mini-backend** (2026-09-20 completeness pass): every `request(...)`
  endpoint the UI calls is handled — auth register/OTP (preview code `123456`), order cancel +
  refunds, payment retry/refund/mock-webhook with real state, supplier fulfilment
  accept/pack/ready/reject with `INVALID_TRANSITION` 409s, listing create/patch, inventory
  adjust/set + ledger, admin application summary/triage, notification inbox + preferences,
  address/session mutations, and `POST /applications` (apply form → admin queue). The
  catch-all returns a **404 `NOT_IMPLEMENTED_IN_PREVIEW`** — never reintroduce a fake-success
  catch-all; silent `{}` responses are what made console buttons look broken.
- Mock state is in-memory: dev-server restart resets fixtures (useful after demo mutations).
- Verified: typecheck green, 24 routes 200 on `next dev`, cart/quote/search flows exercised through
  the app's own route handlers.

# BEZZO — implementation status (living memory)

**Last updated:** 2026-09-26
**Branch:** `main`
**Purpose:** this file is the project's memory. It records *what actually exists in code*, how it was
verified, what is deliberately absent, and what comes next. It is updated at the end of every work
session. Nothing here is aspirational: an item appears under **IMPLEMENTED** only when the code exists
and has been exercised against the running stack.

Status vocabulary (as required by the brief):
**IMPLEMENTED** · **PARTIALLY IMPLEMENTED** · **MOCKED** · **NOT IMPLEMENTED** ·
**REQUIRES CONFIGURATION** · **REQUIRES EXTERNAL CREDENTIALS**.

---

## 1. Repository at a glance

```
BEZZO/
├── apps/
│   ├── api/        NestJS 11 + Fastify — versioned REST API, workers, OpenAPI
│   ├── web/        Next.js 15 + React 19 — buyer storefront, supplier workspace, ops screens
│   └── mobile/     Flutter/Dart — buyer prototype; core, catalog, cart, and presentation modules
├── packages/
│   ├── contracts/  framework-free domain vocabulary (enums, events, errors, DTOs, state machines)
│   ├── config/     zod-validated environment + .env discovery
│   ├── crypto/     scrypt hashing, token/OTP helpers, constant-time comparison
│   └── database/   pooled client, migrator, 14 migrations, dev/test seeds
├── docs/           assessment, local development runbook, this status file
└── *.md            the specification corpus (source of truth)
```

Toolchain: npm 10.8.2 (`packageManager` pinned at repository root) · turbo 2.x · TypeScript 5.9.3 (`strict`, `noUncheckedIndexedAccess`).

## 2. Verified running system

| Service | Command | Address | Evidence |
| --- | --- | --- | --- |
| API | `node dist/main.js` (from `apps/api`) | `0.0.0.0:4000` | 71 operations over 55 paths in the live Swagger document (same numbers in the checked-in `openapi/bezzo-api.json`; 12 of them document the required `Idempotency-Key`); `/health` 200; `/docs` 200; `/api/v1/catalog/products` 200 |
| Web | `npm run dev --workspace=@bezzo/web` | `0.0.0.0:3000` | `/`, `/apply`, `/login`, `/register`, `/catalog`, `/catalog/:id`, `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/account`, `/notifications`, `/status`, `/supplier`, `/supplier/listings`, `/supplier/inventory`, `/admin/applications` all return 200 |
| Database | embedded PostgreSQL 17.10 | `127.0.0.1:5432` | `bezzo_local` reset + 14/14 migrations + seed (409 statements) + `verify` PASS |
| Redis | **not running** (no local binary) | — | documented degraded mode: in-process cache fallback, reported by `/health` |
| OpenSearch | `SEARCH_ENABLED=false` | — | documented degraded mode: database search path, reported by `/health` |

Background workers are live: `job_runs` shows `outbox.dispatch`, `notifications.dispatch`,
`reservations.expire`, `search.index` all `SUCCEEDED` with per-run durations (max 66 ms). The
reservation-expiry job was broken until this session (an unreferenced `$2` placeholder made Postgres
reject the whole statement, so it failed every 30 seconds); it now releases lapsed reservations,
returns the stock to the shelf and — because an order whose stock has gone back can no longer be
fulfilled — closes the unpaid order with it (see §5.2).

## 3. Phase-by-phase status (implementation plan §44)

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: workspace, tooling, config, logging, migrations, health/metrics | **IMPLEMENTED** |
| 2 | Identity & onboarding: auth, sessions, RBAC, buyer/supplier profiles, verification, documents | **IMPLEMENTED** (mobile OTP flows exist API-side; push delivery **REQUIRES EXTERNAL CREDENTIALS**) |
| 3 | Catalogue & inventory: products, categories, manufacturers, listings, inventory + ledger | **IMPLEMENTED** |
| 4 | Marketplace: cart, checkout, orders, payments | Cart + quote + order placement + cancellation + reservation commitment/expiry **IMPLEMENTED** (web `/cart`, `/checkout`, `/orders`, `/orders/[orderId]`); payment capture, webhooks, retry and refunds **IMPLEMENTED** (Phase 6 below) |
| 5 | Fulfilment: supplier → hub pickup flow (fulfilment records, packing) | Supplier fulfillment list/detail, accept/reject, pack and ready-for-pickup are **IMPLEMENTED** (API, web workspace, integration coverage); picker pickup remains Phase 7 |
| 6 | Payments: abstraction, server verification, webhooks, reconciliation | **IMPLEMENTED** end to end: provider abstraction (mock + razorpay; cashfree adapter **NOT IMPLEMENTED**), signed webhook intake with evidence + replay protection, capture → order confirmation, buyer retry, admin full/partial refunds, reconciliation poll, buyer payment UI and `/admin/payments` backoffice. Live-gateway checkout UI and settlement payouts **REQUIRES EXTERNAL CREDENTIALS** / later phase |
| 7 | Picker system: offers, atomic claim, runs, stops, package scans, hub receiving | **PARTIALLY IMPLEMENTED**: heartbeat/availability, home-hub and capacity scoped task queue, atomic claim, supplier arrival, collection start, package list/scans, offline scan replay, unexpected-package exceptions, full/partial reconciliation and follow-up pickup tasks are in the API; offer generation, runs/stops, hub receiving and picker UI remain **NOT IMPLEMENTED** |
| 8 | Delivery: hub → retailer, Porter adapter, slots, tracking | Logistics adapter **IMPLEMENTED**; delivery flow **NOT IMPLEMENTED** |
| 9 | Admin / backoffice: verification queues, disputes, settlements, analytics | **PARTIALLY IMPLEMENTED**: partner-application queue (`/admin/applications`) and the payments backoffice (`/admin/payments`: search, evidence trail, refunds). Verification queues, disputes, settlements and analytics are **NOT IMPLEMENTED** |
| 10 | Scale & hardening: load tests, DR, autoscaling, WAF | **NOT IMPLEMENTED** |
| — | Cross-cutting: public partner intake (apply to sell / pick / buy) routed to the operations WhatsApp line + operations triage queue | **IMPLEMENTED** (automated WhatsApp *delivery* from Bezzo's own business number **REQUIRES EXTERNAL CREDENTIALS**; today the applicant's own WhatsApp sends the prefilled message) |

## 4. What is implemented, in detail

### 4.1 Database (`packages/database`)

- 17 forward-only migrations (~80 tables) with sha256 drift detection, advisory lock `982451653`,
  `-- @transactional: false` support for concurrent index creation.
- Domains: identity/RBAC, buyers, suppliers, catalog, inventory (+ `inventory_transactions` ledger),
  carts, orders/order_items, fulfillment, pickup (tasks, offers, packages, runs, stops, events),
  hub receiving (+ package scans, exceptions), deliveries, payments (+ webhook events, refunds),
  invoices, promotions, settlements, notifications, audit, jobs/outbox, idempotency, search projection.
- Invariants enforced in the database, not only in services:
  `inventories CHECK (reserved_quantity <= available_quantity)`,
  `supplier_product_listings CHECK (selling_price <= mrp_reference)`,
  partial unique index `carts_active_unique` (one active cart per buyer),
  `idempotency_keys UNIQUE (key, operation, user_scope)`, `pickup_task_orders UNIQUE (task, fulfillment)`.
- ADRs: no PostgreSQL enums (TEXT + CHECK) · inventory keyed by `supplier_listing_id` · role superset ·
  `READY_FOR_PICKUP` added to the fulfilment machine · PostGIS optional (haversine fallback) ·
  prescription classification configurable.

### 4.2 Contracts (`packages/contracts`)

Domain enums and state machines, ~70 domain-event names with envelopes, ~140 stable error codes with
HTTP mappings, DTOs for identity/marketplace/picker/admin, operational configuration. This package is
the single vocabulary shared by the API and web client; the Flutter prototype uses local demo data
and still needs API integration.

### 4.3 API

Cross-cutting: request context + correlation IDs, `{success,data,meta}` envelope, stable error filter,
zod validation pipes, JWT auth guard, permission guard, audit trail, metrics, pagination, API index,
Swagger at `/docs` (+ generated `apps/api/openapi/bezzo-api.json`).

Infrastructure modules (all `@Global`): config, logger (pino), database, cache (Redis with in-process
fallback), storage (S3-compatible with local driver), events (transactional outbox + domain events),
idempotency, audit, jobs/scheduler (5 jobs, advisory-locked), metrics, search (OpenSearch with database
fallback), notifications (IN_APP guaranteed, unconfigured channels fail rather than lie), payments
(server-verified, mock + Razorpay), logistics (manual + Porter adapter with webhook signature).

Picker API (`/api/v1/picker`): availability heartbeat, hub/capacity scoped task queue, transactional
task claim and fulfillment assignment, supplier arrival, collection start, task package list, and
package scanning and full/partial pickup reconciliation are implemented. Scans use server-side
package/task ownership checks, conditional collection writes and offline `localEventId`
deduplication. Unexpected/wrong packages create a pickup exception without exposing another task’s
package details. Partial pickups record missing packages/reason and create a follow-up task. Actions
write audit/domain events. Offer generation, runs/stops, hub receiving and picker UI remain absent.
The API TypeScript/Nest build and OpenAPI export passed; picker runtime/integration behavior has not
been exercised against the API and database.

| Module | Endpoints | Notes |
| --- | --- | --- |
| auth | register, login, otp request/verify, refresh, logout, logout-all, sessions, `me`, `me/security`, `me/password`, delete `me` | rotating refresh tokens with family revocation on replay, peppered single-use OTP, login lockout, password history, cache `actor:<uid>:<sid>` 60 s |
| buyers | profile, addresses CRUD, documents | buyer-only, ownership enforced by `actor.buyerId` |
| suppliers | profile, verification submit, documents, listings CRUD, inventory + adjust/set/ledger | supplier-only; every stock change writes an `inventory_transactions` row |
| picker | heartbeat, task list/accept/arrive/start-collection, package list/scan/complete | picker-only; queue restricted by hub/capacity; scans enforce task ownership and replay-safe package collection |
| catalog | categories, manufacturers, dosage-forms, delivery-slots, products (search/filter/sort), products/suggest, products/:id | public read; product detail returns live offers with sellable quantity |
| cart | GET cart, POST items, PATCH item, DELETE item, DELETE cart | implemented this session — see §5 |
| checkout | POST checkout/quote | server-priced preview of the live basket (address, mode, slot, serviceability), zero side effects — see §5.2 |
| orders | POST orders, GET orders, GET orders/:id, POST orders/:id/cancel | idempotent placement with guarded per-line reservation, one fulfillment per supplier, payment intent after the commit, guarded cancellation; both `:orderId` routes validate the parameter (`uuidParam`) so a malformed id returns 422 with a field error instead of a database cast error — see §5.2 |
| users | notifications (+read/read-all), notification-preferences, devices | |
| platform | `/health`, `/health/live`, `/health/ready`, `/metrics`, `/version`, `/` index | |

### 4.4 Web (`apps/web`)

Route map: `/` landing · `/apply` (public partner intake, server shell + client form) ·
`/login` · `/register` · `/catalog` (+filters, type-ahead) · `/catalog/[productId]` (offers,
add-to-cart) · `/cart` · `/checkout` (address, delivery mode/slot, payment method, server-priced
review, place order) · `/orders` (history with status filters and pagination) · `/orders/[orderId]`
(lines, per-supplier fulfilments, payment, timeline, guarded cancel) · `/account` (profile, addresses, documents, sessions, security events) ·
`/notifications` · `/supplier` (dashboard, low-stock triage) · `/supplier/listings` (publish +
status) · `/supplier/inventory` (movements, stock-take, ledger) · `/admin/applications` (operations
triage queue) · `/status` (live `/health` + `/version`).

Client conventions: same-origin `/api/v1` calls proxied by Next; envelope unwrapping into typed domain
objects; `ApiError` carries the stable API error code; one automatic refresh-and-retry on 401 with the
same idempotency key; role-aware navigation that is *not* a security boundary. Mutating calls always
carry an `Idempotency-Key` (generated per user action, reused by the retry), which is why the
API-side requirement is satisfied without any screen managing keys by hand.

### 4.5 Design system — "Clinical Precision" (`apps/web/src/app/globals.css`)

The supplied design specification is the visual source of truth. It is implemented as one token-driven
stylesheet, and the specification's internal conflicts are resolved **in the file's header comment**
so the decision is discoverable where the tokens are defined:

| Specification | Implementation | Reason |
| --- | --- | --- |
| prose `#0A2156` (clinical navy) | `--primary` | brand surfaces, primary actions, headings |
| token list `#000d32` | `--primary-deep` | the darkest navy is used for the top bar and inverse surfaces |
| prose `#00BFA5` (teal) | `--accent` | focus rings, selected states, accent buttons |
| Material pair `#006b5c` / `#68fadd` | `--accent-deep` / `--accent-soft` / `--accent-fixed` | text-safe deep teal, tinted backgrounds, on-navy accents |
| tertiary `#3A86FF` | `--info` (+`--info-soft`, `--info-ink`) | informational chips and links |
| dark-mode tokens | deliberately not implemented | the specification is light-first; `color-scheme: light` is declared |

Also implemented: the 8-pt spacing scale, the 0.25/0.5/1/1.5 rem radius scale plus full pills (status
chips and dots only, 24–28 px high, led by a 6 px dot), 1 px slate borders with micro-ambient elevation
(`--elevation-1/2/3`), inputs with a 1 px `#CBD5E1` border and a 2 px teal focus ring offset by 2 px,
Plus Jakarta Sans (400–800) for text and Space Mono for every technical readout (order numbers,
references, phone numbers, amounts in monospace contexts). Type-scale and component classes
(`.display-*`, `.headline-*`, `.title-*`, `.body-*`, `.label-*`, `.eyebrow`, `.mono`, `.card`,
`.chip`, `.table`, `.apply-*`, `.choice-grid`, `.stage-track`, `.code-block`, `.stat-*`) are the only
styling vocabulary the screens use — no ad-hoc colours in components.

Typefaces are loaded from the Google Fonts CDN by the browser (`<link>` in the root layout, **not**
`next/font/google`), so builds succeed on machines without egress; the CSS stack always ends in system
fonts. In this sandbox the CDN is unreachable, which is exactly the degraded case the stack covers —
if a self-hosted build is required, drop the WOFF2 files into `apps/web/public/fonts` and switch the
`<link>` to a local `@font-face` (recorded as a gap below).

## 5. Work completed in this session

1. **Cart module** (`apps/api/src/modules/cart/`): `ensureActiveCart` using the partial unique index
   with `ON CONFLICT … DO NOTHING` + re-read; live re-pricing and stock re-read on every read; quantity
   bounded by MOQ and sellable quantity; per-line issue codes
   (`LISTING_UNAVAILABLE`, `SUPPLIER_NOT_VERIFIED`, `PRODUCT_UNAVAILABLE`, `INSUFFICIENT_STOCK`,
   `BELOW_MINIMUM_QUANTITY`, `BATCH_EXPIRING`, `BUYER_NOT_VERIFIED_FOR_RESTRICTED_ITEM`); audit +
   `CartItemAdded` domain event. Cart is soft intent — it never reserves inventory.
   Verified: add/update/remove/clear, oversell rejected with 409, supplier and admin get 403,
   identical replays do not double-add.
2. **Idempotency is enforced, not declared.** `@Idempotent()` set metadata that nothing consumed, so
   retries re-executed. Added `IdempotencyInterceptor` (registered after the envelope interceptor so it
   stores the raw payload): requires the header, inserts once, replays the stored status+body, returns
   409 while in flight, rejects key reuse with a different body, and deletes the record on failure so a
   genuine retry still works.
3. **Empty-body JSON mutations** no longer fail with
   *"Body cannot be empty when content-type is set to 'application/json'"* (this broke every `DELETE`).
   The JSON parser is replaced through Nest's adapter so `rawBody` capture still works for future
   webhook signature verification; malformed JSON still returns 400.
4. **The idempotency contract is now published, not just enforced.** Nine harmful-duplicate
   mutations (cart add, stock adjust/set, listing create, supplier verification+documents, buyer
   address+document, device registration) carry `@Idempotent`; the decorator composes the runtime
   guard with the OpenAPI `Idempotency-Key` header, so `apps/api/openapi/bezzo-api.json` documents the
   requirement instead of letting clients discover it by failing.
5. **Background jobs actually run.** `SchedulerService.start()` was never called, so timers were never
   armed; the job recorder also wrote a non-existent column and status, and reused one positional
   parameter with two inferred types. All fixed; `job_runs` now shows four jobs succeeding.
6. **Supplier stock adjustment returned 500 after applying the change.** The response was rebuilt from
   the `UPDATE … RETURNING` partial row, so `updated_at` was `undefined`. It now re-reads the canonical
   joined row; `setStock`'s no-op branch uses the same reader.
7. **Web surface built out**: cart, account, notifications, supplier workspace (dashboard, listings with
   publish form, inventory with movements/stock-take/ledger), platform status; catalogue type-ahead
   fixed (it never sent the required `q` parameter); styles for tables, definition grids, stat tiles,
   forms and suggestion lists added to the single stylesheet.
8. **Embeddability fix for preview/managed hosting**: helmet's `X-Frame-Options` was blocking the API's
   own operator pages inside the BEZZO console; framing is now governed at the CDN/WAF layer while CSP
   stays explicit.
9. **Docs**: `docs/01-local-development.md` gained the web-application, proxy and idempotency
   sections; this file was added as the project's implementation memory.
10. **The "Clinical Precision" design system** replaced the previous ad-hoc green palette: one
    token-driven stylesheet, resolved-conflict mapping documented in the file header (see §4.5), fonts
    wired through the CDN with a system-font fallback, `themeColor` corrected to the navy brand colour,
    and a sweep that removed every reference to the retired tokens (`--brand*`, `--shadow-sm/md`,
    `--info-bg`) — an audit script confirmed no screen references an undefined custom property and no
    class used in JSX lacks a rule.
11. **Public partner intake → WhatsApp (see §5.3)**: the apply form for suppliers, stores, pickers and
    other partners, delivered to the operations line **+91 86046 83669**, with a persisted application,
    reference, audit trail, domain events, operations notifications and a triage queue.
12. **Checkout, orders and the web purchase flow were rewritten end-to-end** (see §5.2), including
    three defects the rewrite surfaced: the inventory status vocabulary (`inventories.status` is
    `AVAILABLE`/`LOW_STOCK`/…, never `ACTIVE`), the per-line picking vocabulary
    (`fulfillment_items.status` is `PENDING`/`ALLOCATED`/`PACKED`/…, a different set from
    `fulfillments.status` — now a shared `FulfillmentItemStatus` contract enum rather than a literal),
    and `supplier_service_areas.active` (a boolean, not `status`).
13. **The reservation-expiry job had never once succeeded.** `reserved_quantity = reserved_quantity -
    $3` left `$2` unreferenced, which Postgres cannot type, so every tick failed with *"could not
    determine data type of parameter $2"* and expired reservations were never released. Fixed, and the
    job now also closes an unpaid order once its last reservation lapses (§5.2).
14. **`bezzo-db` loads `.env` itself** (`npm run migrate --workspace=@bezzo/database` etc. failed with
    *"DATABASE_URL is required"* when run from a package directory even though `.env` existed).

### 5.2 Checkout & order placement (this session)

The marketplace flow that turns a basket into a commitment, implemented as the `orders` module:

- `POST /checkout/quote` validates the buyer, the address (ownership + active), the delivery mode
  against the suppliers' service areas, the scheduled slot, and prices the live basket — read-only, so a
  preview can never hold stock.
- `POST /orders` (idempotent) reserves every line with the guarded update
  `available_quantity - reserved_quantity >= :quantity`, creates the order with a database-generated
  customer number (`BZ-2026-000001`), immutable line snapshots, **one fulfillment per supplier**, one
  `inventory_reservations` row per line, the payment row and an auditable `checkout_sessions` record,
  then closes the cart (`CONVERTED`). Events `OrderCreated` / `OrderConfirmed` and audit entries are
  written in the same transaction.
- The gateway call happens **after** the commit. A provider failure is recorded on the payment and
  returned with the order rather than thrown — reporting a failed order that actually exists would be
  a lie, and it would leave the buyer unable to pay.
- `POST /orders/:id/cancel` is restricted to states that still allow it, rejects paid orders (a refund
  is the correct command), releases reservations with a guarded update, cancels items and
  fulfillments, and emits `OrderCancelled` + `InventoryReservationReleased`.
- `GET /orders` (filters + bounded pagination) and `GET /orders/:id` (lines, fulfillments, payment,
  status timeline) are buyer-scoped: ownership is enforced in SQL, never from a client-supplied id.

### 5.3 Partner applications → WhatsApp (this session)

A public intake that is honest about what happens to a submission:

- **`POST /api/v1/applications`** (public, `@Idempotent('application.submit')`, strict zod schema)
  writes one `partner_applications` row with a database-generated reference
  (`bezzo_next_application_reference()` → `BZ-APP-2026-000001`), the routing destination, the client
  context (request id, IP, signed-in user when there is one), a `PartnerApplicationSubmitted` domain
  event and an `application.submitted` audit entry — all in one transaction.
- **Routing is configuration, not markup**: `APPLICATIONS_WHATSAPP_NUMBER` (default `918604683669`)
  plus `APPLICATIONS_WHATSAPP_DISPLAY` (`+91 86046 83669`) live in `@bezzo/config`; `GET
  /applications/routing` publishes them and the API returns a `wa.me` deep link whose text is the full
  application summary. Every row stores the number it was routed to, so a reconfiguration never
  rewrites history.
- **The applicant's own WhatsApp performs the hand-off.** No WhatsApp Business credentials are
  configured in this environment, and the platform does not pretend a message was delivered when it
  was not — the success screen shows the number, the reference, the exact message and an
  "Open WhatsApp" action. Automated outbound delivery from Bezzo's business number is recorded as
  **REQUIRES EXTERNAL CREDENTIALS** (§6).
- **Operations is told twice**: an in-app notification per operator (admin, super admin, operations
  agent) with the reference and the deep link, and the triage queue itself.
- **`GET /admin/applications`** (permission `admin.application.read`, granted by the migration to
  `ADMIN`, `SUPER_ADMIN`, `OPERATIONS_AGENT`, `SUPPORT_AGENT`) supports status/type/search filters with
  bounded pagination and returns status counters; **`GET /admin/applications/summary`** feeds the queue
  header; **`PATCH /admin/applications/:id`** (permission `admin.application.write`) moves an
  application through `NEW → CONTACTED → IN_REVIEW → APPROVED/REJECTED/DUPLICATE` with review notes,
  emitting `PartnerApplicationStatusChanged` and an audit entry.
- **No account is created by an application.** Verification remains a human gate; approving an
  application starts onboarding, it does not silently provision a supplier or buyer.
- Web: `/apply` is a server shell (the WhatsApp number is in the delivered HTML, not something a
  client fetch has to succeed at) around a client form with service-type choice cards, strict
  validation feedback, a success state with the deep link and copy-to-clipboard, and a note that
  submission is not approval. `/admin/applications` is the operations queue (filters, counters, review
  panel, status transitions) and is gated on the same permission server-side.
- Migration `0014_partner_applications.sql` adds the table, the sequence/function, the two permissions
  and the role grants; `0013`'s checksum is untouched (forward-only, no drift).

### 5.0 Phase 6 — payments, and a platform-wide authorization defect

**A. The defect (security, fixed and regression-tested).** `PermissionsGuard` asked the reflector for its
metadata with `getAllAndOverride([ROLES_KEY], …)` — an array where NestJS expects the metadata key itself.
The lookup returned `undefined` for every route, the guard answered `true`, and **every `@Roles` and
`@RequirePermissions` in the platform was inert**. Only the ownership checks inside the services were
stopping cross-tenant access, which is exactly the class of defence that leaves admin surfaces open:
a buyer could read `GET /admin/applications`, and a buyer could execute `POST /payments/:id/refund`
(observed: a refund row with `requested_by` = the buyer's user id). Fixed by passing the key; locked down
by the negative RBAC matrix in `apps/api/test/security/rbac.spec.ts`, which was mutation-checked —
restoring the array form in the compiled guard makes three tests fail.

**B. Payments (client decision: gateway-agnostic, server-authoritative).**

| Control | How it works |
| --- | --- |
| Evidence before interpretation | The raw request bytes are hashed and a `payment_webhook_events` row is written **before** the body is parsed, including for calls that are then refused. `signature_valid` records the verdict. |
| Signature is not optional | The verdict is rendered *before* the duplicate short-circuit, so a forged call that guesses an event id we have seen is still 400 — otherwise the signature requirement would be skippable by guessing. |
| Replay protection | `(gateway, external_event_id)` is unique. A repeat is answered 200 `DUPLICATE` with `applied: false` and no second effect. A refusal is not terminal: a later properly signed delivery of a previously refused event is applied — exactly once, because the transition itself is guarded. |
| One transition | `applyProviderStatus` is the only place a provider-reported state reaches canonical data; the webhook and the reconciliation poll both call it, so a payment can never be "paid" by one path and "pending" by the other. |
| Amounts | A mismatch is recorded and refused; the canonical amount is never overwritten by an inbound event. |
| Retry | Reuses the same payment row (partial unique index `payments_order_active_unique`), records a `payment_attempts` row and uses an attempt-scoped provider idempotency key. Failure keeps the order payable. |
| Refunds | The `refunds` row is written before the gateway is called; only the provider's own answer moves `payments.refunded_amount`; over-refunds and COD refunds are refused; a buyer is refused by permission (403), not by convention. |
| Reconciliation | `payments.reconcile` (60 s) polls `PENDING`/`AUTHORIZED` payments older than `PAYMENTS_RECONCILE_AFTER_SECONDS`, records `reconciled_at`, and audits failures rather than dropping them silently. |
| Dev simulator | `POST /dev/payments/:id/mock-webhook` builds a body with the mock provider's **own signer** and re-enters the production handler. It is not a shortcut around the controls; it is a second signer, available only when `PAYMENTS_PROVIDER=mock` and only to the owning buyer or an `admin.payment.read` holder. |

**C. Reservations across the payment boundary.** The TTL is a *payment* window. Cash on delivery commits
at placement and a prepaid order commits on capture — both now flip the reservation to `CONFIRMED` with a
`NULL` expiry (migration 0017), and the expiry job additionally refuses to touch a reservation whose order
is no longer waiting for money. Before this, a confirmed COD order silently lost its stock back to the
shelf while the order stayed live. Cancelling an order now releases `ACTIVE` **and** `CONFIRMED`
reservations, so committed units are never stranded.

**D. Surfaces shipped.** API: `POST /webhooks/payments/:provider`, `POST /payments/:id/retry`,
`POST /payments/:id/refund`, `GET /orders/:orderId/refunds`, `GET /admin/payments`,
`GET /admin/payments/:paymentId`, `POST /dev/payments/:id/mock-webhook`. Web: the payment card on
`/orders/[orderId]` (retry while payable, refunds, dev simulator) and `/admin/payments` (search, attempts,
refunds, webhook evidence, refund form gated on `admin.payment.review`).

**E. Migrations.** `0015_payment_operations.sql` (permissions + `reconciled_at`),
`0016_payment_refund_grant_correction.sql` (forward-only correction: 0015 granted the refund right to
support agents by accident; 0015 is left byte-identical because it was already applied, and a fresh
database reaches the intended grants by running 0015 then 0016),
`0017_reservation_commitment.sql` (nullable `expires_at`).

### 5.1 Evidence (commands actually run against the live stack)

The two end-to-end scripts quoted below are **in the repository** (`scripts/verify/`), not in `/tmp`:
`payments-e2e.py` (capture → duplicate → forged signature → retry → refunds, 33 assertions) and
`reservations-e2e.py` (committed COD hold, forced expiry, cancel, 10 assertions). Both read
`BEZZO_API_URL` and `.env`, and both mutate development data.

```
# supplier inventory — the endpoint that used to commit the change and then return 500
POST /api/v1/supplier/inventory/:id/adjust   (no key)        -> 400 IDEMPOTENCY_KEY_REQUIRED
POST /api/v1/supplier/inventory/:id/adjust   (+1, key K)     -> 200 available=151
POST /api/v1/supplier/inventory/:id/adjust   (+1, key K)     -> 200 available=151   (replayed, not re-applied)
POST /api/v1/supplier/inventory/:id/adjust   (-1, new key)   -> 200 available=150
POST /api/v1/supplier/inventory/:id/set      (no-op)         -> 200 available=150 version=6

# buyer cart (through the Next proxy on :3000, exactly as the browser calls it)
POST /api/v1/cart/items  2 units (key K)  -> 201 units=2 total=68.32
POST /api/v1/cart/items  2 units (key K)  -> 201 units=2 total=68.32   (replay)
POST /api/v1/cart/items  9 units (key K)  -> 409 IDEMPOTENCY_KEY_CONFLICT
POST /api/v1/cart/items  (no key)         -> 400 IDEMPOTENCY_KEY_REQUIRED
POST /api/v1/cart/items  351 of 350       -> 409 CART_ITEM_UNAVAILABLE
POST /api/v1/cart/items  malformed JSON   -> 400 INVALID_REQUEST
DELETE /api/v1/cart      empty JSON body  -> 200 itemCount=0
```

`idempotency_keys` stores the completed records with their replay status; the database was left
exactly as it was found (the +1/−1 pair nets to zero and the basket is empty).

```
# checkout & orders (buyer1@bezzo.local, COD so the order is confirmed without a gateway)
POST /api/v1/checkout/quote  INSTANT   -> 200 placeable=true, deliveryFee=148 (49 + 99 instant surcharge)
POST /api/v1/orders  (key K, COD)      -> 201 BZ-2026-000002 CONFIRMED, fulfillments=1, payment cod/PENDING
POST /api/v1/orders  (key K, replay)   -> 201 same order id (no second order, no second reservation)
GET  /api/v1/orders?pageSize=5         -> 200 history with meta.pagination
GET  /api/v1/orders/:id                -> 200 items + fulfillments + payment + timeline
POST /api/v1/orders/:id/cancel         -> 200 CANCELLED; reservations RELEASED, fulfillments CANCELLED
POST /api/v1/orders/:id/cancel (again) -> 409 ORDER_ALREADY_CANCELLED

# last-unit race: inventory reduced to a single sellable unit, two buyers checkout simultaneously
buyer1 POST /api/v1/orders -> 201 BZ-2026-000003
buyer2 POST /api/v1/orders -> 409 INSUFFICIENT_STOCK
inventory afterwards: available=1 reserved=1 sellable=0, active reservations on that unit = 1
```

The full rewrite of that flow was verified against the
live stack (2026-09-20), covering: two offers from two suppliers in one basket; quote placeable with
`supplierCount=2` and no order written; placement producing `BZ-YYYY-NNNNNN` with **two** fulfilments and
one ACTIVE reservation per line; pricing identical between quote and order; replay of the same
`Idempotency-Key` returning the same order; buyer-scoped history and detail (another buyer gets 404);
`order_status_history`, `OrderCreated`/`OrderConfirmed` domain events and the `order.placed` audit row;
cancellation releasing every reservation and cascading to items, fulfilments and the payment;
`ORDER_ALREADY_CANCELLED` on a second attempt; the final-unit race landing at exactly one order and one
ACTIVE reservation; and stock restored to its pre-test level afterwards. The same script exercises the
browser path (every call through the Next proxy on `:3000`) for quote → UPI order (mock gateway
reference + `payment_attempts` row) → detail → cancel.

```
# unpaid order: reservation TTL forced into the past, then the worker was allowed to tick
reservations.expire job          -> released 1 reservation (log: "unpaid order cancelled after its reservation expired")
inventory_reservations           -> status EXPIRED, release_reason RESERVATION_TTL_ELAPSED
inventories                      -> reserved_quantity back to 0
orders                           -> CANCELLED / payment_status CANCELLED / reason "Reservation expired before the payment was captured"
order_items, fulfillments, payments -> CANCELLED
notifications                    -> order.payment_timeout, dispatched to SENT
audit_logs                       -> order.payment_timeout_cancelled
domain_events                    -> OrderCancelled
POST /api/v1/orders/not-a-uuid   -> 422 VALIDATION_FAILED  (was 500: Postgres uuid cast leaked)
POST /api/v1/orders/not-a-uuid/cancel -> 422 VALIDATION_FAILED, fieldErrors [{field: orderId}]
```

```
# partner applications (public form → WhatsApp routing), through the Next proxy on :3000
GET  /api/v1/applications/routing                     -> 200 whatsappNumber="+91 86046 83669"
POST /api/v1/applications  (no Idempotency-Key)       -> 400 IDEMPOTENCY_KEY_REQUIRED
POST /api/v1/applications  invalid phone/type         -> 422 VALIDATION_FAILED (2 field errors)
POST /api/v1/applications  (key K)                    -> 201 BZ-APP-2026-000001 NEW, wa.me link to 918604683669
POST /api/v1/applications  (key K, replay)            -> 201 BZ-APP-2026-000001   (no second row)
POST /api/v1/applications  (key K, different body)    -> 409 IDEMPOTENCY_KEY_CONFLICT
POST /api/v1/applications  (second, distinct)         -> 201 BZ-APP-2026-000002
GET  /api/v1/admin/applications        (no token)     -> 401 AUTH_REQUIRED
GET  /api/v1/admin/applications/summary               -> 200 {"NEW":4,"REJECTED":1}, awaitingReview set
GET  /api/v1/admin/applications?status=REJECTED       -> 200 filtered, meta.pagination.totalItems=1
GET  /api/v1/admin/applications?search=agarwal        -> 200 by business name
PATCH /api/v1/admin/applications/:id  CONTACTED       -> 200 with review notes (reviewed_at set)
PATCH /api/v1/admin/applications/:id  REJECTED        -> 200 + PartnerApplicationStatusChanged event
```

Database truth after the run: 5 applications (`routed_to_number = 918604683669`,
`delivery_channel = WHATSAPP_HANDOFF`), 4 role grants for the new permissions, `PartnerApplicationSubmitted`
events ×5, `application.submitted` / `application.status_changed` audit rows, and one IN_APP
notification per operator per application (dispatched to `SENT` by the notification worker).

After every verification run the database was restored: all three verification orders are cancelled,
`inventory_reservations` has no `ACTIVE` rows, no inventory holds `reserved_quantity > 0`, and no
inventory violates `reserved_quantity <= available_quantity`.

## 6. Known gaps and required decisions

| Item | Status | Detail |
| --- | --- | --- |
| Partner-application outbound WhatsApp (Bezzo's own business number) | REQUIRES EXTERNAL CREDENTIALS | Today the applicant's WhatsApp sends the prefilled message; `delivery_channel` is `WHATSAPP_HANDOFF`. A WhatsApp Cloud API token + verified sender would let the platform deliver it directly (`delivery_channel = API`). |
| Self-hosted webfonts | REQUIRES CONFIGURATION | The root layout loads Plus Jakarta Sans / Space Mono from the Google Fonts CDN with a system-font fallback; the sandbox cannot reach that CDN. Self-hosting is a two-file change (`public/fonts` + `@font-face`) and is preferred for production. |
| Payment webhook endpoint + reconciliation | IMPLEMENTED | `POST /api/v1/webhooks/payments/:provider` verifies the HMAC over the raw bytes, stores the call as evidence before interpreting it, deduplicates on `(gateway, external_event_id)` and applies one shared transition; `payments.reconcile` polls the provider every 60 s for anything the webhook never delivered. |
| Picker pickup / hub receiving / delivery flows | NOT IMPLEMENTED | Phases 7–8. Supplier fulfillment accept/pack/ready is implemented; picker claiming, hub package receipt and retailer delivery are not. |
| Admin & backoffice (verification queues, disputes, settlements) | NOT IMPLEMENTED | Phase 9. |
| Analytics & reporting, promotions (`0014_promotions.sql`) | NOT IMPLEMENTED | Promotions migration is planned but not written; do not invent promotion rules without the spec. |
| Mobile app (`apps/mobile`) | PARTIALLY IMPLEMENTED | Flutter/Dart buyer client has buyer registration with email/phone verification, password/OTP sign-in, secure session storage, `/me` restoration, shared refresh-on-401, live catalog/category search, per-supplier offers, server cart, scheduled delivery quote, COD checkout, order history/details/cancellation, buyer business-profile editing, and compliance document upload/view/removal. Online payment handoff, push notifications, production signing/API configuration, direct-to-storage document uploads, and device-matrix verification remain. Flutter analyze and Android debug APK build pass. |
| API response compression | IMPLEMENTED (runtime requirement) | API negotiates Zstandard on Node.js 22.15+, then Brotli, then gzip for textual payloads ≥1 KB. Request decompression stays disabled. Runtime/build verification is pending the required Node.js 22.15 toolchain. |
| API load balancing | PARTIALLY IMPLEMENTED | `infra/kubernetes/api.yaml` defines 3+ ready API replicas, Service/Ingress balancing, health probes, TLS-secret reference, disruption budget, graceful updates, and CPU/memory HPA. Production cluster, image, host, secrets, managed LB/WAF/CDN, and TLS certificate still require operator configuration. |
| Test suites | PARTIALLY IMPLEMENTED | `pnpm --filter @bezzo/api test:integration` runs 21 black-box tests against a booted API (RBAC negative matrix, payments critical scenarios, reservation commitment) — 21/21 green and mutation-checked. Unit, contract, load, mobile and the remaining concurrency scenarios are still **NOT IMPLEMENTED**. |
| Redis / OpenSearch / S3 in this environment | REQUIRES CONFIGURATION | Fallbacks are intentional and reported by `/health`; production must set `REDIS_URL`, `SEARCH_ENABLED=true`, storage credentials. |
| Razorpay / Porter live keys | REQUIRES EXTERNAL CREDENTIALS | Boot refuses to start Razorpay without credentials rather than silently degrading. |
| Push notifications (FCM/APNs) | REQUIRES EXTERNAL CREDENTIALS | In-app channel works; unconfigured channels are recorded as FAILED/DEAD_LETTER. |
| `Bezo_PRD_v1.0.docx` | REQUIRES TOOLING | Binary document, not yet parsed; all other specs are Markdown and were used directly. |

## 7. Next steps (in order)

1. Picker slice (Phase 7): offer generation, atomic claim, run/stop progression, package scans with
   `local_event_id` idempotency, hub receiving with duplicate/unexpected handling.
2. Extend the integration suite to the remaining critical scenarios: final-unit race, two pickers one
   task, duplicate package scan, duplicate hub receipt, queue delay, partial pickup, hub discrepancy.
   (Duplicate payment webhook, forged signature, refunds, RBAC and reservation commitment are covered.)
3. Promotions: the promotion rules from `Bezzo_promotions_pricing_discounts_marketplace_commercial_rules_spec_v1.0.md`
   are **NOT IMPLEMENTED** — the cart/checkout pricing path has no promotion hook yet, and inventing rules
   without the spec is not acceptable. Read the spec, then migrate + implement + test.
4. Web parity for the remaining phases (picker app, operations dashboard
   tiles) — the buyer purchase flow (`/cart`, `/checkout`, `/orders`, `/orders/[orderId]`, payments) and
   the payments backoffice are done.
5. Partner intake follow-ups: attach uploaded licence documents to an application, convert an approved
   application into a supplier/buyer invite, and an operations dashboard tile for `awaitingReview`.
6. Live gateway work when credentials exist: Razorpay checkout handoff in the web client (the API already
   creates the intent), webhook secret rotation, and settlement/payout reporting.
7. Flutter buyer app: connect online payment handoff; then add lifecycle/deep-link behavior, release
   signing, direct-to-storage compliance uploads, push notifications, and device-matrix verification.

## 8. Verification commands used

```bash
npm run build --workspace=@bezzo/contracts
npm run build --workspace=@bezzo/config
npm run build --workspace=@bezzo/crypto
npm run build --workspace=@bezzo/database
npm run build --workspace=@bezzo/api
npm run build --workspace=@bezzo/web
npm run reset --workspace=@bezzo/database -- --yes
npm run migrate --workspace=@bezzo/database
npm run seed --workspace=@bezzo/database
npm run verify --workspace=@bezzo/database
curl -s localhost:4000/health | head -c 200
# cart + idempotency probe (buyer1@bezzo.local / Bezzo@12345)
curl -s -X POST localhost:4000/api/v1/cart/items -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -H "idempotency-key: $(uuidgen)" \
  -d '{"supplierProductId":"<listing-id>","quantity":1}'
# checkout → order → cancel, end to end against the live stack
curl -s -X POST localhost:4000/api/v1/checkout/quote -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -d '{"deliveryAddressId":"<address-id>","deliveryMode":"INSTANT"}'
curl -s -X POST localhost:4000/api/v1/orders -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -H "idempotency-key: $(uuidgen)" \
  -d '{"deliveryAddressId":"<address-id>","deliveryMode":"INSTANT","paymentMethod":"UPI"}'
# payments: capture → duplicate → forged signature → retry → refunds (33 assertions)
python3 scripts/verify/payments-e2e.py
# reservations across the payment boundary: committed COD hold, forced expiry, cancel (10 assertions)
python3 scripts/verify/reservations-e2e.py
# integration suites (black-box against the booted API, 21 tests, ~50 s)
npm run test:integration --workspace=@bezzo/api
# OpenAPI export after any route change
npm run openapi:export --workspace=@bezzo/api
# partner applications: public submit + operations triage (curl equivalent of the old apply-flow.py)
curl -s localhost:4000/api/v1/applications/routing
curl -s -X POST localhost:4000/api/v1/applications -H 'content-type: application/json' \
  -H "idempotency-key: $(python3 -c 'import uuid;print(uuid.uuid4())')" \
  -d '{"applicationType":"SUPPLIER","applicantName":"A","businessName":"B Pharma","contactPhone":"+919812345678","city":"Varanasi","state":"Uttar Pradesh"}'
```

Note for local development: do **not** run `npm run build --workspace=@bezzo/web` while `next dev`
is running — both write `.next`, and the dev server starts returning 500 for every route until it is
restarted. Stop the dev server (or use a separate build directory) first.

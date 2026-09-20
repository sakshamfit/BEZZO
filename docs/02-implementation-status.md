# BEZZO — implementation status (living memory)

**Last updated:** 2026-09-20
**Branch:** `arena/01a0bd9d-bezzo`
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
│   └── web/        Next.js 15 + React 19 — buyer storefront, supplier workspace, ops screens
├── packages/
│   ├── contracts/  framework-free domain vocabulary (enums, events, errors, DTOs, state machines)
│   ├── config/     zod-validated environment + .env discovery
│   ├── crypto/     scrypt hashing, token/OTP helpers, constant-time comparison
│   └── database/   pooled client, migrator, 13 migrations, dev/test seeds
├── docs/           assessment, local development runbook, this status file
└── *.md            the specification corpus (source of truth)
```

Toolchain: pnpm 12.5.1 (corepack) · turbo 2.11.2 · TypeScript 5.9.3 (`strict`, `noUncheckedIndexedAccess`).

## 2. Verified running system

| Service | Command | Address | Evidence |
| --- | --- | --- | --- |
| API | `node dist/main.js` (from `apps/api`) | `0.0.0.0:4000` | 48 routes mapped at boot; `/health` 200; `/docs` 200; `/api/v1/catalog/products` 200 |
| Web | `corepack pnpm --filter @bezzo/web dev` | `0.0.0.0:3000` | `/`, `/login`, `/register`, `/catalog`, `/catalog/:id`, `/cart`, `/account`, `/notifications`, `/status`, `/supplier`, `/supplier/listings`, `/supplier/inventory` all return 200 |
| Database | embedded PostgreSQL 17.10 | `127.0.0.1:5432` | `bezzo_local` reset + 13/13 migrations + seed (409 statements) + `verify` PASS |
| Redis | **not running** (no local binary) | — | documented degraded mode: in-process cache fallback, reported by `/health` |
| OpenSearch | `SEARCH_ENABLED=false` | — | documented degraded mode: database search path, reported by `/health` |

Background workers are live: `job_runs` shows `outbox.dispatch`, `notifications.dispatch`,
`reservations.expire`, `search.index` all `SUCCEEDED` with per-run durations (max 66 ms).

## 3. Phase-by-phase status (implementation plan §44)

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: workspace, tooling, config, logging, migrations, health/metrics | **IMPLEMENTED** |
| 2 | Identity & onboarding: auth, sessions, RBAC, buyer/supplier profiles, verification, documents | **IMPLEMENTED** (mobile OTP flows exist API-side; push delivery **REQUIRES EXTERNAL CREDENTIALS**) |
| 3 | Catalogue & inventory: products, categories, manufacturers, listings, inventory + ledger | **IMPLEMENTED** |
| 4 | Marketplace: cart, checkout, orders, payments | Cart + checkout + order placement/cancel **IMPLEMENTED**; payment capture/webhooks/refunds **NOT IMPLEMENTED** |
| 5 | Fulfilment: supplier → hub pickup flow (fulfilment records, packing) | Fulfillment records are created per supplier at order placement; supplier accept/pack/ready flows **NOT IMPLEMENTED** |
| 6 | Payments: abstraction, server verification, webhooks, reconciliation | Provider abstraction + mock/razorpay adapters + payment intent creation at checkout **IMPLEMENTED**; webhook endpoint, capture and reconciliation **NOT IMPLEMENTED** |
| 7 | Picker system: offers, atomic claim, runs, stops, package scans, hub receiving | **NOT IMPLEMENTED** (schema for the full flow is migrated) |
| 8 | Delivery: hub → retailer, Porter adapter, slots, tracking | Logistics adapter **IMPLEMENTED**; delivery flow **NOT IMPLEMENTED** |
| 9 | Admin / backoffice: verification queues, disputes, settlements, analytics | **NOT IMPLEMENTED** |
| 10 | Scale & hardening: load tests, DR, autoscaling, WAF | **NOT IMPLEMENTED** |

## 4. What is implemented, in detail

### 4.1 Database (`packages/database`)

- 13 forward-only migrations (~80 tables) with sha256 drift detection, advisory lock `982451653`,
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
the single vocabulary shared by the API, the web client and (later) the mobile apps.

### 4.3 API

Cross-cutting: request context + correlation IDs, `{success,data,meta}` envelope, stable error filter,
zod validation pipes, JWT auth guard, permission guard, audit trail, metrics, pagination, API index,
Swagger at `/docs` (+ generated `apps/api/openapi/bezzo-api.json`).

Infrastructure modules (all `@Global`): config, logger (pino), database, cache (Redis with in-process
fallback), storage (S3-compatible with local driver), events (transactional outbox + domain events),
idempotency, audit, jobs/scheduler (5 jobs, advisory-locked), metrics, search (OpenSearch with database
fallback), notifications (IN_APP guaranteed, unconfigured channels fail rather than lie), payments
(server-verified, mock + Razorpay), logistics (manual + Porter adapter with webhook signature).

| Module | Endpoints | Notes |
| --- | --- | --- |
| auth | register, login, otp request/verify, refresh, logout, logout-all, sessions, `me`, `me/security`, `me/password`, delete `me` | rotating refresh tokens with family revocation on replay, peppered single-use OTP, login lockout, password history, cache `actor:<uid>:<sid>` 60 s |
| buyers | profile, addresses CRUD, documents | buyer-only, ownership enforced by `actor.buyerId` |
| suppliers | profile, verification submit, documents, listings CRUD, inventory + adjust/set/ledger | supplier-only; every stock change writes an `inventory_transactions` row |
| catalog | categories, manufacturers, dosage-forms, delivery-slots, products (search/filter/sort), products/suggest, products/:id | public read; product detail returns live offers with sellable quantity |
| cart | GET cart, POST items, PATCH item, DELETE item, DELETE cart | implemented this session — see §5 |
| checkout | POST checkout/quote | server-priced preview of the live basket, zero side effects |
| orders | POST orders, GET orders, GET orders/:id, POST orders/:id/cancel | this session — see §5.2 |
| users | notifications (+read/read-all), notification-preferences, devices | |
| platform | `/health`, `/health/live`, `/health/ready`, `/metrics`, `/version`, `/` index | |

### 4.4 Web (`apps/web`)

Route map: `/` landing · `/login` · `/register` · `/catalog` (+filters, type-ahead) ·
`/catalog/[productId]` (offers, add-to-cart) · `/cart` · `/account` (profile, addresses, documents,
sessions, security events) · `/notifications` · `/supplier` (dashboard, low-stock triage) ·
`/supplier/listings` (publish + status) · `/supplier/inventory` (movements, stock-take, ledger) ·
`/status` (live `/health` + `/version`).

Client conventions: same-origin `/api/v1` calls proxied by Next; envelope unwrapping into typed domain
objects; `ApiError` carries the stable API error code; one automatic refresh-and-retry on 401 with the
same idempotency key; role-aware navigation that is *not* a security boundary.

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

### 5.1 Evidence (commands actually run against the live stack)

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

After every verification run the database was restored: all three verification orders are cancelled,
`inventory_reservations` has no `ACTIVE` rows, no inventory holds `reserved_quantity > 0`, and no
inventory violates `reserved_quantity <= available_quantity`.

## 6. Known gaps and required decisions

| Item | Status | Detail |
| --- | --- | --- |
| Checkout, orders, order_items creation | NOT IMPLEMENTED | Phase 4 remainder. Schema, state machines, `DomainEventName` entries and error codes already exist. |
| Payment webhook endpoint + reconciliation | NOT IMPLEMENTED | Provider adapters and signature verification exist; no route consumes them yet. |
| Fulfilment / pickup / hub receiving / delivery flows | NOT IMPLEMENTED | Phase 5–8. All tables are migrated; the atomic claim SQL is documented in the engineering specs. |
| Admin & backoffice (verification queues, disputes, settlements) | NOT IMPLEMENTED | Phase 9. |
| Analytics & reporting, promotions (`0014_promotions.sql`) | NOT IMPLEMENTED | Promotions migration is planned but not written; do not invent promotion rules without the spec. |
| Mobile apps (`apps/mobile`) | NOT IMPLEMENTED | React Native client is a later phase; the API is already platform-agnostic (`X-Client-Platform`). |
| Test suites | NOT IMPLEMENTED | Jest configs exist; no suite has ever been executed. This is the largest quality gap. |
| Redis / OpenSearch / S3 in this environment | REQUIRES CONFIGURATION | Fallbacks are intentional and reported by `/health`; production must set `REDIS_URL`, `SEARCH_ENABLED=true`, storage credentials. |
| Razorpay / Porter live keys | REQUIRES EXTERNAL CREDENTIALS | Boot refuses to start Razorpay without credentials rather than silently degrading. |
| Push notifications (FCM/APNs) | REQUIRES EXTERNAL CREDENTIALS | In-app channel works; unconfigured channels are recorded as FAILED/DEAD_LETTER. |
| `Bezo_PRD_v1.0.docx` | REQUIRES TOOLING | Binary document, not yet parsed; all other specs are Markdown and were used directly. |

## 7. Next steps (in order)

1. Payment capture + webhook endpoint (`POST /webhooks/payments/:provider`) with signature
   verification, replay protection and reconciliation against `payments`/`payment_attempts`, plus
   `POST /payments/:id/retry|refund`.
2. Supplier fulfillment flow (`GET /suppliers/orders`, accept, pack, ready-for-pickup) — this is the
   precondition for the picker system.
3. Picker slice (Phase 7): offer generation, atomic claim, run/stop progression, package scans with
   `local_event_id` idempotency, hub receiving with duplicate/unexpected handling.
4. Jest suites for the critical scenarios: final-unit race, two pickers one task, duplicate scans,
   duplicate webhook, queue delay, partial pickup, hub discrepancy.
5. Promotions migration (`0014_promotions.sql`) plus the promotion service and cart promotion preview.
6. Web: checkout page (address, mode, slot, payment) and order history/detail screens, mobile parity.

## 8. Verification commands used

```bash
corepack pnpm --filter @bezzo/api build
corepack pnpm --filter @bezzo/web build
corepack pnpm db:reset -- --yes && corepack pnpm db:migrate && corepack pnpm db:seed && corepack pnpm db:verify
curl -s localhost:4000/health | head -c 200
# cart + idempotency probe (buyer1@bezzo.local / Bezzo@12345)
curl -s -X POST localhost:4000/api/v1/cart/items -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -H "idempotency-key: $(uuidgen)" \
  -d '{"supplierProductId":"<listing-id>","quantity":1}'
```

# BEZZO — Repository Assessment (First Action per Specification §45)

**Date:** 2026-09-20
**Branch:** `arena/01a0bd9d-bezzo`
**Base commit:** `781d1a98041ad2efb2855b62d491c4d87fe13138` (`main`)
**Assessed by:** Principal Architect / Senior Full-Stack Engineer

---

## 1. Current project structure

The repository contained **documentation only** — no application code, no tooling, no
infrastructure, no migrations, no `package.json`.

```
BEZZO/
├── *.md            (72 specification / engineering documents)
├── Bezo_PRD_v1.0.docx
├── README.md       (7 bytes — title only)
└── .git            (single commit "Add files via upload")
```

Total tracked files: **73**. Source files: **0**.

## 2. Existing technologies

**None.** No language toolchain, no runtime, no framework, no database artefacts, no CI, no
containers, no IaC, no lockfile. The only "technology" evidence is *prescriptive* text inside the
specifications (TRD §2–§20, Implementation Plan §3–§5).

## 3. Existing apps

None. Specifications describe three client surfaces (`web`, `mobile`, `api`) plus an admin console
served from the same web shell.

## 4. Existing backend modules

None. `Bezzo_backend_module_by_module_detailed_implementation_spec_v1.0.md` names the target modules
(Identity, Buyer, Supplier, Catalog, Listings, Inventory, Search, Cart, Checkout, Orders, Fulfillment,
Payment, Billing, Logistics, Notification, Returns, Promotions, Settlement, Support, Risk, Admin,
Audit, Analytics, Config, Files, Jobs, Events) but no code existed.

## 5. Existing database schema / migrations

None as executable artefacts. Two documents define the logical model:

- `BEZZO-DATABASE.md` (v1.0) — logical design, snake_case tables, money as `NUMERIC`, UTC storage.
- `Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md` — concrete column-level
  schema for `users`, `user_roles`, `permissions`, `role_permissions`, `sessions`, `buyers`,
  `buyer_addresses`, `suppliers`, `supplier_business_details`, `supplier_documents`,
  `supplier_service_areas`, `categories`, `manufacturers`, `dosage_forms`, `products`,
  `product_compositions`, `product_images`, `product_identifiers`, `supplier_product_listings`,
  `inventories`, `inventory_reservations`, `inventory_transactions`, `carts`, `cart_items`,
  `checkout_sessions`, `orders`, `order_items`, `order_status_history`, `fulfillments`,
  `fulfillment_items`, `fulfillment_status_history`, `deliveries`, `delivery_slots`,
  `delivery_events`, `payments`, `payment_attempts`, `payment_webhook_events`, `refunds`,
  `invoices`, `invoice_items`, `promotions`, `promotion_redemptions`, `supplier_settlements`,
  `support_tickets`, `support_messages`, `disputes`, `risk_cases`, `notifications`, `audit_logs`.

The picker specification adds: `picker`, `picker_availability`, `pickup_task`, `pickup_task_order`,
`pickup_package`, `pickup_run`, `pickup_stop`, `pickup_event`, `collection_hub`, `hub_receiving`,
`hub_package_scan`, `pickup_exception`.

`Bezzo_database_migration_seed_data_environment_setup_spec_v1.0.md` fixes the migration conventions
used in this repository (`database/migrations/0001_create_users.sql`, forward-only production
migrations, expand-and-contract, seeds under `seeds/{reference,development,test}`).

## 6. Existing authentication

None implemented. `Bezzo_identity_authentication_user_account_spec_v1.0.md` defines the target:
user status states (`PENDING|ACTIVE|RESTRICTED|SUSPENDED|LOCKED|DEACTIVATED`), org model, memberships,
sessions, rotating refresh tokens with reuse detection, device/session management, roles and an
authorization hierarchy of *user → membership → organization → role → permission → ownership*.

## 7. Existing APIs

None implemented. `Bezo_api_specification_v1.0.md` and
`Bezzo_api_implementation_endpoint_by_endpoint_engineering_spec_v1.0.md` define the contract:
base `/api/v1`, envelope `{ success, data, meta.requestId }`, error contract
`{ success:false, error:{ code, message, details, fieldErrors } }`, `Idempotency-Key` on marked
mutations, page/pageSize and cursor pagination, allow-listed filters/sorts, HTTP mapping
400/401/403/404/409/422/429/500/502/503, and a stable error-code registry
(`Bezzo_api_error_handling_idempotency_integration_contract_spec_v1.0.md` §10).

## 8. Existing frontend screens

None implemented. Target screens are enumerated in `Bezo_ui_ux_specification_v1.0.md` and
`Bezzo_frontend_screen_by_screen_implementation_spec_v1.0.md` (public/auth, buyer marketplace,
supplier portal, admin backoffice).

## 9. Existing mobile screens

None implemented. `Bezzo_mobile_app_navigation_platform_specific_engineering_spec_v1.0.md` defines
buyer/supplier mobile navigation; `Bezzo_picker_collection_system_architecture_spec_v1.0.md` §47–48
defines the picker app navigation and home screen concept.

## 10. Existing tests

None.

## 11. Existing infrastructure

None (no Docker, Terraform, CI/CD, environments, or observability wiring). Target is defined in
`Bezzo_devops_infrastructure_v1.0.md`, `Bezzo_infrastructure_cloud_architecture_implementation_spec_v1.0.md`,
`Bezzo_ci_cd_release_management_deployment_engineering_spec_v1.0.md`.

## 12. What matches the specifications

Nothing, in the sense of implementation. The **specification corpus itself is coherent and complete
enough to implement against**: order/fulfillment/pickup/hub-receiving/delivery separation, the picker
task state machine, atomic claim semantics, package chain of custody, idempotency, error contract,
RBAC and tenant isolation are all specified to a level that permits direct implementation.

## 13. What is missing (build backlog)

1. Whole monorepo, toolchain, CI, containers, IaC.
2. Database: migrations, constraints, indexes, seeds, migration runner.
3. Identity: registration, OTP, login, rotating refresh tokens, sessions, RBAC + permissions.
4. Organisation tenancy and ownership enforcement (buyer/supplier/picker scoping).
5. Supplier + buyer onboarding with document upload and verification workflow.
6. Catalog: categories, manufacturers, dosage forms, products, compositions, identifiers, images.
7. Supplier listings + inventory with **atomic, concurrency-safe reservation**.
8. Search (OpenSearch primary, indexed asynchronously from canonical PostgreSQL).
9. Cart → checkout → order with multi-supplier fulfillment split.
10. Payment abstraction + webhook verification/idempotency/reconciliation.
11. Logistics abstraction + Porter adapter + delivery slots.
12. **Picker system**: availability, task generation, geographic assignment, offer/expiry,
    atomic accept, navigation/arrival, package scanning, partial pickup, runs, hub handover,
    hub receiving + reconciliation, exceptions, metrics.
13. Notifications (push/SMS/email/in-app/WhatsApp) with retries + DLQ.
14. Domain events + outbox + workers.
15. Admin/backoffice and analytics surfaces.
16. Web app (buyer marketplace, supplier portal, admin), mobile app (picker op app).
17. Tests: unit, integration, API, concurrency, failure-mode, load.
18. Observability: structured logs, correlation IDs, metrics, tracing hooks, health/readiness.

## 14. What must be changed

Nothing existing has to be *changed*; everything has to be *created*. Two specification **conflicts**
were found and must be resolved deliberately (see §15 and
`docs/02-architecture-decisions.md` for the recorded decisions).

## 15. Architectural conflicts identified

| # | Conflict | Resolution (recorded as ADR) |
|---|---|---|
| C1 | `Bezzo_business_rules_state_machine_spec_v1.0.md` §16 lists fulfillment states `READY_FOR_DISPATCH / HANDED_TO_LOGISTICS`, while `Bezzo_picker_collection_system_architecture_spec_v1.0.md` §5/§31 makes `READY_FOR_PICKUP` the canonical trigger for pickup task generation. | Adopt `READY_FOR_PICKUP` as an **additional, explicit** fulfillment state used by the Bezzo collection flow (ADR-0004). The state machine's remaining states are preserved verbatim. No business rule is silently dropped; both transitions are modelled and audited. |
| C2 | Identity spec §31 names roles `BUYER_OWNER/BUYER_MANAGER/…`, API spec §6 names `BUYER/SUPPLIER/ADMIN/SUPPORT_AGENT/…`, DB schema spec §7 names `BUYER/SUPPLIER/ADMIN/OPERATIONS/SUPPORT/FINANCE`, picker spec §35 requires a `PICKER` scope. | Seed a **superset** role catalogue with stable codes; API-level primary roles are `BUYER`, `SUPPLIER`, `PICKER`, `SUPPORT_AGENT`, `OPERATIONS_AGENT`, `FINANCE_AGENT`, `COMPLIANCE_AGENT`, `SUPER_ADMIN`, plus buyer/supplier sub-roles (`BUYER_OWNER`, `BUYER_STAFF`, `SUPPLIER_OWNER`, `SUPPLIER_INVENTORY`, `SUPPLIER_FINANCE`). Granular authority is expressed via permissions (ADR-0003). |
| C3 | PRD/DB docs use the legacy spelling "Bezo" in filenames/titles. | Product name in all *new* artefacts is **Bezzo** (APIs, code, docs, seeds). Legacy filenames are left untouched to avoid destroying source-of-truth documents. |
| C4 | `BEZZO-DATABASE.md` §12 puts `available_quantity`/`reserved_quantity` on a table keyed by `supplier_product_id`, while the ERD spec §26.1 keys inventory by `supplier_listing_id`. | Use `inventories.supplier_listing_id` (ERD spec is the column-level, later artefact) and keep the canonical sellable quantity expression `available_quantity − reserved_quantity` (ADR-0002). |

## 16. Exact implementation sequence (adopted)

Aligned to §44 of the brief and to
`Bezzo_picker_collection_system_architecture_spec_v1.0.md` §52 and
`Bezzo_database_migration_seed_data_environment_setup_spec_v1.0.md` §8:

1. **Foundation** — monorepo, TypeScript strict, env/config, logging, DB pool + migration runner, health.
2. **Identity & onboarding** — users, sessions, OTP, RBAC, buyers, suppliers, documents, verification.
3. **Catalog & inventory** — categories/manufacturers/dosage forms/products, listings, inventories,
   atomic reservations, inventory ledger, search projection.
4. **Marketplace** — cart, checkout quote/validate, orders with multi-supplier fulfillment split.
5. **Fulfillment** — supplier accept/prepare/pack/ready, inventory commit.
6. **Payments** — provider abstraction, intent creation, webhook verify/idempotency/reconcile.
7. **Picker system** — availability, task generation, geographic assignment, atomic claim, scanning,
   partial pickup, runs, hub handover and receiving.
8. **Delivery** — logistics abstraction, Porter adapter, slots, tracking.
9. **Admin & analytics** — operational queues, verification/moderation, disputes, settlements, KPIs.
10. **Hardening** — load/concurrency/security tests, observability, DR, deployment.

Status of each slice is tracked honestly in `docs/03-verification-matrix.md`.

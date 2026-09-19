# Bezzo Database Migration, Seed Data & Environment Setup Specification v1.0

**Product:** Bezzo  
**Document:** Database Migration, Seed Data & Environment Setup Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Primary Database:** PostgreSQL  
**Cache / Jobs:** Redis  
**Search:** OpenSearch-compatible  
**Object Storage:** S3-compatible  

---

# 1. Purpose

This document defines how the Bezzo database and supporting local development data are created, migrated, seeded, tested, and promoted across environments.

It covers:

- database environment setup
- migration standards
- migration ordering
- schema bootstrap
- reference data
- development seed data
- test data
- staging data
- production initialization
- safe data backfills
- rollback strategy
- migration validation
- database reset procedures
- environment isolation
- CI/CD database operations

The goal is to make database changes repeatable and safe across development, testing, staging, and production.

---

# 2. Environment Model

Bezzo should maintain separate database environments.

```text
LOCAL
  ↓
TEST
  ↓
STAGING
  ↓
PRODUCTION
```

Each environment must have:

- separate credentials
- separate database instances or isolated databases
- separate Redis resources where appropriate
- separate object-storage namespaces/buckets
- separate search indexes
- environment-specific configuration

Production data must never be copied into local development by default.

---

# 3. Environment Responsibilities

## 3.1 Local

Purpose:

- developer implementation
- feature development
- local integration testing

Characteristics:

- disposable
- seedable
- resettable
- safe synthetic data

## 3.2 Test

Purpose:

- automated tests
- integration tests
- API tests
- migration verification

Characteristics:

- deterministic
- isolated
- recreated frequently

## 3.3 Staging

Purpose:

- release validation
- realistic workflow testing
- performance testing
- migration rehearsal

Characteristics:

- production-like schema
- production-like infrastructure topology where practical
- synthetic or approved non-production data

## 3.4 Production

Purpose:

- live marketplace operations

Characteristics:

- persistent
- protected
- backup-enabled
- monitored
- strictly access controlled

---

# 4. Database Naming

Use environment-specific names.

Example:

```text
bezzo_local
bezzo_test
bezzo_staging
bezzo_production
```

The exact naming convention may follow cloud/provider conventions, but environment isolation must remain obvious.

---

# 5. Migration Technology

The project must use one authoritative migration mechanism.

The chosen migration tool must provide:

- ordered migrations
- migration history
- transaction support where possible
- repeatability
- CI integration
- production execution controls

Do not allow developers to make undocumented production schema changes manually.

---

# 6. Migration Directory

Recommended structure:

```text
database/
├── migrations/
│   ├── 0001_create_users.sql
│   ├── 0002_create_roles.sql
│   ├── 0003_create_buyers.sql
│   ├── 0004_create_suppliers.sql
│   ├── 0005_create_catalog.sql
│   └── ...
│
├── seeds/
│   ├── reference/
│   ├── development/
│   └── test/
│
└── scripts/
    ├── migrate
    ├── rollback
    ├── seed
    ├── reset
    └── verify
```

If an ORM migration system is selected, equivalent organization should be maintained.

---

# 7. Migration Naming

Migration names must communicate the change.

Good:

```text
0001_create_users
0002_create_supplier_tables
0003_add_order_status_history
0004_add_inventory_reservation_index
```

Avoid:

```text
change1
fix
update
misc
```

---

# 8. Migration Ordering

Initial migration order should follow domain dependencies.

Recommended:

```text
1. Extensions / database prerequisites
2. Users
3. Roles and permissions
4. Sessions
5. Buyers
6. Buyer addresses
7. Suppliers
8. Supplier verification/documents
9. Categories
10. Manufacturers
11. Dosage forms
12. Products
13. Product compositions
14. Product images
15. Product identifiers
16. Supplier listings
17. Inventory
18. Inventory reservations
19. Inventory transactions
20. Carts
21. Cart items
22. Checkout sessions
23. Orders
24. Order items
25. Order status history
26. Fulfillments
27. Fulfillment items
28. Fulfillment history
29. Delivery slots
30. Deliveries
31. Delivery events
32. Payments
33. Payment attempts
34. Payment webhook records
35. Refunds
36. Invoices
37. Promotions
38. Promotion redemptions
39. Supplier settlements
40. Support tickets
41. Support messages
42. Disputes
43. Risk cases
44. Notifications
45. Notification deliveries
46. Audit logs
47. Documents
48. Idempotency records
49. Configuration
50. Operational metadata
```

The actual migration sequence may combine closely related tables when dependencies permit.

---

# 9. Migration Rules

Every migration must be:

- deterministic
- version controlled
- reviewed
- tested
- documented
- safe for the target environment

A migration must not depend on a developer's local machine state.

---

# 10. Forward-Only Production Principle

Production migrations should generally be treated as forward-only.

Instead of:

```text
production
  ↓
rollback schema
```

prefer:

```text
production
  ↓
new corrective migration
```

This is safer once real production data exists.

Rollback scripts may still be maintained for development/test environments where practical.

---

# 11. Expand-and-Contract Pattern

Breaking schema changes should use an expand-and-contract strategy.

Example:

### Step 1

Add new nullable column.

### Step 2

Deploy code that writes both old and new fields.

### Step 3

Backfill historical rows.

### Step 4

Switch reads to new field.

### Step 5

Stop writing old field.

### Step 6

Remove old field in a later migration.

This reduces deployment risk.

---

# 12. Avoid Blocking Migrations

Large production tables require special care.

Avoid migrations that unnecessarily:

- lock large tables for long periods
- rewrite entire tables
- rebuild large indexes synchronously without planning
- perform huge data updates inside one transaction

Large changes should use staged backfills or online-safe techniques where supported.

---

# 13. Index Creation

Large production indexes should be created using production-safe methods where supported.

The deployment plan must consider:

- table size
- lock behavior
- concurrent traffic
- disk usage
- query impact
- rollback/recovery

---

# 14. Data Backfills

A backfill is different from a schema migration.

Recommended structure:

```text
Schema Migration
      ↓
Application Compatibility
      ↓
Backfill Job
      ↓
Validation
      ↓
Application Cutover
      ↓
Cleanup Migration
```

Do not hide multi-million-row business-data transformations inside a single deployment migration unless the operation is proven safe.

---

# 15. Backfill Requirements

Every production backfill must define:

- purpose
- source fields
- target fields
- batch size
- retry behavior
- progress tracking
- failure handling
- validation query
- completion criteria
- rollback/compensation strategy

---

# 16. Reference Data

Reference data is required for stable system vocabularies.

Examples:

```text
Roles
Permissions
Dosage Forms
Categories
Delivery Slots
Order Status Definitions
Payment Method Types
Notification Types
Document Types
```

Reference data must be version controlled.

---

# 17. Reference Data Principles

Reference records should have stable identifiers/codes.

Prefer:

```text
TABLET
CAPSULE
SYRUP
```

over relying on display text such as:

```text
Tablet
Capsule
Syrup
```

Display labels can change; stable codes should not.

---

# 18. Seed Categories

Initial category seed data should represent the approved pharmaceutical catalog taxonomy.

Examples may include:

```text
Analgesics
Anti-inflammatory
Antibiotics
Antivirals
Antifungals
Antiparasitics
Cardiovascular
Diabetes / Endocrine
Gastrointestinal
Respiratory
CNS / Neurological
Dermatology
Ophthalmic
ENT
Urological
Oncology
Vaccines / Biologics
Vitamins / Minerals
```

The production taxonomy must use the final approved catalog/compliance specification rather than blindly assuming this example list is exhaustive.

---

# 19. Delivery Slot Seed

Initial configurable slots may include:

```text
MORNING
AFTERNOON
EVENING
```

Example conceptual windows:

```text
MORNING   08:00–12:00
AFTERNOON 12:00–16:00
EVENING   16:00–20:00
```

These are configuration examples, not immutable business rules.

---

# 20. Development Seed Data

Development seeds should provide enough data to exercise major workflows.

Suggested synthetic dataset:

```text
5 buyers
5 suppliers
50 products
100 supplier listings
200 inventory records
20 carts
50 orders
75 order items
multiple fulfillments
payments
deliveries
support tickets
promotions
settlements
```

The exact size may be adjusted for developer performance.

---

# 21. Development Users

Development users should be clearly synthetic.

Example accounts:

```text
buyer.demo
supplier.demo
admin.demo
support.demo
finance.demo
```

Credentials must never match production credentials.

Development passwords should be generated/configured locally and must not be committed as secrets.

---

# 22. Supplier Seed Scenarios

Development suppliers should represent multiple states:

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
ACTIVE
REJECTED
SUSPENDED
```

This allows the UI and backend workflows to be tested across lifecycle states.

---

# 23. Inventory Seed Scenarios

Include:

```text
In stock
Low stock
Out of stock
Reserved stock
Blocked stock
Expired stock
Damaged stock
```

This is required for testing buyer discovery, supplier operations, and allocation logic.

---

# 24. Order Seed Scenarios

Development orders should cover:

```text
PENDING
CONFIRMED
PROCESSING
READY_FOR_PICKUP
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
```

Also include:

- single-supplier orders
- multi-supplier orders
- failed payments
- refunded orders
- scheduled delivery
- instant delivery

---

# 25. Payment Seed Scenarios

Test data should cover:

```text
PENDING
AUTHORIZED
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
CANCELLED
```

Do not use real payment credentials.

Use gateway sandbox references or synthetic references.

---

# 26. Supplier Settlement Seed Scenarios

Include:

```text
CALCULATED
REVIEWED
APPROVED
PROCESSING
PAID
FAILED
```

Settlement values should be synthetic.

---

# 27. Support Seed Scenarios

Create tickets covering:

```text
OPEN
ASSIGNED
IN_PROGRESS
WAITING_FOR_CUSTOMER
ESCALATED
RESOLVED
CLOSED
```

Include examples linked to orders and examples not linked to orders.

---

# 28. Test Seed Data

Automated tests should use deterministic fixtures/factories rather than depending on the general development seed.

Recommended:

```text
factoryUser()
factoryBuyer()
factorySupplier()
factoryProduct()
factoryListing()
factoryInventory()
factoryOrder()
factoryPayment()
```

Factories should allow controlled overrides.

---

# 29. Test Isolation

Each automated test should be isolated.

Possible strategies:

- transaction rollback
- disposable database
- test schema
- truncated tables
- fixture reset

The selected strategy must support parallel testing safely.

---

# 30. Local Database Reset

Developers should have a simple reset command.

Conceptually:

```text
database reset
   ↓
drop/recreate schema
   ↓
run migrations
   ↓
load reference data
   ↓
load development seed
```

The reset operation must be impossible to accidentally point at production.

---

# 31. Environment Guardrails

Database scripts must identify the target environment before destructive actions.

Examples:

```text
RESET DATABASE
Environment: LOCAL
Proceed? YES
```

Production reset commands should be blocked entirely from ordinary developer tooling.

---

# 32. Seed Idempotency

Reference seeds should be safely repeatable.

Prefer:

```text
INSERT ... ON CONFLICT ...
```

or equivalent migration/seed behavior.

Running a seed twice should not create duplicate reference records.

---

# 33. Seed Ordering

Seed order must respect foreign keys.

Example:

```text
Roles
 ↓
Permissions
 ↓
Users
 ↓
Suppliers
 ↓
Products
 ↓
Listings
 ↓
Inventory
 ↓
Orders
```

---

# 34. Production Seed Policy

Production should not receive development/demo seed data.

Production initialization should contain only:

- required system configuration
- approved reference data
- necessary administrative bootstrap records
- legally/business-approved catalog seed where applicable

---

# 35. Production Admin Bootstrap

The first administrative account must be created through a controlled secure process.

Do not commit an admin password into:

- source control
- migration files
- seed files
- container images

Bootstrap credentials should be injected securely and rotated.

---

# 36. Catalog Data Import

Large pharmaceutical catalog imports should not be embedded as giant SQL migration files.

Recommended flow:

```text
Source Data
   ↓
Validation
   ↓
Normalization
   ↓
Staging
   ↓
Review
   ↓
Import
   ↓
Index Search
```

The import pipeline should provide error reporting for invalid records.

---

# 37. Catalog Import Staging

For large imports, use staging structures such as:

```text
catalog_import_batches
catalog_import_rows
```

Potential metadata:

```text
batch_id
source
source_version
row_number
status
error_message
normalized_payload
created_at
```

This provides operational visibility.

---

# 38. Data Validation During Import

Validate:

- required product identity
- manufacturer
- dosage form
- composition
- strength
- pack information
- identifiers
- category mapping
- image references
- regulatory fields where applicable

Invalid rows should not silently enter the production catalog.

---

# 39. Import Idempotency

Imports must avoid creating duplicate products.

Use stable source identifiers or controlled matching rules.

Potential matching hierarchy:

```text
Trusted external identifier
   ↓
Manufacturer + product identifier
   ↓
Approved normalized identity
   ↓
Manual review for ambiguous matches
```

Do not automatically merge ambiguous pharmaceutical products.

---

# 40. Migration Testing

Every migration must be tested against:

1. empty database
2. previous production-like schema
3. representative data volume
4. expected indexes
5. expected constraints

---

# 41. Migration CI Pipeline

Recommended:

```text
Checkout
 ↓
Create empty PostgreSQL
 ↓
Run all migrations
 ↓
Run schema verification
 ↓
Load reference seeds
 ↓
Run integration tests
 ↓
Run rollback/dev safety checks where applicable
 ↓
Destroy environment
```

---

# 42. Schema Verification

Automated checks should verify:

- required tables exist
- required columns exist
- primary keys exist
- foreign keys exist
- unique constraints exist
- important indexes exist
- expected reference records exist

---

# 43. Migration Drift

Schema drift occurs when the actual database differs from the version-controlled schema.

Prevent drift by:

- disabling unmanaged manual schema changes
- reviewing all production DDL
- running schema verification
- using migration history
- periodically comparing expected and actual schema

---

# 44. Migration Locking

Migration execution should use a migration lock so that two deployment processes cannot modify the same database schema simultaneously.

Example:

```text
Deployment A → migration lock acquired
Deployment B → waits/fails safely
```

---

# 45. Deployment Migration Sequence

Production deployment should generally follow:

```text
Backup / recovery check
        ↓
Pre-deployment validation
        ↓
Acquire migration lock
        ↓
Run schema migration
        ↓
Run required data migration/backfill
        ↓
Validate schema
        ↓
Deploy compatible application
        ↓
Verify health
        ↓
Release migration lock
```

For expand-and-contract changes, application and schema deployment may be deliberately separated.

---

# 46. Migration Failure

If a migration fails:

1. stop further migration execution
2. preserve logs
3. determine whether transaction rollback occurred
4. inspect schema state
5. do not blindly rerun destructive SQL
6. apply a reviewed corrective migration if necessary

---

# 47. Rollback Strategy

Rollback depends on migration type.

### Safe rollback candidates

- development schema changes
- additive changes not used by application
- reversible reference data

### Production preferred approach

Use a forward correction migration.

Example:

```text
Migration 041 incorrect
       ↓
Migration 042 corrects data/schema
```

---

# 48. Large Table Backfills

Large backfills should process batches.

Example:

```text
10,000 rows
   ↓
batch 1
batch 2
batch 3
...
```

Track progress so the process can resume safely.

---

# 49. Backfill Monitoring

Backfills should expose:

- processed rows
- remaining rows
- failure count
- throughput
- estimated completion
- last processed identifier

Operational jobs must be observable.

---

# 50. Data Integrity Verification

After migrations/backfills, validate important invariants.

Examples:

```text
inventory.available_quantity >= 0

all order_items reference valid orders

all fulfillment_items reference valid fulfillments

all active supplier listings reference active/approved products

payment totals are non-negative

settlement records reconcile with source transactions
```

---

# 51. Environment Variables

Database tooling may require:

```text
DATABASE_URL
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD
DATABASE_SSL_MODE
REDIS_URL
SEARCH_URL
OBJECT_STORAGE_BUCKET
APP_ENV
```

Sensitive values must come from secret management.

---

# 52. Local Environment Example

A developer may use:

```text
APP_ENV=local
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SEARCH_URL=http://...
OBJECT_STORAGE_BUCKET=bezzo-local
```

Actual credentials belong in local environment configuration and must not be committed.

---

# 53. Staging Environment

Staging should be close enough to production to validate:

- migrations
- query plans
- indexes
- large data operations
- background jobs
- search indexing
- payment sandbox flows
- logistics sandbox/integration flows

---

# 54. Production Protection

Production database operations should require:

- approved deployment pipeline
- restricted credentials
- auditability
- backup/recovery readiness
- migration review
- monitoring

Developers should not have unrestricted direct production database access.

---

# 55. Database Seed Versioning

Reference seeds should be treated as versioned application assets.

Changes to controlled reference values should be reviewed like code.

Example:

```text
add_delivery_slot
add_dosage_form
add_permission
```

---

# 56. Development Data Privacy

Development data must be synthetic whenever possible.

If real data is ever required for debugging, it must undergo an approved privacy-safe process such as:

- masking
- minimization
- anonymization
- access restriction

Do not copy production personal/business documents into developer machines casually.

---

# 57. Production Catalog Seeding

The pharmaceutical catalog should be loaded through an approved data pipeline.

The initial production catalog should not be assumed to be complete merely because database tables exist.

Catalog onboarding requires:

- source validation
- taxonomy mapping
- duplicate handling
- product moderation
- image handling
- compliance checks
- search indexing

---

# 58. Migration Documentation

Each migration PR should document:

```text
Purpose
Tables affected
Columns affected
Indexes affected
Data impact
Locking impact
Expected duration
Rollback/correction strategy
Application compatibility
```

---

# 59. Database Change Review Checklist

Reviewers should verify:

### Schema

- correct data types
- correct nullability
- correct foreign keys
- correct constraints

### Performance

- indexes
- query plans
- table rewrite risk
- locking

### Data

- backfill correctness
- duplicate handling
- historical preservation

### Security

- sensitive data
- access controls
- retention

### Deployment

- ordering
- compatibility
- rollback/correction

---

# 60. Definition of Ready

A database change is ready when:

- schema change is defined
- affected modules are identified
- migration is written
- constraints are reviewed
- indexes are reviewed
- data migration needs are identified
- deployment order is known
- test coverage is defined

---

# 61. Definition of Done

A database change is complete when:

- migration is version controlled
- local migration succeeds
- test migration succeeds
- staging migration succeeds
- schema verification passes
- required seed/reference data is present
- data backfill completes if applicable
- application compatibility is verified
- performance impact is measured
- documentation is updated
- production deployment is completed safely

---

# 62. Final Database Operations Position

Bezzo database operations must be **migration-driven, environment-isolated, repeatable, and observable**.

The fundamental lifecycle is:

```text
Schema Design
     ↓
Migration
     ↓
Validation
     ↓
Seed / Reference Data
     ↓
Application Compatibility
     ↓
Staging Rehearsal
     ↓
Production Migration
     ↓
Verification
     ↓
Monitoring
```

The most important operational rules are:

1. never rely on undocumented manual production schema changes
2. never use production data as ordinary development seed data
3. never put real secrets into migrations or seed files
4. treat production schema changes as controlled deployments
5. use expand-and-contract for risky breaking changes
6. separate large backfills from ordinary schema changes
7. make seeds deterministic and repeatable
8. verify critical database invariants after changes
9. test restoration, not merely backup creation
10. keep schema, seed data, and application versions coordinated

---

**End of Specification**

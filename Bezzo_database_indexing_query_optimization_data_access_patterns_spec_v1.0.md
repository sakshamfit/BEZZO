# Bezzo Database Indexing, Query Optimization & Data Access Patterns Specification v1.0

## Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Database Indexing, Query Optimization & Data Access Patterns Specification |
| Version | 1.0 |
| Status | Baseline / Implementation Reference |
| Primary Audience | Backend, database, architecture, DevOps, QA |
| Primary Database | PostgreSQL |
| Supporting Data Systems | Redis, OpenSearch-compatible search, object storage |
| Related Documents | Bezzo Database Specification, Caching/Performance/Scalability, API, Event-Driven Architecture, Data Privacy |

---

# 1. Purpose

This specification defines how Bezzo accesses PostgreSQL efficiently and safely at application scale.

It covers:

- indexing
- query design
- ORM/query-builder usage
- transactions
- connection pooling
- pagination
- locking
- concurrency
- inventory access
- order access
- supplier access
- search boundaries
- reporting/read models
- caching interaction
- query observability
- migrations
- performance testing
- data-access conventions

The objective is to keep transactional operations predictable as Bezzo grows from an initial deployment to a high-volume B2B marketplace.

---

# 2. Core Database Principle

Bezzo PostgreSQL remains the authoritative transactional database.

The architecture should follow:

```text
PostgreSQL
    |
    +--> transactional truth
    +--> business state
    +--> inventory reservation
    +--> orders
    +--> payments/financial records
    +--> supplier/buyer records
```

Redis and search systems improve performance but must not silently replace transactional truth.

---

# 3. Data Access Rules

Every database access layer SHALL:

1. use parameterized queries
2. use connection pooling
3. avoid unbounded queries
4. avoid N+1 access patterns
5. select only required columns
6. use explicit transactions where required
7. keep transactions short
8. use indexes based on real access patterns
9. measure slow queries
10. avoid database calls from presentation-layer code

---

# 4. Data Access Architecture

Recommended:

```text
Controller/API
      |
Application Service
      |
Domain Service
      |
Repository / Query Layer
      |
PostgreSQL
```

The API controller should not directly contain complex SQL or business transaction logic.

---

# 5. Repository Responsibilities

Repositories should handle:

- persistence
- retrieval
- filtering
- pagination
- transactional queries
- locking where required
- mapping database records to domain/application models

Repositories should not decide business policy such as:

```text
whether an order may be cancelled
whether a supplier is legally eligible
whether a refund is approved
```

Those decisions belong in application/domain services.

---

# 6. Query Object / Read Query Pattern

Complex read operations should use explicit query objects.

Example:

```text
ProductSearchQuery
SupplierOrderListQuery
BuyerOrderHistoryQuery
AdminSettlementQuery
```

This avoids spreading database filtering logic across controllers and UI code.

---

# 7. PostgreSQL Connection Pooling

Every API/worker instance should use a bounded connection pool.

Pool sizing must consider:

```text
API replicas
worker replicas
background jobs
admin/reporting workload
database max_connections
```

Example principle:

```text
Total application connections
<
safe PostgreSQL connection capacity
```

Do not configure a large pool independently on every replica.

---

# 8. Connection Lifetime

Connections should be:

- reused
- released promptly
- monitored
- protected from leaks

A request must never leave a connection checked out because of an unhandled exception.

---

# 9. Transaction Rules

Use a database transaction when multiple changes must succeed or fail together.

Examples:

```text
create order
+
reserve inventory
+
create fulfillment
```

or:

```text
payment state update
+
financial record
+
outbox event
```

Do not use transactions merely because a query is a mutation.

---

# 10. Transaction Length

Transactions should be short.

Avoid:

```text
BEGIN
database update
external API call
wait 10 seconds
another query
COMMIT
```

Prefer:

```text
BEGIN
validate/update durable state
write outbox/intent
COMMIT

external provider call

persist provider result
```

External network calls should generally occur outside database transactions.

---

# 11. Isolation

Use the weakest isolation level that safely satisfies the business operation.

Default PostgreSQL transaction behavior should be sufficient for many operations.

Use stronger locking/isolation only when required by correctness.

Inventory and financial workflows require explicit concurrency design.

---

# 12. Optimistic Concurrency

Use versioning for resources where concurrent updates are likely.

Example:

```text
version = 17
```

Update:

```text
UPDATE supplier_offers
SET price = $1,
    version = version + 1
WHERE id = $2
  AND version = $3;
```

If zero rows are affected:

```text
RESOURCE_VERSION_CONFLICT
```

---

# 13. Pessimistic Locking

Use row locks only when necessary.

Example inventory reservation:

```sql
SELECT *
FROM inventory
WHERE id = $1
FOR UPDATE;
```

Then:

```text
validate available quantity
decrement/reserve
commit
```

Do not hold locks while calling external providers.

---

# 14. Inventory Reservation

Inventory is one of Bezzo's most concurrency-sensitive operations.

Required properties:

- atomic reservation
- no negative stock
- reservation expiry
- safe release
- idempotency
- transaction consistency

Example:

```text
BEGIN
  lock inventory row
  validate available quantity
  create reservation
  decrement available/reservable quantity
COMMIT
```

---

# 15. Avoiding Overselling

Never perform:

```text
SELECT available_stock
```

then later:

```text
UPDATE available_stock
```

as two unrelated operations for final reservation.

Two buyers can observe the same stock.

Use an atomic transaction/conditional update.

---

# 16. Atomic Inventory Update Alternative

For suitable models:

```sql
UPDATE inventory
SET available_quantity = available_quantity - $quantity,
    version = version + 1
WHERE id = $inventory_id
  AND available_quantity >= $quantity;
```

Then verify affected rows:

```text
1 -> reservation succeeded
0 -> insufficient/conflicting stock
```

---

# 17. Inventory Reservations

Reservations should have:

```text
reservation_id
inventory_id
order_id/cart_id
quantity
status
expires_at
created_at
released_at
```

Statuses:

```text
ACTIVE
CONFIRMED
RELEASED
EXPIRED
CANCELLED
```

Expired reservations must not permanently consume inventory.

---

# 18. Reservation Cleanup

A scheduled job should detect:

```text
ACTIVE
AND expires_at < now()
```

and release eligible reservations.

The release operation must itself be idempotent.

---

# 19. Supplier Inventory Queries

Avoid querying every supplier individually.

Bad:

```text
for supplier in suppliers:
    SELECT inventory...
```

Preferred:

```text
single/batched query
WHERE product_id = $1
AND supplier_id IN (...)
```

For large candidate sets, use indexed candidate selection.

---

# 20. Supplier Allocation

Supplier selection should be separated into:

```text
candidate retrieval
      |
business eligibility
      |
availability
      |
pricing/ranking
      |
inventory reservation
```

The final reservation remains authoritative.

---

# 21. Product Catalog Queries

Product listing APIs should select only listing fields.

Example:

```text
id
name
brand
generic_name
thumbnail
dosage_form
strength
manufacturer
pack_size
current_display_price
availability_summary
```

Do not load large compliance/document/image metadata for every list item.

---

# 22. Product Detail Queries

Product detail can retrieve richer information.

Use:

```text
product
+
approved supplier offers
+
approved images
+
relevant catalog metadata
```

Avoid loading unrelated supplier-private data.

---

# 23. Supplier Offer Queries

Supplier offers should commonly filter by:

```text
supplier_id
status
product_id
```

High-value composite indexes should follow actual query patterns.

Example:

```sql
CREATE INDEX idx_supplier_offers_supplier_status
ON supplier_offers (supplier_id, status);
```

---

# 24. Buyer Order History

Typical query:

```text
WHERE buyer_id = ?
ORDER BY created_at DESC
LIMIT ?
```

Recommended index pattern:

```sql
CREATE INDEX idx_orders_buyer_created
ON orders (buyer_id, created_at DESC);
```

Actual index definitions must be validated against the final schema.

---

# 25. Supplier Order Queue

Supplier operations commonly require:

```text
supplier_id
status
created_at
```

Example:

```sql
CREATE INDEX idx_fulfillments_supplier_status_created
ON fulfillments (supplier_id, status, created_at DESC);
```

This supports operational queue screens.

---

# 26. Admin Operational Queries

Admin dashboards often combine large datasets.

Avoid repeatedly executing expensive aggregate queries against the transactional database.

Use:

- cached aggregates
- read models
- analytics database/read replica
- precomputed metrics

where appropriate.

---

# 27. Pagination

Every potentially large list SHALL be paginated.

Never expose:

```text
SELECT * FROM orders
```

through an API.

Page size must have a server-enforced maximum.

Example:

```text
default = 20
maximum = 100
```

Exact values are configurable.

---

# 28. Offset Pagination

Offset pagination is acceptable for:

- small datasets
- admin tables
- low-volume screens

Example:

```text
LIMIT 20 OFFSET 40
```

It becomes less efficient at very large offsets.

---

# 29. Cursor Pagination

Cursor pagination is preferred for high-volume feeds.

Example:

```text
created_at
id
```

cursor:

```text
(created_at, id)
```

Query:

```sql
WHERE (created_at, id) < ($created_at, $id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

The tie-breaker ID provides deterministic ordering.

---

# 30. Search vs PostgreSQL

Do not force PostgreSQL to perform all marketplace discovery.

Use OpenSearch-compatible infrastructure for:

- full-text search
- fuzzy matching
- autocomplete
- relevance ranking
- large faceted discovery

PostgreSQL remains authoritative for the underlying catalog and transactional data.

---

# 31. Search Result Hydration

Search results should not cause an N+1 database pattern.

Preferred options:

1. Store safe display fields in the search document.
2. Batch hydrate required authoritative fields.
3. Use a read model.

Do not make one database query per search result.

---

# 32. Cache and Database Interaction

Preferred:

```text
Request
  |
  v
Cache
  |
  +-- HIT --> response
  |
  +-- MISS
        |
        v
     Database
        |
        v
     Cache
```

Cache should not hide database correctness problems.

---

# 33. Cache Invalidation from Events

Use domain events to invalidate/rebuild caches.

Example:

```text
product.updated
      |
      v
invalidate product cache
```

```text
inventory.updated
      |
      v
invalidate availability cache
```

This integrates with the Bezzo event-driven architecture.

---

# 34. Query Result Caching

Cache only when:

- query is read-heavy
- result is safe to cache
- staleness is acceptable
- invalidation is understood
- cache key is complete

Avoid caching highly volatile financial or authorization decisions without strict controls.

---

# 35. N+1 Detection

The codebase should monitor query count per API request.

Example warning:

```text
GET /orders
queries = 121
```

when expected:

```text
queries = 3-8
```

Query count regression should fail performance tests for critical endpoints where practical.

---

# 36. Selective Columns

Avoid:

```sql
SELECT *
```

in production application queries.

Prefer:

```sql
SELECT id, name, status, created_at
```

This reduces:

- network transfer
- memory usage
- serialization cost
- accidental sensitive-field exposure

---

# 37. Join Discipline

Joins should be based on actual data requirements.

Avoid giant queries that join:

```text
orders
users
supplier
products
payments
fulfillments
notifications
analytics
```

for a basic order list.

Use targeted queries/read models.

---

# 38. Aggregation Queries

Large aggregates should be:

- indexed
- bounded
- measured
- cached/precomputed when appropriate

Example:

```text
supplier sales dashboard
```

should not calculate years of transaction history on every page refresh.

---

# 39. Counting Rows

`COUNT(*)` over very large datasets can become expensive.

For dashboards, consider:

- precomputed counters
- materialized/read models
- approximate counts where exactness is not required

Exact transactional counts remain available when required.

---

# 40. Reporting Queries

Heavy reporting should use:

```text
read replica
analytics store
precomputed tables
```

rather than competing with checkout/order transactions on the primary database.

---

# 41. Materialized Views

Materialized views may be used for expensive stable reporting queries.

Example:

```text
supplier_daily_sales
admin_daily_order_metrics
```

Refresh strategy must be documented.

Do not use materialized views for highly volatile transaction decisions.

---

# 42. Database Constraints

Use database constraints for correctness.

Examples:

```text
PRIMARY KEY
UNIQUE
FOREIGN KEY
CHECK
NOT NULL
```

Application validation is necessary but should not be the only line of defense for critical invariants.

---

# 43. Unique Constraints for Idempotency

Examples:

```text
payment provider reference
idempotency scope + key
webhook provider + event ID
settlement reference
```

should use database uniqueness where appropriate.

This protects against race conditions between application instances.

---

# 44. Soft Delete Queries

If soft deletion is used:

```text
WHERE deleted_at IS NULL
```

must be consistently applied.

Prefer repository-level enforcement rather than relying on every caller to remember the condition.

Indexes may need to use partial indexes.

Example:

```sql
CREATE INDEX idx_active_products_category
ON products (category_id, created_at DESC)
WHERE deleted_at IS NULL;
```

---

# 45. Partial Indexes

Partial indexes are useful when most queries target a subset.

Examples:

```text
active products
active supplier offers
open support tickets
active reservations
```

Use them based on actual query patterns.

---

# 46. Composite Index Order

Index column order matters.

For query:

```text
WHERE supplier_id = ?
AND status = ?
ORDER BY created_at DESC
```

an index such as:

```text
(supplier_id, status, created_at DESC)
```

may be useful.

Do not assume every column should be independently indexed.

---

# 47. Low-Cardinality Columns

Columns such as:

```text
status
boolean flags
```

may have low selectivity.

An index only on:

```text
status
```

may provide little benefit for some workloads.

Combine with selective fields where appropriate.

---

# 48. Foreign-Key Indexes

Foreign keys used in joins/filtering should be reviewed for indexes.

Examples:

```text
orders.buyer_id
orders.supplier_id
order_items.order_id
fulfillments.order_id
payments.order_id
inventory.product_id
inventory.supplier_id
```

PostgreSQL does not automatically create indexes for every foreign key.

---

# 49. Sorting Performance

Queries using:

```text
ORDER BY created_at DESC
```

on large datasets should have appropriate indexes where beneficial.

Avoid sorting massive unfiltered datasets in memory.

---

# 50. Query Plans

Slow queries SHALL be investigated with:

```text
EXPLAIN
EXPLAIN ANALYZE
```

Review:

- sequential scans
- row estimates
- actual rows
- join strategy
- sort operations
- index usage
- buffer reads
- execution time

---

# 51. Statistics

PostgreSQL statistics must remain current.

Autovacuum/analyze settings should be monitored.

After major data changes or unusual distributions, verify query plans.

---

# 52. Vacuum and Bloat

Monitor:

- dead tuples
- table bloat
- index bloat
- autovacuum activity
- long-running transactions

Long-running transactions can prevent cleanup and cause storage growth.

---

# 53. Long-Running Transactions

Production monitoring should detect transactions that remain open unusually long.

Potential causes:

- external network calls inside transaction
- blocked application thread
- unhandled exceptions
- reporting query
- connection leak

Long-running transactions should trigger investigation.

---

# 54. Deadlocks

Transactions should acquire locks in consistent order.

Example:

```text
Always lock:
order -> inventory
```

rather than some code paths using:

```text
inventory -> order
```

and others:

```text
order -> inventory
```

Consistent lock ordering reduces deadlocks.

---

# 55. Deadlock Recovery

The application should treat deadlocks as retryable at the transaction boundary when safe.

Do not blindly repeat non-idempotent external side effects.

---

# 56. Batch Operations

Bulk updates should be bounded.

Avoid one enormous transaction for millions of rows.

Use:

```text
batch 1
batch 2
batch 3
...
```

with progress tracking where appropriate.

---

# 57. Bulk Catalog Import

Catalog imports should:

- validate outside the critical transaction where possible
- process in batches
- use staging tables
- produce row-level errors
- avoid locking the entire catalog
- publish relevant events after successful changes

---

# 58. Staging Tables

Bulk imports may use:

```text
catalog_import_staging
```

Workflow:

```text
upload
  |
parse
  |
stage
  |
validate
  |
transform
  |
commit batches
  |
publish events
```

This prevents malformed imports from partially corrupting core data.

---

# 59. Database Migrations

Migrations must be production-safe.

Avoid large blocking operations during peak traffic.

Preferred strategies:

```text
add nullable column
deploy code
backfill gradually
add constraints/indexes safely
switch reads/writes
remove old column later
```

---

# 60. Index Creation in Production

Large indexes should be created using PostgreSQL-safe production techniques where appropriate, such as concurrent index creation.

Migration tooling must account for transaction limitations of such operations.

---

# 61. Expand-and-Contract Migrations

Breaking schema changes should follow:

```text
EXPAND
  |
deploy compatible code
  |
BACKFILL
  |
SWITCH
  |
CONTRACT
```

Do not deploy application code that assumes a new column exists before the schema is safely deployed.

---

# 62. Zero-Downtime Deployment

Database migrations must support rolling application deployment.

During rollout:

```text
old API + new API
```

may temporarily run simultaneously.

Schema changes must support both versions during the transition.

---

# 63. Query Timeouts

Long-running application queries should have controlled timeouts.

This prevents one bad query from consuming database capacity indefinitely.

Separate limits may exist for:

```text
transactional API
admin/reporting
background jobs
```

---

# 64. Lock Timeouts

Where appropriate, use lock timeouts to prevent requests from waiting indefinitely.

A lock timeout should be mapped to a controlled retry/conflict behavior.

---

# 65. Database Error Mapping

Database failures should not leak SQL details.

Examples:

```text
unique violation
    -> CONFLICT / domain-specific error

foreign-key violation
    -> controlled business/data error

serialization/deadlock
    -> retry where safe

connection failure
    -> SERVICE_UNAVAILABLE
```

---

# 66. ORM Usage

If an ORM is used:

- understand generated SQL
- avoid lazy-loading traps
- inspect complex queries
- use explicit transactions
- use parameterized raw SQL when justified
- do not assume ORM queries are automatically efficient

Critical queries should be benchmarked at SQL level.

---

# 67. Raw SQL

Raw SQL is acceptable when it provides a measurable benefit for:

- complex aggregation
- bulk operations
- concurrency-sensitive inventory
- specialized PostgreSQL functionality

It must remain:

- parameterized
- tested
- reviewed
- documented

---

# 68. Data Access Transactions by Domain

### Order

```text
order creation
inventory reservation
fulfillment creation
outbox
```

### Payment

```text
payment state
financial record
outbox
```

### Inventory

```text
lock/conditional update
reservation
inventory movement
outbox
```

### Supplier

```text
profile/document status
audit
outbox
```

Actual boundaries depend on the final domain model.

---

# 69. Read-After-Write Consistency

After a critical mutation, the user may require the newest state.

Examples:

```text
order created -> order detail
payment succeeded -> payment/order status
inventory update -> supplier inventory page
```

Do not route such reads to an eventually consistent replica if it can produce confusing stale UI.

---

# 70. Read Replicas

Use replicas for suitable read-only workloads.

Avoid replicas for:

- final inventory decisions
- payment verification
- immediate post-write critical state
- authorization decisions requiring current state

Replica lag must be monitored.

---

# 71. Data Access for Admin

Admin APIs often have broader queries.

Admin code should still use:

- bounded pagination
- query limits
- indexed filters
- read replicas/read models where suitable
- explicit permissions

Admin privilege does not justify unbounded database queries.

---

# 72. Search Index Synchronization

Search indexing should use domain events.

Example:

```text
product.approved
   |
   v
search indexing worker
   |
   v
OpenSearch
```

Search index failures should not corrupt PostgreSQL transactions.

---

# 73. Cache Synchronization

Caches should similarly react to events where practical.

Example:

```text
supplier.suspended
   |
   +--> invalidate supplier eligibility cache
   +--> remove eligible offers from discovery
```

---

# 74. Query Observability

Track at minimum:

```text
query duration
query count/request
database calls/request
slow query count
lock wait time
connection pool usage
transaction duration
deadlocks
errors
```

---

# 75. Slow Query Thresholds

Initial thresholds may be:

```text
warning: > 250 ms
critical: > 1 s
```

for transactional queries, with separate thresholds for known reporting workloads.

Thresholds should be tuned from production data.

---

# 76. Query Fingerprinting

Group equivalent queries by normalized pattern.

Example:

```text
SELECT ... WHERE buyer_id = ?
```

rather than treating every ID value as a unique query.

This helps identify high-volume query patterns.

---

# 77. Performance Regression Tests

Critical endpoints should have automated tests for:

```text
response latency
query count
database rows scanned where measurable
memory behavior
pagination performance
```

Baseline values should be stored and reviewed when changes cause regressions.

---

# 78. Capacity Tests

Test increasing:

```text
buyers
suppliers
catalog size
inventory rows
orders
concurrent checkout
search traffic
supplier updates
admin queries
```

The objective is to discover the point where bottlenecks emerge.

---

# 79. Example Product List Query

Conceptual:

```sql
SELECT
    p.id,
    p.name,
    p.brand_name,
    p.generic_name,
    p.manufacturer_name,
    p.dosage_form,
    p.strength,
    p.pack_size
FROM products p
WHERE p.category_id = $1
  AND p.status = 'ACTIVE'
ORDER BY p.created_at DESC, p.id DESC
LIMIT $2;
```

Recommended review:

- index on category/status
- deterministic ordering
- bounded limit
- no unnecessary joins

---

# 80. Example Supplier Order Query

Conceptual:

```sql
SELECT
    f.id,
    f.order_id,
    f.status,
    f.created_at,
    f.delivery_mode
FROM fulfillments f
WHERE f.supplier_id = $1
  AND f.status = ANY($2)
ORDER BY f.created_at DESC, f.id DESC
LIMIT $3;
```

Potential index:

```text
(supplier_id, status, created_at DESC, id DESC)
```

Validate against actual workload.

---

# 81. Example Buyer Order Query

Conceptual:

```sql
SELECT
    o.id,
    o.status,
    o.total_amount,
    o.currency,
    o.created_at
FROM orders o
WHERE o.buyer_id = $1
ORDER BY o.created_at DESC, o.id DESC
LIMIT $2;
```

Potential index:

```text
(buyer_id, created_at DESC, id DESC)
```

---

# 82. Example Inventory Reservation Query

Conceptual:

```sql
UPDATE inventory
SET available_quantity = available_quantity - $1,
    version = version + 1
WHERE id = $2
  AND available_quantity >= $1;
```

If:

```text
affected_rows = 1
```

reservation may continue.

If:

```text
affected_rows = 0
```

the service must determine whether the failure is:

```text
out of stock
invalid inventory
concurrency conflict
```

---

# 83. Database Access Anti-Patterns

Do not use:

```text
SELECT *
```

for large APIs.

Do not use:

```text
unbounded list queries
```

Do not perform:

```text
N+1 queries
```

Do not hold:

```text
database transactions during provider calls
```

Do not trust:

```text
application validation without database constraints
```

Do not use:

```text
database as search engine
```

for workloads requiring full-text/fuzzy marketplace search.

---

# 84. Implementation Sequence

## Phase 1 — Baseline

1. Finalize schema.
2. Identify hot queries.
3. Configure connection pooling.
4. Add repository/query conventions.
5. Add query logging/metrics.

## Phase 2 — Indexing

6. Add primary transactional indexes.
7. Add buyer order indexes.
8. Add supplier fulfillment indexes.
9. Add inventory indexes.
10. Add catalog/offer indexes.
11. Review foreign-key indexes.

## Phase 3 — Concurrency

12. Implement inventory atomic reservation.
13. Add optimistic versioning where required.
14. Standardize lock ordering.
15. Add deadlock/retry handling.

## Phase 4 — Scale

16. Add read models.
17. Add suitable read replicas.
18. Optimize reporting.
19. Add search/index boundaries.
20. Tune caching.

## Phase 5 — Continuous Optimization

21. Query fingerprinting.
22. Slow-query review.
23. Load testing.
24. Capacity planning.
25. Index lifecycle review.

---

# 85. Acceptance Criteria

This specification is considered implemented when:

- PostgreSQL is the transactional source of truth.
- Connection pools are bounded and monitored.
- Critical queries are indexed.
- Large collections are paginated.
- Cursor pagination is available for high-volume feeds where appropriate.
- N+1 query patterns are controlled.
- Inventory reservation is atomic.
- Critical uniqueness rules have database constraints.
- Transactions are short and do not normally contain external API calls.
- Read replicas are used only where consistency permits.
- Reporting does not overload transactional workloads.
- Search is separated from transactional catalog queries.
- Slow queries are observable.
- Lock/deadlock behavior is monitored.
- Production migrations support rolling deployment.
- Performance tests cover critical access paths.

---

# 86. Definition of Done

For every new database-backed feature:

- [ ] Access pattern documented.
- [ ] Repository/query layer defined.
- [ ] Query bounded.
- [ ] Required indexes reviewed.
- [ ] N+1 risk reviewed.
- [ ] Transaction boundary defined.
- [ ] Concurrency behavior defined.
- [ ] Read-after-write requirement defined.
- [ ] Cache interaction reviewed.
- [ ] Search interaction reviewed.
- [ ] Query metrics added where important.
- [ ] Load/performance test added for critical paths.
- [ ] Migration is production-safe.
- [ ] Data access respects tenant isolation.
- [ ] Sensitive fields are not unnecessarily selected.

---

# 87. Final Architecture Position

Bezzo database performance should be built around:

```text
CORRECT TRANSACTIONS
        +
GOOD INDEXES
        +
BOUNDED QUERIES
        +
CONTROLLED CONNECTIONS
        +
SAFE CONCURRENCY
        +
CACHE WHERE APPROPRIATE
        +
SEARCH FOR DISCOVERY
        +
READ MODELS FOR HEAVY REPORTING
        +
MEASUREMENT
```

The central rule is:

```text
DO NOT OPTIMIZE BLINDLY.
MEASURE THE QUERY.
UNDERSTAND THE ACCESS PATTERN.
THEN CHOOSE THE INDEX/CACHE/READ MODEL.
```

For transactional workflows, correctness remains more important than raw latency.

For high-volume discovery and reporting, specialized read infrastructure should absorb load rather than forcing PostgreSQL to perform every workload.

The initial Bezzo architecture should therefore remain PostgreSQL-centered, with Redis, OpenSearch, event consumers and read models added where they solve measured workload problems.

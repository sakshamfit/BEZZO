# Bezzo Database Transactions, Consistency & Data Integrity Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Scope:** PostgreSQL transactions, consistency models, constraints, state integrity, atomicity, isolation, recovery, and business-data correctness

---

## 1. Purpose

This specification defines how Bezzo preserves correctness of business data when multiple requests, workers, suppliers, payment providers, logistics providers, and administrators operate concurrently.

The objective is to ensure that:

- orders cannot become internally contradictory
- inventory cannot become negative through race conditions
- payments cannot be applied twice
- refunds cannot exceed allowed amounts
- supplier and buyer ownership boundaries remain intact
- state transitions are legal
- partial writes do not leave broken business records
- failures can be recovered safely
- database constraints remain the final integrity boundary

PostgreSQL is the authoritative transactional database for core Bezzo business state.

---

# 2. Core Principles

1. Database transactions protect business invariants.
2. Constraints are the final line of defense.
3. Transactions must be short and explicit.
4. External network calls must not normally occur inside database transactions.
5. Isolation level must be selected intentionally.
6. State transitions must be guarded.
7. Monetary values must use exact numeric representations.
8. Inventory mutations must be atomic.
9. Referential integrity must be enforced.
10. Soft deletion must not bypass uniqueness or ownership rules.
11. Recovery procedures must preserve financial and operational correctness.
12. Application validation and database validation must complement each other.
13. Critical workflows must remain correct under retries and concurrent execution.

---

# 3. Consistency Model

Bezzo should distinguish between:

### Strong transactional consistency

Used for:

- order creation
- inventory reservation
- payment state changes
- refunds
- supplier settlement ledger entries
- critical account ownership changes

### Eventual consistency

Acceptable for:

- search indexes
- analytics
- recommendation features
- notifications
- reporting aggregates
- some catalog projections

The source of truth must always be clear.

---

# 4. Source-of-Truth Model

```text
PostgreSQL
   │
   ├── users
   ├── suppliers
   ├── buyers
   ├── products
   ├── inventory
   ├── orders
   ├── payments
   ├── refunds
   ├── fulfillment
   ├── settlements
   └── audit records
          │
          ├── Search projection
          ├── Analytics
          ├── Notifications
          └── Recommendations
```

Derived systems must not silently become authoritative for transactional business state.

---

# 5. ACID Requirements

Core business transactions should provide:

### Atomicity

All required state changes commit together or none do.

### Consistency

Database constraints and business rules remain valid.

### Isolation

Concurrent operations do not produce invalid intermediate outcomes.

### Durability

Committed state survives process/database restarts according to the infrastructure durability model.

---

# 6. Transaction Boundaries

A transaction should represent one coherent business mutation.

Example:

```text
BEGIN
  validate inventory
  reserve inventory
  create order
  create order items
  create fulfillment records
  create outbox events
COMMIT
```

Do not combine unrelated operations into one large transaction.

---

# 7. Transaction Boundary Anti-Pattern

Avoid:

```text
BEGIN
  update database
  call payment provider
  wait
  call Porter
  wait
  send email
  wait
COMMIT
```

This creates:

- long locks
- connection exhaustion
- deadlock risk
- provider dependency inside database transaction
- poor failure recovery

Instead:

```text
transaction
   ↓
commit local state
   ↓
outbox
   ↓
external async processing
```

---

# 8. PostgreSQL Isolation

Default recommendation:

```text
READ COMMITTED
```

This is appropriate for many Bezzo operations.

Use stronger isolation only for workflows that demonstrate a need.

Possible levels:

```text
READ COMMITTED
REPEATABLE READ
SERIALIZABLE
```

Isolation should be selected per transaction/workflow where practical.

---

# 9. READ COMMITTED

Under `READ COMMITTED`, each statement sees a consistent committed snapshot.

This works well for:

- ordinary CRUD
- guarded state transitions
- atomic counters
- many order operations

However, application logic must not assume that a value read by one statement remains unchanged until commit unless protected appropriately.

---

# 10. REPEATABLE READ

Use when a transaction requires a consistent snapshot across multiple reads.

Potential use cases:

- certain reconciliation operations
- controlled reporting transactions
- complex consistency checks

It may increase serialization/conflict behavior under high concurrency.

---

# 11. SERIALIZABLE

Use only where business correctness genuinely requires serializable behavior.

A serializable transaction may fail with a serialization error.

The application must:

```text
detect serialization failure
      ↓
rollback
      ↓
retry transaction
```

Retries must be bounded and idempotent.

Do not expose raw database serialization errors to users.

---

# 12. Transaction Retry

Safe retry conditions may include:

```text
serialization failure
deadlock detected
temporary database connection failure
```

Do not automatically retry:

```text
business validation failure
authorization failure
constraint violation caused by invalid user input
```

---

# 13. Transaction Length

Keep transactions short.

Prefer:

```text
BEGIN
  read required rows
  validate
  update
  insert
COMMIT
```

Avoid:

```text
BEGIN
  large loop
  network request
  file processing
  external API
  long computation
COMMIT
```

---

# 14. Database Constraints

Use constraints for invariant protection.

Important types:

```text
PRIMARY KEY
FOREIGN KEY
UNIQUE
NOT NULL
CHECK
EXCLUSION where appropriate
```

Application validation cannot replace database constraints.

---

# 15. Primary Keys

Every core entity must have a stable primary key.

Recommended application-facing identifiers should be non-sequential where exposing sequential IDs could create enumeration risk.

Internally, PostgreSQL identity/bigint or UUID-style identifiers may be used according to the established Bezzo schema.

---

# 16. Foreign Keys

Foreign keys should enforce relationships such as:

```text
order → buyer
order item → order
order item → product
fulfillment → order
payment → order
refund → payment
inventory → supplier/product
```

Do not rely solely on application code to preserve these relationships.

---

# 17. Foreign Key Delete Policies

Delete behavior must be intentional.

For transactional records, prefer retaining historical records rather than cascading destructive deletes.

Examples:

```text
supplier deletion
     ≠
delete historical orders
```

Use:

- RESTRICT
- SET NULL
- controlled archival

where appropriate.

---

# 18. Unique Constraints

Examples:

```text
supplier GST/business identifier
supplier licence reference where applicable
user email where globally unique
supplier SKU within supplier
payment provider transaction ID
provider webhook event ID
idempotency scope + key
```

The exact uniqueness scope must follow the domain model.

---

# 19. Check Constraints

Use database checks for simple invariants.

Examples:

```sql
CHECK (quantity > 0)
CHECK (amount >= 0)
CHECK (reserved_quantity >= 0)
CHECK (available_quantity >= 0)
```

More complex business rules belong in application/domain logic, supported by transactional enforcement.

---

# 20. Money Representation

Monetary values must not use floating-point types.

Use:

```text
NUMERIC / DECIMAL
```

with explicitly defined precision and scale.

For example:

```text
NUMERIC(19,4)
```

or another domain-approved precision.

Currency must be stored explicitly where multi-currency support is possible.

---

# 21. Money Calculation

Never rely on:

```text
JavaScript number
```

for authoritative financial calculations.

Use:

- decimal arithmetic
- integer minor units where appropriate
- database NUMERIC
- validated rounding rules

Rounding must be deterministic.

---

# 22. Currency

Every monetary record should have a currency context.

Example:

```text
amount
currency = INR
```

Do not infer currency solely from UI locale.

---

# 23. Inventory Integrity

Inventory must maintain explicit invariants.

Conceptually:

```text
available_quantity >= 0
reserved_quantity >= 0
```

If the inventory model includes additional buckets:

```text
on_hand
reserved
available
damaged
quarantined
```

their relationships must be explicitly defined.

---

# 24. Inventory Reservation Transaction

Preferred pattern:

```text
BEGIN

SELECT inventory
FOR UPDATE

validate product/supplier eligibility
validate available quantity

UPDATE inventory
SET available = available - qty,
    reserved = reserved + qty

INSERT reservation

COMMIT
```

---

# 25. Atomic Inventory Update

Where appropriate:

```sql
UPDATE inventory
SET available_quantity = available_quantity - :quantity,
    reserved_quantity = reserved_quantity + :quantity
WHERE id = :inventory_id
  AND available_quantity >= :quantity;
```

The affected-row count is part of the correctness check.

---

# 26. Inventory Reservation State

Recommended:

```text
PENDING
RESERVED
COMMITTED
RELEASED
EXPIRED
CANCELLED
```

Only valid transitions may occur.

---

# 27. Inventory Reservation Expiration

Reservations must not remain indefinitely.

A durable job should process:

```text
expires_at < now
AND status = RESERVED
```

using a guarded state transition.

Example:

```text
RESERVED → EXPIRED
```

Only one worker may successfully perform the transition.

---

# 28. Inventory Ledger

For high-integrity inventory systems, maintain a movement/ledger record.

Examples:

```text
PURCHASE
RESERVATION
RELEASE
FULFILLMENT
RETURN
ADJUSTMENT
DAMAGE
EXPIRY
TRANSFER
```

This provides an audit trail rather than relying solely on the current quantity.

---

# 29. Inventory Reconciliation

Periodically reconcile:

```text
inventory summary
      vs
inventory movement ledger
```

Differences must produce an investigation record.

Do not silently overwrite discrepancies.

---

# 30. Order Atomicity

Creating an order may require:

```text
order
order items
pricing snapshot
supplier allocation
fulfillment records
inventory reservations
payment intent/reference
outbox events
```

The exact boundary depends on payment strategy.

The database transaction must ensure that the order cannot appear committed without its mandatory dependent records.

---

# 31. Pricing Snapshot

An order must preserve the commercial values used at checkout.

Store sufficient snapshot information such as:

```text
unit price
quantity
discount
tax
shipping/delivery fee
final amount
currency
```

Later catalog price changes must not rewrite historical order totals.

---

# 32. Order Item Integrity

Order items must reference the relevant product/catalog identity and preserve the purchased commercial snapshot.

A product being later:

```text
edited
deactivated
removed from marketplace
```

must not destroy historical order meaning.

---

# 33. Order State Machine

Example:

```text
PENDING
  ↓
CONFIRMED
  ↓
FULFILLING
  ↓
READY_FOR_DISPATCH
  ↓
SHIPPED
  ↓
DELIVERED
```

Cancellation/refund paths must be modeled separately and explicitly.

---

# 34. Guarded State Transition

Use:

```sql
UPDATE orders
SET status = :new_status
WHERE id = :order_id
  AND status = :expected_current_status;
```

Then check affected rows.

This prevents two workers from both successfully applying the same transition.

---

# 35. State Transition History

Important state transitions should be auditable.

Recommended record:

```text
entity_type
entity_id
from_state
to_state
actor
source
correlation_id
occurred_at
metadata
```

This supports troubleshooting and compliance investigations.

---

# 36. Payment Consistency

Payment state must be separated from order state.

Example:

```text
Order = CONFIRMED
Payment = PAID
Fulfillment = PROCESSING
```

These are related state machines, not one universal status field.

---

# 37. Payment Transaction

A payment operation should record:

```text
payment ID
order ID
provider
provider payment reference
amount
currency
status
idempotency key
timestamps
```

Provider event IDs should be unique where applicable.

---

# 38. Payment State Machine

Example:

```text
PENDING
  ↓
AUTHORIZED
  ↓
PAID
  ↓
REFUND_PENDING
  ↓
REFUNDED
```

Failure/cancellation paths must be explicitly modeled.

---

# 39. Payment Callback Race

If multiple callbacks arrive:

```text
PAID
PAID
PAID
```

only one logical transition should produce the financial effect.

Use:

```text
provider event uniqueness
+
payment state guard
+
transaction
```

---

# 40. Refund Integrity

Refund amount must satisfy defined business invariants.

Conceptually:

```text
total_refunded <= refundable_amount
```

This must be enforced transactionally.

Two concurrent refund requests must not both independently observe the same remaining refundable amount.

---

# 41. Refund Transaction

Example:

```text
BEGIN

lock payment/order financial row

calculate refundable amount

validate requested refund

create refund record
update refund totals/state

COMMIT
```

External provider execution occurs outside the database transaction where practical, with idempotent reconciliation.

---

# 42. Settlement Integrity

Supplier settlement records should be immutable or append-oriented after finalization.

Corrections should use adjustment entries rather than silently editing historical financial facts.

---

# 43. Ledger Principle

For financial records:

```text
historical fact
    ↓
append adjustment
```

is generally safer than:

```text
edit old financial fact
```

The exact accounting model must align with the approved finance design.

---

# 44. Multi-Supplier Orders

A customer order may contain:

```text
Supplier A fulfillment
Supplier B fulfillment
Supplier C fulfillment
```

Each fulfillment should have its own transactional state.

The customer-facing order aggregates the underlying fulfillment states.

---

# 45. Multi-Supplier Consistency

Do not assume independent suppliers can be committed through one distributed database transaction.

Instead use:

```text
local transaction
+
state machine
+
outbox
+
compensation/recovery
```

The order orchestration layer determines the overall customer-visible state.

---

# 46. Compensation

When a later step fails:

```text
Supplier A reservation succeeded
Supplier B reservation failed
```

the system may need to:

```text
release Supplier A reservation
```

This is a compensating transaction.

Compensation must itself be idempotent.

---

# 47. Distributed Transactions

Avoid distributed two-phase commit for ordinary Bezzo workflows.

Prefer:

```text
local ACID transaction
+
durable event
+
idempotent downstream processing
+
compensation
```

This is more operationally manageable.

---

# 48. Transactional Outbox

Whenever a database transaction must produce an asynchronous event:

```text
BEGIN
  business mutation
  outbox insert
COMMIT
```

The event is then dispatched asynchronously.

This ensures the business mutation and event creation share one atomic boundary.

---

# 49. Outbox Integrity

Outbox records should have:

```text
unique event_id
status
attempt_count
next_attempt_at
created_at
published_at
```

A worker must safely claim/process records without losing them.

---

# 50. Inbox / Processed Event Pattern

For inbound events:

```text
receive event
 ↓
persist event identity
 ↓
process
```

Use a unique provider/event identifier.

This prevents duplicate external events from creating duplicate business effects.

---

# 51. Eventual Consistency

Some derived views will be temporarily stale.

Examples:

```text
product changed
 ↓
PostgreSQL updated
 ↓
search index update pending
```

The UI and business logic must understand which systems are authoritative.

Critical checkout validation must use current transactional data rather than stale search/cache projections.

---

# 52. Read-After-Write

After a critical mutation, the API should return authoritative database state where the user expects immediate confirmation.

Derived systems may catch up asynchronously.

Example:

```text
product price changed
```

The supplier portal should immediately reflect PostgreSQL state even if search indexing is still pending.

---

# 53. Cache Consistency

Cache invalidation must occur after successful transaction commit.

Do not invalidate or publish cache changes based on a transaction that later rolls back.

Outbox-driven cache invalidation may be used when appropriate.

---

# 54. Transaction Hooks

Do not perform external side effects directly inside database transaction hooks unless the behavior is carefully controlled.

Prefer:

```text
transaction commit
 ↓
outbox
 ↓
async side effect
```

---

# 55. Database Trigger Usage

Triggers may be used for narrowly defined database integrity tasks.

Avoid putting large business workflows into triggers.

Triggers can make:

- testing harder
- observability harder
- transaction behavior less obvious

Application/domain logic should remain the primary location for complex business workflows.

---

# 56. Deferred Constraints

Deferred constraints may be useful for specialized multi-row consistency cases.

They should not be used casually.

Most Bezzo constraints should be immediate so invalid states fail as early as possible.

---

# 57. Unique Constraint Concurrency

Never implement uniqueness only with:

```text
SELECT
then INSERT
```

Use:

```text
UNIQUE constraint
+
INSERT ... ON CONFLICT
```

where appropriate.

---

# 58. Upsert Safety

Upserts must preserve business semantics.

Example:

```sql
INSERT INTO supplier_inventory (...)
VALUES (...)
ON CONFLICT (supplier_id, sku)
DO UPDATE ...
```

The update portion must not accidentally overwrite newer source data.

Use version/timestamp checks where source ordering matters.

---

# 59. Optimistic Versioning

Entities subject to concurrent editing may include:

```text
version
```

Example:

```text
version 12
```

Update only if:

```text
version = 12
```

then increment to:

```text
version 13
```

---

# 60. Stale Update Handling

When an optimistic update fails:

```text
0 rows updated
```

return a controlled conflict.

The client should:

1. reload current state
2. show relevant changes
3. allow user to retry

Do not silently overwrite the newer version.

---

# 61. Referential Integrity During Deactivation

Products and suppliers may become inactive while historical records remain.

Use:

```text
active/inactive status
```

rather than destructive deletion.

Historical orders continue referencing the original records.

---

# 62. Soft Delete

Soft delete fields may include:

```text
deleted_at
deleted_by
```

But soft deletion must not bypass:

- unique constraints
- foreign keys
- audit requirements
- privacy deletion obligations

If uniqueness must be reusable after soft deletion, use an explicit database design such as a partial unique index where appropriate.

---

# 63. Audit Integrity

Audit records should identify:

```text
who
what
when
source
before
after
correlation ID
```

Audit history should not be silently rewritten as part of ordinary business operations.

---

# 64. Data Integrity and Tenant Isolation

Every tenant-scoped transaction must verify tenant ownership.

Example:

```sql
UPDATE products
SET price = :price
WHERE id = :product_id
  AND tenant_id = :tenant_id;
```

Do not load by ID alone when IDs are not globally sufficient for authorization.

---

# 65. Row-Level Security

PostgreSQL Row-Level Security may be considered for additional defense-in-depth.

However, application-level authorization and tenant scoping remain required.

RLS should be introduced only with a clear operational and testing model.

---

# 66. Connection Pooling

The total database connection budget must account for:

```text
API instances
worker instances
admin tools
migration jobs
reporting jobs
```

Do not allow every deployment to create an unbounded pool.

---

# 67. Transaction Monitoring

Track:

```text
transaction duration
lock wait duration
deadlocks
serialization failures
rollback rate
commit rate
connection pool saturation
```

Long transactions should trigger investigation.

---

# 68. Slow Transaction Investigation

When a transaction becomes slow:

```text
1. identify query
2. identify lock wait
3. inspect execution plan
4. inspect indexes
5. inspect transaction scope
6. inspect external calls accidentally inside transaction
7. reduce critical section
8. load test correction
```

---

# 69. Deadlock Prevention

Use:

- consistent lock ordering
- short transactions
- minimal rows locked
- indexed predicates
- deterministic update ordering

If a deadlock occurs, retry the complete safe transaction.

---

# 70. Foreign Key Concurrency

Foreign key checks can introduce locks.

High-volume operations should be designed with:

- appropriate indexes
- correct insert/delete ordering
- short transactions

Do not disable referential integrity to improve throughput.

---

# 71. Bulk Database Operations

Bulk operations must use bounded batches.

Example:

```text
10,000 records
→ 100 × 100 records
```

rather than one enormous transaction when the operation does not require all-or-nothing semantics.

---

# 72. Bulk Transaction Choice

Use one transaction when:

```text
all records must commit atomically
```

Use chunked transactions when:

```text
partial progress is acceptable
+
each chunk can be independently recovered
```

The product behavior must clearly communicate partial failure where applicable.

---

# 73. Migration Consistency

Schema migrations must be:

- backward compatible where possible
- reversible where practical
- tested against production-like data
- separated from destructive cleanup

Avoid large blocking schema changes during peak traffic.

---

# 74. Expand-and-Contract Migration

Preferred pattern:

```text
1. add new field
2. deploy code supporting old + new
3. backfill
4. switch reads
5. switch writes
6. verify
7. remove old field later
```

This supports rolling deployments.

---

# 75. Backfills

Large backfills should run asynchronously.

Requirements:

- chunked processing
- progress tracking
- throttling
- retry
- monitoring
- resumability

Do not hold one giant transaction for a full-table backfill unless specifically justified.

---

# 76. Recovery from Partial Transaction Failure

If a transaction fails:

```text
ROLLBACK
```

must leave no partial business mutation from that transaction.

External side effects already performed cannot automatically roll back.

This is why external operations should normally occur after the local durable state is committed and be protected with idempotency/reconciliation.

---

# 77. External Payment Failure Model

Example:

```text
Local payment intent created
      ↓
COMMIT
      ↓
provider request
      ↓
provider timeout
```

The state should become:

```text
PENDING / UNKNOWN
```

rather than assuming failure.

A reconciliation process determines the provider's authoritative outcome.

---

# 78. External Logistics Failure Model

Example:

```text
fulfillment ready
 ↓
Porter booking attempted
 ↓
timeout
```

Do not create an unlimited number of bookings.

Use:

```text
booking idempotency key
+
provider reference
+
retry
+
reconciliation
```

---

# 79. Notification Failure Model

A failed notification must not roll back an order.

Example:

```text
Order CONFIRMED
+
SMS failed
```

The order remains confirmed.

The notification job retries independently.

---

# 80. Search Failure Model

A failed OpenSearch update must not roll back a committed product change.

The search index must eventually converge through:

```text
event
+
retry
+
reconciliation
```

---

# 81. Analytics Failure Model

Analytics ingestion failure must not block core transactions.

Analytics is downstream and eventually consistent.

Critical business events should remain recoverable through durable event records.

---

# 82. Consistency of Scheduled Delivery

Scheduled order placement must store:

```text
delivery_date
delivery_slot
timezone
```

The scheduling system derives execution times from these authoritative values.

A scheduler restart must not change the customer's selected slot.

---

# 83. Time-Based Data Integrity

Persist:

```text
created_at
updated_at
occurred_at
expires_at
```

where relevant.

Use UTC for persisted timestamps.

Business-local time should be represented explicitly when needed for scheduling.

---

# 84. Clock Assumptions

Distributed servers must not depend on exact clock equality.

For ordering:

- use database timestamps
- provider sequence numbers
- event IDs
- version numbers

where possible.

Do not assume:

```text
server A time == server B time
```

---

# 85. Data Validation Layers

Validation should occur at:

```text
API schema
   ↓
domain/business validation
   ↓
database constraints
```

Each layer catches different classes of problems.

---

# 86. Validation Example

For order quantity:

### API

```text
integer
positive
reasonable maximum
```

### Domain

```text
product purchasable
supplier eligible
quantity within policy
```

### Database

```text
quantity > 0
```

---

# 87. Error Semantics

Database errors must be translated into safe domain/API errors.

Examples:

```text
unique violation
→ conflict

foreign key violation
→ invalid related resource

check violation
→ invalid business input

serialization failure
→ safe retry

deadlock
→ safe retry
```

Do not expose SQL or internal schema details to clients.

---

# 88. Integrity Error Monitoring

Track database constraint failures.

Unexpected increases may indicate:

- application bug
- race condition
- bad migration
- malicious traffic
- integration defect

Constraint violations should not simply disappear into generic 500 logs.

---

# 89. Data Repair

Production data repair must use controlled scripts or migration-style procedures.

Requirements:

- review
- backup/rollback strategy
- audit
- dry run where possible
- bounded scope
- verification

Never manually edit production financial rows without an approved procedure.

---

# 90. Reconciliation Framework

Bezzo should have reusable reconciliation patterns.

Examples:

```text
inventory reconciliation
payment reconciliation
shipment reconciliation
settlement reconciliation
search-index reconciliation
supplier catalog reconciliation
```

Each should compare source-of-truth state against derived/external state.

---

# 91. Reconciliation Records

A reconciliation discrepancy should produce:

```text
reconciliation_id
entity_type
entity_id
source_state
observed_state
severity
detected_at
resolution_status
resolved_at
resolution_actor
```

---

# 92. Integrity Invariants

The engineering test suite should encode invariants such as:

```text
available inventory >= 0
reserved inventory >= 0
refund total <= refundable total
order total = sum(order components)
payment references are unique
provider events are unique
foreign keys always resolve
terminal states do not regress
tenant access never crosses boundaries
```

---

# 93. Property-Based Testing

For high-risk domains, property-based tests may generate:

- random quantities
- concurrent reservations
- repeated retries
- state transition sequences
- duplicate events

The objective is to prove invariants rather than only test a few fixed examples.

---

# 94. Concurrency Test Harness

Create a reusable test utility capable of:

```text
N concurrent requests
N concurrent workers
random delays
random retries
forced transaction failures
forced network timeouts
```

This should be used for:

- inventory
- payments
- orders
- refunds
- webhooks
- supplier sync

---

# 95. Production Readiness Checks

Before production:

- [ ] all critical tables have primary keys
- [ ] required foreign keys exist
- [ ] critical uniqueness constraints exist
- [ ] monetary fields use exact arithmetic
- [ ] critical state transitions are guarded
- [ ] inventory mutations are atomic
- [ ] payment operations are idempotent
- [ ] refunds are concurrency-safe
- [ ] outbox exists for required events
- [ ] reconciliation jobs exist
- [ ] deadlock/serialization retries exist
- [ ] connection pools are bounded
- [ ] long transactions are monitored

---

# 96. Definition of Done

The Bezzo database consistency layer is production-ready when:

### Transactions
- [ ] transaction boundaries are documented
- [ ] isolation choices are documented
- [ ] retryable transaction failures are handled
- [ ] external calls are outside critical DB transactions

### Integrity
- [ ] primary/foreign keys exist
- [ ] unique constraints exist
- [ ] check constraints exist
- [ ] tenant ownership is enforced
- [ ] historical data is preserved correctly

### Business correctness
- [ ] inventory cannot become negative through supported workflows
- [ ] duplicate payments cannot create duplicate financial effects
- [ ] refunds are bounded
- [ ] order state cannot perform illegal transitions
- [ ] supplier/buyer data remains isolated

### Recovery
- [ ] outbox recovery works
- [ ] reconciliation works
- [ ] data repair process exists
- [ ] migration rollback/recovery is documented

### Testing
- [ ] concurrency tests pass
- [ ] deadlock tests pass
- [ ] serialization tests pass
- [ ] constraint tests pass
- [ ] failure-injection tests pass
- [ ] production-like load tests pass

---

# 97. Final Architecture

```text
                    BEZZO APPLICATION
                           │
                           ▼
                 ┌───────────────────┐
                 │ API Validation    │
                 └─────────┬─────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │ Domain Rules      │
                 └─────────┬─────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │ PostgreSQL        │
                 │ Transaction       │
                 ├───────────────────┤
                 │ Constraints       │
                 │ Row Locks         │
                 │ State Guards      │
                 │ Version Checks    │
                 └─────────┬─────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       Durable Business State       Outbox Event
                                        │
                                        ▼
                                  Async Processing
                                        │
                   ┌────────────────────┼───────────────────┐
                   ▼                    ▼                   ▼
                Search              Payments             Logistics
              Projection          Reconciliation        Reconciliation
                   │                    │                   │
                   └────────────────────┴───────────────────┘
                                        │
                                        ▼
                                  Observability
```

The database is the authoritative consistency boundary for core Bezzo business data. Asynchronous systems provide scalability and integration without weakening transactional correctness.

---

## 98. Implementation Priority

Recommended sequence:

1. audit current schema constraints
2. formalize transaction boundaries
3. implement critical state guards
4. implement inventory atomic reservation
5. implement payment/refund transaction safety
6. implement transactional outbox
7. implement idempotency records
8. add optimistic concurrency to editable entities
9. add deadlock/serialization retry infrastructure
10. add reconciliation framework
11. add integrity invariant tests
12. add concurrency/failure test harness
13. monitor long transactions and lock waits
14. harden migrations with expand-and-contract patterns
15. establish production data-repair procedures

---

**End of Document**

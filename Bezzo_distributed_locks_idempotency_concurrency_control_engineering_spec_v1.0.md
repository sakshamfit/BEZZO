# Bezzo Distributed Locks, Idempotency & Concurrency Control Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Scope:** Distributed locks, idempotency, concurrency control, race-condition prevention, inventory reservation, order/payment safety, background workers, and external integrations

---

## 1. Purpose

This specification defines how Bezzo prevents duplicate processing, race conditions, overselling, double charging, conflicting updates, and unsafe concurrent execution across horizontally scaled application and worker instances.

Bezzo is expected to run multiple API servers and workers concurrently. Therefore, correctness cannot depend on:

- process-local memory
- a single application instance
- JavaScript mutexes
- in-memory flags
- request ordering
- a single worker remaining alive

The authoritative controls must use durable database constraints, transactional state transitions, idempotency records, and carefully scoped distributed coordination.

---

# 2. Core Principles

1. Prefer database transactions and constraints over distributed locks.
2. Use distributed locks only when they solve a real coordination problem.
3. Every critical external operation must be idempotent.
4. Never use a lock as a substitute for a transaction.
5. Locks must have bounded lifetime.
6. Lock ownership must be explicit.
7. A crashed process must not permanently block progress.
8. Critical inventory and payment operations must remain correct under concurrent requests.
9. Database uniqueness constraints are the final protection against duplicate logical records.
10. Retries must be safe.
11. Race conditions must be tested deliberately.
12. Tenant isolation must remain enforced during concurrent operations.

---

# 3. Concurrency Problems Bezzo Must Handle

Examples include:

```text
Two buyers purchase the last unit simultaneously
Two checkout requests submit the same cart
Two workers process the same job
Two payment callbacks arrive together
Two supplier inventory updates arrive out of order
Two admins update the same product
Two workers attempt the same scheduled task
Two refund requests are submitted simultaneously
Two delivery callbacks attempt conflicting transitions
Two webhook retries hit the same consumer
```

The system must define deterministic behavior for each.

---

# 4. Concurrency Control Layers

Bezzo should use several complementary mechanisms:

```text
                    ┌─────────────────────────┐
                    │ Application Validation  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Idempotency             │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Database Constraints    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Database Transactions   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Row / Advisory Locks    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Distributed Locks       │
                    │ only when required      │
                    └─────────────────────────┘
```

The lower layers protect correctness even if upper layers fail.

---

# 5. Idempotency vs Locking

These solve different problems.

## Idempotency

Prevents repeated execution of the same logical operation.

Example:

```text
POST /orders
Idempotency-Key: abc123
```

A retry should return the same logical result rather than create another order.

## Locking

Prevents conflicting operations from executing simultaneously.

Example:

```text
reserve inventory SKU X
```

Two different buyers are not duplicate requests. They are competing operations and require concurrency control.

---

# 6. Idempotency Key

Client-generated idempotency keys should be supported for operations where retries may create side effects.

Examples:

```text
order creation
payment initiation
refund request
supplier bulk import
logistics booking
webhook processing
```

Format:

```text
Idempotency-Key: <opaque-client-generated-value>
```

The server must scope the key appropriately.

Recommended logical scope:

```text
tenant/user + endpoint/action + idempotency_key
```

---

# 7. Idempotency Record

Recommended table:

```text
idempotency_records
```

Fields:

| Field | Purpose |
|---|---|
| id | internal ID |
| scope | operation scope |
| actor_id | requesting actor |
| tenant_id | tenant context |
| idempotency_key | client key |
| request_hash | request consistency |
| status | processing/completed/failed |
| response_status | stored HTTP status |
| response_body/reference | replayable response |
| resource_type | created resource |
| resource_id | created resource |
| created_at | creation |
| expires_at | retention |

Unique constraint should prevent duplicate logical requests.

---

# 8. Idempotency Request Hash

If the same idempotency key is reused with a different request body, Bezzo must reject the request.

Example:

```text
Key: abc123
Request A → amount ₹100
Request B → amount ₹500
```

The second request must not silently reuse the first result.

Return a conflict-style error indicating that the key is already associated with a different request.

---

# 9. Idempotency Lifecycle

```text
REQUEST RECEIVED
      ↓
LOOKUP KEY
      │
      ├── existing COMPLETED
      │       ↓
      │   return stored result
      │
      ├── existing PROCESSING
      │       ↓
      │   wait / return conflict according to endpoint policy
      │
      └── absent
              ↓
        create idempotency record
              ↓
        execute operation
              ↓
        persist result
              ↓
          COMPLETED
```

---

# 10. Atomic Idempotency Creation

The idempotency record must be created atomically.

Do not use:

```text
SELECT key
if not found:
    INSERT
```

without a uniqueness constraint.

Two concurrent requests could both pass the check.

Use:

```text
UNIQUE(scope, actor_id, idempotency_key)
```

and handle the conflict deterministically.

---

# 11. Database Constraints as Final Protection

Every important logical uniqueness rule must have a database constraint.

Examples:

```text
unique supplier SKU
unique payment provider event ID
unique webhook event ID
unique idempotency key within scope
unique active subscription
unique external provider reference
```

Application validation is useful but is not sufficient.

---

# 12. Distributed Lock Principles

A distributed lock is a coordination mechanism shared across application instances.

Use it only when:

- multiple instances must coordinate
- database transaction semantics alone are insufficient
- the critical section is bounded
- lock ownership can be safely identified
- failure recovery is understood

Do not place large workflows inside a distributed lock.

---

# 13. Lock Key Design

Lock keys must be narrowly scoped.

Good:

```text
lock:inventory:supplier_123:sku_456
```

Potentially dangerous:

```text
lock:inventory
```

The broader the lock, the greater the contention.

Prefer the smallest key that protects the conflicting resource.

---

# 14. Lock Ownership

A lock must have a unique owner token.

Example:

```text
lock key:
lock:inventory:sup123:sku456

owner:
uuid-generated-token
```

Only the owner that acquired the lock may release it.

Never blindly execute:

```text
DEL lock:key
```

because another worker may have acquired the lock after expiration.

---

# 15. Lock TTL

Every distributed lock must have a TTL.

Example:

```text
acquire
TTL = bounded duration
```

The TTL must exceed normal critical-section duration but remain finite.

A crashed process must eventually release the lock automatically.

---

# 16. Lock Renewal

For operations that genuinely exceed the initial TTL, use controlled lease renewal.

Requirements:

- owner verification
- bounded maximum lifetime
- renewal heartbeat
- cancellation if renewal fails

Do not allow infinite lock renewal.

---

# 17. Lock Expiration Hazard

A critical problem:

```text
Worker A acquires lock
       ↓
lock expires
       ↓
Worker B acquires lock
       ↓
Worker A continues operating
```

Therefore, TTL alone does not prove exclusive ownership.

For highly sensitive operations, use:

- fencing tokens
- database state validation
- transactional ownership checks

where necessary.

---

# 18. Fencing Tokens

A fencing token is a monotonically increasing ownership number.

Example:

```text
Worker A → token 101
Worker B → token 102
```

If Worker A continues after losing the lock, downstream state can reject token 101 because token 102 is newer.

Fencing is particularly useful for:

- long-running resource ownership
- external storage operations
- warehouse operations
- scheduled singleton jobs

---

# 19. Preferred Lock Technology

Bezzo may use Redis for distributed coordination initially.

However:

```text
Redis lock
```

must not become the authoritative source of business state.

PostgreSQL remains the source of truth for:

- orders
- payments
- inventory
- users
- suppliers
- fulfillment
- refunds

---

# 20. PostgreSQL Row Locks

For database-backed resources, row-level locking is often preferable to Redis locks.

Example:

```sql
SELECT *
FROM inventory
WHERE id = $1
FOR UPDATE;
```

The transaction then safely evaluates and updates inventory.

This keeps the lock and business mutation inside one transaction.

---

# 21. Inventory Reservation

Inventory is one of Bezzo's most important concurrency cases.

Example:

```text
Available = 1

Buyer A → reserve 1
Buyer B → reserve 1
```

Only one request may succeed.

The preferred approach is an atomic database transaction.

---

# 22. Inventory Reservation Transaction

Conceptual flow:

```text
BEGIN

SELECT inventory row
FOR UPDATE

verify available_quantity >= requested_quantity

decrement available quantity
increment reserved quantity

create reservation

COMMIT
```

If insufficient inventory exists:

```text
ROLLBACK
```

and return an out-of-stock response.

---

# 23. Atomic Conditional Update

For suitable inventory models, an atomic update may be used:

```sql
UPDATE inventory
SET available_quantity = available_quantity - :qty
WHERE id = :id
  AND available_quantity >= :qty;
```

Then verify affected row count.

```text
1 row → reservation succeeded
0 rows → insufficient inventory / conflict
```

This can reduce lock duration.

---

# 24. Reservation Expiration

If inventory is reserved during checkout/payment:

```text
RESERVED
   ↓
payment completed
   ↓
COMMITTED
```

or:

```text
RESERVED
   ↓
reservation expires
   ↓
RELEASED
```

Expiration must be processed by a durable background job.

---

# 25. Preventing Double Release

A reservation must only transition once.

Use a state transition:

```text
RESERVED → RELEASED
```

and enforce:

```text
current_state = RESERVED
```

in the update.

A second release should become a no-op or controlled conflict.

---

# 26. Multi-Supplier Inventory

When one customer order requires multiple suppliers:

```text
Customer Order
      │
      ├── Supplier A reservation
      ├── Supplier B reservation
      └── Supplier C reservation
```

Each reservation must be independently concurrency-safe.

The overall order must not assume all supplier inventory operations are one database transaction if they are represented by separate bounded operations.

---

# 27. Supplier Inventory Sync Race

Potential race:

```text
Supplier webhook says stock = 0
        +
Buyer checkout reserves 1
```

The system must define event ordering and source-of-truth rules.

Inventory updates should include source metadata where available:

```text
source
source_event_id
source_timestamp
source_version
```

Stale supplier updates should not overwrite newer authoritative state.

---

# 28. Optimistic Concurrency

Optimistic concurrency is appropriate when conflicts are uncommon.

Add a version:

```text
version = 10
```

Update:

```sql
UPDATE product
SET price = :price,
    version = version + 1
WHERE id = :id
  AND version = 10;
```

If zero rows are updated:

```text
concurrent modification detected
```

The client can reload and retry.

---

# 29. When to Use Optimistic Concurrency

Good candidates:

- admin product edits
- supplier profile edits
- configuration
- catalog metadata
- non-hot records

Avoid relying solely on optimistic concurrency for extremely hot inventory counters without an appropriate atomic strategy.

---

# 30. Pessimistic Concurrency

Pessimistic locking is appropriate when:

- the record is highly contested
- correctness requires serialized mutation
- transaction duration can remain short

Examples:

- inventory reservation
- financial ledger mutation
- certain order state transitions

---

# 31. Order State Transitions

Orders must use guarded state transitions.

Example:

```text
PENDING
  ↓
CONFIRMED
  ↓
FULFILLING
  ↓
SHIPPED
  ↓
DELIVERED
```

An invalid concurrent transition must fail.

Example:

```text
DELIVERED → CONFIRMED
```

must not be possible.

---

# 32. Guarded State Update

Conceptual:

```sql
UPDATE orders
SET status = 'CONFIRMED'
WHERE id = :id
  AND status = 'PENDING';
```

Then inspect affected rows.

```text
1 → transition succeeded
0 → already transitioned or invalid state
```

This prevents race-dependent state corruption.

---

# 33. Payment Idempotency

Payment initiation must use an idempotency mechanism.

Example:

```text
payment_intent_key
```

The same client retry must not create multiple payment attempts unintentionally.

External gateway idempotency support should be used where available.

---

# 34. Payment Webhook Deduplication

Provider callbacks may arrive:

```text
once
twice
many times
```

Store the provider's event/reference ID with a unique constraint.

Example:

```text
UNIQUE(provider, provider_event_id)
```

Only the first valid event should produce the business transition.

---

# 35. Payment State Concurrency

Example:

```text
Payment callback: PAID
Refund request: REFUND_PENDING
```

These operations must use guarded state transitions.

The payment state machine defines which transitions are legal.

Never let two concurrent operations independently overwrite payment status.

---

# 36. Refund Idempotency

Refund requests should have a unique logical operation key.

Example:

```text
refund:<payment_id>:<refund_request_id>
```

A retry should return the existing refund record rather than create another refund.

---

# 37. Shipment State Concurrency

External logistics callbacks can arrive out of order.

Example:

```text
DELIVERED
then
IN_TRANSIT
```

The state machine must reject or safely ignore stale backward transitions.

Use:

- provider event timestamp
- provider sequence number where available
- terminal-state rules
- current state validation

---

# 38. Scheduled Job Singleton

A scheduled task should not execute simultaneously on multiple workers.

Options:

### Database uniqueness

Create a unique execution key:

```text
job_type + scheduled_period
```

### Distributed lock

Acquire:

```text
lock:scheduler:payment-reconciliation:2026-01-15T10
```

Database uniqueness is preferred when the execution itself is represented as a durable record.

---

# 39. Cron Overlap

Suppose:

```text
job runs every 5 minutes
execution takes 8 minutes
```

The next scheduled run must not automatically create an unsafe duplicate.

Use:

- unique execution key
- overlap policy
- worker lease
- explicit concurrency setting

---

# 40. Webhook Processing Concurrency

The same event can arrive concurrently.

Protection:

```text
provider_event_id
        ↓
unique constraint
        ↓
one logical processing record
```

The processing handler must also be idempotent because a process can crash after the record is created.

---

# 41. Distributed Lock Anti-Patterns

Do not:

```text
lock entire checkout
```

Do not:

```text
lock an entire supplier catalog
```

Do not:

```text
hold a Redis lock while waiting for a third-party API
```

Do not:

```text
use a lock without TTL
```

Do not:

```text
release another worker's lock
```

Do not:

```text
assume lock acquisition means business authorization
```

---

# 42. Lock Scope

Keep critical sections short.

Bad:

```text
acquire lock
 ↓
call payment gateway
 ↓
call Porter
 ↓
send SMS
 ↓
update database
 ↓
release lock
```

Better:

```text
transactionally reserve local state
 ↓
commit
 ↓
external operation
 ↓
transactionally record result
```

Use idempotency and state machines instead of holding locks across network calls.

---

# 43. Lock Contention

Metrics should include:

```text
lock_acquisition_total
lock_contention_total
lock_wait_duration
lock_timeout_total
lock_expired_total
```

A rising contention rate indicates a design or workload problem.

---

# 44. Lock Timeouts

A lock acquisition timeout must be handled explicitly.

Do not silently continue as if the lock was acquired.

Possible response:

```text
409 CONFLICT
```

or:

```text
503 SERVICE_UNAVAILABLE
```

depending on whether the conflict is business-level or infrastructure-level.

---

# 45. Lock Failure Handling

If Redis is unavailable:

- do not assume the lock exists
- do not perform operations requiring the lock unless an alternate safe mechanism exists
- prefer database transaction/constraint protection
- fail closed for operations where correctness cannot otherwise be guaranteed

---

# 46. Database Deadlocks

Concurrent transactions can deadlock.

Example:

```text
Transaction A locks row 1 → waits row 2
Transaction B locks row 2 → waits row 1
```

Prevention:

- consistent lock ordering
- short transactions
- minimal locked rows
- avoiding unnecessary nested transactions

Recovery:

- detect database deadlock
- retry the transaction safely
- use bounded retry count

---

# 47. Lock Ordering

If a workflow must lock multiple records, acquire them in deterministic order.

Example:

```text
SKU IDs:
101, 205, 301
```

Always lock:

```text
101 → 205 → 301
```

rather than depending on request order.

This reduces deadlock risk.

---

# 48. Transaction Isolation

PostgreSQL isolation must be selected intentionally.

Default:

```text
READ COMMITTED
```

is generally appropriate for many Bezzo operations.

Stronger isolation may be used for specific workflows when required.

Do not use serializable isolation globally without evidence that the workload needs it.

---

# 49. Serializable Transactions

For operations requiring serializable semantics:

```text
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE
```

must be paired with bounded retry handling for serialization failures.

The application must treat a serialization failure as a safe transaction retry, not as a business failure.

---

# 50. Advisory Locks

PostgreSQL advisory locks may be useful for database-local coordination.

Examples:

```text
singleton maintenance task
catalog rebuild
supplier-specific reconciliation
```

They must still have:

- bounded scope
- clear key design
- timeout behavior
- observability

Advisory locks should not replace row-level transactional locking when the business state is already represented by rows.

---

# 51. Distributed Lock vs Database Lock

Use a database lock when:

```text
resource is stored in PostgreSQL
+
operation is transactional
```

Use a distributed lock when:

```text
multiple independent processes must coordinate
+
database transaction cannot express the coordination cleanly
```

Examples for distributed coordination:

```text
singleton scheduler
expensive external synchronization
cross-service coordination
```

---

# 52. Idempotency for Background Jobs

Queue delivery is normally at-least-once.

Therefore:

```text
job execution ≠ exactly once
```

Handlers must be safe to repeat.

Examples:

```text
send notification
create shipment
update search index
process supplier sync
```

Each requires a suitable idempotency mechanism.

---

# 53. Notification Idempotency

For notifications:

```text
notification:<event_id>:<channel>:<recipient>
```

can represent the logical delivery.

Before sending:

```text
already sent?
```

must be determined atomically.

Provider-level message IDs should also be stored when available.

---

# 54. Search Index Idempotency

Search indexing should use deterministic document IDs.

Example:

```text
product:<product_id>
```

Indexing the same product multiple times becomes an overwrite of the same logical document rather than duplicate documents.

---

# 55. Inventory Sync Idempotency

Supplier sync records should use:

```text
supplier_id
+
source_system
+
source_event_id
```

or another deterministic source key.

Repeated supplier events should not repeatedly mutate inventory.

---

# 56. Bulk Operation Concurrency

Bulk operations require special controls.

Examples:

- bulk product upload
- bulk price update
- bulk inventory import
- bulk report generation
- bulk webhook replay

Controls:

```text
job limit
row/chunk limit
concurrency limit
tenant quota
rate limit
```

---

# 57. Admin Concurrency

Admin operations can conflict with supplier actions.

Example:

```text
Supplier changes product price
Admin suspends product
```

Use:

- optimistic concurrency
- guarded state transitions
- audit logging

Admin authority must not bypass data integrity rules.

---

# 58. Configuration Concurrency

Runtime configuration should use versioning.

Example:

```text
configuration_version = 42
```

An update can require:

```text
WHERE version = 42
```

to prevent silently overwriting a concurrent administrator change.

---

# 59. Cache Concurrency

Cache invalidation must not become a source of stale critical business state.

For example:

```text
inventory cache
```

must never override the authoritative inventory transaction.

Use cache for:

```text
read acceleration
```

not:

```text
business correctness
```

---

# 60. Cache Stampede Protection

For expensive cache misses:

```text
many requests
     ↓
same missing key
     ↓
many database queries
```

Use:

- request coalescing
- short-lived lock
- stale-while-revalidate
- bounded refresh concurrency

The lock should protect cache generation, not business state.

---

# 61. Single-Flight Pattern

For expensive reads:

```text
first request → generates value
other requests → await same generation
```

This is useful for:

- catalog aggregations
- configuration loading
- expensive reports
- metadata generation

The mechanism must have timeout and failure recovery.

---

# 62. Race Testing

Concurrency tests must deliberately create races.

Example:

```text
50 parallel buyers
1 remaining unit
```

Expected:

```text
1 success
49 failures
```

not:

```text
multiple successful reservations
```

---

# 63. Payment Race Tests

Test:

```text
same payment initiation × 20
same webhook × 20
refund request × 20
payment + refund concurrently
```

Expected state must remain valid and financially consistent.

---

# 64. Order Race Tests

Test:

```text
same idempotency key × 20
same cart checkout × 20
cancel + confirm
confirm + timeout
```

Only legal state transitions may succeed.

---

# 65. Inventory Race Tests

Test:

```text
stock = 10
100 concurrent requests × quantity 1
```

Expected:

```text
10 successful reservations
90 rejected
```

No negative stock.

---

# 66. Supplier Sync Race Tests

Simulate:

```text
event version 20
event version 19
event version 21
event version 20 duplicate
```

The final state must follow the documented source ordering rules.

---

# 67. Lock Testing

Test:

```text
worker A acquires
worker B attempts
worker A crashes
TTL expires
worker B acquires
```

Also test:

```text
worker A lock expires
worker B acquires
worker A attempts release
```

Worker A must not release worker B's lock.

---

# 68. Fencing Test

Test:

```text
token 100 → old worker
token 101 → new worker
old worker attempts write
```

The stale token must be rejected wherever fencing is required.

---

# 69. Observability

Metrics should include:

### Idempotency

```text
idempotency_requests_total
idempotency_replays_total
idempotency_conflicts_total
idempotency_in_progress_total
```

### Locks

```text
lock_acquire_success_total
lock_acquire_failure_total
lock_wait_duration
lock_timeout_total
lock_contention_total
```

### Concurrency

```text
serialization_failure_total
deadlock_retry_total
optimistic_conflict_total
```

---

# 70. Logging

Every concurrency-sensitive operation should log:

```text
operation
resource_type
resource_id
job_id/request_id
correlation_id
idempotency_key hash/reference
lock key hash/reference
attempt
result
duration
```

Never log raw secrets or sensitive idempotency values unnecessarily.

---

# 71. Tracing

Distributed traces should identify:

```text
request
 ↓
idempotency check
 ↓
transaction
 ↓
lock acquisition
 ↓
external call
 ↓
state transition
```

Lock wait time and transaction wait time should be visible where possible.

---

# 72. Alerting

Alert on:

- abnormal idempotency conflicts
- high lock contention
- frequent lock timeouts
- deadlock spikes
- serialization retry spikes
- negative inventory detection
- duplicate payment prevention events
- abnormal refund conflicts
- queue duplicate processing
- stale lock accumulation

---

# 73. Security Considerations

Concurrency controls must not become an authorization bypass.

Example:

```text
User A acquires resource lock
```

does not mean:

```text
User A is authorized for resource
```

Authorization must be checked independently.

Lock keys must not expose sensitive information unnecessarily.

---

# 74. Tenant Isolation

Lock keys and idempotency scopes must include tenant context when required.

Bad:

```text
lock:product:123
```

if product IDs can collide or the resource is tenant-scoped.

Safer:

```text
lock:tenant:456:product:123
```

The exact key depends on global vs tenant-local identity.

---

# 75. API Idempotency Response Rules

If a completed idempotent request is repeated:

```text
same status
same logical response
same resource
```

should normally be returned.

The API should document whether response headers indicate replay.

Example:

```text
Idempotency-Replayed: true
```

---

# 76. Idempotency Expiration

Idempotency records should have bounded retention.

The retention window depends on operation type.

Examples:

```text
order creation → longer
payment initiation → longer
simple non-financial action → shorter
```

The retention period must be documented per API operation.

---

# 77. Expired Idempotency Keys

After expiration, reuse may be possible depending on endpoint policy.

For financial operations, reuse should be treated cautiously.

A previously completed business resource may still exist even if the idempotency record expired.

Business-level uniqueness constraints remain necessary.

---

# 78. External Provider Idempotency

When supported, pass a deterministic idempotency key to the provider.

Example:

```text
Bezzo payment intent ID
```

should map to the provider request's idempotency key.

Do not generate a new provider key for every network retry of the same logical operation.

---

# 79. Exactly-Once Reality

Bezzo should not claim universal exactly-once execution across distributed systems.

The practical model is:

```text
at-least-once execution
+
idempotency
+
database constraints
+
state-machine guards
+
reconciliation
```

This is the reliability model for critical distributed workflows.

---

# 80. Recommended Decision Matrix

| Problem | Primary Control | Secondary Control |
|---|---|---|
| Duplicate API request | Idempotency key | DB uniqueness |
| Duplicate webhook | Provider event ID | Unique constraint |
| Last-unit inventory race | DB transaction/atomic update | Row lock |
| Admin edit conflict | Optimistic concurrency | Audit |
| Order transition race | Guarded update | Transaction |
| Payment retry | Idempotency | Provider idempotency |
| Singleton scheduler | DB execution key | Distributed lock |
| Slow cache regeneration | Single-flight | Short lock |
| Long external ownership | Fencing token | Lease |
| Job duplicate | Idempotent handler | Job key |
| Deadlock | Lock ordering | Transaction retry |

---

# 81. Implementation Structure

Recommended modules:

```text
src/
  modules/
    idempotency/
      application/
      domain/
      infrastructure/

    distributed-lock/
      application/
      infrastructure/

    concurrency/
      optimistic/
      pessimistic/
      state-transition/

    inventory/
      reservation/

    payments/
      idempotency/
      state-machine/

    jobs/
      deduplication/
      execution/

  shared/
    database/
    redis/
    crypto/
    observability/
```

---

# 82. Database Tables

Recommended supporting tables:

```text
idempotency_records
lock_operations (optional audit/diagnostic record)
job_executions
webhook_inbound_events
payment_provider_events
inventory_reservations
resource_versions
scheduled_job_executions
```

Not every lock acquisition requires a permanent database record; high-volume ephemeral locks should normally be monitored through metrics rather than persisted individually.

---

# 83. Migration Requirements

Existing tables should receive:

- unique constraints
- indexes
- version columns where required
- state transition constraints
- provider reference uniqueness
- idempotency support

Migrations must be backward compatible during rolling deployments.

---

# 84. Deployment Safety

During deployment:

```text
old code
+
new code
```

may run concurrently.

Therefore:

- schemas must remain compatible
- idempotency behavior must remain compatible
- job payload versions must remain supported
- state transitions must remain valid
- lock keys must remain compatible

---

# 85. Performance Requirements

Concurrency controls must improve correctness without becoming the primary performance bottleneck.

Measure:

```text
lock wait
transaction duration
row lock duration
idempotency lookup latency
database conflict rate
serialization retries
```

Hot resources should be identified and optimized based on measurements.

---

# 86. Hot-Row Mitigation

A single extremely hot inventory row may become a contention point.

Possible approaches:

- atomic updates
- reservation partitioning
- batching
- inventory bucket/shard model
- supplier-level distribution
- short transactions

Do not introduce complexity until profiling shows the hot row is a real bottleneck.

---

# 87. Avoiding Global Locks

Never create a global lock for ordinary marketplace traffic.

Bad:

```text
lock:checkout
```

This would serialize unrelated buyers.

Prefer resource-scoped coordination:

```text
lock:inventory:<sku>
```

or, better where possible, a database atomic update.

---

# 88. Lock Key Namespacing

Use explicit namespaces:

```text
lock:inventory:...
lock:scheduler:...
lock:catalog:...
lock:integration:...
```

This prevents accidental key collisions.

---

# 89. Lock Key Length and Cardinality

Keys should be:

- deterministic
- bounded
- non-sensitive
- easy to inspect operationally

Avoid embedding full request bodies or personal data.

---

# 90. Concurrency and Caching

Never trust stale cached values for critical conditional decisions.

Bad:

```text
cache says stock = 1
→ reserve
```

Correct:

```text
database authoritative inventory
→ atomic reservation
```

Cache can assist discovery but not final correctness.

---

# 91. Concurrency and Search

Search results may become stale while an order is being placed.

Therefore:

```text
search availability
```

must not be treated as a reservation.

Checkout must revalidate:

- product eligibility
- price
- supplier
- inventory
- licensing restrictions
- delivery eligibility

before final order commitment.

---

# 92. Concurrency and Promotions

Promotion eligibility may be contested.

For limited-use promotions:

```text
coupon usage count
```

must be updated atomically.

Example:

```sql
UPDATE promotions
SET used_count = used_count + 1
WHERE id = :id
  AND used_count < usage_limit;
```

Then verify affected rows.

---

# 93. Concurrency and Supplier Capacity

If supplier capacity is limited:

```text
available fulfillment capacity
```

must be reserved atomically or through a clearly defined allocation mechanism.

Do not use a cached capacity number for final booking.

---

# 94. Concurrency and Logistics

Multiple workers must not create duplicate logistics bookings for the same fulfillment.

Use:

```text
fulfillment_id
+
booking idempotency key
```

with a unique constraint.

---

# 95. Concurrency and Notifications

Repeated business events must not generate uncontrolled duplicate customer notifications.

Use:

```text
event_id
+
channel
+
recipient
+
notification type
```

as a logical uniqueness scope where appropriate.

---

# 96. Concurrency and Support

Two agents may update the same support case.

Use optimistic concurrency:

```text
case_version
```

and reject stale updates.

The UI should reload current data when a conflict occurs.

---

# 97. Concurrency and Admin Bulk Actions

Bulk admin operations should create a job and process resources in bounded chunks.

Do not hold one lock across the entire bulk action.

Each resource should be independently protected.

---

# 98. Operational Runbook: Lock Contention

```text
1. Identify lock namespace
2. Identify hottest resource keys
3. Check lock wait duration
4. Check transaction duration
5. Check worker count
6. Determine whether contention is expected
7. Reduce critical-section size if possible
8. Review lock granularity
9. Review database query/index performance
10. Only then consider architectural changes
```

---

# 99. Operational Runbook: Duplicate Financial Operation

```text
1. Identify logical operation ID
2. Inspect idempotency record
3. Inspect provider reference
4. Inspect payment state machine
5. Verify database uniqueness
6. Reconcile provider state
7. Prevent further retries if necessary
8. Correct state through controlled workflow
9. Record audit event
```

---

# 100. Operational Runbook: Negative Inventory Detection

```text
1. Freeze affected SKU/supplier workflow if necessary
2. Identify conflicting reservations
3. Inspect inventory transactions
4. Inspect supplier sync events
5. Inspect order reservations
6. Reconcile source inventory
7. Correct inventory through controlled adjustment
8. Review concurrency failure
9. Add regression test
```

---

# 101. Definition of Done

The Bezzo concurrency-control subsystem is production-ready when:

### Idempotency
- [ ] API idempotency exists for critical write operations
- [ ] request hashes are validated
- [ ] duplicate requests return deterministic results
- [ ] retention is configured
- [ ] provider idempotency is used where available

### Database correctness
- [ ] critical uniqueness constraints exist
- [ ] guarded state transitions exist
- [ ] inventory reservation is atomic
- [ ] payment state transitions are guarded
- [ ] deadlock retries exist

### Locks
- [ ] lock keys are scoped
- [ ] locks have TTL/lease behavior
- [ ] ownership is verified
- [ ] lock release is safe
- [ ] contention is observable
- [ ] critical long-lived ownership has a fencing strategy where required

### Jobs
- [ ] handlers are idempotent
- [ ] duplicate jobs are safe
- [ ] scheduler overlap is controlled
- [ ] replay is safe

### Testing
- [ ] inventory race tests pass
- [ ] payment race tests pass
- [ ] webhook duplicate tests pass
- [ ] concurrent order tests pass
- [ ] deadlock tests pass
- [ ] lock expiry tests pass
- [ ] deployment overlap tests pass

---

# 102. Final Engineering Architecture

```text
                    CLIENT REQUEST
                          │
                          ▼
                 ┌─────────────────┐
                 │ Authentication  │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Idempotency     │
                 │ Check/Create    │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Authorization   │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ DB Transaction  │
                 │ + Constraints   │
                 └────────┬────────┘
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
       Atomic Update             Row Lock / Version
              │                        │
              └───────────┬────────────┘
                          ▼
                  Durable State
                          │
                          ▼
                    Outbox / Job
                          │
                          ▼
                   Async Worker
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       External Provider       Internal Processing
              │                       │
              ▼                       ▼
       Idempotent Result        State Transition
              │                       │
              └───────────┬───────────┘
                          ▼
                    Audit + Metrics
```

The Bezzo platform should treat **idempotency, database constraints, transactions, guarded state transitions, and bounded distributed coordination** as complementary controls.

Distributed locks are a specialized tool, not the default mechanism for business correctness.

---

## 103. Implementation Priority

Recommended sequence:

1. database uniqueness constraints audit
2. critical state-machine transition guards
3. API idempotency framework
4. inventory atomic reservation
5. payment idempotency and provider references
6. webhook deduplication
7. background-job idempotency
8. optimistic concurrency for admin/supplier edits
9. database deadlock/serialization retry infrastructure
10. Redis distributed-lock abstraction
11. scheduler singleton protection
12. lock metrics and dashboards
13. fencing tokens for genuinely long-lived ownership
14. concurrency/load test suite
15. production race-condition testing
16. operational runbooks

---

**End of Document**

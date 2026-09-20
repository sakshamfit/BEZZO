# Bezzo Background Jobs, Queue Workers & Asynchronous Processing Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Scope:** Background jobs, queues, workers, asynchronous processing, scheduling, retries, concurrency, reliability, observability, and operational controls

---

## 1. Purpose

This specification defines how Bezzo performs work asynchronously outside the synchronous HTTP request path.

The system must support reliable background processing for:

- order workflows
- payments and reconciliation
- inventory synchronization
- supplier integrations
- webhook delivery
- notifications
- scheduled deliveries
- logistics updates
- search indexing
- analytics/event processing
- media processing
- reports
- fraud/risk analysis
- data lifecycle jobs
- operational maintenance

The design prioritizes durability, idempotency, bounded concurrency, horizontal scaling, observability, and graceful recovery.

---

# 2. Core Principles

1. User-facing requests should remain short and bounded.
2. Slow or failure-prone work should move to asynchronous processing.
3. Every important job must be safely retryable.
4. Job handlers must be idempotent.
5. Jobs must have explicit ownership and purpose.
6. Queue failure must not silently lose durable work.
7. One failing job type must not starve unrelated workloads.
8. Concurrency must be bounded.
9. Retries must use exponential backoff with jitter.
10. Poison jobs must enter a dead-letter state.
11. Scheduled jobs must be durable and observable.
12. Shutdown must be graceful.
13. Operational replay must be controlled and audited.
14. Background processing must preserve tenant isolation.
15. External systems must be treated as unreliable dependencies.

---

# 3. High-Level Architecture

```text
                 ┌─────────────────────────┐
                 │ Bezzo API / Application │
                 └────────────┬────────────┘
                              │
                    create async work
                              │
                              ▼
                 ┌─────────────────────────┐
                 │ Job / Outbox Producer   │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │ Queue / Job Store       │
                 │ Redis initially         │
                 └────────────┬────────────┘
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
   Order Workers       Integration Workers   Notification Workers
          │                   │                    │
          ▼                   ▼                    ▼
     PostgreSQL          External APIs        Push/SMS/Email
          │
          └───────────────────────────────────────┐
                                                  ▼
                                         Observability / Audit
```

Redis-backed queues are appropriate for the initial implementation. The architecture must keep queue infrastructure replaceable if scale or reliability requirements later justify another broker.

---

# 4. Synchronous vs Asynchronous Work

## 4.1 Keep Synchronous

Use synchronous processing for operations that:

- require immediate user feedback
- are short and predictable
- need transactional consistency before responding
- cannot reasonably be deferred

Examples:

```text
login
OTP verification
cart read
product search
cart validation
order submission validation
payment initiation
basic account updates
```

## 4.2 Move Asynchronous

Use background processing for:

```text
email
SMS
push notification
webhook delivery
search indexing
image processing
supplier inventory synchronization
analytics ingestion
report generation
payment reconciliation
logistics reconciliation
scheduled order preparation
bulk imports
large exports
fraud analysis
data retention cleanup
```

---

# 5. Job Categories

Bezzo should organize jobs into bounded domains.

Recommended categories:

```text
orders
payments
inventory
fulfillment
logistics
notifications
webhooks
integrations
search
media
analytics
fraud
support
reports
maintenance
data-lifecycle
```

Each category should have explicit retry, timeout, concurrency, and priority policies.

---

# 6. Job Envelope

Every durable job should use a common envelope.

Example:

```json
{
  "job_id": "job_01JXXXXXXXX",
  "job_type": "inventory.sync",
  "job_version": 1,
  "created_at": "2026-01-15T10:20:30.000Z",
  "scheduled_at": "2026-01-15T10:20:35.000Z",
  "attempt": 1,
  "tenant_id": "tenant_123",
  "correlation_id": "req_456",
  "causation_id": "evt_789",
  "priority": "normal",
  "idempotency_key": "inventory-sync:supplier-123:batch-456",
  "payload": {}
}
```

Required:

- job ID
- job type
- version
- created timestamp
- attempt number
- correlation ID where available
- payload

Tenant context is required for tenant-scoped work.

---

# 7. Job Identity

Every job must have a unique immutable `job_id`.

Job IDs must never be reused.

A separate `idempotency_key` should be used when the same logical operation may be requested multiple times.

Example:

```text
job_id:
job_001
job_002

idempotency_key:
supplier:123:inventory:2026-01-15T10
```

Multiple physical jobs may therefore safely represent one logical operation.

---

# 8. Queue Model

Recommended logical queues:

```text
critical
default
notifications
integrations
webhooks
search
media
analytics
reports
maintenance
```

The exact physical queue topology may differ by environment.

The important requirement is workload isolation.

---

# 9. Priority

Jobs may use:

```text
critical
high
normal
low
```

Priority must not become an excuse for unbounded starvation.

A high-priority queue should still have concurrency limits.

Example:

```text
critical: 20%
high:     30%
normal:   40%
low:      10%
```

These are configuration examples, not fixed production values.

---

# 10. Queue Isolation

High-volume workloads must not consume every worker.

For example:

```text
bulk analytics
     ≠
payment reconciliation
```

and:

```text
image processing
     ≠
order state transition
```

Resource-intensive jobs should use separate worker pools or concurrency controls.

---

# 11. Job Lifecycle

```text
CREATED
  ↓
QUEUED
  ↓
CLAIMED
  ↓
RUNNING
  ├── SUCCEEDED
  │
  ├── RETRY_WAIT
  │      ↓
  │    QUEUED
  │
  ├── FAILED
  │
  └── DEAD_LETTERED
```

Scheduled jobs additionally use:

```text
SCHEDULED
```

before becoming queued.

---

# 12. Job States

Recommended persistent states:

```text
QUEUED
SCHEDULED
RUNNING
SUCCEEDED
RETRYING
FAILED
DEAD_LETTERED
CANCELLED
```

State transitions must be explicit.

---

# 13. Worker Architecture

Workers should be independently deployable from API processes where useful.

Example:

```text
API deployment
Worker deployment
Scheduler deployment
```

For smaller environments these may initially run within the same application repository but must remain logically separated.

---

# 14. Worker Responsibilities

A worker must:

1. receive a job
2. validate the job envelope
3. establish tracing context
4. verify authorization/tenant context
5. claim the job safely
6. execute the handler
7. record success or failure
8. schedule retry when appropriate
9. release resources
10. emit metrics

---

# 15. Graceful Shutdown

Workers must handle shutdown signals.

Shutdown sequence:

```text
receive SIGTERM
      ↓
stop claiming new jobs
      ↓
finish active safe work
      ↓
acknowledge completed jobs
      ↓
return unfinished work to queue
      ↓
close connections
      ↓
exit
```

The implementation must use bounded shutdown time.

---

# 16. Job Timeout

Every job type must define a maximum execution time.

Examples:

```text
short job
medium job
long job
```

The actual duration should be based on load testing.

A job that exceeds its timeout must not remain indefinitely marked as running.

---

# 17. Lease / Visibility Timeout

Where the queue system uses leases, a worker receives a temporary claim.

If the worker dies:

```text
lease expires
   ↓
job becomes available
   ↓
another worker retries
```

Long-running jobs may renew their lease.

Lease duration must exceed normal processing time while remaining short enough to recover failed workers promptly.

---

# 18. Idempotent Job Handlers

Every handler must assume it can execute more than once.

Example:

```ts
async function handleShipmentCreated(job) {
  const existing = await shipmentEvents.findById(job.idempotencyKey);

  if (existing) {
    return;
  }

  // perform operation
}
```

Database uniqueness constraints should be used where possible instead of relying only on application memory.

---

# 19. Transactional Job Creation

When a database transaction creates a state change that requires asynchronous work, use the transactional outbox pattern where appropriate.

Example:

```text
BEGIN

UPDATE order
SET status = CONFIRMED

INSERT INTO outbox_event (...)

COMMIT
```

A dispatcher converts the outbox event into the corresponding job.

This prevents:

```text
business state committed
+
job enqueue failed
=
lost async operation
```

---

# 20. Direct Queue Publishing

Direct queue publishing is acceptable when loss of the request-to-job relationship cannot create an inconsistent business state.

For critical business workflows, prefer:

```text
database transaction
        +
outbox
        ↓
durable dispatch
```

---

# 21. Retry Classification

Failures must be classified.

### Retryable

- network timeout
- temporary DNS failure
- connection reset
- HTTP 429
- HTTP 500
- HTTP 502
- HTTP 503
- HTTP 504
- temporary database connectivity failure
- temporary provider outage

### Non-retryable

- invalid payload
- authorization failure that requires configuration
- unsupported event
- malformed data
- permanent business rule violation
- deleted target where recovery is impossible

---

# 22. Retry Strategy

Use exponential backoff with jitter.

Conceptual formula:

```text
delay =
  min(max_delay, base_delay × 2^attempt)
  + random_jitter
```

This prevents synchronized retry storms.

Retry policy must be configurable per job type.

---

# 23. Retry Limits

Each job type must define:

- maximum attempts
- maximum retry duration
- maximum backoff
- dead-letter behavior

Do not retry forever.

Infinite retries hide incidents and consume infrastructure.

---

# 24. Dead-Letter Jobs

After retry exhaustion, move the job to a dead-letter state.

Record:

- job ID
- job type
- payload reference
- tenant
- attempt count
- first failure
- last failure
- error classification
- timestamps

Sensitive payloads must be protected.

---

# 25. Poison Jobs

A poison job is a job that repeatedly fails because the input or handler cannot succeed.

Examples:

```text
malformed supplier record
unsupported schema version
invalid product data
broken integration configuration
```

Poison jobs must stop retrying indefinitely and enter dead-letter handling.

---

# 26. Job Replay

Authorized operators should be able to replay dead-letter jobs.

Replay must:

- preserve the original job ID for audit reference
- create a new execution attempt or replay ID
- be idempotent
- be rate limited
- be audited
- avoid overwhelming downstream systems

Bulk replay requires stronger controls.

---

# 27. Scheduled Jobs

Scheduled jobs include:

- scheduled delivery preparation
- reminder notifications
- payment reconciliation
- supplier sync
- inventory refresh
- report generation
- data cleanup
- fraud/risk checks
- expired-cart cleanup

Schedules must be durable and observable.

---

# 28. Scheduler Architecture

Recommended:

```text
Scheduler
   ↓
find due schedules
   ↓
create jobs
   ↓
queue
   ↓
workers
```

The scheduler must be safe to run on multiple instances.

Use distributed locking or database uniqueness to prevent duplicate schedule creation.

---

# 29. Scheduled Delivery

For scheduled customer deliveries:

```text
order created
     ↓
delivery date + slot stored
     ↓
scheduled job
     ↓
preparation window
     ↓
supplier fulfillment
     ↓
route batching
     ↓
logistics dispatch
```

Jobs should be generated early enough to account for supplier preparation and logistics capacity.

---

# 30. Recurring Jobs

Recurring jobs must not depend solely on in-memory timers.

Avoid:

```ts
setInterval(...)
```

as the authoritative scheduler.

Use durable schedule records.

---

# 31. Time Zones

All persisted timestamps should use UTC.

Business scheduling must retain the relevant local timezone.

For India-focused Bezzo operations:

```text
Asia/Kolkata
```

is the primary business timezone unless a multi-country rollout introduces additional timezone rules.

---

# 32. Cron Safety

Cron-style jobs must be idempotent.

Example:

```text
reconcile payments every 15 minutes
```

If two scheduler instances trigger the same period, only one logical reconciliation should execute.

Use:

- unique execution keys
- distributed locks
- database constraints

---

# 33. Job Deduplication

Duplicate job creation should be controlled with an idempotency key.

Example:

```text
notification:order-confirmed:ord_123
```

A unique constraint can ensure that the same logical job is not created repeatedly.

---

# 34. Concurrency Controls

Concurrency limits must exist at multiple levels:

```text
global workers
queue
job type
tenant
supplier
external provider
endpoint
```

Example:

```text
Porter API concurrency = N
```

prevents Bezzo from overwhelming the provider even if thousands of jobs are queued.

---

# 35. Per-Tenant Limits

Large suppliers or enterprise integrations must not monopolize workers.

Use tenant-aware quotas for:

- inventory sync
- bulk imports
- exports
- reports
- webhooks
- integration traffic

---

# 36. External Provider Backpressure

When an external provider returns:

```text
429
503
timeout
```

workers should reduce pressure through:

- retries
- backoff
- concurrency reduction
- circuit breakers
- provider-specific rate limits

Do not continue increasing traffic against an unhealthy dependency.

---

# 37. Batch Processing

Batching may be used for:

- analytics
- search indexing
- supplier inventory imports
- notification fan-out
- report generation
- cleanup operations

Batch size must be bounded.

Large batches increase:

- memory usage
- transaction duration
- retry cost
- blast radius

---

# 38. Chunking

Large jobs should be split.

Example:

```text
1,000,000 products
        ↓
1,000 chunks × 1,000 products
```

Each chunk should have its own job or controlled execution unit.

A failed chunk should not require restarting the entire operation.

---

# 39. Bulk Imports

Supplier product/inventory imports should use:

```text
upload
  ↓
validate file
  ↓
create import job
  ↓
parse chunks
  ↓
validate records
  ↓
persist valid records
  ↓
record invalid records
  ↓
publish updates
  ↓
complete import
```

The API should return quickly after accepting the import.

---

# 40. Job Progress

Long-running jobs should expose progress.

Example:

```json
{
  "status": "RUNNING",
  "processed": 7200,
  "total": 10000,
  "failed": 17
}
```

Progress must not require polling the worker process directly.

Persist progress in a durable store.

---

# 41. Cancellation

Long-running jobs should support cancellation when safe.

States:

```text
RUNNING
   ↓
CANCEL_REQUESTED
   ↓
CANCELLED
```

Handlers must check cancellation at safe checkpoints.

Do not forcibly terminate a process while it is in the middle of a critical database transaction.

---

# 42. Job Dependencies

Some jobs depend on previous jobs.

Example:

```text
image upload
   ↓
image processing
   ↓
catalog indexing
```

Dependency state should be explicit.

Possible models:

```text
job A succeeds
   ↓
enqueue job B
```

This is generally easier to reason about than building a complex generic workflow engine too early.

---

# 43. Workflow vs Job

Use a simple job when:

```text
one operation
```

Use a workflow when:

```text
multiple durable steps
+
branching
+
compensation
+
long-running state
```

Core order/payment workflows should remain represented by domain state machines rather than hiding business logic inside arbitrary queue chains.

---

# 44. Notifications

Notification jobs should support:

```text
push
SMS
email
in-app
approved messaging provider
```

Example:

```text
order.confirmed
     ↓
notification job
     ↓
preference check
     ↓
provider
     ↓
delivery status
```

A notification provider outage should not block the underlying order state.

---

# 45. Webhook Jobs

Outbound webhook delivery should run through background workers.

Flow:

```text
event
 ↓
subscription lookup
 ↓
delivery job
 ↓
signature generation
 ↓
HTTP request
 ↓
success / retry / dead-letter
```

This integrates with the Webhooks & Event Delivery specification.

---

# 46. Search Indexing Jobs

Product changes should publish indexing work asynchronously.

Example:

```text
product.updated
      ↓
search-index job
      ↓
OpenSearch update
```

Search indexing failure should not corrupt the source-of-truth PostgreSQL product record.

A reconciliation job should periodically detect indexing drift.

---

# 47. Media Processing Jobs

Product images may require:

- validation
- malware scanning
- resizing
- thumbnail generation
- format conversion
- metadata removal
- CDN publication

These operations should run asynchronously.

---

# 48. Inventory Synchronization Jobs

Supplier inventory jobs should support:

- full sync
- incremental sync
- webhook-triggered sync
- scheduled sync
- retry
- reconciliation

Inventory freshness should be measurable.

Example metric:

```text
inventory_sync_lag_seconds
```

---

# 49. Payment Reconciliation Jobs

Payment reconciliation must compare:

```text
Bezzo payment state
        vs
gateway/provider state
```

Discrepancies should create review/reconciliation records rather than silently overwriting state.

---

# 50. Logistics Reconciliation Jobs

For deliveries:

```text
Bezzo shipment state
        vs
Porter/provider state
```

A reconciliation job should detect:

- missing callbacks
- stale states
- terminal-state mismatches
- failed deliveries
- unexpected cancellations

---

# 51. Analytics Jobs

Analytics workloads should not compete with transaction-critical jobs.

Use separate queues or worker pools.

Examples:

```text
event aggregation
daily metrics
supplier analytics
buyer analytics
dashboard summaries
```

---

# 52. Reports

Large reports should be asynchronous.

Flow:

```text
request report
      ↓
create report job
      ↓
generate file
      ↓
store in object storage
      ↓
mark complete
      ↓
notify user
```

The API should return a job/report identifier.

---

# 53. Fraud and Risk Jobs

Risk analysis may run asynchronously when it is not required before a critical decision.

Examples:

- suspicious order analysis
- account abuse analysis
- payment anomaly detection
- supplier anomaly detection

Risk-critical gates must remain synchronous when business policy requires a decision before fulfillment.

---

# 54. Data Lifecycle Jobs

Background jobs may perform:

- expired session cleanup
- token cleanup
- temporary file cleanup
- webhook payload expiration
- audit retention processing
- abandoned upload cleanup
- anonymization workflows

Deletion must follow the approved retention policy.

---

# 55. Database Transactions in Workers

Workers should keep transactions short.

Avoid:

```text
BEGIN
  external API request
  wait 30 seconds
COMMIT
```

Prefer:

```text
BEGIN
  update state
COMMIT

external call

BEGIN
  persist result
COMMIT
```

State machines must define what happens if the external call succeeds but the persistence step fails.

---

# 56. External API Calls

External calls must have:

- timeout
- retry policy
- idempotency key where supported
- circuit breaker where appropriate
- provider rate limit
- structured error classification

Never allow an external API call to block a worker indefinitely.

---

# 57. Database Connection Management

Workers must use bounded database pools.

Do not allocate a large independent connection pool per worker process.

Total connections must remain within PostgreSQL capacity.

---

# 58. Redis Usage

Redis may initially provide:

- queue storage
- job state
- distributed locks
- rate limiting
- short-lived coordination

Redis must not become the only durable source for business-critical state.

PostgreSQL remains the source of truth for core business records.

---

# 59. Queue Durability

Queue configuration must use appropriate persistence.

Important jobs must have a durable recovery path.

For business-critical events:

```text
PostgreSQL outbox
```

provides the durable source.

The queue is a delivery mechanism, not the business source of truth.

---

# 60. Backpressure

When queues grow:

```text
queue depth ↑
      ↓
processing latency ↑
      ↓
scale workers
      +
limit producers where safe
      +
protect critical queues
```

Backpressure must prevent cascading failures.

---

# 61. Autoscaling

Worker autoscaling may use:

- queue depth
- oldest job age
- processing latency
- CPU
- memory
- external provider capacity

Queue depth alone is insufficient when job execution times vary substantially.

---

# 62. Scaling Model

Workers should scale horizontally:

```text
worker 1
worker 2
worker 3
...
worker N
```

Job handlers must therefore be stateless or use shared durable state.

---

# 63. Worker Resource Isolation

Resource-heavy jobs should have isolated worker pools.

Examples:

```text
media workers
report workers
analytics workers
integration workers
critical transaction workers
```

This protects the marketplace's critical paths.

---

# 64. Memory Safety

Workers must avoid loading huge datasets into memory.

Prefer:

```text
pagination
streaming
chunking
cursor-based reads
bounded batches
```

---

# 65. Error Handling

Every job failure should have:

- normalized error class
- safe error message
- retry classification
- correlation ID
- job ID
- attempt number

Do not store stack traces containing secrets.

---

# 66. Error Taxonomy

Recommended classes:

```text
VALIDATION_ERROR
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
NOT_FOUND
CONFLICT
RATE_LIMITED
TIMEOUT
NETWORK_ERROR
PROVIDER_ERROR
DATABASE_ERROR
SYSTEM_ERROR
UNKNOWN_ERROR
```

Retry behavior should map to these categories.

---

# 67. Observability

Metrics:

```text
jobs_created_total
jobs_started_total
jobs_succeeded_total
jobs_failed_total
jobs_retried_total
jobs_dead_lettered_total
job_duration
queue_depth
oldest_job_age
retry_delay
worker_utilization
```

Dimensions:

- job type
- queue
- environment
- integration
- tenant where safe and useful

Avoid high-cardinality labels containing raw user IDs.

---

# 68. Logging

Structured worker logs should include:

```text
timestamp
level
service
worker_id
job_id
job_type
attempt
correlation_id
tenant_id where appropriate
duration
result
error_class
```

Do not log:

- passwords
- OTPs
- payment credentials
- webhook secrets
- authorization tokens
- unnecessary personal data

---

# 69. Tracing

Trace flow:

```text
HTTP request
 ↓
database transaction
 ↓
outbox
 ↓
job
 ↓
worker
 ↓
external provider
```

Every asynchronous boundary should preserve correlation information.

---

# 70. Alerting

Alert on:

- queue depth threshold
- oldest job age
- dead-letter growth
- worker crash loops
- high retry rate
- job latency spikes
- provider-specific failures
- scheduler failures
- outbox backlog
- Redis queue failure
- database connection exhaustion

---

# 71. Queue Health Dashboard

Admin/operations dashboards should show:

```text
Queue
Depth
Oldest Job
Throughput
Success %
Retry %
Dead-letter count
Worker count
Worker utilization
```

Critical queues should be visible separately.

---

# 72. Tenant Isolation

Every tenant-scoped job must carry tenant context.

Handlers must enforce:

```text
job.tenant_id
      ↓
authorization
      ↓
database query scope
```

Never trust a tenant ID supplied only inside arbitrary job payload data without server-side validation.

---

# 73. Job Payload Security

Do not place large or sensitive data directly in queue payloads unnecessarily.

Prefer:

```text
job payload:
resource ID
```

then retrieve the resource securely.

If a snapshot is required for correctness, encrypt or protect it according to data classification.

---

# 74. API Behavior for Async Operations

For long-running work:

```http
POST /v1/reports
```

may return:

```json
{
  "job_id": "job_123",
  "status": "QUEUED"
}
```

The client may query:

```http
GET /v1/jobs/job_123
```

or receive a notification when complete.

---

# 75. Job Status API

Example response:

```json
{
  "job_id": "job_123",
  "type": "report.generate",
  "status": "RUNNING",
  "progress": {
    "processed": 7200,
    "total": 10000
  },
  "created_at": "...",
  "started_at": "..."
}
```

Do not expose internal worker infrastructure details to ordinary users.

---

# 76. Admin Job APIs

Example:

```text
GET  /v1/admin/jobs
GET  /v1/admin/jobs/:id
POST /v1/admin/jobs/:id/retry
POST /v1/admin/jobs/:id/cancel
POST /v1/admin/jobs/:id/replay
GET  /v1/admin/queues
GET  /v1/admin/dead-letters
```

All administrative actions require authorization and audit logging.

---

# 77. Security Controls

Required:

- authenticated workers
- least-privilege service identities
- encrypted connections
- protected queue access
- secret management
- tenant isolation
- payload validation
- rate limits
- audit logging
- safe error handling

Workers should not receive permissions for unrelated resources.

---

# 78. Worker Service Accounts

Each worker class should receive only required permissions.

Example:

```text
notification worker
  → notification provider credentials
  → notification tables

media worker
  → object storage media bucket
  → media metadata tables
```

Avoid one universal credential for every worker.

---

# 79. Multi-Region Considerations

The initial Bezzo deployment may use one primary region.

If multi-region is later introduced:

- jobs need region ownership rules
- duplicate execution must remain safe
- queues need regional strategy
- failover must preserve durable work
- scheduled jobs must not execute twice

The architecture should not assume one global in-memory scheduler.

---

# 80. Disaster Recovery

After worker infrastructure recovery:

1. reconnect to durable database
2. restore queue connectivity
3. recover outbox backlog
4. resume scheduled jobs
5. process pending work
6. monitor retries
7. inspect dead-letter growth
8. reconcile critical external systems

Do not blindly replay every historical job.

---

# 81. Disaster Recovery Testing

Regularly test:

- worker termination
- Redis restart
- database failover
- queue backlog recovery
- scheduler restart
- duplicate job execution
- provider outage
- network partition
- dead-letter recovery

---

# 82. Testing Strategy

### Unit tests

Test:

- handler logic
- retry classification
- idempotency
- state transitions
- payload validation

### Integration tests

Test:

- queue
- PostgreSQL
- Redis
- external adapters
- outbox dispatcher

### Failure tests

Test:

- worker crash
- timeout
- duplicate delivery
- database error
- queue failure
- provider 500
- provider 429

### Load tests

Test:

- queue bursts
- scheduled delivery peaks
- supplier synchronization bursts
- notification fan-out
- webhook retry storms

---

# 83. Local Development

Developers should be able to run:

```text
PostgreSQL
Redis
API
Worker
Scheduler
```

locally.

Provide deterministic test data and development queues.

---

# 84. Environment Separation

Use separate:

```text
development
staging
production
```

queues and credentials.

Production jobs must never be consumed by development workers.

---

# 85. Deployment

Worker deployment must support:

- rolling updates
- graceful shutdown
- health checks
- autoscaling
- rollback

During deployment:

```text
old worker
  ↓
stop claiming new jobs
  ↓
finish safe work
  ↓
new worker starts
```

---

# 86. Versioned Job Handlers

Long-lived jobs may outlive the application version that created them.

Therefore:

```text
job_type
+
job_version
```

must be considered.

Do not deploy a handler that suddenly interprets an old payload differently.

---

# 87. Backward Compatibility

During rolling deployment:

```text
old workers + new workers
```

may process the same queue.

Job payloads must remain compatible during the deployment window.

Breaking changes require versioned jobs or coordinated migration.

---

# 88. Queue Migration

When moving from one queue implementation to another:

```text
dual-write where necessary
↓
validate new consumers
↓
drain old queue
↓
switch producers
↓
monitor
↓
remove old path
```

Migration must not create duplicate business operations.

---

# 89. Maintenance Mode

Background processing should support controlled maintenance modes:

```text
NORMAL
DEGRADED
DRAIN
PAUSED
READ_ONLY
```

For example, during database maintenance:

```text
stop new jobs
drain safe workers
pause scheduler
perform maintenance
resume
```

---

# 90. Rate Limiting Jobs

Job producers should also be rate limited.

Examples:

```text
supplier bulk import
report generation
mass notification
webhook replay
```

This prevents a single user or admin action from generating an uncontrolled workload.

---

# 91. Notification Fan-Out

For an event affecting many recipients:

```text
event
 ↓
fan-out planner
 ↓
bounded notification jobs
 ↓
provider workers
```

Do not enqueue millions of jobs inside one unbounded transaction.

Use chunking.

---

# 92. Scheduled Order Batching

Scheduled orders may be grouped by:

```text
delivery date
time slot
service area
supplier
route
```

Background processing can prepare batches before the dispatch window.

This supports the planned Morning/Afternoon/Evening delivery model without blocking buyer checkout.

---

# 93. Supplier Sync Scheduling

Supplier synchronization should support configurable schedules such as:

```text
real-time webhook
every few minutes
hourly
daily full reconciliation
```

The exact frequency depends on supplier capability and commercial requirements.

---

# 94. Search Reindexing

A full catalog reindex should be asynchronous.

Flow:

```text
create reindex job
 ↓
scan products in chunks
 ↓
index batches
 ↓
track progress
 ↓
validate counts
 ↓
complete
```

Search availability should remain operational during a controlled reindex where architecture permits.

---

# 95. Media Reprocessing

When image transformation rules change:

```text
create media reprocess job
 ↓
find affected assets
 ↓
chunk
 ↓
process
 ↓
publish
 ↓
verify
```

Failed assets should be retryable individually.

---

# 96. Data Export Jobs

Exports should be asynchronous because they may involve:

- large database scans
- CSV/XLSX generation
- object storage
- access control
- temporary download links

Export jobs must enforce authorization at creation time and file retrieval time.

---

# 97. Job Ownership

Every important job type should have an engineering owner.

Recommended metadata:

```text
job_type
owner_team
severity
runbook
retry_policy
timeout
queue
```

This makes incidents actionable.

---

# 98. Operational Documentation

Every production job should have:

- purpose
- trigger
- input
- output
- dependencies
- retry policy
- timeout
- owner
- dashboard
- alert
- runbook
- rollback/recovery procedure

---

# 99. Definition of Done

The Bezzo background-processing platform is production-ready when:

### Architecture
- [ ] queue infrastructure implemented
- [ ] workers separated logically from API
- [ ] transactional outbox implemented
- [ ] durable job lifecycle implemented
- [ ] scheduler implemented

### Reliability
- [ ] retries work
- [ ] backoff and jitter work
- [ ] dead-letter handling works
- [ ] idempotency works
- [ ] leases/timeouts work
- [ ] graceful shutdown works
- [ ] replay works

### Scalability
- [ ] workers scale horizontally
- [ ] queues are isolated
- [ ] concurrency limits exist
- [ ] tenant limits exist
- [ ] provider limits exist
- [ ] backpressure exists

### Observability
- [ ] metrics exist
- [ ] structured logs exist
- [ ] tracing exists
- [ ] dashboards exist
- [ ] alerts exist
- [ ] queue age is monitored

### Security
- [ ] worker identities are least privilege
- [ ] queue access is protected
- [ ] payloads are validated
- [ ] tenant isolation is tested
- [ ] secrets are protected
- [ ] admin replay is audited

### Testing
- [ ] unit tests pass
- [ ] integration tests pass
- [ ] failure tests pass
- [ ] load tests pass
- [ ] recovery tests pass

---

# 100. Recommended Initial Queue/Worker Topology

For the first production implementation:

```text
                    ┌────────────────────┐
                    │ PostgreSQL         │
                    │ Source of Truth    │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ Transactional      │
                    │ Outbox             │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ Redis              │
                    │ Job Queues         │
                    └─────────┬──────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  Critical Workers      Integration Workers    General Workers
        │                     │                     │
        ▼                     ▼                     ▼
 Orders/Payments       ERP/POS/Porter/Webhook   Notifications/Search
        │                                           Media/Analytics
        └───────────────────┬───────────────────────┘
                            ▼
                    Observability Platform
```

Start with a modular worker architecture rather than a large microservice fleet.

Extract dedicated worker deployments only when workload isolation, scaling, security, or operational requirements justify it.

---

# 101. Implementation Priority

Recommended implementation sequence:

1. queue abstraction
2. job envelope
3. worker runtime
4. retry/backoff engine
5. idempotency infrastructure
6. transactional outbox integration
7. dead-letter handling
8. scheduler
9. job status persistence
10. observability
11. webhook workers
12. notification workers
13. payment reconciliation workers
14. logistics reconciliation workers
15. supplier ERP/POS sync workers
16. search indexing workers
17. media workers
18. report/export workers
19. replay tooling
20. autoscaling and advanced workload isolation

---

# 102. Final Engineering Principle

Bezzo's background processing system should make asynchronous work **durable, observable, retryable, idempotent, bounded, and recoverable**.

The system must assume:

```text
workers crash
queues restart
networks fail
providers time out
messages duplicate
events arrive late
deployments overlap
```

The correct engineering response is not to assume these failures will never happen.

The correct response is to design every critical job so that these failures can occur without corrupting Bezzo's source-of-truth business state.

---

**End of Document**

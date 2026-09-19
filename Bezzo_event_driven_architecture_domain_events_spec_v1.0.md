# Bezzo Event-Driven Architecture & Domain Events Specification v1.0

## Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Event-Driven Architecture & Domain Events Specification |
| Version | 1.0 |
| Status | Baseline / Implementation Reference |
| Primary Audience | Backend, architecture, DevOps, QA, data, integrations |
| Related Documents | Bezzo Business Rules & State Machine Specification; API Error Handling, Idempotency & Integration Contract Specification |

---

# 1. Purpose

This specification defines how Bezzo publishes, consumes, stores, retries, observes and governs domain events.

The event architecture exists to:

- decouple business modules
- trigger asynchronous side effects
- support notifications
- support search/index updates
- support analytics
- support audit and compliance processing
- support inventory and fulfillment workflows
- integrate external providers safely
- enable future service extraction without redesigning domain boundaries

Events are not a replacement for synchronous APIs or transactional business rules.

The source of truth for business state remains the transactional domain model.

---

# 2. Core Architecture Position

Bezzo should initially use an event-driven architecture within a modular monolith / small number of deployables.

Recommended direction:

```text
                 +----------------------+
                 | Bezzo API / Commands |
                 +----------+-----------+
                            |
                            v
                 +----------------------+
                 | Domain/Application   |
                 | Modules              |
                 +----------+-----------+
                            |
                    DB Transaction
                            |
              +-------------+-------------+
              |                           |
              v                           v
       Business State              Outbox Event
              |                           |
              +-------------+-------------+
                            |
                            v
                    Event Publisher
                            |
                            v
                    Message Transport
                            |
          +-----------------+------------------+
          |                 |                  |
          v                 v                  v
     Notification       Search/Index       Analytics
       Worker             Worker            Consumer
          |
          v
    External Providers
```

The implementation should avoid premature distributed microservices.

---

# 3. Event Principles

Bezzo events SHALL follow these principles:

1. Business state changes happen transactionally.
2. Important events are persisted through an outbox.
3. Event delivery is assumed to be at-least-once.
4. Consumers must be idempotent.
5. Event consumers must not bypass domain authorization.
6. Events describe facts that occurred, not commands disguised as facts.
7. Events should be immutable.
8. Events should contain enough context for safe processing.
9. Sensitive information must be minimized.
10. Event schemas must be versioned.
11. Event processing must be observable.
12. Failed events must be retryable and recoverable.

---

# 4. Domain Event vs Command

A command requests an action.

Example:

```text
ConfirmOrder
CancelOrder
ReserveInventory
CreatePayment
DispatchFulfillment
```

A domain event states that something happened.

Example:

```text
order.confirmed
order.cancelled
inventory.reserved
payment.created
fulfillment.dispatched
```

Commands:

```text
"Please do this."
```

Events:

```text
"This happened."
```

Consumers must not interpret a domain event as permission to perform unrelated state changes without applying their own business rules.

---

# 5. Event Categories

Bezzo events are grouped into:

### Identity

```text
user.registered
user.verified
user.suspended
```

### Supplier

```text
supplier.registered
supplier.documents.submitted
supplier.verified
supplier.suspended
supplier.reactivated
```

### Catalog

```text
product.created
product.updated
product.approved
product.rejected
product.archived
supplier_offer.created
supplier_offer.updated
supplier_offer.activated
supplier_offer.deactivated
```

### Inventory

```text
inventory.updated
inventory.reserved
inventory.released
inventory.allocated
inventory.depleted
inventory.adjusted
```

### Cart / Checkout

```text
cart.created
cart.updated
checkout.started
checkout.completed
checkout.failed
```

### Orders

```text
order.created
order.confirmed
order.cancelled
order.completed
order.closed
```

### Fulfillment

```text
fulfillment.created
fulfillment.assigned
fulfillment.accepted
fulfillment.packed
fulfillment.ready
fulfillment.dispatched
fulfillment.delivered
fulfillment.failed
fulfillment.cancelled
```

### Payments

```text
payment.created
payment.authorized
payment.succeeded
payment.failed
payment.pending
payment.refunded
payment.partially_refunded
```

### Logistics

```text
logistics.quote.created
logistics.booking.created
logistics.booking.failed
logistics.driver.assigned
logistics.pickup.completed
logistics.out_for_delivery
logistics.delivered
logistics.failed
```

### Returns / Refunds

```text
return.requested
return.approved
return.rejected
return.picked_up
return.received
refund.requested
refund.completed
refund.failed
```

### Promotions

```text
promotion.created
promotion.activated
promotion.deactivated
promotion.expired
coupon.redeemed
```

### Settlement

```text
settlement.created
settlement.calculated
settlement.approved
payout.initiated
payout.completed
payout.failed
```

### Support

```text
ticket.created
ticket.assigned
ticket.updated
ticket.resolved
ticket.closed
dispute.created
dispute.resolved
```

### Compliance / Risk

```text
compliance_document.submitted
compliance_document.approved
compliance_document.rejected
risk_case.created
risk_case.reviewed
risk_case.resolved
```

---

# 6. Event Naming

Event names SHALL use lowercase dot notation.

Preferred:

```text
order.confirmed
payment.succeeded
inventory.reserved
fulfillment.dispatched
```

Avoid:

```text
OrderConfirmed
Order_Confirmed
ORDER_CONFIRMED
orderConfirmed
```

Event names represent completed facts.

---

# 7. Event Envelope

Every event SHALL use a common envelope.

Example:

```json
{
  "eventId": "evt_01J...",
  "eventType": "order.confirmed",
  "eventVersion": 1,
  "occurredAt": "2026-01-01T10:00:00Z",
  "publishedAt": "2026-01-01T10:00:01Z",
  "producer": "orders",
  "aggregateType": "order",
  "aggregateId": "ord_123",
  "aggregateVersion": 8,
  "correlationId": "corr_123",
  "causationId": "cmd_123",
  "actorType": "BUYER",
  "actorId": "usr_123",
  "data": {}
}
```

---

# 8. Event Envelope Fields

| Field | Required | Purpose |
|---|---:|---|
| eventId | Yes | Globally unique event identifier |
| eventType | Yes | Stable event name |
| eventVersion | Yes | Event schema version |
| occurredAt | Yes | Time business event occurred |
| publishedAt | Recommended | Time event was published |
| producer | Yes | Producing module |
| aggregateType | Yes | Business aggregate |
| aggregateId | Yes | Aggregate identifier |
| aggregateVersion | Recommended | Aggregate version at event creation |
| correlationId | Yes | End-to-end operation identifier |
| causationId | Recommended | Command/event that caused this event |
| actorType | Recommended | User/system/provider |
| actorId | Optional | Actor reference |
| data | Yes | Event-specific payload |

---

# 9. Event Identity

`eventId` SHALL be unique.

Consumers SHALL store processed event identifiers when necessary.

Example:

```text
processed_events
----------------
consumer_name
event_id
processed_at
result
```

Recommended unique constraint:

```text
(consumer_name, event_id)
```

This prevents duplicate processing.

---

# 10. Aggregate Identity

Events should identify the aggregate that changed.

Examples:

```text
aggregateType = order
aggregateId   = ord_123
```

```text
aggregateType = fulfillment
aggregateId   = ful_123
```

This supports:

- tracing
- ordering analysis
- debugging
- replay
- event projection

---

# 11. Aggregate Version

Aggregates MAY maintain a monotonically increasing version.

Example:

```text
Order version 7 -> order.confirmed
Order version 8 -> fulfillment.created
```

Consumers that require ordering can use the aggregate version.

If an event arrives with:

```text
aggregateVersion = 10
```

while version 9 has not been processed, the consumer may delay or reconcile depending on its consistency requirements.

---

# 12. Transactional Outbox

Important domain events SHALL use the transactional outbox pattern.

Example:

```text
BEGIN TRANSACTION

UPDATE orders
SET status = 'CONFIRMED'

INSERT INTO outbox_events (...)

COMMIT
```

After commit:

```text
Outbox Publisher
      |
      v
Message Transport
```

This ensures that the business-state change and event creation succeed or fail together.

---

# 13. Outbox Event Structure

Recommended table:

```text
outbox_events
```

Suggested fields:

```text
id
event_id
event_type
event_version
aggregate_type
aggregate_id
aggregate_version
correlation_id
causation_id
payload
headers
status
attempt_count
available_at
published_at
created_at
last_error
```

Statuses:

```text
PENDING
PUBLISHING
PUBLISHED
FAILED
DEAD_LETTERED
```

---

# 14. Event Delivery

Initial transport can use a managed or Redis-backed queue/event mechanism appropriate to the deployment.

The abstraction should permit migration to a dedicated broker later.

Potential future transports include:

```text
RabbitMQ
Kafka
cloud-managed queues/topics
```

Application modules should not depend directly on broker-specific APIs.

---

# 15. Delivery Guarantee

Bezzo should assume:

```text
at-least-once delivery
```

Therefore consumers must be idempotent.

Exactly-once behavior should not be assumed from the transport layer.

Business-level exactly-once effects are achieved through:

- unique constraints
- event deduplication
- idempotency
- state checks
- transactional writes

---

# 16. Consumer Pattern

Recommended consumer flow:

```text
Receive Event
     |
     v
Validate Envelope
     |
     v
Check Event ID
     |
     +---- already processed ---> ACK
     |
     v
Validate Schema
     |
     v
Execute Consumer Logic
     |
     v
Commit State + Consumer Record
     |
     v
ACK
```

The event should only be acknowledged after the required durable work succeeds.

---

# 17. Consumer Idempotency

Every consumer that causes side effects SHALL be designed for duplicate delivery.

Example:

```text
order.confirmed
      |
      v
Notification Consumer
      |
      +-- event already processed? -> skip
      |
      +-- send notification
      |
      +-- record processing
```

For financial or externally visible operations, use stronger idempotency controls.

---

# 18. Consumer Failure

If consumer processing fails:

```text
Event
  |
  v
Retry
  |
  v
Retry
  |
  v
Retry
  |
  v
Dead Letter Queue
```

Retry count and delay SHALL be configurable.

Transient failures should be retried.

Permanent failures should be moved to a dead-letter mechanism after retry exhaustion.

---

# 19. Retry Strategy

Recommended:

```text
Attempt 1 -> immediate/short delay
Attempt 2 -> exponential delay
Attempt 3 -> longer delay
Attempt 4 -> longer delay
...
```

Use jitter to prevent synchronized retry spikes.

Retry policies should distinguish:

```text
temporary provider failure
database temporary failure
schema failure
authorization/configuration failure
invalid business data
```

Permanent failures should not be retried indefinitely.

---

# 20. Dead-Letter Events

Dead-letter records SHALL contain:

```text
eventId
eventType
consumer
payload/reference
failure reason
attempt count
first failed at
last failed at
```

Operations tooling SHOULD support:

- inspect
- acknowledge
- retry
- replay
- quarantine
- mark resolved

Replaying an event must preserve auditability.

---

# 21. Event Ordering

Global ordering SHALL NOT be assumed.

Where ordering matters, use:

- aggregate version
- partitioning by aggregate ID
- consumer-side sequencing
- state validation

Example:

```text
order.created
order.confirmed
order.cancelled
```

A consumer must not blindly apply `order.cancelled` if the current state does not permit it.

---

# 22. Eventual Consistency

Some Bezzo features are intentionally eventually consistent.

Examples:

- search indexing
- analytics
- notifications
- recommendation updates
- reporting projections
- some dashboards

Transactional business operations remain strongly consistent where required.

The UI should distinguish:

```text
transaction completed
```

from:

```text
secondary projection updating
```

---

# 23. Search Index Events

Example:

```text
product.approved
supplier_offer.activated
inventory.updated
```

may trigger search-index updates.

Flow:

```text
Catalog DB
   |
   v
Domain Event
   |
   v
Search Consumer
   |
   v
OpenSearch
```

If indexing fails, the transaction should not be rolled back merely because the search projection is unavailable.

The indexing pipeline must retry/reconcile.

---

# 24. Notification Events

Notification consumers may listen to:

```text
order.confirmed
payment.succeeded
fulfillment.dispatched
fulfillment.delivered
return.approved
refund.completed
```

The notification service determines:

- channel
- recipient
- template
- locale
- priority
- delivery policy

The domain event should not contain provider-specific notification logic.

---

# 25. Analytics Events

Analytics consumers can process events into reporting models.

Examples:

```text
product.viewed
search.performed
cart.updated
checkout.completed
order.confirmed
payment.succeeded
order.completed
```

Analytics events should avoid unnecessary PII.

Business analytics should be derived from trusted domain events where possible.

---

# 26. Audit Events

Security and compliance-sensitive actions should produce audit records.

Examples:

```text
supplier.verified
supplier.suspended
admin.permission.changed
order.override.applied
refund.approved
compliance_document.approved
```

Audit records should be retained according to the compliance/data-retention policy.

---

# 27. Inventory Events

Inventory events are operationally sensitive.

Example:

```json
{
  "eventType": "inventory.reserved",
  "data": {
    "inventoryId": "inv_123",
    "productId": "prod_123",
    "supplierId": "sup_123",
    "quantity": 10,
    "reservationId": "res_123"
  }
}
```

Consumers must not infer inventory availability solely from an old event.

For authoritative availability, query the inventory domain.

---

# 28. Order Events

Typical order flow:

```text
order.created
      |
      v
order.confirmed
      |
      v
fulfillment.created
      |
      v
fulfillment.dispatched
      |
      v
fulfillment.delivered
      |
      v
order.completed
```

Cancellation may branch from eligible states:

```text
order.created -> order.cancelled
order.confirmed -> order.cancelled
```

Actual legality is defined by the state-machine specification.

---

# 29. Multi-Supplier Events

A single customer order may contain multiple supplier fulfillments.

Example:

```text
order.confirmed
       |
       +--> fulfillment.created [Supplier A]
       |
       +--> fulfillment.created [Supplier B]
```

Consumers SHALL use:

```text
orderId
fulfillmentId
supplierId
```

to distinguish aggregate and fulfillment-level events.

---

# 30. Scheduled Delivery Events

Scheduled orders may generate:

```text
fulfillment.scheduled
route.batch.created
fulfillment.dispatch_ready
logistics.booking.created
```

The scheduling subsystem can consume eligible events and create operational batches.

The customer-facing order remains one order even when multiple internal fulfillments exist.

---

# 31. Instant Delivery Events

Instant delivery can produce:

```text
logistics.quote.created
logistics.booking.created
driver.assigned
fulfillment.dispatched
```

The event architecture should not hard-code a specific logistics provider.

Provider adapters translate internal commands/events to provider APIs.

---

# 32. Payment Events

Payment event sequence may include:

```text
payment.created
payment.pending
payment.authorized
payment.succeeded
payment.failed
payment.refunded
```

Payment events must be reconciled with provider references.

Consumers must not mark an order paid based only on a client-side callback.

---

# 33. Refund Events

Refund flow:

```text
refund.requested
      |
      v
refund.processing
      |
      +--> refund.completed
      |
      +--> refund.failed
```

Where `refund.processing` is needed, it may remain an internal state rather than a public event.

Financial consumers must use idempotent processing.

---

# 34. Settlement Events

Supplier financial events may include:

```text
settlement.created
settlement.calculated
settlement.approved
payout.initiated
payout.completed
payout.failed
```

Settlement calculations should be based on authoritative transactional records.

Events provide notifications and workflow triggers; they do not replace the financial ledger.

---

# 35. Compliance Events

Compliance workflows can generate:

```text
compliance_document.submitted
compliance_document.approved
compliance_document.rejected
supplier.verified
supplier.suspended
```

Consumers may trigger:

- access restrictions
- admin alerts
- audit records
- supplier notifications
- marketplace eligibility changes

---

# 36. Risk Events

Risk events may include:

```text
risk_case.created
risk_case.reviewed
risk_case.resolved
```

Fraud/risk consumers should be separated from normal transactional logic.

A risk decision may place a controlled hold on a business operation according to the applicable business rules.

---

# 37. Support and Dispute Events

Examples:

```text
ticket.created
ticket.assigned
ticket.resolved
dispute.created
dispute.resolved
```

These events can feed:

- notifications
- SLA monitoring
- analytics
- audit records

---

# 38. Event Schema Versioning

Every event SHALL have an explicit schema version.

Example:

```text
order.confirmed v1
order.confirmed v2
```

Preferred evolution:

```text
add optional field
```

Avoid breaking existing consumers.

Breaking changes require a new event version or event type strategy.

---

# 39. Schema Compatibility

Consumers should tolerate:

- new optional fields
- additional metadata
- new event types they do not recognize

Consumers should fail safely when a known event version is unsupported.

Unknown events should be observable but should not crash the consumer process.

---

# 40. Event Payload Design

Events SHOULD contain business identifiers and necessary facts.

Avoid copying huge domain objects.

Preferred:

```json
{
  "orderId": "ord_123",
  "buyerId": "usr_123",
  "totalAmount": 12500,
  "currency": "INR"
}
```

Avoid:

```text
entire user profile
entire cart
entire supplier record
large product image metadata
```

Consumers should query authoritative services when additional data is required.

---

# 41. Sensitive Data

Events SHALL minimize:

- phone numbers
- email addresses
- addresses
- government identifiers
- licence information
- bank details
- payment credentials
- authentication information

If a consumer can work from an ID, publish the ID rather than duplicating sensitive data.

---

# 42. Event Encryption

Transport must use encrypted connections.

Sensitive event payloads may require additional encryption or restricted topics/queues.

Access to event streams SHALL be role-controlled.

---

# 43. Event Access Control

Not every consumer should receive every event.

Recommended logical boundaries:

```text
orders.events
payments.events
inventory.events
supplier.events
compliance.events
notifications.events
analytics.events
```

Access should be granted according to least privilege.

---

# 44. Event Retention

Retention SHALL be defined by event category.

Operational event streams may have shorter transport retention while important audit/financial records remain in durable domain tables.

Do not use message-broker retention as the only legal/compliance record.

---

# 45. Replay Strategy

Bezzo SHOULD support controlled event replay for projection rebuilds.

Example:

```text
Historical domain events
        |
        v
Replay consumer
        |
        v
Rebuild search/reporting projection
```

Replay must:

- identify replay mode
- prevent accidental external side effects
- preserve auditability
- use a separate consumer group/process where appropriate

Notifications and payment operations should generally not be replayed as ordinary side effects.

---

# 46. Projection Rebuild

For read models:

```text
Source of truth
      |
      v
Event stream/outbox history
      |
      v
Projection rebuild
      |
      v
Read model
```

Projection rebuilds should be deterministic.

---

# 47. Event Monitoring

Metrics should include:

```text
events_published_total
events_failed_total
events_retried_total
events_dead_lettered_total
consumer_processing_latency
consumer_lag
duplicate_event_total
schema_validation_failures
```

Alerts should be defined for:

- high consumer lag
- growing dead-letter queues
- repeated provider failures
- event publication failures
- schema incompatibility
- abnormal duplicate rates

---

# 48. Distributed Tracing

Events should propagate:

```text
traceId
correlationId
causationId
```

Example:

```text
POST /checkout
   |
   v
order.confirmed
   |
   +--> notification
   |
   +--> analytics
   |
   +--> search/index
   |
   +--> fulfillment workflow
```

Tracing should allow operators to follow the original user operation across asynchronous work.

---

# 49. Event Consumer Ownership

Each event consumer SHALL have a clear owner.

Recommended metadata:

```text
consumerName
owningModule
purpose
inputEvents
sideEffects
retryPolicy
deadLetterPolicy
```

No production consumer should exist without an identified purpose and owner.

---

# 50. Event Testing

Every important event SHALL have:

### Unit tests

- event creation
- schema validation
- state transition
- consumer logic

### Integration tests

- outbox persistence
- publication
- consumer processing
- duplicate delivery
- retry
- dead-letter

### Failure tests

- broker unavailable
- database unavailable
- consumer crash
- provider timeout
- duplicate event
- out-of-order event

---

# 51. Contract Testing

Producer and consumer contracts should be tested independently.

Test:

```text
producer emits valid event
consumer accepts supported event versions
consumer ignores safe unknown fields
consumer rejects unsupported versions safely
```

Schema changes must run compatibility tests before deployment.

---

# 52. Event Security Testing

Test:

- unauthorized event publishing
- unauthorized event consumption
- tampered payload
- replayed event
- duplicate event
- oversized event
- malicious serialized payload
- sensitive-data leakage

---

# 53. Operational Replay Controls

Replay must require controlled operator access.

Recommended controls:

- admin permission
- reason
- selected event IDs or time range
- consumer selection
- dry-run where possible
- audit record
- maximum replay batch
- monitoring

Never provide unrestricted replay of payment or external side-effect events.

---

# 54. Failure Isolation

A failing consumer SHALL NOT stop unrelated consumers.

Example:

```text
order.confirmed
     |
     +--> Notification consumer  [FAILED]
     |
     +--> Analytics consumer     [SUCCESS]
     |
     +--> Fulfillment consumer   [SUCCESS]
```

The notification failure should be retried independently.

---

# 55. Backpressure

Consumers SHALL support controlled backpressure.

When event volume increases:

```text
Producer
   |
   v
Queue grows
   |
   v
Consumer scales
```

Do not allow unbounded memory queues inside application processes.

---

# 56. Event Storm Protection

Events that can recursively trigger other events SHALL be designed carefully.

Avoid loops such as:

```text
A -> B -> C -> A -> B -> C
```

Use:

- clear ownership
- causation IDs
- state checks
- event semantics
- consumer guards

---

# 57. Example End-to-End Order Flow

```text
Buyer submits checkout
        |
        v
Order command
        |
        v
Order transaction
        |
        +--> order.created
        |
        +--> inventory.reserved
        |
        +--> payment.created
        |
        v
Outbox
        |
        v
Event publisher
        |
        +--> Payment workflow
        +--> Notification
        +--> Analytics
        +--> Fulfillment
```

Once payment succeeds:

```text
payment.succeeded
        |
        v
Order/payment workflow
        |
        v
order.confirmed
        |
        v
fulfillment.created
```

Actual transition conditions remain governed by the business state machine.

---

# 58. Example Multi-Supplier Flow

```text
Customer Order
      |
      +---- Supplier A fulfillment
      |
      +---- Supplier B fulfillment
```

Events:

```text
order.confirmed
fulfillment.created
fulfillment.created
```

Each fulfillment carries its own:

```text
fulfillmentId
supplierId
```

Supplier-specific events remain independently trackable.

---

# 59. Example Scheduled Delivery Flow

```text
Order confirmed
      |
      v
Scheduled fulfillment
      |
      v
Dispatch window approaches
      |
      v
Route batch created
      |
      v
Logistics booking
      |
      v
Driver assigned
      |
      v
Dispatched
      |
      v
Delivered
```

Events support operational orchestration without changing the customer-facing order model.

---

# 60. Event-to-Consumer Matrix

| Event | Notifications | Search | Analytics | Fulfillment | Audit |
|---|---:|---:|---:|---:|---:|
| user.registered | Yes | No | Yes | No | Optional |
| supplier.verified | Yes | Yes | Yes | No | Yes |
| product.approved | No | Yes | Yes | No | Yes |
| inventory.updated | No | Yes | Yes | Yes | Optional |
| order.confirmed | Yes | No | Yes | Yes | Yes |
| payment.succeeded | Yes | No | Yes | Yes | Yes |
| fulfillment.dispatched | Yes | No | Yes | No | Yes |
| fulfillment.delivered | Yes | No | Yes | No | Yes |
| refund.completed | Yes | No | Yes | No | Yes |
| supplier.suspended | Yes | Yes | Yes | Yes | Yes |

This matrix is a baseline and SHALL be refined during implementation.

---

# 61. Event Governance

Every event should have:

- documented owner
- schema
- version
- producer
- consumers
- retention policy
- security classification
- retry behavior
- replay policy
- monitoring
- test coverage

Event changes require architecture review when they affect multiple bounded contexts.

---

# 62. Implementation Sequence

## Phase 1 — Foundation

1. Define event envelope.
2. Define event naming standards.
3. Create event TypeScript interfaces.
4. Create outbox table.
5. Create outbox publisher.
6. Add correlation/causation IDs.
7. Add structured event logging.

## Phase 2 — Core Consumers

8. Order events.
9. Inventory events.
10. Payment events.
11. Fulfillment events.
12. Notification consumers.
13. Analytics consumers.

## Phase 3 — Reliability

14. Consumer deduplication.
15. Retry policies.
16. Dead-letter handling.
17. Replay tooling.
18. Consumer lag metrics.
19. Distributed tracing.

## Phase 4 — Integrations

20. Payment webhook events.
21. Logistics events.
22. Notification provider events.
23. Reconciliation events.

## Phase 5 — Advanced Scale

24. Broker abstraction hardening.
25. Partitioning where justified.
26. Projection rebuild tooling.
27. Event schema registry/governance if scale requires it.

---

# 63. Acceptance Criteria

The event architecture is considered implemented when:

- Important state changes generate durable events.
- Transactional outbox is implemented.
- Event IDs are unique.
- Consumers are idempotent.
- Duplicate events do not duplicate business side effects.
- Event schemas are versioned.
- Correlation and causation identifiers are propagated.
- Failed events retry according to policy.
- Poison events reach dead-letter handling.
- Operators can inspect failed events.
- Controlled replay exists for safe projections.
- External side effects have explicit safeguards.
- Event access is least-privilege.
- Sensitive information is minimized.
- Event metrics and traces are available.
- Contract tests exist.
- Consumer failures are isolated.
- Reconciliation exists for critical external integrations.

---

# 64. Definition of Done

For every new Bezzo domain event:

- [ ] Event name follows naming convention.
- [ ] Event owner is identified.
- [ ] Aggregate is identified.
- [ ] Schema version is defined.
- [ ] Envelope is valid.
- [ ] Payload contains only necessary information.
- [ ] Sensitive data has been reviewed.
- [ ] Outbox behavior is defined.
- [ ] Consumers are documented.
- [ ] Consumer idempotency is implemented.
- [ ] Retry policy is defined.
- [ ] Dead-letter behavior is defined.
- [ ] Metrics are emitted.
- [ ] Tracing identifiers are propagated.
- [ ] Contract tests exist.
- [ ] Failure scenarios are tested.
- [ ] Replay behavior is documented.

---

# 65. Final Architecture Position

Bezzo should use event-driven architecture as a reliability and decoupling mechanism, not as a reason to make every operation asynchronous.

The preferred model is:

```text
Synchronous command
        |
        v
Transactional business state
        |
        v
Transactional outbox
        |
        v
Durable event
        |
        +--> Notifications
        +--> Search
        +--> Analytics
        +--> Fulfillment
        +--> Audit
        +--> Integrations
```

The transactional database remains authoritative for business state.

Events provide durable facts and asynchronous propagation.

The combination of:

```text
Domain State
+
Business State Machine
+
Transactional Outbox
+
Idempotent Consumers
+
Retry/DLQ
+
Observability
+
Reconciliation
```

forms the event-driven reliability foundation for Bezzo and provides a clean path from the initial modular architecture toward future horizontal scaling and selective service extraction.

# Bezzo Business Rules & State Machine Specification v1.0

## 1. Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Business Rules & State Machine Specification |
| Version | 1.0 |
| Status | Draft for implementation |
| Scope | Cross-domain business state transitions |
| Primary Platforms | Web, Android, iOS, Admin |
| Related Domains | Identity, Supplier, Catalog, Inventory, Cart, Checkout, Orders, Fulfillment, Payments, Logistics, Returns, Settlements, Risk, Support |

---

## 2. Purpose

This document defines the canonical business states, allowed transitions, transition conditions, ownership, side effects, and failure handling for major Bezzo domain entities.

The purpose is to prevent business logic from being duplicated inconsistently across frontend, backend, workers, integrations, and admin tools.

State transitions are server-authoritative.

A client may request a transition, but only the domain service owning the entity may approve and persist it.

---

# 3. Core State Machine Principles

1. Every state transition must be explicit.
2. Invalid transitions must be rejected.
3. State changes must be transactional.
4. Every important transition must be auditable.
5. Automated transitions must identify their source.
6. Side effects should be event-driven where possible.
7. A failed side effect must not corrupt the authoritative state.
8. External provider status must not directly overwrite internal state without validation.
9. Terminal states must not be reopened except through an explicitly supported corrective workflow.
10. Historical transitions must remain traceable.
11. Permissions are evaluated before transitions.
12. Compliance and risk holds can restrict otherwise valid transitions.
13. Idempotent requests must not produce duplicate side effects.
14. State names and transition semantics must remain stable across clients.

---

# 4. State Machine Notation

The specifications below use:

```text
STATE_A
   ↓ condition
STATE_B
```

Each transition has:

- trigger
- preconditions
- actor
- resulting state
- side effects
- audit event
- failure behavior

---

# 5. User Account State Machine

## 5.1 States

```text
REGISTERED
PENDING_VERIFICATION
ACTIVE
SUSPENDED
LOCKED
DEACTIVATED
```

## 5.2 Core Transitions

```text
REGISTERED
→ PENDING_VERIFICATION
```

Trigger:
Account registration requiring verification.

```text
PENDING_VERIFICATION
→ ACTIVE
```

Condition:
Required verification completed.

```text
ACTIVE
→ SUSPENDED
```

Trigger:
Authorized administrative/security action.

```text
SUSPENDED
→ ACTIVE
```

Condition:
Suspension resolved.

```text
ACTIVE
→ LOCKED
```

Trigger:
Security control requiring temporary lock.

```text
LOCKED
→ ACTIVE
```

Condition:
Lock cleared.

```text
ACTIVE
→ DEACTIVATED
```

Trigger:
Account deactivation according to supported policy.

Every transition must generate an audit record.

---

# 6. Supplier Verification State Machine

## 6.1 States

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
REJECTED
SUSPENDED
```

## 6.2 Transitions

```text
REGISTERED
→ DOCUMENTS_PENDING
```

Supplier begins compliance onboarding.

```text
DOCUMENTS_PENDING
→ UNDER_REVIEW
```

Required documents submitted.

```text
UNDER_REVIEW
→ VERIFIED
```

Authorized reviewer approves required verification.

```text
UNDER_REVIEW
→ REJECTED
```

Required verification is not approved.

```text
VERIFIED
→ SUSPENDED
```

Authorized operational/compliance action.

```text
SUSPENDED
→ VERIFIED
```

Suspension is resolved.

```text
REJECTED
→ DOCUMENTS_PENDING
```

Supplier is permitted to resubmit required information.

---

# 7. Supplier Offer State Machine

## 7.1 States

```text
DRAFT
PENDING_REVIEW
ACTIVE
PAUSED
BLOCKED
ARCHIVED
```

## 7.2 Rules

A supplier offer can become `ACTIVE` only when:

- supplier is eligible to sell
- required product data exists
- required compliance checks pass
- pricing exists
- inventory configuration is valid where required
- the offer is not blocked

Transitions:

```text
DRAFT → PENDING_REVIEW
PENDING_REVIEW → ACTIVE
PENDING_REVIEW → DRAFT
ACTIVE → PAUSED
PAUSED → ACTIVE
ACTIVE → BLOCKED
BLOCKED → PAUSED
PAUSED → ARCHIVED
```

Blocked offers must not be newly ordered.

---

# 8. Product / Catalog State Machine

## 8.1 States

```text
DRAFT
UNDER_REVIEW
PUBLISHED
UNPUBLISHED
BLOCKED
ARCHIVED
```

Transitions:

```text
DRAFT → UNDER_REVIEW
UNDER_REVIEW → PUBLISHED
UNDER_REVIEW → DRAFT
PUBLISHED → UNPUBLISHED
PUBLISHED → BLOCKED
BLOCKED → UNPUBLISHED
UNPUBLISHED → PUBLISHED
UNPUBLISHED → ARCHIVED
```

A blocked product must not appear as an eligible sellable product.

---

# 9. Inventory State Machine

Inventory quantity is primarily ledger-driven, but operational inventory status may use:

```text
AVAILABLE
LOW_STOCK
OUT_OF_STOCK
QUARANTINED
BLOCKED
DAMAGED
EXPIRED
RECALLED
DEPLETED
```

Rules:

- `EXPIRED` cannot return directly to `AVAILABLE`.
- `RECALLED` cannot be allocated.
- `QUARANTINED` cannot be allocated.
- `DAMAGED` cannot be allocated.
- `BLOCKED` cannot be allocated.
- `OUT_OF_STOCK` can return to available after valid stock is received.
- Status must be consistent with authoritative quantities and batch restrictions.

---

# 10. Inventory Reservation State Machine

## States

```text
ACTIVE
CONVERTED
RELEASED
EXPIRED
CANCELLED
```

Transitions:

```text
ACTIVE → CONVERTED
```

Order/fulfillment successfully consumes reservation.

```text
ACTIVE → RELEASED
```

Order cancellation or explicit release.

```text
ACTIVE → EXPIRED
```

Reservation timeout.

```text
ACTIVE → CANCELLED
```

Reservation invalidated by an authorized process.

Terminal states should not be reused for new reservations.

---

# 11. Inventory Allocation State Machine

## States

```text
PENDING
ALLOCATED
PICKING
PICKED
PACKED
DISPATCHED
CANCELLED
FAILED
```

Transitions:

```text
PENDING → ALLOCATED
ALLOCATED → PICKING
PICKING → PICKED
PICKED → PACKED
PACKED → DISPATCHED
ALLOCATED → CANCELLED
PICKING → FAILED
```

The exact cancellation boundary must be coordinated with order and logistics state.

---

# 12. Cart State Machine

## States

```text
ACTIVE
CHECKOUT_STARTED
CONVERTED
ABANDONED
EXPIRED
```

Transitions:

```text
ACTIVE → CHECKOUT_STARTED
CHECKOUT_STARTED → CONVERTED
ACTIVE → ABANDONED
ACTIVE → EXPIRED
```

A cart does not itself guarantee inventory.

Inventory reservation occurs during the defined checkout/order flow.

---

# 13. Checkout State Machine

## States

```text
STARTED
PRICING
INVENTORY_CHECK
INVENTORY_RESERVED
PAYMENT_PENDING
PAYMENT_CONFIRMED
ORDER_CREATED
FAILED
EXPIRED
CANCELLED
```

Typical flow:

```text
STARTED
→ PRICING
→ INVENTORY_CHECK
→ INVENTORY_RESERVED
→ PAYMENT_PENDING
→ PAYMENT_CONFIRMED
→ ORDER_CREATED
```

Failure paths may include:

```text
PRICING → FAILED
INVENTORY_CHECK → FAILED
INVENTORY_RESERVED → FAILED
PAYMENT_PENDING → FAILED
```

A checkout timeout must release applicable inventory reservations.

---

# 14. Order State Machine

## 14.1 States

```text
PENDING_PAYMENT
CONFIRMED
PROCESSING
PARTIALLY_FULFILLED
FULFILLED
CANCELLED
PARTIALLY_CANCELLED
RETURN_REQUESTED
PARTIALLY_RETURNED
RETURNED
CLOSED
```

## 14.2 Core Flow

```text
PENDING_PAYMENT
→ CONFIRMED
→ PROCESSING
→ FULFILLED
→ CLOSED
```

For multi-supplier orders:

```text
PROCESSING
→ PARTIALLY_FULFILLED
→ FULFILLED
```

Cancellation may produce:

```text
CONFIRMED → CANCELLED
PROCESSING → PARTIALLY_CANCELLED
```

The order state must be derived consistently from item/fulfillment states.

---

# 15. Order Item State Machine

Recommended states:

```text
PENDING
CONFIRMED
ALLOCATED
PROCESSING
DISPATCHED
DELIVERED
CANCELLED
RETURN_REQUESTED
RETURNED
REFUNDED
```

Each item must maintain its own lifecycle so a multi-supplier order can contain different states simultaneously.

---

# 16. Fulfillment State Machine

## States

```text
CREATED
ALLOCATING
ALLOCATED
PICKING
PACKED
READY_FOR_DISPATCH
HANDED_TO_LOGISTICS
IN_TRANSIT
DELIVERED
FAILED
CANCELLED
RETURNING
RETURNED
```

Typical flow:

```text
CREATED
→ ALLOCATING
→ ALLOCATED
→ PICKING
→ PACKED
→ READY_FOR_DISPATCH
→ HANDED_TO_LOGISTICS
→ IN_TRANSIT
→ DELIVERED
```

Failures must not incorrectly mark an order as delivered.

---

# 17. Logistics State Mapping

External logistics providers such as Porter may use different statuses.

Bezzo should normalize them into internal states.

Example:

```text
Provider accepted
→ HANDED_TO_LOGISTICS

Provider picked up
→ IN_TRANSIT

Provider delivered
→ DELIVERED

Provider failed
→ FAILED
```

Provider statuses must be mapped through an adapter rather than directly stored as the canonical domain state.

---

# 18. Delivery Mode Rules

Supported modes:

```text
INSTANT
SCHEDULED
```

Instant delivery may require:

- service availability
- eligible supplier/warehouse
- logistics availability
- configurable delivery fee
- operational cutoff

Scheduled delivery requires:

- selected delivery date
- selected slot
- supplier/warehouse availability
- fulfillment capacity
- logistics planning

The exact fee, slots, and cutoff times remain configurable.

---

# 19. Payment State Machine

## States

```text
PENDING
AUTHORIZED
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
CANCELLED
```

Typical flow:

```text
PENDING
→ AUTHORIZED
→ PAID
```

Failure:

```text
PENDING → FAILED
```

Refund:

```text
PAID → PARTIALLY_REFUNDED
PAID → REFUNDED
```

Payment state must be based on server-side provider confirmation and reconciliation.

---

# 20. Refund State Machine

## States

```text
REQUESTED
UNDER_REVIEW
APPROVED
PROCESSING
PARTIALLY_REFUNDED
REFUNDED
REJECTED
FAILED
CANCELLED
```

Typical flow:

```text
REQUESTED
→ UNDER_REVIEW
→ APPROVED
→ PROCESSING
→ REFUNDED
```

A refund failure must remain observable and retryable without creating duplicate payments.

---

# 21. Return State Machine

## States

```text
REQUESTED
UNDER_REVIEW
APPROVED
REJECTED
PICKUP_SCHEDULED
IN_TRANSIT
RECEIVED
INSPECTING
RESOLVED
CANCELLED
```

Typical flow:

```text
REQUESTED
→ UNDER_REVIEW
→ APPROVED
→ PICKUP_SCHEDULED
→ IN_TRANSIT
→ RECEIVED
→ INSPECTING
→ RESOLVED
```

The return result must determine inventory disposition and financial adjustment.

---

# 22. Dispute State Machine

## States

```text
OPEN
UNDER_REVIEW
WAITING_FOR_BUYER
WAITING_FOR_SUPPLIER
ESCALATED
RESOLVED
REJECTED
CLOSED
```

Transitions must record:

- actor
- reason
- evidence
- decision
- financial impact where applicable

---

# 23. Promotion State Machine

## States

```text
DRAFT
SCHEDULED
ACTIVE
PAUSED
EXPIRED
CANCELLED
```

Transitions:

```text
DRAFT → SCHEDULED
SCHEDULED → ACTIVE
ACTIVE → PAUSED
PAUSED → ACTIVE
ACTIVE → EXPIRED
DRAFT/SCHEDULED/ACTIVE/PAUSED → CANCELLED
```

Historical orders retain their original promotion snapshot.

---

# 24. Coupon State Machine

## States

```text
DRAFT
ACTIVE
PAUSED
EXPIRED
DISABLED
```

A coupon cannot be redeemed when inactive, expired, or disabled.

Redemption records must remain historical even if the coupon is later disabled.

---

# 25. Settlement State Machine

## States

```text
PENDING
INELIGIBLE
ELIGIBLE
CALCULATED
UNDER_REVIEW
APPROVED
PAYOUT_PENDING
PAID
PARTIALLY_PAID
ON_HOLD
DISPUTED
REVERSED
CANCELLED
```

Typical flow:

```text
PENDING
→ ELIGIBLE
→ CALCULATED
→ APPROVED
→ PAYOUT_PENDING
→ PAID
```

Financial holds may interrupt the flow.

---

# 26. Payout State Machine

## States

```text
CREATED
VALIDATING
APPROVED
INITIATED
PROCESSING
COMPLETED
FAILED
PARTIALLY_COMPLETED
CANCELLED
```

Provider results must be reconciled before final completion.

A failed payout may be retried through a controlled idempotent process.

---

# 27. Supplier Compliance Document State Machine

## States

```text
UPLOADED
VALIDATING
UNDER_REVIEW
VERIFIED
REJECTED
EXPIRED
REVOKED
SUPERSEDED
```

Transitions must preserve the document review history.

Expired or revoked compliance documents may cause supplier or offer restrictions according to configured rules.

---

# 28. Risk Case State Machine

## States

```text
OPEN
ASSIGNED
INVESTIGATING
WAITING_FOR_INFORMATION
RESOLVED
DISMISSED
ESCALATED
```

A risk case may produce a hold, step-up verification, or operational restriction.

Risk actions must not silently rewrite historical order/payment state.

---

# 29. Support Ticket State Machine

## States

```text
OPEN
ASSIGNED
IN_PROGRESS
WAITING_FOR_CUSTOMER
WAITING_FOR_SUPPLIER
ESCALATED
RESOLVED
CLOSED
```

Support agents may trigger business actions only through authorized domain APIs.

A support ticket must not directly mutate inventory, payment, or settlement database records.

---

# 30. Notification State Machine

## States

```text
QUEUED
PROCESSING
SENT
DELIVERED
FAILED
CANCELLED
```

Channel-specific delivery states may exist below the normalized notification state.

Retries must be idempotent.

---

# 31. Import Job State Machine

For inventory, price, catalog, or other bulk imports:

```text
UPLOADED
VALIDATING
READY
PROCESSING
COMPLETED
PARTIALLY_COMPLETED
FAILED
CANCELLED
```

An import must provide row-level errors where applicable.

---

# 32. Reconciliation State Machine

## States

```text
CREATED
RUNNING
MATCHED
EXCEPTIONS_FOUND
UNDER_REVIEW
RESOLVED
CLOSED
FAILED
```

A reconciliation process must never silently rewrite historical transactions.

Corrections are explicit adjustments.

---

# 33. Administrative Hold Model

A reusable hold abstraction may be used across domains.

Hold states:

```text
ACTIVE
REVIEWING
RELEASED
EXPIRED
CANCELLED
```

Hold types may include:

```text
PAYMENT_HOLD
PAYOUT_HOLD
COMPLIANCE_HOLD
RISK_HOLD
ORDER_HOLD
INVENTORY_HOLD
SUPPLIER_HOLD
```

A hold should identify:

- scope
- reason
- creator
- created time
- review deadline where applicable
- release actor
- release reason

---

# 34. State Transition Authorization

Every transition must validate:

```text
actor
+ role
+ ownership
+ current state
+ transition
+ business conditions
+ risk/compliance restrictions
```

Example:

```text
Supplier user
→ may update own offer

Supplier user
→ cannot approve own compliance verification unless explicitly permitted by policy

Buyer
→ cannot mark an order as delivered

Client
→ cannot mark payment as PAID
```

---

# 35. Transition Command Pattern

Recommended domain API:

```text
transition(entityId, command)
```

Example:

```json
{
  "command": "APPROVE_RETURN",
  "reason": "eligible_return",
  "idempotencyKey": "ret_123_approve_v1"
}
```

The domain service validates the current state and transition rules.

---

# 36. State Transition Transaction

A transition should follow:

```text
BEGIN
→ lock entity
→ verify current state
→ validate authorization
→ validate business conditions
→ calculate next state
→ persist state
→ write audit record
→ write outbox event
COMMIT
```

This prevents concurrent requests from producing invalid state sequences.

---

# 37. Idempotency

Repeated commands should not duplicate side effects.

Example:

```text
APPROVE_RETURN
request #1 → transition succeeds
request #2 with same idempotency key → return existing result
```

Idempotency keys should be scoped appropriately to the actor/entity/operation.

---

# 38. Concurrency

For stateful entities:

```text
Request A reads CONFIRMED
Request B reads CONFIRMED

Request A → CANCELLED
Request B → DISPATCHED
```

The system must prevent both transitions from being committed if they are mutually incompatible.

Use:

- database row locks
- optimistic versioning
- state/version checks
- transactional commands

according to the entity's concurrency requirements.

---

# 39. Versioned State

High-contention entities may include:

```text
version
updated_at
```

Example:

```text
UPDATE orders
SET status = 'CANCELLED',
    version = version + 1
WHERE id = ?
AND status = 'CONFIRMED'
AND version = 7
```

If zero rows are updated, the command must be rejected/retried according to policy.

---

# 40. Terminal States

Typical terminal states include:

```text
CLOSED
ARCHIVED
DEACTIVATED
REFUNDED
REJECTED
EXPIRED
COMPLETED
CANCELLED
```

Terminal states should not be reopened casually.

Corrective actions should create explicit compensating records or a supported reversal workflow.

---

# 41. Cross-Domain Transition Rules

Some transitions depend on another domain.

Examples:

### Order Confirmation

Requires:

```text
valid price
+ inventory reservation
+ payment success/authorized condition
```

### Fulfillment Dispatch

Requires:

```text
order/fulfillment eligible
+ allocation complete
+ packed
+ logistics handoff
```

### Supplier Payout

Requires:

```text
settlement approved
+ payout destination valid
+ no blocking hold
```

### Product Publication

Requires:

```text
catalog data valid
+ applicable review complete
+ product not blocked
```

Cross-domain checks must use service contracts rather than direct database writes across modules.

---

# 42. Event-Driven Side Effects

State transitions should publish domain events.

Example:

```text
OrderConfirmed
→ notification
→ analytics
→ fulfillment processing
→ settlement preparation
```

The order service remains authoritative for order state.

Consumers must not mutate order state directly.

---

# 43. Event Ordering

Events should include:

```text
event_id
aggregate_id
aggregate_type
sequence/version
occurred_at
correlation_id
schema_version
```

Consumers should tolerate:

- duplicate events
- retries
- delayed events
- safe reordering where possible

Critical state transitions remain authoritative in the transactional database.

---

# 44. Failure Handling

If a side effect fails after state commit:

```text
State remains committed
→ event remains pending/retryable
→ worker retries
→ alert if threshold exceeded
```

Do not roll back a committed business state simply because a notification or analytics consumer failed.

For tightly coupled operations such as payment/inventory reservation, the transaction boundary must be designed explicitly.

---

# 45. State History

For major entities, maintain a transition history.

Recommended table:

```text
entity_state_history
```

Fields:

```text
id
entity_type
entity_id
from_state
to_state
command
actor_type
actor_id
reason
request_id
correlation_id
created_at
```

This provides a clear lifecycle timeline.

---

# 46. State Machine API Errors

Standard error codes should include:

```text
INVALID_STATE
INVALID_TRANSITION
NOT_AUTHORIZED
PRECONDITION_FAILED
ENTITY_NOT_FOUND
CONCURRENT_MODIFICATION
ALREADY_PROCESSED
HOLD_ACTIVE
COMPLIANCE_RESTRICTION
RISK_RESTRICTION
EXTERNAL_DEPENDENCY_FAILURE
```

Clients should receive stable machine-readable codes and safe human-readable messages.

---

# 47. Admin Override Rules

Admin overrides must be narrowly scoped.

An override should require:

- privileged role
- reason
- target entity
- current state
- requested state
- approval where required
- audit event

Admin override must not bypass mandatory security or compliance controls unless an explicitly authorized emergency process exists.

---

# 48. State Machine Testing

Every state machine requires:

### Transition Tests

Test every valid transition.

### Invalid Transition Tests

Test every prohibited transition.

### Authorization Tests

Test every actor role.

### Concurrency Tests

Test simultaneous commands.

### Idempotency Tests

Repeat identical commands.

### Failure Tests

Simulate database/provider/event failures.

### Recovery Tests

Verify retries do not duplicate effects.

---

# 49. State Machine Documentation Standard

Every new stateful domain added to Bezzo must document:

```text
Entity
States
Terminal states
Valid transitions
Transition triggers
Preconditions
Authorized actors
Side effects
Events
Audit events
Failure behavior
Idempotency behavior
Concurrency strategy
Recovery behavior
```

This becomes an engineering definition-of-done requirement.

---

# 50. Acceptance Criteria

The business-rule/state-machine layer is production-ready when:

1. Major domain entities have explicit states.
2. Valid transitions are documented.
3. Invalid transitions are rejected.
4. Server-side authorization is enforced.
5. State changes are transactional.
6. Important transitions create audit records.
7. Domain events are published reliably.
8. Duplicate commands are idempotent.
9. Concurrent transitions cannot corrupt state.
10. Cross-domain dependencies are validated through contracts.
11. Terminal states are protected.
12. Admin overrides are controlled and audited.
13. State history is queryable.
14. Failure and retry behavior is documented.
15. Automated tests cover valid and invalid transitions.
16. Operational monitoring exists for transition failures.
17. Client applications use stable state names and error codes.
18. No frontend is trusted to enforce business state rules.

---

# 51. Implementation Sequence

## Phase 1 — Core State Infrastructure

- shared transition conventions
- state history model
- idempotency
- audit integration
- error codes
- event conventions

## Phase 2 — Identity and Supplier

- user lifecycle
- supplier verification
- supplier offers
- compliance documents

## Phase 3 — Commerce

- cart
- checkout
- orders
- order items
- inventory reservations
- fulfillment

## Phase 4 — Financial

- payments
- refunds
- settlements
- payouts
- reconciliation

## Phase 5 — Operations

- returns
- disputes
- support
- notifications
- logistics

## Phase 6 — Risk and Governance

- risk cases
- holds
- compliance restrictions
- administrative overrides
- audit investigations

---

# 52. Definition of Done

- Canonical state definitions exist.
- Transition rules are implemented server-side.
- State history is persisted.
- Authorization is enforced.
- Invalid transitions return stable errors.
- Concurrency protection exists.
- Idempotency exists for commands.
- Audit events are generated.
- Domain events are reliable.
- Cross-domain contracts are enforced.
- Admin overrides are controlled.
- Automated transition tests pass.
- Operational alerts exist.
- Documentation stays synchronized with implementation.

---

# 53. Final Architecture Position

Bezzo should treat business state as a first-class domain concern:

```text
Command
  ↓
Authorization
  ↓
Current State
  ↓
Business Preconditions
  ↓
Transition
  ↓
Persist State + History + Audit + Outbox
  ↓
Domain Events
  ↓
Asynchronous Side Effects
```

The frontend presents state and requests commands.

The backend owns the state machine.

The database preserves the authoritative state and history.

Events connect downstream systems.

This model prevents inconsistent lifecycle behavior across Bezzo web, Android, iOS, supplier portal, admin portal, background workers, payment integrations, logistics integrations, and future services.

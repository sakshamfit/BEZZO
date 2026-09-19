# Bezzo Returns, Refunds & Reverse Logistics Specification v1.0

**Product:** Bezzo  
**Document:** Returns, Refunds & Reverse Logistics Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Return eligibility, cancellation-linked refunds, post-delivery issues, damaged/wrong/missing products, reverse pickup, supplier returns, inventory disposition, refund orchestration, financial reconciliation, evidence, compliance, and auditability.

---

# 1. Purpose

The Bezzo Returns, Refunds & Reverse Logistics system manages post-order financial and physical resolution workflows.

It covers:

- Order cancellation refunds
- Partial refunds
- Full refunds
- Missing items
- Wrong items
- Damaged products
- Delivery failures
- Product-quality concerns
- Return requests where permitted
- Reverse pickup
- Supplier return handling
- Inventory disposition
- Refund status
- Payment reconciliation
- Customer communication
- Evidence
- Compliance escalation

Pharmaceutical returns require stricter controls than ordinary consumer e-commerce. Not every medicine or pharmaceutical product should automatically be eligible for physical return or resale.

---

# 2. Core Principles

## 2.1 Refund and return are separate concepts

A customer may receive a refund without a physical return.

Example:

```text
Missing item
   |
Verify issue
   |
Partial refund
```

Conversely, a physical return may require controlled inspection before financial resolution.

## 2.2 Never automatically restock returned medicines

A returned pharmaceutical product must not become sellable inventory merely because a logistics pickup succeeded.

Disposition requires the appropriate operational/compliance workflow.

## 2.3 Financial state is authoritative

Refund status must come from the payment/finance system.

## 2.4 Evidence matters

High-impact decisions should use:

- Order records
- Fulfillment records
- Delivery events
- Product information
- Batch information
- Customer evidence
- Supplier evidence
- Logistics evidence

---

# 3. Return Concepts

Bezzo should distinguish:

```text
Cancellation
Refund
Return Request
Reverse Pickup
Inspection
Inventory Disposition
```

These are separate states and workflows.

---

# 4. Return Eligibility

Eligibility is configuration-driven and may depend on:

- Product category
- Product type
- Order state
- Delivery state
- Issue type
- Time since delivery
- Buyer eligibility
- Supplier policy
- Applicable pharmaceutical requirements
- Product integrity
- Batch/expiry condition

The system must not assume that every product is returnable.

---

# 5. Issue Categories

Recommended:

```text
MISSING_ITEM
WRONG_ITEM
DAMAGED_PACKAGE
DAMAGED_PRODUCT
QUALITY_CONCERN
EXPIRY_CONCERN
BATCH_CONCERN
DELIVERY_FAILURE
DUPLICATE_ORDER
ORDER_CANCELLATION
OTHER
```

---

# 6. Refund Types

Recommended:

```text
FULL_REFUND
PARTIAL_REFUND
ITEM_REFUND
DELIVERY_FEE_REFUND
GOODWILL_CREDIT
```

Any goodwill credit should follow configured approval rules.

---

# 7. Refund States

```text
REQUESTED
UNDER_REVIEW
APPROVED
REJECTED
PROCESSING
COMPLETED
FAILED
CANCELLED
```

Refund state must not be inferred from the support case alone.

---

# 8. Return States

Where physical returns are permitted:

```text
REQUESTED
UNDER_REVIEW
APPROVED
PICKUP_SCHEDULED
PICKED_UP
RECEIVED
UNDER_INSPECTION
ACCEPTED
REJECTED
DISPOSED
CLOSED
```

---

# 9. Refund Request Flow

```text
Buyer / Support
      |
Refund Request
      |
Eligibility Validation
      |
Evidence Review
      |
Approval where required
      |
Payment Service
      |
Gateway Processing
      |
Refund Confirmation
      |
Buyer Notification
```

---

# 10. Full Refund

A full refund may include:

```text
Eligible item amount
+
Applicable delivery fee
+
Applicable taxes/charges
-
Non-refundable components where policy permits
=
Refund amount
```

The financial calculation must come from the authoritative order/finance system.

---

# 11. Partial Refund

Partial refunds are required when only some items or some charges are eligible.

Example:

```text
Order:
10 items

Missing:
2 items

Refund:
2 item amounts
```

The refund calculation must reference original order price components.

---

# 12. Refund Calculation

Never calculate refunds from current catalog pricing.

Use:

```text
Original order item
+
Original price
+
Original discounts
+
Original tax allocation
+
Applicable delivery allocation
=
Refund basis
```

Historical order financial data must remain immutable.

---

# 13. Payment Gateway Integration

Refund workflow:

```text
Bezzo Finance
      |
Payment Provider
      |
Refund Request
      |
Provider Reference
      |
Webhook / Status Poll
      |
Refund Confirmation
```

Gateway-specific implementation remains behind the payment abstraction.

---

# 14. Idempotency

Refund creation must be idempotent.

A retry must not create two refunds for the same financial entitlement.

Recommended:

```text
refund_id
payment_id
order_id
idempotency_key
```

---

# 15. Refund Failure

If refund fails:

```text
Refund FAILED
     |
Retry according to policy
     |
If repeated failure
     |
Finance Exception Queue
```

The buyer must not be told the refund is complete until authoritative confirmation exists.

---

# 16. Payment Success / Refund Mismatch

If Bezzo records a refund request but the gateway does not confirm it:

```text
Refund requested
      |
Gateway state unknown
      |
Reconciliation
      |
Confirmed / retry / escalate
```

These cases should be visible to finance operations.

---

# 17. Cancellation Refund

Cancellation flow:

```text
Order
 |
Cancellation eligibility
 |
Cancel
 |
Calculate refund
 |
Create refund
 |
Track refund
```

Cancellation completion and refund completion are separate states.

---

# 18. Missing Item

Workflow:

```text
Buyer reports missing item
      |
Verify order item
      |
Verify fulfillment
      |
Review delivery evidence
      |
Supplier/logistics investigation
      |
Decision
```

Possible resolution:

- Partial refund
- Replacement where supported
- Supplier investigation
- Logistics investigation

---

# 19. Wrong Item

Evidence may include:

```text
Ordered SKU
Fulfilled SKU
Product images
Invoice
Packing evidence
Batch information where applicable
```

Possible outcomes:

```text
Replacement
Refund
Return + replacement
Return + refund
Supplier corrective action
```

---

# 20. Damaged Product

Potential evidence:

- Customer photographs
- Packaging photographs
- Delivery proof
- Fulfillment record
- Batch details
- Supplier information

If product integrity may be affected, the case should enter the appropriate compliance workflow.

---

# 21. Expiry Concern

If a buyer reports a potentially expired product:

```text
Issue reported
      |
Identify product/batch
      |
Block/quarantine relevant inventory where required
      |
Identify affected orders
      |
Compliance review
      |
Resolution / recall workflow
```

Do not treat the issue as a normal commercial return until the safety/compliance assessment is complete.

---

# 22. Batch Concern

Batch-related cases should capture:

```text
Product
Batch number
Expiry
Supplier
Order
Quantity
Evidence
```

Potential actions:

- Inventory block
- Quarantine
- Supplier investigation
- Recall workflow
- Affected-order identification

---

# 23. Return Approval

Where physical return is allowed:

```text
Request
   |
Eligibility
   |
Approval
   |
Pickup
```

Approval should record:

```text
Decision
Reviewer
Timestamp
Reason
Policy/version
```

---

# 24. Reverse Logistics

Where reverse pickup is permitted:

```text
Return Approved
      |
Create Reverse Delivery Job
      |
Logistics Provider
      |
Pickup
      |
Return Transit
      |
Supplier / Authorized Facility
      |
Receipt
```

The logistics abstraction should support both forward and reverse delivery jobs.

---

# 25. Reverse Logistics Adapter

Recommended:

```text
Returns Service
      |
Logistics Service
      |
Reverse Logistics Adapter
      |
Provider
```

This prevents the returns domain from becoming dependent on a single provider.

---

# 26. Porter Reverse Pickup

If Porter supports the required reverse logistics operation and the business chooses to use it:

```text
Bezzo Returns
      |
Logistics Service
      |
Porter Adapter
      |
Reverse Pickup
```

Provider capabilities must be validated before enabling a workflow.

---

# 27. Reverse Pickup States

```text
REQUESTED
ASSIGNED
PICKUP_SCHEDULED
PICKED_UP
IN_TRANSIT
DELIVERED
FAILED
CANCELLED
```

---

# 28. Return Inspection

Physical returns requiring inspection should enter:

```text
RECEIVED
   |
UNDER_INSPECTION
   |
+------+------+
|             |
ACCEPTED    REJECTED
```

Inspection may consider:

- Packaging integrity
- Product identity
- Batch
- Expiry
- Storage/handling evidence where relevant
- Tampering indicators
- Quantity
- Physical condition

---

# 29. Inventory Disposition

Returned inventory must receive an explicit disposition.

Possible:

```text
RESTOCK
QUARANTINE
RETURN_TO_SUPPLIER
DISPOSE
BLOCK
```

`RESTOCK` must only be permitted where the applicable product, quality, safety, and operational requirements are satisfied.

---

# 30. Quarantine

Quarantined inventory must be unavailable for normal sale.

```text
Inventory
   |
QUARANTINED
   |
No sale
   |
Review
   |
Release / Return / Dispose
```

All transitions must be audited.

---

# 31. Disposal

If inventory cannot be returned to sale:

```text
DISPOSAL_PENDING
      |
Approved Disposal
      |
DISPOSED
```

Disposal procedures must follow the applicable legal, environmental, pharmaceutical, and operational requirements.

---

# 32. Supplier Returns

Supplier returns may involve:

- Customer-returned product
- Supplier fulfillment error
- Damaged goods
- Recall
- Batch issue

The supplier should receive only the information required for the operational workflow.

---

# 33. Supplier Dispute

If supplier disputes a return/refund:

```text
Return / Refund Case
       |
Supplier Response
       |
Evidence
       |
Operations Decision
       |
Financial Adjustment where applicable
```

The customer-facing refund decision should not be delayed indefinitely because of an internal supplier dispute when policy requires Bezzo to resolve the buyer issue independently.

---

# 34. Customer Communication

Notifications may include:

```text
Return request received
Return approved
Pickup scheduled
Return picked up
Return received
Refund initiated
Refund completed
Return rejected
Additional information required
```

Use the notification/communication service rather than sending directly from the returns domain.

---

# 35. Support Integration

Every return/refund case should link to:

```text
Support Case
Order
Order Item
Fulfillment
Payment
Refund
Return
Delivery
Supplier
```

This creates one operational history.

---

# 36. Evidence Management

Evidence entity:

```text
evidence_id
case_id
return_id
type
storage_reference
uploaded_by
uploaded_at
checksum
visibility
```

Visibility may be:

```text
INTERNAL
BUYER_VISIBLE
SUPPLIER_VISIBLE
AUTHORIZED_PARTIES
```

---

# 37. Evidence Security

Use:

- Secure object storage
- Malware scanning
- File-type validation
- Size limits
- Encryption
- Short-lived access URLs
- Access logging

Never expose storage credentials to clients.

---

# 38. Return Time Windows

Where a return window exists, calculate it from authoritative timestamps such as:

```text
Delivery completed
```

rather than client device time.

Time-window rules should be configurable.

---

# 39. Return Eligibility API

Conceptual:

```text
GET /returns/v1/orders/{order_id}/eligibility
```

Response should identify:

```text
eligible
reason
eligible_items
ineligible_items
required_evidence
deadline
```

---

# 40. Return APIs

Recommended:

```text
POST /returns/v1
GET  /returns/v1
GET  /returns/v1/{id}
POST /returns/v1/{id}/approve
POST /returns/v1/{id}/reject
POST /returns/v1/{id}/cancel
GET  /returns/v1/{id}/timeline
POST /returns/v1/{id}/evidence
```

---

# 41. Refund APIs

Recommended:

```text
POST /refunds/v1
GET  /refunds/v1/{id}
GET  /refunds/v1/{id}/status
POST /refunds/v1/{id}/retry
```

High-risk refund approval should be controlled by finance permissions.

---

# 42. Reverse Logistics APIs

Recommended:

```text
POST /returns/v1/{id}/pickup
GET  /returns/v1/{id}/delivery
POST /returns/v1/{id}/delivery/retry
```

Provider-specific APIs must remain behind the logistics abstraction.

---

# 43. Data Model

Recommended entities:

```text
return_cases
return_items
return_events
return_evidence
return_inspections
return_dispositions

refunds
refund_items
refund_events

reverse_deliveries
reverse_delivery_events

inventory_dispositions
inventory_quarantines
```

Existing order, payment, inventory, logistics, and support entities remain authoritative for their domains.

---

# 44. State Machine

Return:

```text
REQUESTED
    |
UNDER_REVIEW
    |
APPROVED
    |
PICKUP_SCHEDULED
    |
PICKED_UP
    |
RECEIVED
    |
UNDER_INSPECTION
    |
+---+---------+
|             |
ACCEPTED    REJECTED
|             |
DISPOSITION   CLOSED
|
CLOSED
```

Refund:

```text
REQUESTED
    |
APPROVED
    |
PROCESSING
    |
COMPLETED

or

FAILED -> RETRY / ESCALATE
```

---

# 45. Partial Return

A multi-item order may have:

```text
Order
 |
 +-- Item A -> returned
 +-- Item B -> retained
 +-- Item C -> delivered normally
```

The return system must operate at item level while maintaining order-level aggregation.

---

# 46. Multi-Supplier Returns

If one customer order contains multiple supplier fulfillments:

```text
Order
 |
 +-- Return Item A -> Supplier A
 |
 +-- Return Item B -> Supplier B
```

A single customer return request may therefore generate multiple internal return workflows.

The buyer should not be forced to understand internal supplier routing unless operationally necessary.

---

# 47. Refund Allocation

For a multi-supplier order, refund allocation should preserve:

```text
Order
Order item
Supplier fulfillment
Original financial components
Refund amount
```

This is required for correct supplier settlement adjustments.

---

# 48. Supplier Settlement Adjustment

When a supplier is financially responsible for an approved return/refund, the finance system may record:

```text
Supplier settlement adjustment
```

This must be generated from authoritative financial rules rather than manually changing settlement totals.

---

# 49. Audit Events

Recommended events:

```text
return_requested
return_approved
return_rejected
pickup_created
pickup_completed
return_received
inspection_completed
inventory_quarantined
inventory_restocked
inventory_disposed
refund_requested
refund_approved
refund_completed
refund_failed
settlement_adjustment_created
```

All privileged actions must be auditable.

---

# 50. Security

Implement:

- Authentication
- Authorization
- Buyer organization isolation
- Supplier organization isolation
- Finance permissions
- Compliance permissions
- Evidence access controls
- Rate limiting
- Idempotency
- Audit logging

---

# 51. Performance

Return operations should be responsive for:

- Return creation
- Eligibility checks
- Return detail
- Refund status
- Tracking

Large inspection/evidence histories should use pagination.

---

# 52. Reliability

Critical workflows require:

- Idempotency
- Retries
- Dead-letter handling
- Reconciliation
- Event deduplication
- State-transition validation
- Operational alerts

---

# 53. Reconciliation

Periodic reconciliation should compare:

```text
Return record
Refund record
Payment provider
Reverse delivery
Inventory disposition
Supplier settlement
```

Mismatches should enter an operations/finance exception queue.

---

# 54. Testing

## Unit

Test:

- Return eligibility
- Refund calculations
- State transitions
- Disposition rules
- Supplier allocation
- Idempotency

## Integration

Test:

- Order
- Payment
- Inventory
- Logistics
- Supplier
- Support
- Notifications
- Finance

## Failure tests

Test:

```text
Refund gateway failure
Reverse pickup failure
Duplicate webhook
Return received without expected event
Inventory disposition failure
Payment/refund mismatch
Supplier dispute
```

## End-to-end

```text
Buyer receives order
    ->
Reports eligible issue
    ->
Return/refund created
    ->
Evidence reviewed
    ->
Approval
    ->
Reverse pickup if applicable
    ->
Inspection
    ->
Disposition
    ->
Refund completed
    ->
Buyer notified
    ->
Supplier settlement adjusted where applicable
```

---

# 55. Acceptance Criteria

The system is production-ready when:

- Refunds can be created from eligible order events.
- Full and partial refunds are supported.
- Refunds are idempotent.
- Refund state comes from authoritative financial systems.
- Physical returns are policy-controlled.
- Pharmaceutical products are not automatically restocked after return.
- Batch/expiry concerns can trigger compliance workflows.
- Reverse logistics can be integrated through an abstraction layer.
- Return evidence is securely stored.
- Multi-supplier returns are supported.
- Supplier settlement adjustments can be generated.
- Return and refund timelines are auditable.
- Buyers receive clear status updates.
- Finance can reconcile refunds.
- Inventory disposition is explicit.
- Critical workflows have automated tests.

---

# 56. Implementation Sequence

## Phase 1 — Refund Foundation

1. Refund model
2. Refund API
3. Payment integration
4. Refund status
5. Reconciliation

## Phase 2 — Return Cases

6. Return eligibility
7. Return request
8. Evidence
9. Approval/rejection
10. Buyer communication

## Phase 3 — Reverse Logistics

11. Reverse delivery model
12. Provider adapter
13. Pickup scheduling
14. Tracking
15. Failure/retry handling

## Phase 4 — Inventory / Compliance

16. Inspection
17. Quarantine
18. Disposition
19. Batch/expiry workflows
20. Recall integration

## Phase 5 — Advanced Operations

21. Supplier disputes
22. Settlement adjustments
23. Advanced reconciliation
24. Analytics
25. Automation

---

# 57. Final Architecture

```text
                    Buyer / Support
                           |
                           v
                     Returns API
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
          Eligibility   Refunds      Reverse Logistics
             |             |             |
             |          Finance       Provider Adapter
             |             |             |
             +-------------+-------------+
                           |
                           v
                    Order / Fulfillment
                           |
             +-------------+-------------+
             |                           |
             v                           v
        Inventory                   Supplier
       Disposition                 Operations
             |
             v
        Compliance
```

The returns system should provide a controlled bridge between customer support, financial refunds, physical reverse logistics, supplier operations, inventory disposition, and pharmaceutical compliance.

---

# 58. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Returns, refunds, reverse logistics, inspection, inventory disposition, supplier returns, financial reconciliation, and compliance workflows

This specification should be implemented together with the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, analytics/reporting, identity, search/discovery, cart/checkout, order tracking, supplier portal, admin/backoffice, and customer-support specifications.

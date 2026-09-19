# Bezzo Customer Support & Dispute Resolution Specification v1.0

**Product:** Bezzo  
**Document:** Customer Support & Dispute Resolution Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Buyer support, supplier support, order disputes, delivery disputes, payment disputes, refunds, escalations, case management, SLAs, evidence, communication, and resolution workflows.

---

# 1. Purpose

The Bezzo Support & Dispute Resolution system provides a structured way to handle customer and supplier problems without relying on informal communication or manual spreadsheets.

It covers:

- Buyer support
- Supplier support
- Order issues
- Product issues
- Delivery issues
- Payment issues
- Refund requests
- Missing or incorrect items
- Damaged shipments
- Supplier disputes
- Logistics disputes
- Compliance-related cases
- Escalations
- Evidence collection
- Resolution tracking
- SLA management
- Customer communication
- Internal operational notes
- Support analytics

The system must preserve a complete history of what happened, what evidence was reviewed, who made decisions, and how the case was resolved.

---

# 2. Core Principles

## 2.1 One case, one source of truth

Every material support issue should have a unique case record.

## 2.2 Separate customer communication from internal notes

Internal operational comments must never accidentally appear to customers.

## 2.3 Evidence before irreversible action

High-impact decisions should be based on available evidence such as:

- Order records
- Payment records
- Delivery records
- Product information
- Supplier responses
- Customer messages
- Packaging images
- Delivery proof
- System event history

## 2.4 Clear responsibility

Every active case should have:

- Owner
- Priority
- SLA
- Current status
- Next action

## 2.5 Controlled financial decisions

Refunds, credits, settlement adjustments, and other financial actions must use permission-controlled workflows.

---

# 3. Support Channels

Bezzo may receive support requests through:

- In-app support
- Web support
- Email
- Phone/call center
- SMS where applicable
- WhatsApp where enabled
- Admin-created cases
- Automated system-created cases

All channels should ultimately create or associate with a canonical support case.

---

# 4. User Types

Support may involve:

```text
Buyer / Medical Store
Supplier / Wholesaler
Logistics Provider
Bezzo Operations
Bezzo Finance
Bezzo Compliance
```

A case may contain multiple participants.

Example:

```text
Buyer reports missing medicine
        |
Support Agent
        |
Supplier
        |
Logistics
```

---

# 5. Case Model

Core case fields:

```text
case_id
case_type
category
subcategory
priority
status
source
buyer_id
supplier_id
order_id
fulfillment_id
delivery_id
payment_id
assigned_team
assigned_agent
created_at
updated_at
due_at
resolved_at
resolution_code
resolution_notes
```

---

# 6. Case Categories

Recommended initial categories:

### Order

- Order cancellation
- Order status
- Missing item
- Wrong item
- Partial fulfillment
- Duplicate order

### Product

- Product quality concern
- Packaging issue
- Incorrect catalog information
- Product mismatch
- Expiry concern
- Batch concern

### Delivery

- Late delivery
- Failed delivery
- Wrong address
- Damaged package
- Missing package
- Driver issue
- Pickup delay

### Payment

- Payment failed
- Payment captured but order failed
- Duplicate charge
- Payment not reflected
- COD issue

### Refund

- Refund requested
- Refund delayed
- Partial refund dispute
- Refund amount dispute

### Account

- Login
- OTP
- Verification
- Account suspension
- Profile issue

### Supplier

- Supplier fulfillment issue
- Stock discrepancy
- Invoice issue
- Supplier dispute

### Compliance

- License issue
- Restricted product concern
- Recall concern
- Suspected counterfeit/unauthorized product
- Regulatory escalation

---

# 7. Case Priority

Recommended priorities:

```text
LOW
NORMAL
HIGH
URGENT
CRITICAL
```

Priority should be based on documented operational criteria.

Examples of factors:

- Customer impact
- Financial impact
- Number of affected orders
- Compliance implications
- Product safety implications
- Delivery urgency
- SLA age

A critical classification should trigger appropriate escalation rather than simply changing the visual color of a ticket.

---

# 8. Case Status

Recommended lifecycle:

```text
OPEN
    |
IN_PROGRESS
    |
+---+----------------------+
|                          |
WAITING_CUSTOMER      WAITING_SUPPLIER
|                          |
+------------+-------------+
             |
          ESCALATED
             |
         RESOLVED
             |
          CLOSED
```

Cases may return to `IN_PROGRESS` if the customer reopens an issue or new evidence appears.

---

# 9. Case Creation

Cases can be created manually or automatically.

## Manual

Agent enters:

- Category
- Issue description
- Customer
- Related order
- Priority
- Evidence
- Initial action

## Automatic

System may create cases for:

- Delivery failure
- Payment captured but order creation failed
- Repeated payment failures
- Logistics provider failure
- Recall affecting an existing order
- SLA breach
- Reconciliation exception
- Supplier fulfillment failure

---

# 10. Case Deduplication

The system should detect duplicate cases.

Potential duplicate signals:

- Same buyer
- Same order
- Same product
- Similar issue category
- Recent creation time
- Same payment transaction
- Same delivery

Agent should be able to:

- Link cases
- Merge cases where safe
- Mark duplicate
- Preserve original history

No case history should be silently deleted.

---

# 11. Support Inbox

The support inbox should provide:

- Case ID
- Customer/supplier
- Category
- Priority
- Status
- Age
- SLA timer
- Assigned agent
- Related order
- Last activity
- Next action

Sorting:

- SLA urgency
- Priority
- Age
- Last update

Filtering:

- Team
- Agent
- Category
- Status
- Priority
- Date
- Supplier
- Buyer
- Region

---

# 12. Assignment

Cases may be assigned:

```text
Queue
   |
Team
   |
Agent
```

Assignment strategies:

- Manual
- Round robin
- Skill-based
- Region-based
- Priority-based

High-risk categories should be routed to specialized teams.

Examples:

```text
Payment dispute -> Finance Support
Recall -> Compliance
Supplier license issue -> Compliance
Delivery issue -> Logistics Support
```

---

# 13. SLA Management

Every case category should have a configurable SLA policy.

Possible SLA components:

- First response target
- Resolution target
- Escalation threshold
- Business hours
- Calendar hours
- Priority multiplier

Example:

```text
URGENT
First response: short configurable target
Resolution: short configurable target

NORMAL
First response: standard configurable target
Resolution: standard configurable target
```

Exact values should be configured by Bezzo operations rather than hard-coded.

---

# 14. SLA States

A case can be:

```text
WITHIN_SLA
APPROACHING_BREACH
BREACHED
PAUSED
RESOLVED
```

If waiting on a customer or supplier, SLA pause behavior must be explicitly configured.

---

# 15. Escalation

Escalation levels:

```text
Agent
  |
Team Lead
  |
Operations Manager
  |
Specialist Team
  |
Senior Operations / Compliance / Finance
```

Escalation triggers:

- SLA breach
- Safety concern
- High financial value
- Multiple affected customers
- Repeat supplier issue
- Suspected fraud
- Recall
- Regulatory concern
- Executive escalation

---

# 16. Order Disputes

Order dispute workflow:

```text
Customer reports issue
        |
Case created
        |
Order verified
        |
Evidence collected
        |
Supplier/logistics contacted if required
        |
Decision
        |
Refund/replacement/other resolution
        |
Customer notified
        |
Case resolved
```

Support should not modify historical order facts simply to make the case appear resolved.

---

# 17. Missing Item

Example workflow:

```text
Buyer reports missing item
        |
Check order items
        |
Check fulfillment
        |
Check packing evidence if available
        |
Check delivery information
        |
Contact supplier/logistics if needed
        |
Determine eligible resolution
```

Possible resolution:

- Partial refund
- Replacement where supported
- Supplier investigation
- Logistics investigation
- No adjustment with documented reason

---

# 18. Wrong Item

Evidence may include:

- Ordered SKU
- Fulfilled SKU
- Product image
- Packaging image
- Invoice
- Supplier fulfillment record

Possible resolution:

- Replacement
- Refund
- Supplier corrective action
- Catalog correction

The resolution must preserve the original order record.

---

# 19. Damaged Package

Case should capture:

- Damage description
- Delivery timestamp
- Product/batch where relevant
- Packaging condition
- Photos
- Delivery proof
- Supplier information
- Logistics information

Potential resolution:

- Refund
- Replacement where supported
- Supplier/logistics investigation
- Compliance escalation if product integrity is potentially affected

---

# 20. Expiry or Batch Concern

Any report involving potentially expired, recalled, or otherwise unsafe pharmaceutical inventory must be handled as a higher-risk workflow.

Case should capture:

- Product
- Batch/lot
- Expiry date where available
- Supplier
- Order
- Photos/evidence
- Quantity affected
- Other potentially affected orders

Potential actions:

```text
Quarantine
Block inventory
Escalate compliance
Investigate affected orders
Initiate recall workflow where appropriate
Notify affected parties where required
```

Support agents should not independently make regulatory determinations.

---

# 21. Payment Disputes

Payment cases should reference the authoritative payment record.

Examples:

### Charged but order missing

```text
Payment provider
      |
Payment ledger
      |
Order system
```

Support should determine whether:

- Payment succeeded
- Payment is pending
- Payment failed
- Order creation failed
- Duplicate order/payment occurred

Resolution may involve:

- Order recovery
- Refund
- Payment reconciliation
- Gateway escalation

---

# 22. Duplicate Payment

The system should compare:

- Buyer
- Amount
- Payment gateway reference
- Timestamp
- Order ID
- Idempotency key

Possible outcomes:

- Genuine duplicate
- Retry that only appeared duplicated
- Gateway state mismatch

Refunds should be performed only after the transaction state is verified.

---

# 23. Refund Disputes

A refund case should include:

```text
Original order
Original payment
Refund requested
Refund eligible amount
Refund approved amount
Refund status
Refund gateway reference
```

Agents must not manually claim that a refund is complete until the authoritative refund state confirms completion.

---

# 24. Supplier Disputes

Supplier disputes may involve:

- Wrong order assignment
- Inventory discrepancy
- Customer complaint
- Pricing discrepancy
- Fulfillment rejection
- Delivery handoff issue
- Settlement issue

Supplier response should be recorded within the case.

Internal comments and supplier-visible communications must remain separate.

---

# 25. Logistics Disputes

Logistics cases should connect:

```text
Order
  |
Fulfillment
  |
Delivery job
  |
Provider
  |
Driver/rider event history
```

Evidence may include:

- Pickup timestamp
- Dispatch timestamp
- Delivery attempt
- GPS/provider event where legally and operationally appropriate
- Delivery proof
- Failure reason

---

# 26. Evidence Management

Evidence types:

- Images
- Documents
- Screenshots
- Invoices
- Delivery proof
- Payment references
- System events
- Communication history

Every evidence item should contain:

```text
evidence_id
case_id
type
storage_reference
uploaded_by
uploaded_at
checksum
visibility
```

Visibility:

```text
INTERNAL
CUSTOMER_VISIBLE
SUPPLIER_VISIBLE
AUTHORIZED_PARTIES
```

Evidence access must be permission-controlled.

---

# 27. File Security

Uploaded support evidence should use:

- Virus/malware scanning
- Content-type validation
- Size limits
- Secure object storage
- Short-lived access URLs
- Access logging
- Encryption at rest

File names must not be trusted as proof of file type.

---

# 28. Customer Communication

Case communication should support:

- In-app messages
- Email
- SMS
- Push
- WhatsApp where enabled
- Phone interaction notes

Every outbound communication should reference the case where practical.

---

# 29. Communication Templates

Templates should be versioned.

Examples:

```text
case_created
case_assigned
more_information_required
supplier_investigation_started
refund_started
refund_completed
replacement_confirmed
case_resolved
case_reopened
```

Templates should support localization.

---

# 30. Internal Notes

Internal notes may include:

- Investigation details
- Supplier conversations
- Financial reasoning
- Compliance instructions
- Escalation decisions
- Operational actions

Internal notes must have separate permissions from customer-visible messages.

---

# 31. Resolution Codes

Standard resolution codes make analytics reliable.

Examples:

```text
REFUND_FULL
REFUND_PARTIAL
REPLACEMENT
ORDER_CANCELLED
PAYMENT_RECONCILED
DELIVERY_RESCHEDULED
SUPPLIER_CORRECTION
CATALOG_CORRECTION
NO_ACTION_REQUIRED
DUPLICATE_CASE
ESCALATED_COMPLIANCE
```

The list should be configurable and versioned.

---

# 32. Refund Integration

Support should request financial actions through the refund system rather than directly manipulating payment records.

```text
Support Case
     |
Refund Request
     |
Finance Authorization
     |
Payment Gateway
     |
Refund Confirmation
     |
Case Update
```

This preserves segregation of duties.

---

# 33. Credit / Compensation

If Bezzo introduces credits or goodwill compensation, define:

- Eligibility
- Maximum amount
- Approval thresholds
- Expiration
- Accounting treatment
- Abuse controls

High-value compensation should require elevated approval.

---

# 34. Case Timeline

Every case should expose a chronological timeline:

```text
09:10 Case created
09:12 Assigned to Agent A
09:15 Customer contacted
09:40 Supplier contacted
10:20 Supplier responded
10:35 Refund requested
10:50 Finance approved
11:10 Refund completed
11:12 Customer notified
11:15 Case resolved
```

Events should be append-only from the support application's perspective.

---

# 35. Reopening Cases

A resolved case may be reopened if:

- Customer replies
- Refund fails
- Replacement fails
- New evidence appears
- Supplier disputes the resolution
- Compliance identifies a new concern

Reopening must preserve previous resolution history.

---

# 36. Case Merging

When two cases refer to the same incident:

```text
Primary Case
    |
    +-- Related Case A
    +-- Related Case B
```

If merged, retain references to the original case IDs.

---

# 37. Abuse and Fraud Signals

Support may flag suspicious behavior without making unsupported accusations.

Signals may include:

- Repeated high-value refund requests
- Repeated damaged-item claims
- Multiple accounts associated with similar activity
- Repeated payment disputes
- Unusual delivery patterns

Fraud/risk review should be handled by the appropriate specialized system/team.

---

# 38. Supplier Performance Feedback

Resolved cases can contribute operational signals such as:

- Supplier-related complaints
- Fulfillment errors
- Product issues
- Packaging issues

These signals should feed supplier analytics without exposing private customer information unnecessarily.

---

# 39. Customer Satisfaction

Bezzo may collect post-resolution feedback.

Possible fields:

```text
case_id
rating
reason
comment
submitted_at
```

Useful metrics:

- CSAT
- Response rate
- Rating by category
- Rating by team
- Resolution-time relationship

Customer feedback should not be treated as the sole measure of operational correctness.

---

# 40. Support Analytics

Core metrics:

- New cases
- Open cases
- Resolved cases
- Reopened cases
- First response time
- Resolution time
- SLA compliance
- Escalation rate
- Cases per 1,000 orders
- Refund rate from support
- CSAT where enabled

Breakdowns:

- Category
- Priority
- Team
- Agent
- Supplier
- Region
- Delivery mode

---

# 41. APIs

Recommended endpoints:

```text
GET    /support/v1/cases
POST   /support/v1/cases
GET    /support/v1/cases/{id}
PATCH  /support/v1/cases/{id}

POST   /support/v1/cases/{id}/assign
POST   /support/v1/cases/{id}/escalate
POST   /support/v1/cases/{id}/resolve
POST   /support/v1/cases/{id}/reopen

POST   /support/v1/cases/{id}/messages
POST   /support/v1/cases/{id}/notes
POST   /support/v1/cases/{id}/evidence

GET    /support/v1/cases/{id}/timeline
GET    /support/v1/sla

POST   /support/v1/cases/{id}/refund-request
```

Every endpoint must enforce authorization and generate appropriate audit/event records.

---

# 42. Data Model

Recommended entities:

```text
support_cases
support_case_participants
support_case_assignments
support_case_messages
support_case_internal_notes
support_case_evidence
support_case_events
support_case_links
support_case_sla
support_case_escalations
support_case_resolutions
support_case_feedback
support_case_tags
```

Foreign references should connect cases to authoritative:

```text
buyers
suppliers
orders
fulfillments
deliveries
payments
refunds
products
batches
```

---

# 43. State Machine Rules

Case transitions should be validated server-side.

Example:

```text
OPEN -> IN_PROGRESS
IN_PROGRESS -> WAITING_CUSTOMER
IN_PROGRESS -> WAITING_SUPPLIER
IN_PROGRESS -> ESCALATED
IN_PROGRESS -> RESOLVED

WAITING_CUSTOMER -> IN_PROGRESS
WAITING_SUPPLIER -> IN_PROGRESS

ESCALATED -> IN_PROGRESS
ESCALATED -> RESOLVED

RESOLVED -> CLOSED
RESOLVED -> IN_PROGRESS
```

Invalid transitions must return explicit errors.

---

# 44. Permissions

Example permissions:

```text
support.case.read
support.case.create
support.case.assign
support.case.escalate
support.case.resolve
support.case.reopen

support.message.send
support.note.create
support.evidence.upload
support.evidence.read

support.refund.request
support.refund.approve

support.config.manage
support.analytics.read
```

Refund approval should normally be separated from ordinary support permissions.

---

# 45. Security

Support systems contain sensitive information and should implement:

- RBAC
- MFA for administrators
- Secure sessions
- Audit logging
- Data minimization
- Restricted evidence access
- Encryption
- Rate limiting
- Abuse detection
- Export controls
- Session revocation

Customer and supplier data must only be shown to authorized staff.

---

# 46. Performance

Support agents need fast case retrieval.

Targets should be established for:

- Inbox loading
- Case search
- Case detail
- Timeline loading
- Evidence listing

Large case histories should use pagination or lazy loading.

Search should use appropriate indexes/search infrastructure rather than unbounded database scans.

---

# 47. Reliability

Critical support workflows must be resilient.

Examples:

- Refund request creation
- Case assignment
- Customer message delivery
- Supplier notification
- Evidence upload
- Case state transition

Background jobs should support:

- Idempotency
- Retries
- Dead-letter handling
- Monitoring
- Safe replay

---

# 48. Testing

## Unit tests

Test:

- Case state transitions
- SLA calculations
- Priority rules
- Permission checks
- Resolution codes
- Deduplication rules

## Integration tests

Test:

- Support API
- Order linkage
- Payment linkage
- Refund workflow
- Notification workflow
- Evidence storage
- Audit logging

## End-to-end tests

Example:

```text
Buyer reports missing item
    ->
Case created
    ->
Agent assigned
    ->
Supplier contacted
    ->
Evidence reviewed
    ->
Refund approved
    ->
Refund completed
    ->
Buyer notified
    ->
Case resolved
```

Also test:

```text
Buyer reports batch/expiry concern
    ->
Compliance escalation
    ->
Inventory block/quarantine workflow
    ->
Affected-order identification
    ->
Resolution
```

---

# 49. Acceptance Criteria

The support system is production-ready when:

- Buyers can create support cases.
- Suppliers can receive and respond to applicable cases.
- Agents can search and manage cases.
- Cases can link to orders, fulfillments, deliveries, payments, products, and suppliers.
- Assignment and escalation are operational.
- SLA tracking is operational.
- Internal notes are separated from customer messages.
- Evidence is securely stored.
- Refund requests are integrated with the financial workflow.
- High-risk cases can be escalated.
- Cases can be resolved and reopened.
- Full timelines are available.
- Audit records exist for privileged actions.
- Support metrics are available.
- Sensitive data is access-controlled.
- Critical workflows have automated tests.

---

# 50. Implementation Sequence

## Phase 1 — Core Support

1. Case model
2. Case API
3. Support inbox
4. Assignment
5. Internal notes
6. Customer messaging
7. Case timeline

## Phase 2 — Operations

8. Order-linked cases
9. Supplier cases
10. Logistics cases
11. Payment cases
12. Refund request workflow
13. Evidence management

## Phase 3 — Escalation and Compliance

14. SLA engine
15. Escalation
16. Recall/product safety cases
17. Compliance routing
18. Advanced dispute workflows

## Phase 4 — Intelligence

19. Support analytics
20. CSAT
21. Duplicate detection
22. Automated case creation
23. Operational anomaly signals

---

# 51. Recommended Operating Model

Bezzo support should operate as a structured workflow:

```text
IDENTIFY
   |
CLASSIFY
   |
ASSIGN
   |
INVESTIGATE
   |
COLLECT EVIDENCE
   |
DECIDE
   |
EXECUTE RESOLUTION
   |
COMMUNICATE
   |
VERIFY
   |
CLOSE
```

For pharmaceutical or safety-related cases:

```text
IDENTIFY
   |
ISOLATE / QUARANTINE WHEN APPROPRIATE
   |
ESCALATE
   |
INVESTIGATE
   |
COMPLIANCE DECISION
   |
RESOLVE / RECALL WORKFLOW
   |
DOCUMENT
```

The support system should make these processes repeatable, auditable, and measurable.

---

# 52. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Customer support and dispute resolution

This specification should be implemented together with the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, admin/backoffice, and analytics/reporting specifications.

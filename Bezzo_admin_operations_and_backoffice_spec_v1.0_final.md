# Bezzo Admin Operations & Backoffice Specification v1.0

**Product:** Bezzo  
**Document:** Admin Operations & Backoffice Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Internal administration, supplier/buyer verification, catalog moderation, order operations, fulfillment, logistics, payments, disputes, recalls, support, analytics, configuration, audit, and operational controls.

---

# 1. Purpose

The Bezzo Admin & Backoffice system is the internal operating environment used by authorized Bezzo staff to manage marketplace operations.

It provides controlled tools for:

- Supplier verification
- Buyer verification
- Catalog moderation
- Product and batch controls
- Order operations
- Fulfillment monitoring
- Logistics operations
- Payment and reconciliation operations
- Refunds and disputes
- Customer support
- Compliance workflows
- Recalls and safety actions
- Notifications
- Analytics
- Configuration
- Feature flags
- Audit logs
- Operational queues
- SLA and escalation management

The backoffice is not a replacement for the transactional services. It is a controlled operational interface over those services.

---

# 2. Core Principles

## 2.1 Least privilege

Every administrator receives only the permissions required for their role.

## 2.2 Separation of duties

High-risk actions should require separate permissions or approval workflows.

Examples:

```text
Review supplier
      |
Approve supplier
```

may be separated from:

```text
Financial refund approval
```

## 2.3 Auditability

Important administrative actions must be recorded with:

```text
Actor
Role
Organization/context
Action
Target
Before state where appropriate
After state where appropriate
Timestamp
Reason
Request/correlation ID
```

## 2.4 No direct database operations

Routine operational changes should go through authorized service APIs/workflows rather than direct production database editing.

## 2.5 Operational safety

Backoffice actions should clearly distinguish:

```text
Preview
Validate
Approve
Execute
Rollback / Recovery
```

---

# 3. Admin Architecture

Recommended:

```text
Admin Web App
      |
Admin API / BFF
      |
+-----+------+------+------+------+
|     |      |      |      |      |
Users Catalog Orders Payments Logistics Support
|     |      |      |      |      |
+-----+------+------+------+------+
             |
        Audit / Events
```

The admin UI must not bypass normal authorization or business rules.

---

# 4. Admin Access

Admin access should require:

- Strong authentication
- MFA
- Role-based access control
- Session timeout
- Device/session management
- Rate limiting
- Audit logging
- Privileged-action controls

Highly privileged roles may require stronger authentication or step-up verification.

---

# 5. Admin Roles

Recommended initial roles:

```text
SUPER_ADMIN
OPERATIONS_ADMIN
SUPPLIER_ADMIN
BUYER_SUPPORT_ADMIN
CATALOG_ADMIN
ORDER_OPERATIONS_ADMIN
LOGISTICS_ADMIN
FINANCE_ADMIN
COMPLIANCE_ADMIN
ANALYTICS_ADMIN
READ_ONLY_ADMIN
```

Roles should be permission bundles rather than hard-coded application logic.

---

# 6. Permission Model

Examples:

```text
admin.users.read
admin.users.update

admin.suppliers.read
admin.suppliers.review
admin.suppliers.approve
admin.suppliers.suspend

admin.buyers.read
admin.buyers.review
admin.buyers.approve
admin.buyers.suspend

admin.catalog.read
admin.catalog.review
admin.catalog.approve
admin.catalog.block

admin.orders.read
admin.orders.update
admin.orders.cancel
admin.orders.reassign

admin.payments.read
admin.refunds.create
admin.refunds.approve

admin.logistics.read
admin.logistics.retry
admin.logistics.reassign

admin.support.read
admin.support.manage

admin.configuration.read
admin.configuration.update

admin.audit.read
```

Exact permissions should be maintained centrally.

---

# 7. Admin Dashboard

The main dashboard should show operational work rather than vanity metrics.

Recommended:

```text
Pending Verification
Catalog Review Queue
Orders Requiring Attention
Failed Fulfillments
Delivery Exceptions
Payment Exceptions
Open Disputes
Support SLA Breaches
Compliance Alerts
System Health
```

---

# 8. Operational Queues

Every major operational domain should have a queue.

Examples:

```text
Supplier Verification Queue
Buyer Verification Queue
Catalog Review Queue
Order Exception Queue
Payment Exception Queue
Refund Queue
Logistics Exception Queue
Dispute Queue
Compliance Queue
Support Queue
```

Each queue should provide:

- Priority
- Status
- Age
- Assignee
- SLA
- Next action

---

# 9. Queue States

Common states:

```text
NEW
ASSIGNED
IN_PROGRESS
WAITING
ESCALATED
RESOLVED
CLOSED
CANCELLED
```

Domain-specific queues may use additional states.

---

# 10. Assignment

Cases can be assigned to:

```text
Individual admin
Team
Queue
```

Assignment must be auditable.

Avoid silent ownership changes.

---

# 11. SLA Management

Operational cases may have:

```text
Created at
First response deadline
Resolution deadline
Escalation deadline
Resolved at
```

SLA policies should be configurable by case type and priority.

---

# 12. Priority

Recommended:

```text
LOW
NORMAL
HIGH
URGENT
CRITICAL
```

Priority should be determined by operational impact and configured rules.

---

# 13. Supplier Verification

Admin workflow:

```text
Supplier Registered
      |
Documents Submitted
      |
Under Review
      |
+-----+------+
|            |
Approve     Reject
|            |
Verified    Rejected
```

Suspension should be a separate controlled action.

---

# 14. Supplier Review Workspace

Admin should be able to see:

```text
Business profile
Verification documents
Document expiry
Licensing information where applicable
Bank/settlement information where authorized
Addresses
Contact information
Review history
Previous rejection reasons
Audit history
```

Sensitive information should be permission-gated.

---

# 15. Supplier Approval

Approval should record:

```text
Reviewer
Decision
Timestamp
Reason / notes
Documents reviewed
Policy/version used
```

Approval must not silently modify unrelated supplier information.

---

# 16. Supplier Rejection

Rejection should provide structured reasons.

Examples:

```text
Missing document
Invalid document
Expired document
Information mismatch
Verification failed
Additional information required
```

Supplier-facing messages can be generated from controlled templates.

---

# 17. Supplier Suspension

Suspension may restrict:

- New order assignment
- Product publication
- Inventory selling
- New catalog submissions
- Certain account functions

Before suspension, the admin should see operational impact.

---

# 18. Buyer Verification

Buyer review may cover:

```text
Business identity
Medical-store information
Applicable licence/documentation
Tax/business information
Address
Contact information
Verification status
```

Exact requirements are governed by the applicable Bezzo compliance policy.

---

# 19. Buyer Suspension

Buyer suspension may restrict:

- New purchases
- Checkout
- Account functions
- Certain payment methods

Historical orders and financial records must remain intact.

---

# 20. Catalog Moderation

Catalog admins review:

```text
Product data
Images
Composition
Strength
Dosage form
Manufacturer
Pack size
Pricing fields where applicable
Storage information
Eligibility attributes
```

The catalog specification remains authoritative for required fields.

---

# 21. Catalog Review States

Recommended:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
CHANGES_REQUIRED
APPROVED
REJECTED
BLOCKED
ARCHIVED
```

---

# 22. Catalog Review Actions

Admin may:

```text
Approve
Reject
Request changes
Block
Unblock
Archive
Escalate
```

Every action requires an audit record.

---

# 23. Product Blocking

Blocking may be initiated for:

- Compliance concerns
- Data problems
- Safety concerns
- Supplier verification issues
- Operational reasons

A block should propagate to relevant systems:

```text
Catalog
Search
Inventory eligibility
Cart
Checkout
Fulfillment
```

---

# 24. Batch Controls

Where batch-level data is required, admins should be able to:

- Search batch
- View status
- Block batch
- Quarantine batch
- Release batch where authorized
- Review associated inventory
- Review affected orders

---

# 25. Recall Management

Recall workflow:

```text
Recall Identified
      |
Create Recall Case
      |
Identify Products/Batches
      |
Identify Supplier Inventory
      |
Identify Affected Orders
      |
Block Inventory
      |
Operational Response
      |
Buyer Communication
      |
Resolution
```

Recall actions must be highly auditable.

---

# 26. Order Operations

Admin order workspace should show:

```text
Order
Buyer
Items
Fulfillments
Suppliers
Payment
Delivery
Timeline
Support cases
Exceptions
```

Access must follow admin permissions and data minimization.

---

# 27. Order Search

Search by:

- Order ID
- Buyer
- Product
- Supplier
- Fulfillment ID
- Payment reference
- Delivery reference
- Date range

Search must be indexed and controlled for large datasets.

---

# 28. Order Exception Management

Examples:

```text
Payment successful / order failed
Inventory unavailable
Supplier rejection
Delivery failed
Duplicate event
Refund mismatch
Partial fulfillment
```

Each exception should have a clear resolution path.

---

# 29. Supplier Reassignment

Where supported:

```text
Failed Supplier Fulfillment
       |
Find eligible supplier
       |
Create replacement fulfillment
       |
Update order orchestration
       |
Notify relevant systems
```

Admins should not manually assign an ineligible supplier.

---

# 30. Fulfillment Operations

Admin should see:

```text
Fulfillment status
Supplier
Items
Inventory reservation
Pickup state
Delivery state
Exceptions
Timestamps
```

Allowed manual actions must be tightly controlled.

---

# 31. Logistics Operations

Admin logistics workspace:

```text
Delivery jobs
Provider
Pickup
Drop
Status
ETA
Failures
Retries
Provider response
```

The logistics abstraction remains responsible for provider-specific integration.

---

# 32. Porter Operations

For the initial provider:

```text
Bezzo Logistics Service
       |
Porter Adapter
       |
Porter
```

Admin should see normalized delivery status while retaining provider references for troubleshooting.

---

# 33. Logistics Retry

If a provider operation fails:

```text
Provider failure
      |
Retry policy
      |
Retry
      |
Success / Escalate
```

Manual retry must be idempotent.

---

# 34. Payment Operations

Finance admins should be able to review:

```text
Payment
Order
Gateway reference
Amount
Currency
Status
Attempts
Webhook events
Refunds
Reconciliation status
```

Sensitive payment credentials and full card data must never be exposed.

---

# 35. Payment Exceptions

Examples:

```text
Payment captured but order failed
Payment webhook missing
Duplicate payment
Incorrect amount
Refund pending
Refund failed
Settlement mismatch
```

These should enter a finance exception queue.

---

# 36. Refunds

Refund workflow:

```text
Refund requested
      |
Validate
      |
Approval if required
      |
Gateway refund
      |
Webhook/status confirmation
      |
Refund completed
```

High-value refunds may require dual authorization.

---

# 37. Reconciliation

Finance operations should reconcile:

```text
Bezzo order
Payment gateway
Refund records
Settlement records
```

Reconciliation jobs should identify mismatches automatically.

---

# 38. Disputes

Admin dispute workspace should include:

```text
Dispute ID
Order
Buyer
Supplier
Issue
Evidence
Timeline
Financial impact
Current status
Resolution
```

Possible states:

```text
OPEN
UNDER_REVIEW
WAITING_FOR_BUYER
WAITING_FOR_SUPPLIER
RESOLVED
REJECTED
CLOSED
```

---

# 39. Evidence

Evidence may include:

- Order records
- Delivery events
- Supplier responses
- Buyer messages
- Product images
- Packing evidence where available
- Payment records
- Logistics records

Access should be permission-controlled.

---

# 40. Customer Support

Support agents should have a unified customer context.

Example:

```text
Buyer
 |
Orders
 |
Payments
 |
Tickets
 |
Notifications
 |
Relevant account status
```

Support agents should see only the data necessary for resolving the case.

---

# 41. Support Actions

Depending on permission:

```text
Add note
Reply
Escalate
Assign
Request information
Create dispute
Create operational task
```

Financial or account-state changes should require separate permissions.

---

# 42. Communication Controls

Admins may need to:

- Send approved transactional notifications
- Trigger resend
- Review delivery status
- Manage templates
- Disable a problematic template
- Review communication failures

Free-form messaging should be permission-controlled.

---

# 43. Notification Templates

Templates should support:

```text
Template ID
Channel
Language
Version
Variables
Status
Created by
Approved by
Updated at
```

Production templates should be versioned.

---

# 44. Configuration Management

Admin configuration may include:

```text
Delivery fees
Delivery slots
COD eligibility
Order limits
Notification settings
Search settings
Feature flags
Operational thresholds
SLA rules
```

Configuration changes must be audited.

---

# 45. Configuration Safety

Critical configuration should support:

```text
Draft
Review
Approval
Publish
Rollback
```

Do not expose arbitrary code execution through configuration.

---

# 46. Feature Flags

Feature flags may control:

```text
New checkout
New search ranking
New payment method
New logistics provider
New delivery mode
New supplier workflow
```

Flags should support:

- Environment
- Percentage rollout
- Role targeting where appropriate
- Organization targeting where appropriate
- Start/end date
- Audit history

---

# 47. Admin Audit Log

Audit log should capture:

```text
actor_id
actor_role
action
resource_type
resource_id
before_value where appropriate
after_value where appropriate
reason
ip/reference metadata where appropriate
timestamp
correlation_id
```

Audit records should be append-oriented and protected from ordinary modification.

---

# 48. Sensitive Data

Backoffice screens must minimize exposure of:

- Authentication secrets
- Payment credentials
- Unnecessary personal information
- Sensitive documents
- Security tokens

Sensitive fields should be masked or permission-gated.

---

# 49. Admin Search

Global admin search may cover:

```text
Order
Supplier
Buyer
Product
Batch
Payment
Fulfillment
Delivery
Support case
Dispute
```

Results must clearly show entity type and status.

---

# 50. Bulk Actions

Bulk actions should include:

```text
Select
Validate
Preview
Confirm
Execute
Report results
```

Potential examples:

- Catalog moderation
- Product blocking
- Supplier status changes
- Inventory safety blocks
- Notification resend

High-risk bulk actions should require explicit confirmation and may require approval.

---

# 51. Bulk Job Processing

Large operations should run asynchronously.

```text
Admin Request
    |
Create Job
    |
Queue
    |
Worker
    |
Progress
    |
Completed / Failed
```

Admin should be able to view job results.

---

# 52. Export

Admin exports may include:

- Orders
- Products
- Suppliers
- Buyers
- Payments
- Settlements
- Support cases
- Analytics

Exports must be:

- Permission-controlled
- Audited
- Time-limited where appropriate
- Protected from accidental public exposure

---

# 53. Analytics

Admin dashboards may cover:

```text
Orders
GMV / sales metrics
Supplier activity
Buyer activity
Catalog
Inventory
Fulfillment
Delivery
Payments
Refunds
Support
```

Financial definitions must align with the analytics/reporting specification.

---

# 54. Operational Health

Admin dashboard should surface:

```text
API health
Queue backlog
Failed jobs
Payment failures
Webhook failures
Search health
Inventory sync failures
Logistics failures
Notification failures
```

This is operational monitoring, not a replacement for infrastructure observability.

---

# 55. Queue Monitoring

Important queue metrics:

```text
Pending jobs
Processing jobs
Failed jobs
Retry count
Oldest pending job
Dead-letter count
```

Alert thresholds should be configurable.

---

# 56. Dead-Letter Handling

Failed asynchronous jobs may enter:

```text
DEAD_LETTER
```

Admin should be able to:

```text
Inspect
Retry
Resolve manually
Discard where authorized
```

Retry actions must be safe and idempotent.

---

# 57. Admin Notifications

Admins may receive alerts for:

- Critical payment mismatch
- Critical logistics failure
- Compliance issue
- Recall
- Supplier suspension
- Queue SLA breach
- System integration failure

Notification routing should depend on admin role/team.

---

# 58. Operational Notes

Admins should be able to attach internal notes to:

- Supplier
- Buyer
- Order
- Fulfillment
- Payment exception
- Support case
- Dispute
- Compliance case

Internal notes must never accidentally appear in buyer/supplier-facing interfaces.

---

# 59. Impersonation / Support Access

If support impersonation is implemented, it must be heavily controlled.

Requirements:

- Explicit permission
- Strong audit logging
- Visible impersonation banner
- Limited session duration
- Restricted high-risk actions
- Clear exit mechanism

Prefer read-only support views where possible.

---

# 60. Admin APIs

Recommended namespaces:

```text
/admin/v1/users
/admin/v1/suppliers
/admin/v1/buyers
/admin/v1/catalog
/admin/v1/products
/admin/v1/batches
/admin/v1/orders
/admin/v1/fulfillments
/admin/v1/logistics
/admin/v1/payments
/admin/v1/refunds
/admin/v1/disputes
/admin/v1/support
/admin/v1/configuration
/admin/v1/feature-flags
/admin/v1/audit
/admin/v1/jobs
/admin/v1/analytics
```

Exact endpoint contracts must align with the canonical Bezzo API specification.

---

# 61. Admin Data Model

Recommended supporting entities:

```text
admin_users
admin_roles
admin_permissions
admin_role_permissions
admin_user_roles

admin_cases
admin_case_assignments
admin_case_events
admin_case_notes

admin_approval_requests
admin_approval_steps

admin_feature_flags
admin_configuration_changes

admin_jobs
admin_job_items

admin_audit_logs
```

Domain data remains owned by its respective services.

---

# 62. Approval Workflows

High-risk operations should support:

```text
Request
   |
Approval
   |
Execution
   |
Audit
```

Examples:

- High-value refund
- Supplier suspension
- Critical product unblock
- Recall release
- Sensitive configuration change

---

# 63. Four-Eyes Control

For selected high-risk operations:

```text
Admin A requests
      |
Admin B approves
      |
System executes
```

The requester should not be able to approve their own high-risk request where segregation is required.

---

# 64. Admin Security

Security controls should include:

- MFA
- RBAC
- Session timeout
- Device/session revocation
- IP/network controls where appropriate
- Rate limiting
- Audit logs
- Privileged access review
- Secure file access
- Secret management
- Step-up authentication

---

# 65. Admin Session Management

Admin sessions should support:

```text
Active sessions
Session creation
Last activity
Device information where appropriate
Revoke session
Global sign-out
```

Long-lived unattended admin sessions should not remain active indefinitely.

---

# 66. Access Reviews

Periodic reviews should identify:

```text
Inactive admins
Excess permissions
Unused privileged roles
Suspended staff
Expired access
```

Access reviews should be auditable.

---

# 67. Testing

## Unit

Test:

- Permissions
- State transitions
- Approval rules
- Configuration validation
- Queue logic

## Integration

Test:

- Admin API
- Supplier workflows
- Buyer workflows
- Catalog
- Orders
- Payments
- Logistics
- Support
- Audit

## Security

Test:

- RBAC bypass
- IDOR
- Privilege escalation
- Cross-tenant access
- Session abuse
- Sensitive-data exposure
- Unauthorized bulk operations

## End-to-end

```text
Admin login
 ->
Review supplier
 ->
Approve supplier
 ->
Review product
 ->
Approve product
 ->
Monitor order
 ->
Review fulfillment
 ->
Review payment
 ->
Resolve operational issue
 ->
Audit trail visible
```

---

# 68. Acceptance Criteria

The Admin & Backoffice system is production-ready when:

- Admin authentication is secure.
- Admin roles and permissions are enforced server-side.
- Supplier verification can be operated end-to-end.
- Buyer verification can be operated end-to-end.
- Catalog moderation is available.
- Product/batch blocks can be controlled.
- Recall workflows can be initiated and tracked.
- Orders and fulfillments can be investigated.
- Logistics exceptions can be monitored.
- Payment and refund exceptions can be reconciled.
- Disputes can be managed.
- Support cases can be assigned and escalated.
- Configuration changes are audited.
- Feature flags are controlled.
- Bulk operations are validated and auditable.
- High-risk actions can require approval.
- Audit logs are protected.
- Admin data access is permission-scoped.
- Operational queues expose SLA breaches.
- Failed background jobs can be inspected and safely retried.
- Critical workflows have automated tests.

---

# 69. Implementation Sequence

## Phase 1 — Admin Foundation

1. Admin authentication
2. Admin RBAC
3. Admin dashboard
4. Audit logging
5. Global search
6. Operational queues

## Phase 2 — Marketplace Operations

7. Supplier verification
8. Buyer verification
9. Catalog moderation
10. Product/batch controls
11. Order operations
12. Fulfillment operations

## Phase 3 — Finance and Support

13. Payment exceptions
14. Refund workflows
15. Reconciliation
16. Disputes
17. Support operations

## Phase 4 — Compliance and Control

18. Recall workflows
19. Approval workflows
20. Configuration management
21. Feature flags
22. Access reviews

## Phase 5 — Scale

23. Bulk operations
24. Background jobs
25. Advanced analytics
26. Operational automation
27. Advanced case routing

---

# 70. Recommended Admin Home

```text
BEZZO OPERATIONS

Critical
- Payment Exceptions
- Logistics Failures
- Compliance Alerts

Needs Action
- Supplier Reviews
- Buyer Reviews
- Catalog Reviews
- Order Exceptions
- Refund Queue
- Disputes

Operations
- Orders
- Fulfillments
- Deliveries
- Support

System
- Queue Health
- Webhook Failures
- Integration Health
- Audit
```

The home screen should prioritize actionable work and operational risk rather than simply displaying large numerical dashboards.

---

# 71. Final Backoffice Architecture

```text
                         Bezzo Admin Web
                               |
                               v
                         Admin API / BFF
                               |
       +-----------+-----------+-----------+-----------+
       |           |           |           |           |
       v           v           v           v           v
    Users       Catalog      Orders     Finance    Logistics
       |           |           |           |           |
       +-----------+-----------+-----------+-----------+
                               |
                    +----------+----------+
                    |                     |
                    v                     v
                 Support              Compliance
                    |                     |
                    +----------+----------+
                               |
                               v
                         Audit / Events
                               |
                               v
                       Analytics / Reports
```

The backoffice should remain a controlled operational layer over Bezzo's domain services. It should not become a second source of truth.

---

# 72. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Internal administration, verification, catalog moderation, order operations, fulfillment, logistics, finance, disputes, support, compliance, configuration, audit, and operational control

This specification should be implemented together with the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, analytics/reporting, identity, search/discovery, cart/checkout, order tracking, supplier portal, and customer-support specifications.

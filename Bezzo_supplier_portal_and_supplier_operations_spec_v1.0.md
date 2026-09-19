# Bezzo Supplier Portal & Supplier Operations Specification v1.0

**Product:** Bezzo  
**Document:** Supplier Portal & Supplier Operations Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Supplier onboarding, verification, supplier dashboard, catalog management, inventory, pricing, orders, fulfillment, delivery handoff, finance visibility, staff access, analytics, compliance operations, and supplier support.

---

# 1. Purpose

The Bezzo Supplier Portal is the private operating environment for wholesalers and suppliers participating in the marketplace.

Each supplier receives a role-specific dashboard and must only access its own authorized business data.

The portal covers:

- Supplier onboarding
- Business verification
- Document submission
- Supplier dashboard
- Product catalog management
- Product uploads
- Inventory
- Pricing
- Order management
- Fulfillment
- Logistics handoff
- Invoices
- Settlement visibility
- Supplier analytics
- Staff management
- Support
- Compliance actions

---

# 2. Supplier Isolation

Supplier data must be isolated by organization.

```text
Supplier A
   |
   +-- Products
   +-- Inventory
   +-- Orders
   +-- Fulfillments
   +-- Settlements
   +-- Staff

Supplier B
   |
   +-- Products
   +-- Inventory
   +-- Orders
   +-- Fulfillments
   +-- Settlements
   +-- Staff
```

Supplier A must never access Supplier B's private operational data.

---

# 3. Supplier Portal Entry

Supplier users enter through the supplier role.

```text
Bezzo
  |
Wholesaler / Supplier
  |
Authentication
  |
Supplier Organization
  |
Supplier Dashboard
```

The dashboard is private and role-specific.

---

# 4. Supplier Onboarding

Recommended flow:

```text
Create Account
      |
Verify Phone / Email
      |
Create Supplier Organization
      |
Business Information
      |
Required Documents
      |
Review
      |
Verified
      |
Activated
```

Required documentation depends on the supplier's applicable jurisdiction, business activity, and Bezzo verification policy.

---

# 5. Supplier Verification States

Recommended:

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
REJECTED
SUSPENDED
```

Operational activation may be represented separately:

```text
ACTIVE
INACTIVE
```

---

# 6. Supplier Business Profile

Profile may contain:

```text
Legal/business name
Display name
Business type
Registered address
Warehouse address
Contact details
Applicable business identifiers
Applicable pharmaceutical licence information
Tax information
Banking/settlement information
Operating hours
Service regions
```

Sensitive fields must be protected with appropriate permissions.

---

# 7. Verification Documents

Supplier document records should include:

```text
document_id
supplier_id
document_type
document_number where applicable
storage_reference
status
submitted_at
reviewed_at
reviewer_id
rejection_reason
expiry_date where applicable
```

Documents must be securely stored and access-controlled.

---

# 8. Document Status

Recommended:

```text
PENDING
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
EXPIRED
REPLACEMENT_REQUIRED
```

Document expiry should trigger appropriate operational alerts.

---

# 9. Supplier Dashboard

The dashboard should provide a concise operational overview.

Recommended sections:

```text
Today's Orders
Pending Fulfillment
Low Stock
Delivery Handoffs
Payment / Settlement Summary
Support Cases
Compliance Alerts
Performance Metrics
```

---

# 10. Dashboard Metrics

Possible metrics:

- New orders
- Orders awaiting action
- Orders fulfilled
- Orders cancelled
- Low-stock products
- Out-of-stock products
- Fulfillment delays
- Pending settlement amount
- Completed settlement amount
- Support cases
- Catalog issues

Metrics should be scoped to the supplier organization.

---

# 11. Supplier Staff

A supplier organization may have multiple users.

Example:

```text
Owner
Manager
Inventory Staff
Operations Staff
Finance Staff
```

Each role receives only the permissions necessary for its work.

---

# 12. Supplier Permissions

Examples:

```text
supplier.profile.read
supplier.profile.update

supplier.documents.read
supplier.documents.submit

supplier.products.read
supplier.products.create
supplier.products.update
supplier.products.submit

supplier.inventory.read
supplier.inventory.update

supplier.orders.read
supplier.orders.accept
supplier.orders.reject
supplier.orders.fulfill

supplier.finance.read

supplier.analytics.read

supplier.staff.read
supplier.staff.manage

supplier.support.create
supplier.support.read
```

High-risk actions should require elevated permissions.

---

# 13. Staff Invitations

Supplier owners/managers may invite staff.

```text
Invite
  |
Select role
  |
Invitation
  |
Acceptance
  |
Membership active
```

Invitations should expire and be revocable.

---

# 14. Product Management

Supplier users should be able to:

- View supplier products
- Create products
- Edit product information
- Upload images
- Submit products for moderation
- View product status
- Update allowed commercial information
- Archive products where permitted

Catalog ownership and marketplace catalog rules remain authoritative.

---

# 15. Product Submission

Recommended flow:

```text
Create Product
      |
Enter Product Data
      |
Upload Images
      |
Add Packaging Information
      |
Submit
      |
Catalog Review
      |
Approved / Rejected / Changes Required
```

---

# 16. Product Data

Supplier product submission may include:

```text
Product name
Brand
Generic/composition
Strength
Dosage form
Manufacturer
Pack size
MRP where applicable
Supplier price
Storage requirements
Batch information where applicable
Expiry information where applicable
Prescription/eligibility attributes where applicable
Product images
```

Final field requirements come from the Bezzo product catalog/pharma data specification.

---

# 17. Product Images

Support images such as:

- Front packaging
- Back packaging
- Side packaging
- Label
- Other required views

Image processing should include:

- Size limits
- File-type validation
- Malware scanning
- Secure object storage
- Image optimization

---

# 18. Catalog Moderation

Supplier-submitted catalog changes may enter:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
CHANGES_REQUIRED
BLOCKED
ARCHIVED
```

A supplier must not be able to bypass catalog moderation.

---

# 19. Product Blocking

If a product becomes blocked:

```text
Product Block
     |
Search visibility affected
     |
Purchasing affected
     |
Inventory allocation affected
     |
Supplier notified where appropriate
```

Emergency safety/compliance controls must take precedence over supplier preferences.

---

# 20. Inventory Management

Supplier inventory should support:

```text
SKU / product
Available quantity
Reserved quantity
Sellable quantity
Batch/lot where applicable
Expiry where applicable
Warehouse/location
Updated timestamp
```

---

# 21. Inventory States

Conceptual:

```text
ON_HAND
RESERVED
ALLOCATED
DAMAGED
QUARANTINED
EXPIRED
BLOCKED
```

Only eligible inventory should contribute to sellable availability.

---

# 22. Inventory Updates

Supported mechanisms:

### Manual

Supplier updates stock through portal.

### Import

CSV/spreadsheet or approved structured import.

### Integration

Future:

```text
ERP
POS
Warehouse system
Supplier API
```

All inventory updates must be validated.

---

# 23. Inventory Sync

For integrations:

```text
Supplier ERP
      |
Integration Adapter
      |
Inventory Service
      |
Validation
      |
Inventory Read Model
```

The inventory service remains authoritative for marketplace reservations.

---

# 24. Inventory Concurrency

Supplier inventory may change from:

- Manual update
- ERP sync
- Order reservation
- Cancellation
- Return
- Adjustment

Inventory operations must be atomic enough to prevent overselling.

---

# 25. Low Stock

Supplier dashboard may show:

```text
LOW_STOCK
OUT_OF_STOCK
```

Thresholds should be configurable per product or supplier where appropriate.

---

# 26. Batch Management

Where batch-level tracking is required, supplier inventory should support:

```text
product_id
batch_number
manufacturing information where applicable
expiry_date
quantity
warehouse
status
```

Batch data must support applicable recall and traceability workflows.

---

# 27. Expiry Management

Supplier portal should identify:

- Near-expiry inventory
- Expired inventory
- Blocked inventory
- Quarantined inventory

Expired or otherwise prohibited inventory must not remain sellable.

---

# 28. Pricing

Supplier users may manage supplier pricing subject to Bezzo commercial rules.

Fields may include:

```text
product_id
supplier_id
selling_price
effective_from
effective_to
status
```

Price history should be retained.

---

# 29. Price Changes

Supplier price changes should follow:

```text
Draft
 |
Submit
 |
Validate
 |
Apply
```

Where immediate pricing is allowed, the backend must still record the effective time and previous value.

---

# 30. Orders

Supplier order queue should show:

```text
Order ID
Fulfillment ID
Order date
Required action
Items
Quantity
Delivery mode
Requested slot
Status
```

Supplier users should only see fulfillments assigned to their organization.

---

# 31. Supplier Order States

Recommended fulfillment-facing states:

```text
ASSIGNED
ACCEPTED
REJECTED
PICKING
PACKED
READY_FOR_PICKUP
HANDED_TO_LOGISTICS
FULFILLED
CANCELLED
FAILED
```

Final transitions must align with the order/fulfillment specification.

---

# 32. Order Acceptance

When a new fulfillment is assigned:

```text
New Fulfillment
      |
Supplier Notification
      |
Supplier Accepts
      |
ACCEPTED
```

If supplier rejection is permitted, the rejection reason must be recorded.

---

# 33. Supplier Rejection

Possible reasons:

```text
Stock unavailable
Operational issue
Product issue
Warehouse issue
Other configured reason
```

Repeated rejection patterns should feed supplier performance monitoring.

---

# 34. Picking

Supplier workflow:

```text
Accepted
   |
Picking
   |
Items verified
   |
Packed
```

The portal may support pick lists and barcode/scan workflows in later versions.

---

# 35. Packing

Packing workflow may capture:

- Items packed
- Quantity
- Batch where applicable
- Packaging confirmation
- Packing timestamp
- Operator

Where evidence is required, images may be attached.

---

# 36. Ready for Pickup

When packed:

```text
PACKED
   |
READY_FOR_PICKUP
   |
Logistics Handoff
```

The supplier should receive clear pickup instructions.

---

# 37. Logistics Handoff

Supplier portal should show:

```text
Pickup requested
Pickup assigned
Pickup arrived
Picked up
```

The supplier does not directly control the logistics provider's final status.

---

# 38. Porter Integration

The supplier portal should use normalized logistics states.

```text
Supplier Portal
      |
Fulfillment Service
      |
Logistics Service
      |
Porter Adapter
```

Provider-specific implementation details should remain behind the adapter.

---

# 39. Supplier Cancellation

Supplier cancellation must be controlled.

Possible outcomes:

- Reassignment to another supplier
- Customer notification
- Partial order update
- Operational escalation

The system should avoid exposing internal failure complexity to the buyer unnecessarily.

---

# 40. Automatic Reassignment

If Supplier A cannot fulfill:

```text
Supplier A
   |
Unable to fulfill
   |
Routing Engine
   |
Eligible Supplier B
   |
New fulfillment
```

The buyer-facing order may remain unchanged.

---

# 41. Supplier Notifications

Supplier notifications may include:

```text
New fulfillment
Acceptance reminder
Urgent fulfillment
Pickup scheduled
Pickup delayed
Customer cancellation
Fulfillment reassigned
Support case
Compliance alert
Low stock
Document expiry
```

Notification delivery follows the Bezzo communication specification.

---

# 42. Supplier Finance

Supplier finance view may include:

```text
Orders
Gross sales
Adjustments
Refunds
Fees/commissions where applicable
Net payable
Settlement status
Settlement history
```

Exact commercial terms are configuration-driven and must follow the commercial agreement.

---

# 43. Settlement States

Potential:

```text
PENDING
PROCESSING
SETTLED
ON_HOLD
REVERSED
```

Settlement data must come from the finance system.

---

# 44. Supplier Invoices

Depending on the business model, suppliers may access:

- Order-related documents
- Settlement statements
- Commercial invoices
- Applicable tax documents

Document availability depends on the final financial architecture.

---

# 45. Supplier Analytics

Dashboard metrics may include:

- Orders received
- Acceptance rate
- Rejection rate
- Fulfillment time
- Fulfillment success
- Cancellation rate
- Stock availability
- Out-of-stock rate
- Sales
- Settlement totals
- Support cases

Analytics should clearly distinguish operational metrics from financial accounting records.

---

# 46. Performance Metrics

Potential operational metrics:

```text
Order acceptance time
Pick time
Pack time
Pickup readiness time
Supplier cancellation rate
Stock accuracy
Fulfillment completion rate
```

Metrics should be calculated from authoritative event timestamps.

---

# 47. Support

Supplier users should have a support center.

Possible categories:

```text
Order issue
Inventory issue
Payment/settlement
Catalog issue
Verification
Logistics
Account
Compliance
```

Cases should integrate with the Bezzo support system.

---

# 48. Supplier Compliance Alerts

Supplier portal may show:

```text
Document expiring
Verification incomplete
Catalog issue
Product block
Batch issue
Recall action
Account restriction
```

High-risk compliance events should be routed through the appropriate compliance workflow.

---

# 49. Supplier Account Suspension

If a supplier is suspended:

```text
Supplier status -> SUSPENDED
```

The system may restrict:

- New order assignment
- Product publication
- Inventory selling
- New catalog submissions

Existing orders require an explicit operational handling policy.

---

# 50. Existing Orders During Suspension

Suspension must not blindly delete or cancel historical business state.

Operations should determine:

- Which fulfillments can continue
- Which must be reassigned
- Which orders require customer notification
- Which inventory must be blocked

All decisions must be recorded.

---

# 51. Supplier Search

Supplier portal should support searching its own:

- Products
- Orders
- Fulfillments
- Inventory
- Settlements
- Support cases

Search must be supplier-scoped.

---

# 52. Bulk Operations

Potential bulk actions:

- Inventory update
- Product status update
- Price update
- Order acknowledgement
- Catalog import

Bulk actions require:

- Validation
- Preview
- Error reporting
- Idempotency
- Audit logging

---

# 53. CSV / Spreadsheet Import

Where enabled:

```text
Upload
   |
Validate
   |
Preview
   |
Fix errors
   |
Confirm
   |
Import
```

The system should provide row-level errors.

Example:

```text
Row 27:
Invalid product identifier
```

---

# 54. Bulk Import Safety

Imports must not:

- Bypass authorization
- Publish unapproved products
- Create negative inventory
- Modify another supplier's data
- Overwrite protected fields without permission

---

# 55. Supplier API Integration

Future suppliers may integrate through APIs.

Potential capabilities:

```text
Product sync
Inventory sync
Price sync
Order receive
Fulfillment status
Shipment handoff
Settlement reporting
```

Integration credentials must be organization-scoped and revocable.

---

# 56. Supplier Webhooks

Bezzo may provide supplier webhooks for:

```text
new_fulfillment
fulfillment_cancelled
inventory_alert
settlement_completed
support_case_created
```

Webhook delivery must support:

- Signing
- Retry
- Idempotency
- Delivery logs
- Secret rotation

---

# 57. Supplier Data Model

Recommended entities:

```text
supplier_organizations
supplier_members
supplier_verification_documents
supplier_products
supplier_product_prices
supplier_inventory
supplier_inventory_batches
supplier_inventory_events
supplier_fulfillments
supplier_fulfillment_items
supplier_staff_invitations
supplier_settlement_views
supplier_support_links
```

Existing canonical database design remains authoritative for exact schema.

---

# 58. Supplier APIs

Recommended:

```text
GET    /supplier/v1/profile
PATCH  /supplier/v1/profile

GET    /supplier/v1/documents
POST   /supplier/v1/documents

GET    /supplier/v1/products
POST   /supplier/v1/products
GET    /supplier/v1/products/{id}
PATCH  /supplier/v1/products/{id}
POST   /supplier/v1/products/{id}/submit

GET    /supplier/v1/inventory
PATCH  /supplier/v1/inventory/{id}

GET    /supplier/v1/fulfillments
GET    /supplier/v1/fulfillments/{id}
POST   /supplier/v1/fulfillments/{id}/accept
POST   /supplier/v1/fulfillments/{id}/reject
POST   /supplier/v1/fulfillments/{id}/ready

GET    /supplier/v1/settlements
GET    /supplier/v1/analytics

GET    /supplier/v1/staff
POST   /supplier/v1/staff/invitations

GET    /supplier/v1/support/cases
POST   /supplier/v1/support/cases
```

Final endpoints must align with the canonical Bezzo API specification.

---

# 59. Security

Supplier portal must enforce:

- Authentication
- MFA where required
- RBAC
- Organization isolation
- Secure document access
- Rate limiting
- Audit logs
- Session management
- Secure file uploads
- API authorization
- Privileged-action controls

---

# 60. Audit Logs

Audit important supplier actions:

```text
profile_changed
document_submitted
document_updated
product_created
product_submitted
product_changed
price_changed
inventory_changed
fulfillment_accepted
fulfillment_rejected
fulfillment_ready
staff_invited
staff_role_changed
staff_removed
```

Audit records should contain actor, organization, action, target, timestamp, and relevant metadata.

---

# 61. Performance

Supplier dashboard should remain responsive with:

- Large product catalogs
- Large inventories
- Many fulfillment records
- Large order histories

Use:

- Pagination
- Indexed queries
- Server-side filtering
- Search indexes where justified
- Background exports
- Asynchronous bulk processing

---

# 62. Reliability

Supplier workflows must support:

- Retry
- Idempotency
- Background processing
- Import recovery
- Webhook retries
- Event replay where appropriate
- Operational alerts

---

# 63. Testing

## Unit

Test:

- Supplier permissions
- Verification states
- Inventory rules
- Fulfillment transitions
- Bulk validation
- Price changes

## Integration

Test:

- Supplier portal APIs
- Inventory service
- Order service
- Catalog service
- Logistics service
- Finance service
- Notification service

## Security

Test:

- Cross-supplier access
- Privilege escalation
- Unauthorized document access
- IDOR
- Bulk import abuse
- Session security

## End-to-end

```text
Supplier registers
    ->
Submits verification documents
    ->
Verified
    ->
Creates product
    ->
Product approved
    ->
Adds inventory
    ->
Receives fulfillment
    ->
Accepts
    ->
Picks
    ->
Packs
    ->
Ready for pickup
    ->
Logistics pickup
    ->
Fulfillment completed
```

---

# 64. Acceptance Criteria

The supplier portal is production-ready when:

- Suppliers can register.
- Required verification documents can be submitted.
- Verification status is visible.
- Supplier data is isolated.
- Supplier staff can be managed.
- Products can be created and submitted.
- Catalog moderation is enforced.
- Inventory can be maintained.
- Batch/expiry data can be managed where required.
- Prices can be maintained.
- Fulfillments can be accepted and processed.
- Logistics handoff is visible.
- Supplier cancellations are controlled.
- Multi-supplier reassignment is supported by backend workflows.
- Settlement information is accessible according to permissions.
- Supplier analytics are available.
- Support cases can be created.
- Compliance alerts can be surfaced.
- Bulk operations are validated and audited.
- Supplier APIs/webhooks can be added without redesigning the portal.
- Security and cross-tenant isolation tests pass.

---

# 65. Implementation Sequence

## Phase 1 — Supplier Foundation

1. Supplier organization
2. Supplier onboarding
3. Verification documents
4. Supplier dashboard
5. Supplier RBAC
6. Staff invitations

## Phase 2 — Catalog and Inventory

7. Product management
8. Catalog submission
9. Product images
10. Inventory management
11. Batch/expiry support
12. Price management

## Phase 3 — Fulfillment

13. Supplier order queue
14. Fulfillment acceptance
15. Picking
16. Packing
17. Ready-for-pickup
18. Logistics handoff

## Phase 4 — Finance and Operations

19. Settlement view
20. Supplier analytics
21. Support integration
22. Compliance alerts
23. Bulk operations

## Phase 5 — Integrations

24. ERP/POS inventory integration
25. Supplier APIs
26. Webhooks
27. Advanced imports
28. Advanced supplier analytics

---

# 66. Recommended Supplier Dashboard

The first production dashboard should prioritize actions rather than vanity metrics.

```text
Supplier Dashboard

[ New Orders ]
[ Fulfillments Awaiting Action ]

Inventory
- Low Stock
- Out of Stock
- Expiring / Blocked

Operations
- Ready for Pickup
- Delayed Fulfillments

Finance
- Pending Settlement
- Recent Settlement

Compliance
- Documents Expiring
- Catalog Issues

Support
- Open Cases
```

---

# 67. Supplier Operating Flow

```text
ONBOARD
   |
VERIFY
   |
PUBLISH CATALOG
   |
MAINTAIN INVENTORY
   |
RECEIVE FULFILLMENT
   |
ACCEPT
   |
PICK
   |
PACK
   |
READY FOR PICKUP
   |
LOGISTICS HANDOFF
   |
FULFILLMENT COMPLETE
   |
SETTLEMENT
```

This workflow should remain visible and understandable to supplier operators.

---

# 68. Final Supplier Architecture

```text
                  Supplier Web / Portal
                           |
                           v
                    Supplier API
                           |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
     Catalog           Inventory          Fulfillment
        |                  |                  |
        |                  |                  v
        |                  |             Logistics
        |                  |
        +------------------+------------------+
                           |
                           v
                    Finance / Settlement
                           |
                           v
                       Analytics
```

The supplier portal is a private operational layer over the core Bezzo marketplace services. It should provide suppliers enough control to operate their business while keeping marketplace governance, buyer data, payment authority, catalog moderation, and security boundaries under Bezzo-controlled backend services.

---

# 69. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Supplier onboarding, verification, supplier dashboard, catalog, inventory, pricing, orders, fulfillment, logistics handoff, finance visibility, staff, analytics, compliance, and support

This specification should be implemented together with the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, admin/backoffice, analytics/reporting, identity, search/discovery, cart/checkout, order-tracking, and customer-support specifications.

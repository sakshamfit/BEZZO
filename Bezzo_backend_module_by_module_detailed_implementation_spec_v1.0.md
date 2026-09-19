# Bezzo Backend Module-by-Module Detailed Implementation Specification v1.0

**Product:** Bezzo  
**Document:** Backend Module-by-Module Detailed Implementation Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Backend:** Node.js + NestJS + TypeScript  
**Database:** PostgreSQL  
**Cache/Jobs:** Redis  
**Search:** OpenSearch-compatible  
**Storage:** S3-compatible object storage  

---

# 1. Purpose

This document translates the Bezzo backend architecture into concrete module responsibilities and implementation boundaries.

It defines, for each major backend module:

- responsibility
- owned data
- public interfaces
- core use cases
- business rules
- dependencies
- events
- background jobs
- security requirements
- transaction requirements
- testing requirements

The document is intended to be used directly by backend engineers during implementation.

---

# 2. Module Dependency Principle

Modules must communicate through explicit application interfaces.

Preferred dependency direction:

```text
API Controllers
      ↓
Application Services
      ↓
Domain Logic
      ↓
Repositories / Adapters
      ↓
Infrastructure
```

Cross-domain communication should use:

- application interfaces for synchronous operations
- domain events/jobs for asynchronous operations

Direct access to another module's private repository or tables is prohibited unless explicitly approved as infrastructure-level behavior.

---

# 3. Core Modules

```text
01 Auth
02 Users & Accounts
03 Buyer
04 Supplier
05 Supplier Verification
06 Catalog
07 Inventory
08 Search
09 Cart
10 Checkout
11 Orders
12 Fulfillment
13 Payments
14 Billing
15 Logistics
16 Notifications
17 Returns & Refunds
18 Promotions & Pricing
19 Supplier Settlement
20 Customer Support & Disputes
21 Fraud & Risk
22 Admin & Backoffice
23 Audit
24 Analytics
25 Configuration
26 Files/Documents
27 Jobs & Events
```

---

# 4. Auth Module

## Responsibility

Authentication and session lifecycle.

## Core operations

```text
register
login
logout
refreshSession
verifyCredential
requestPasswordReset
resetPassword
verifyContact
revokeSession
listSessions
```

## Owns

- credentials
- authentication identities
- sessions
- refresh-token/session metadata
- authentication events

## Must not own

- supplier verification
- business permissions
- order ownership

## Security

- password hashing
- rate limiting
- account lock/risk controls where required
- secure session handling
- token/session revocation
- audit logging for security-sensitive actions

## Events

```text
UserRegistered
UserAuthenticated
UserLoggedOut
SessionRevoked
CredentialReset
```

---

# 5. Users & Accounts Module

## Responsibility

Common identity profile and account information.

## Core operations

```text
getProfile
updateProfile
updateContact
getAccountStatus
deactivateAccount
```

## Data

- user
- profile
- contact information
- account status
- preferences

Role-specific data belongs to Buyer/Supplier modules.

---

# 6. Buyer Module

## Responsibility

Medical-store buyer identity and business profile.

## Core operations

```text
createBuyerProfile
updateBuyerProfile
submitBusinessDocuments
getBuyerVerificationStatus
manageAddresses
```

## Buyer information may include

- business/store details
- owner/contact details
- applicable licence information
- GST/business information
- addresses
- approved documents

## Security

A buyer may access only their own private business information unless authorized operational access exists.

---

# 7. Supplier Module

## Responsibility

Supplier/wholesaler business account and operational profile.

## Core operations

```text
createSupplierProfile
updateSupplierProfile
getSupplierDashboard
updateOperatingHours
updateServiceAreas
updateBankDetails
suspendSupplier
reactivateSupplier
```

## Supplier-owned information

- legal/business identity
- contact information
- warehouse/premises details
- service areas
- operating configuration
- banking/settlement references
- supplier status

---

# 8. Supplier Verification Module

## Responsibility

Verification of supplier eligibility and submitted documentation.

## Workflow

```text
REGISTERED
   ↓
DOCUMENTS_PENDING
   ↓
UNDER_REVIEW
   ↓
VERIFIED
   ↓
ACTIVE
```

Alternative terminal/intermediate states:

```text
REJECTED
SUSPENDED
```

## Core operations

```text
submitVerification
reviewVerification
requestCorrection
approveSupplier
rejectSupplier
suspendSupplier
```

## Documents

The exact document requirements must follow applicable pharmaceutical/legal requirements and approved business rules.

Potential categories include:

- business identity
- applicable drug/wholesale licence
- GST/business information
- premises/storage proof
- responsible/qualified personnel documentation where required
- bank verification

## Audit

Every approval, rejection, correction request, and suspension must be audited.

---

# 9. Catalog Module

## Responsibility

Canonical product catalog.

## Core entities

```text
Product
ProductVariant
Manufacturer
Composition
Category
DosageForm
PackSize
ProductImage
ProductAttribute
```

## Core operations

```text
createProduct
updateProduct
getProduct
searchCatalogReference
approveProduct
rejectProduct
archiveProduct
```

## Product data may include

- brand name
- generic name
- composition
- strength
- dosage form
- manufacturer
- pack size
- packaging information
- storage requirements
- prescription classification
- regulatory/product metadata

## Important rule

Catalog identity and supplier-specific commercial data must remain separate.

---

# 10. Supplier Listing Module

Supplier-specific product availability should be represented independently from the canonical catalog.

Conceptually:

```text
Product
   |
   +--- Supplier Listing A
   +--- Supplier Listing B
   +--- Supplier Listing C
```

A supplier listing may contain:

- supplier price
- supplier SKU
- inventory reference
- active/inactive status
- supplier-specific terms
- delivery eligibility

This prevents duplication of canonical product information.

---

# 11. Inventory Module

## Responsibility

Authoritative supplier inventory.

## Core operations

```text
getInventory
increaseStock
decreaseStock
adjustStock
reserveStock
confirmReservation
releaseReservation
bulkImportStock
syncInventory
```

## Inventory states

Conceptually:

```text
AVAILABLE
RESERVED
SOLD
DAMAGED
EXPIRED
BLOCKED
```

## Critical invariant

```text
available quantity >= 0
```

The database and transactional logic must enforce this invariant.

---

# 12. Inventory Reservation

Reservation should be transactional.

Conceptual flow:

```text
Check availability
      ↓
Lock/atomic update
      ↓
Create reservation
      ↓
Commit
```

Reservation records should have:

- reservation ID
- order/cart reference
- supplier
- product/listing
- quantity
- expiration
- status

Expired reservations must be safely released.

---

# 13. Inventory Sync

The inventory module should support future integration with:

- ERP
- POS
- supplier inventory API
- CSV/import
- manual supplier updates

Integration architecture:

```text
External Inventory
      ↓
Adapter
      ↓
Normalization
      ↓
Inventory Service
      ↓
PostgreSQL
```

External systems must not directly write database tables.

---

# 14. Search Module

## Responsibility

Fast discovery across the catalog.

## Searchable attributes

- brand name
- generic name
- composition
- manufacturer
- category
- dosage form
- product identifiers

## Operations

```text
search
suggest
indexProduct
removeProductFromIndex
reindexCatalog
```

## Architecture

```text
Catalog
  ↓
ProductChanged Event
  ↓
Search Index Job
  ↓
OpenSearch
```

Transactional inventory and price remain authoritative outside the search index.

---

# 15. Cart Module

## Responsibility

Buyer shopping cart.

## Operations

```text
getCart
addItem
updateQuantity
removeItem
clearCart
validateCart
```

Cart must identify:

- buyer
- product/listing
- quantity
- price snapshot where required
- timestamps

Cart data is not an order.

---

# 16. Cart Validation

Before checkout, validate:

- buyer status
- product availability
- supplier eligibility
- quantity
- applicable pricing
- applicable promotions
- delivery eligibility
- product restrictions

A cart may become stale and must be revalidated.

---

# 17. Checkout Module

## Responsibility

Orchestrate conversion of a valid cart into an order/payment workflow.

## Operations

```text
prepareCheckout
calculateCheckout
validateCheckout
createOrderFromCheckout
initiatePayment
```

## Checkout must not trust client totals.

Backend recalculates:

```text
item totals
discounts
taxes
delivery fees
final amount
```

according to authoritative rules.

---

# 18. Orders Module

## Responsibility

Customer-facing order lifecycle.

## Core operations

```text
createOrder
getOrder
listOrders
cancelOrder
transitionOrder
```

## Order owns

- buyer reference
- order number
- totals
- delivery selection
- payment reference
- fulfillment references
- order state

---

# 19. Order State Machine

Example:

```text
PENDING
   ↓
CONFIRMED
   ↓
PROCESSING
   ↓
READY_FOR_PICKUP
   ↓
OUT_FOR_DELIVERY
   ↓
DELIVERED
```

Cancellation can be allowed only from permitted states.

The exact transition matrix must be enforced by backend business rules.

---

# 20. Fulfillment Module

## Responsibility

Internal supplier-specific fulfillment.

One customer order can contain multiple fulfillments.

```text
Order #1001
   |
   +--- Fulfillment A → Supplier A
   |
   +--- Fulfillment B → Supplier B
```

## Operations

```text
createFulfillment
assignSupplier
acceptFulfillment
rejectFulfillment
markPacked
markReady
handoffToLogistics
completeFulfillment
```

---

# 21. Supplier Allocation

Supplier selection should consider:

1. product availability
2. supplier eligibility
3. service area
4. delivery capability
5. applicable commercial rules
6. compliance restrictions
7. operational availability

The allocation engine must be replaceable as business rules become more sophisticated.

---

# 22. Payments Module

## Responsibility

Payment lifecycle.

## Operations

```text
createPayment
authorizePayment
capturePayment
processWebhook
markFailed
refund
partiallyRefund
```

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

---

# 23. Payment Adapter

The core payment module must use an interface.

```ts
interface PaymentGateway {
  createPayment(...);
  verifyPayment(...);
  refundPayment(...);
}
```

Adapters can implement supported providers without changing order business logic.

---

# 24. Payment Webhook Processing

Webhook processing:

```text
Receive
  ↓
Verify authenticity
  ↓
Find payment
  ↓
Check idempotency
  ↓
Validate state transition
  ↓
Update payment
  ↓
Publish event
```

Duplicate webhook delivery must not create duplicate financial effects.

---

# 25. Billing Module

## Responsibility

Financial documents and transaction records.

Potential outputs:

- invoices
- credit notes
- refund records
- tax information
- payment receipts

Billing data must be derived from authoritative order/payment records.

---

# 26. Logistics Module

## Responsibility

Delivery orchestration independent of provider.

## Operations

```text
quoteDelivery
createDelivery
scheduleDelivery
cancelDelivery
trackDelivery
completeDelivery
```

## Adapter model

```text
LogisticsService
   |
   +--- PorterAdapter
   +--- FutureProviderAdapter
   +--- BezzoFleetAdapter
```

---

# 27. Delivery Modes

The logistics module should support:

```text
INSTANT
SCHEDULED
```

Scheduled delivery stores:

```text
deliveryDate
deliverySlot
```

Slot definitions must be configurable.

---

# 28. Logistics State

Example:

```text
PENDING
BOOKING
BOOKED
DRIVER_ASSIGNED
PICKED_UP
IN_TRANSIT
DELIVERED
FAILED
CANCELLED
```

Provider-specific statuses must be normalized into Bezzo states.

---

# 29. Notifications Module

## Responsibility

Communication orchestration.

## Channels

```text
PUSH
SMS
EMAIL
IN_APP
```

Additional channels may be added through adapters.

## Operations

```text
sendNotification
queueNotification
retryNotification
getNotificationHistory
```

---

# 30. Notification Templates

Templates should be versioned and centrally managed.

Example:

```text
ORDER_CONFIRMED
PAYMENT_SUCCESS
PAYMENT_FAILED
OUT_FOR_DELIVERY
DELIVERED
REFUND_COMPLETED
SUPPLIER_VERIFIED
```

Templates should not contain sensitive internal data unnecessarily.

---

# 31. Returns & Refunds Module

## Responsibility

Return/refund workflow.

## Operations

```text
createReturnRequest
approveReturn
rejectReturn
scheduleReverseLogistics
inspectReturn
createRefund
completeReturn
```

## Important pharmaceutical consideration

Return eligibility must follow the applicable business and regulatory rules for pharmaceutical products.

Not every product should automatically be treated like ordinary e-commerce merchandise.

---

# 32. Promotions & Pricing Module

## Responsibility

Commercial pricing rules.

Potential concepts:

```text
Base price
MRP/reference price
Supplier price
Buyer-specific pricing
Discount
Promotion
Coupon
Delivery fee
Tax
```

## Critical rule

The backend calculates final payable amounts.

Frontend-displayed calculations are informational.

---

# 33. Pricing Calculation

Conceptual sequence:

```text
Base supplier price
   ↓
Quantity/business pricing
   ↓
Applicable promotion
   ↓
Discount
   ↓
Tax
   ↓
Delivery fee
   ↓
Final total
```

The actual order calculation must use the approved commercial and tax rules.

---

# 34. Supplier Settlement Module

## Responsibility

Supplier financial reconciliation and payout calculation.

Potential inputs:

- completed order items
- commissions
- marketplace fees
- refunds
- adjustments
- taxes/withholding where applicable
- delivery allocations where applicable

## States

```text
CALCULATED
REVIEWED
APPROVED
PROCESSING
PAID
FAILED
```

---

# 35. Settlement Principle

Supplier payout must not be calculated from frontend values.

Settlement must derive from authoritative backend transaction records.

Every settlement adjustment must be auditable.

---

# 36. Customer Support & Disputes Module

## Responsibility

Customer and supplier support cases.

## Core operations

```text
createTicket
assignTicket
addMessage
changeStatus
escalate
resolve
reopen
```

## Ticket states

```text
OPEN
ASSIGNED
IN_PROGRESS
WAITING_FOR_CUSTOMER
ESCALATED
RESOLVED
CLOSED
```

---

# 37. Fraud & Risk Module

## Responsibility

Risk detection and abuse controls.

Potential signals:

- repeated payment failures
- unusual order frequency
- suspicious account behavior
- promotion abuse
- excessive cancellation
- supplier anomalies
- delivery anomalies

Risk decisions should be explainable internally and auditable.

The module should support:

```text
LOW_RISK
REVIEW
BLOCKED
```

as internal risk outcomes where appropriate.

---

# 38. Admin & Backoffice Module

## Responsibility

Operational control plane.

Admin capabilities may include:

- supplier verification
- buyer review
- catalog moderation
- order intervention
- payment review
- logistics monitoring
- dispute handling
- settlement review
- configuration
- reporting
- audit access

Administrative permissions must be granular.

---

# 39. Admin Actions

Sensitive actions require:

- authorization
- validation
- audit record
- confirmation where appropriate

Examples:

```text
Suspend Supplier
Approve Supplier
Approve Refund
Override Order State
Change Commercial Configuration
```

---

# 40. Audit Module

## Responsibility

Immutable-style audit history for important actions.

Audit record:

```text
actor
actorRole
action
resourceType
resourceId
timestamp
requestId
before
after
reason
metadata
```

Sensitive values should be minimized or redacted.

---

# 41. Analytics Module

## Responsibility

Business reporting and operational metrics.

Potential domains:

- orders
- GMV
- supplier performance
- inventory
- delivery
- payments
- refunds
- buyer activity

Operational dashboards should not run expensive unrestricted analytical queries against critical transactional paths.

Use suitable read models/aggregations where necessary.

---

# 42. Configuration Module

Centralized configuration should manage business-configurable values such as:

- delivery fees
- delivery slots
- feature settings
- operational limits
- promotion rules
- notification configuration
- supported payment methods

Configuration changes should be permission-controlled and auditable.

---

# 43. Files/Documents Module

## Responsibility

Secure document metadata and object-storage integration.

## Operations

```text
createUploadRequest
completeUpload
getDocument
deleteDocument
verifyDocument
```

The module should store metadata in PostgreSQL and binary content in object storage.

---

# 44. Jobs Module

Background job categories:

```text
Notifications
Search indexing
Scheduled deliveries
Reservation expiry
Settlement generation
Payment reconciliation
Logistics reconciliation
Analytics aggregation
Document processing
Cleanup
```

Jobs must have:

- retry policy
- timeout
- observability
- idempotency
- failure handling

---

# 45. Events Module

Central domain-event infrastructure.

Events should support:

```text
publish
consume
retry
dead-letter
observe
```

Important event examples:

```text
SupplierVerified
ProductApproved
InventoryReserved
OrderPlaced
PaymentConfirmed
FulfillmentReady
DeliveryCompleted
RefundCompleted
```

---

# 46. Cross-Module Workflow: Buyer Order

```text
Cart
 ↓
Checkout
 ↓
Catalog validation
 ↓
Inventory validation
 ↓
Supplier allocation
 ↓
Inventory reservation
 ↓
Order creation
 ↓
Fulfillment creation
 ↓
Payment
 ↓
Order confirmation
 ↓
Notification
 ↓
Logistics
```

Every step must define:

- synchronous vs asynchronous behavior
- transaction boundary
- failure behavior
- retry behavior
- compensating action where necessary

---

# 47. Cross-Module Workflow: Supplier Order Processing

```text
Order
 ↓
Fulfillment assigned
 ↓
Supplier notified
 ↓
Supplier accepts
 ↓
Pick
 ↓
Pack
 ↓
Ready
 ↓
Logistics booking
 ↓
Pickup
 ↓
Delivery
```

Supplier-specific status changes must update the corresponding fulfillment without corrupting the customer-facing order state.

---

# 48. Cross-Module Workflow: Payment

```text
Checkout
 ↓
Create payment
 ↓
Gateway
 ↓
Gateway result/webhook
 ↓
Verify
 ↓
Payment state transition
 ↓
Order state update
 ↓
Event
 ↓
Notification
```

Client-side payment completion must never bypass backend verification.

---

# 49. Cross-Module Workflow: Scheduled Delivery

```text
Order created
 ↓
Delivery date + slot stored
 ↓
Scheduled job
 ↓
Approaching dispatch window
 ↓
Eligible fulfillment batching
 ↓
Logistics booking
 ↓
Driver assignment
 ↓
Pickup
 ↓
Delivery
```

---

# 50. Failure Handling

Every cross-module workflow must define what happens if:

```text
Inventory reservation fails
Payment fails
Payment times out
Supplier rejects fulfillment
Logistics provider unavailable
Notification provider fails
Search indexing fails
```

Do not silently swallow failures.

---

# 51. Compensation

Distributed workflows may require compensating actions.

Example:

```text
Inventory reserved
   ↓
Payment permanently fails
   ↓
Release reservation
```

Compensation must be explicit and idempotent.

---

# 52. Database Ownership

Each module should conceptually own its tables.

Example:

```text
Inventory → inventory tables
Payments → payment tables
Orders → order tables
Catalog → catalog tables
```

Cross-module foreign keys may exist where justified, but application ownership must remain clear.

---

# 53. Query Boundaries

Do not allow arbitrary modules to query another module's private tables simply because it is convenient.

Preferred:

```text
OrderService
   ↓
InventoryService.reserve()
```

rather than:

```text
OrderService
   ↓
SELECT * FROM inventory_internal_tables
```

---

# 54. Caching by Module

Each module must document:

- cache keys
- TTL
- invalidation
- authoritative source
- stale-data behavior

Do not introduce cache without defining these rules.

---

# 55. Security by Module

Every module must define:

```text
Authentication requirement
Authorization requirement
Ownership/tenant requirement
Sensitive data
Audit requirement
Rate limit
```

Security must be designed at module boundaries rather than added only at the API gateway.

---

# 56. Testing by Module

Each module should have:

```text
Unit tests
Integration tests
API tests where applicable
Concurrency tests where applicable
Authorization tests
Failure-path tests
```

Critical financial/inventory modules require stronger integration and concurrency coverage.

---

# 57. Module Implementation Order

Recommended sequence:

```text
1. Configuration
2. Auth
3. Users
4. Buyers
5. Suppliers
6. Supplier Verification
7. Files
8. Catalog
9. Inventory
10. Search
11. Cart
12. Checkout
13. Orders
14. Fulfillment
15. Payments
16. Billing
17. Logistics
18. Notifications
19. Returns/Refunds
20. Promotions/Pricing
21. Settlements
22. Support/Disputes
23. Fraud/Risk
24. Admin
25. Audit
26. Analytics
27. Jobs/Events hardening
```

This ordering minimizes dependency problems.

---

# 58. Module Acceptance Criteria

A module is considered implementation-ready when:

- responsibility is clearly defined
- owned data is identified
- APIs are identified
- dependencies are documented
- state transitions are defined
- authorization rules are known
- transactions are defined
- events are identified
- background jobs are identified
- failure paths are documented
- tests are defined

---

# 59. Final Backend Module Architecture

The Bezzo backend should ultimately provide:

```text
                    BEZZO API
                       |
       +---------------+---------------+
       |               |               |
    Identity         Commerce       Operations
       |               |               |
 Auth / Users     Catalog / Cart   Supplier
 Buyers           Checkout         Inventory
 Suppliers        Orders           Fulfillment
 Verification     Payments         Logistics
                  Billing          Notifications
                  Pricing          Support
                  Returns          Settlements
                                   Fraud
                                   Admin
                                   Audit
                                   Analytics
                       |
                 Infrastructure
                       |
        PostgreSQL / Redis / Search / Storage
                       |
               External Providers
```

The architecture deliberately keeps business modules explicit while allowing infrastructure and deployment topology to evolve independently.

---

# 60. Definition of Done

The backend module architecture is complete when:

- every core business capability has a clear owner
- module boundaries are enforced in code
- cross-module dependencies are documented
- critical workflows are represented as explicit application services
- inventory and payment invariants are protected
- state transitions are centralized
- authorization is tested
- asynchronous work is observable and retryable
- external integrations use adapters
- database ownership is understood
- module-level tests exist
- failure and compensation paths are implemented
- API contracts remain synchronized with clients
- production observability is available

---

**End of Specification**

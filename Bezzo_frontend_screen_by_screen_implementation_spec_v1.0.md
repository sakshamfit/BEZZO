# Bezzo Frontend Screen-by-Screen Implementation Specification v1.0

**Product:** Bezzo B2B Pharmaceutical Marketplace  
**Document Type:** Frontend Screen Implementation Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Web:** Next.js + React + TypeScript  
**Mobile:** React Native + TypeScript  
**API:** Bezzo REST API v1  
**Audience:** Product, UX/UI, frontend, mobile, backend, QA and engineering teams

---

# 1. Purpose

This document converts the Bezzo product and frontend architecture into an implementation-level screen inventory.

It defines, for each major screen:

- purpose
- user role
- entry points
- primary components
- data requirements
- API dependencies
- loading behavior
- empty state
- error state
- primary actions
- navigation
- permissions
- responsive/mobile considerations
- performance requirements

The goal is to make each screen directly implementable without repeatedly deciding the same architecture during coding.

---

# 2. Global Application Structure

Bezzo has three principal application experiences:

```text
Public / Authentication
        │
        ├── Buyer Marketplace
        │
        ├── Supplier Portal
        │
        └── Admin / Operations
```

Primary buyer navigation:

```text
Home
Categories
Search
Cart
Orders
Account
```

Primary supplier navigation:

```text
Dashboard
Orders
Inventory
Products/Listings
Settlements
Profile
```

Primary admin navigation:

```text
Dashboard
Users
Buyers
Suppliers
Catalog
Orders
Payments
Logistics
Returns
Disputes
Settlements
Risk
Audit
Configuration
```

---

# 3. Global Screen Rules

Every screen must define:

1. page/screen title
2. primary action
3. loading state
4. empty state
5. error state
6. permission behavior
7. responsive behavior
8. API dependencies
9. analytics events where applicable

All screens must support:

- safe navigation
- consistent error handling
- accessible controls
- responsive layout
- session expiration recovery

---

# 4. Public Screens

## 4.1 Landing / Welcome

**Route:** `/`

### Purpose

Introduce Bezzo and route users into the correct experience.

### Primary content

- Bezzo branding
- short marketplace value proposition
- Buyer / Medical Store Owner entry
- Wholesaler / Supplier entry
- Login
- Registration

### Primary actions

```text
I'm a Medical Store Owner
I'm a Supplier / Wholesaler
Login
```

### API

No required API for the initial render.

Optional:

```text
GET /configuration/public
```

### States

- normal
- configuration unavailable

### Performance

The landing screen should load with minimal JavaScript and assets.

---

# 5. Authentication Screens

## 5.1 Login

**Route:** `/login`

### Components

- phone/email input
- password/OTP flow
- login button
- forgot-password/recovery
- registration links

### API

```text
POST /auth/login
POST /auth/verify-otp
POST /auth/refresh
```

### States

- initial
- submitting
- invalid credentials
- verification required
- rate limited
- success

### Security

Never display whether a sensitive account exists in a way that enables account enumeration where the authentication policy prohibits it.

---

## 5.2 Registration Role Selection

**Route:** `/register`

Two primary paths:

```text
Medical Store Owner
Supplier / Wholesaler
```

The selected role determines the onboarding workflow.

---

## 5.3 Buyer Registration

**Route:** `/register/buyer`

### Sections

- phone/email
- account credentials
- business/store information
- contact person
- GST/business information where applicable
- pharmaceutical licence information where applicable
- document upload

### API

```text
POST /auth/register
POST /auth/verify-otp
PATCH /buyer/profile
POST /buyer/documents
```

### UX

Break long onboarding into logical steps rather than one very long form.

---

# 6. Supplier Onboarding Screens

## 6.1 Supplier Registration

**Route:** `/register/supplier`

### Steps

```text
Account
 ↓
Business
 ↓
Licensing
 ↓
Documents
 ↓
Bank/Settlement
 ↓
Review
```

### API

```text
POST /auth/register
PATCH /suppliers/me/application
POST /suppliers/me/documents
POST /suppliers/me/submit-for-review
```

---

## 6.2 Supplier Verification Status

**Route:** `/supplier/onboarding/status`

### Display

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
REJECTED
SUSPENDED
```

### Requirements

Show actionable missing-document information where allowed.

Do not expose internal compliance notes.

---

# 7. Buyer Marketplace

## 7.1 Buyer Home

**Route:** `/buyer`

### Purpose

Primary marketplace landing screen.

### Layout

```text
Header
Search
Category shortcuts
Promotional/operational banner
Frequently purchased
Recommended products
Popular categories
Recent orders
```

### APIs

```text
GET /categories
GET /products
GET /orders
GET /notifications
```

### Performance

Critical above-the-fold content must load first.

Non-critical recommendation sections can load progressively.

---

# 8. Category Screen

**Route:** `/buyer/category/{categoryId}`

### Components

- category title
- child categories
- product grid/list
- filters
- sorting
- pagination/infinite loading

### API

```text
GET /categories/{categoryId}
GET /categories/{categoryId}/children
GET /products?categoryId=...
```

### Empty state

```text
No products available in this category.
```

Offer navigation to parent/all categories.

---

# 9. Search Screen

**Route:** `/buyer/search`

### Components

- search input
- suggestion dropdown
- recent searches
- filters
- result count
- product results
- sort
- pagination

### API

```text
GET /search/products
GET /search/suggestions
```

### Interaction

Search input should debounce requests.

### Empty state

Explain that no matching products were found and provide alternative navigation.

---

# 10. Product Detail Screen

**Route:** `/buyer/products/{productId}`

### Components

- product image gallery
- product name
- generic/brand information
- composition
- strength
- dosage form
- manufacturer
- pack size
- prescription/compliance indicators where applicable
- supplier availability
- price
- quantity selector
- add to cart
- availability message
- relevant storage information
- warnings where required

### API

```text
GET /products/{productId}
GET /products/{productId}/listings
```

### Important rule

The catalog product and supplier listing must remain distinct in the UI data model.

### States

- loading
- available
- temporarily unavailable
- no eligible supplier
- not found
- compliance-restricted

---

# 11. Supplier Listing Selection

When multiple eligible suppliers exist, the screen may show supplier choices or allow server-selected fulfillment depending on marketplace policy.

Possible information:

- availability
- commercial price
- estimated delivery
- supplier display information where permitted

The frontend must not choose a supplier based only on local logic when the backend has an authoritative allocation algorithm.

---

# 12. Cart Screen

**Route:** `/buyer/cart`

### Components

- cart items
- product thumbnail
- supplier/fulfillment summary where appropriate
- quantity controls
- availability warnings
- coupon
- subtotal
- discount
- tax
- delivery estimate/fee
- total
- checkout button

### APIs

```text
GET /cart
POST /cart/items
PATCH /cart/items/{itemId}
DELETE /cart/items/{itemId}
POST /cart/apply-coupon
DELETE /cart/coupon
```

### Empty state

```text
Your cart is empty.
```

Provide category/search navigation.

---

# 13. Checkout — Address Screen

**Route:** `/buyer/checkout/address`

### Components

- saved addresses
- add address
- edit address
- selected address
- continue

### APIs

```text
GET /buyer/addresses
POST /buyer/addresses
PATCH /buyer/addresses/{addressId}
DELETE /buyer/addresses/{addressId}
```

### Validation

The selected address must be valid for delivery.

---

# 14. Checkout — Delivery Screen

**Route:** `/buyer/checkout/delivery`

### Options

```text
Instant
Scheduled
```

### Scheduled

Display available slots:

```text
Morning
Afternoon
Evening
```

Actual slot definitions come from the API.

### API

```text
GET /delivery-slots
POST /orders/{orderId}/delivery-selection
```

For pre-order checkout, the implementation may maintain a checkout session/context until the order is created.

---

# 15. Checkout — Review Screen

**Route:** `/buyer/checkout/review`

### Display

- products
- quantities
- supplier allocation summary
- delivery address
- delivery mode
- delivery slot
- discounts
- tax
- delivery fee
- total payable

### API

```text
POST /checkout/quote
POST /checkout/validate
```

### Important

The screen must display server-calculated values.

---

# 16. Checkout — Payment Screen

**Route:** `/buyer/checkout/payment`

### Components

- available payment methods
- payable amount
- payment action
- payment status

### API

```text
POST /payments
GET /payments/{paymentId}
```

### States

```text
READY
INITIATING
AWAITING_PAYMENT
PROCESSING
PAID
FAILED
UNKNOWN
```

If status is uncertain, show verification rather than immediately reporting failure.

---

# 17. Order Confirmation Screen

**Route:** `/buyer/orders/{orderId}/confirmation`

### Display

- order number
- order status
- amount
- payment status
- delivery mode
- expected delivery
- order tracking button
- continue shopping

### API

```text
GET /orders/{orderId}
GET /orders/{orderId}/timeline
```

---

# 18. Buyer Orders Screen

**Route:** `/buyer/orders`

### Components

- order filters
- order cards
- status
- amount
- date
- delivery information
- reorder where permitted

### API

```text
GET /orders
```

### Empty state

Provide marketplace navigation.

---

# 19. Order Detail Screen

**Route:** `/buyer/orders/{orderId}`

### Sections

```text
Order summary
Items
Fulfillments
Payment
Delivery
Timeline
Returns
Support
```

### APIs

```text
GET /orders/{orderId}
GET /orders/{orderId}/items
GET /orders/{orderId}/fulfillments
GET /orders/{orderId}/timeline
GET /orders/{orderId}/delivery
GET /orders/{orderId}/refunds
```

---

# 20. Order Tracking Screen

**Route:** `/buyer/orders/{orderId}/tracking`

### Display

- current status
- delivery mode
- ETA where available
- tracking timeline
- delivery provider status where appropriate

### API

```text
GET /orders/{orderId}/tracking
```

### Refresh

Support real-time updates where available, plus periodic authoritative reconciliation.

---

# 21. Cancellation Screen/Modal

Cancellation may be implemented as a modal or dedicated screen depending on complexity.

### Flow

```text
Cancel order
 ↓
select reason
 ↓
confirm
 ↓
server validates
 ↓
show result
```

### API

```text
POST /orders/{orderId}/cancel
```

### Important

The UI must not promise cancellation before server confirmation.

---

# 22. Returns Screen

**Route:** `/buyer/orders/{orderId}/returns`

### Components

- eligible order items
- quantity
- reason
- evidence/attachments where required
- submission status

### API

```text
POST /orders/{orderId}/return-requests
GET /orders/{orderId}/return-requests
GET /returns/{returnId}
```

---

# 23. Buyer Account Screen

**Route:** `/buyer/account`

### Sections

```text
Business profile
Addresses
Documents
Notification preferences
Security
Support
Logout
```

### APIs

```text
GET /me
GET /buyer/profile
GET /buyer/addresses
GET /buyer/documents
GET /notification-preferences
```

---

# 24. Buyer Business Profile Screen

**Route:** `/buyer/account/profile`

### Editable fields

- store name
- legal name
- contact information
- GST/business information
- applicable licence details

### API

```text
GET /buyer/profile
PATCH /buyer/profile
```

---

# 25. Buyer Documents Screen

**Route:** `/buyer/account/documents`

### Components

- document list
- status
- expiry where applicable
- upload
- replace

### API

```text
GET /buyer/documents
POST /buyer/documents
DELETE /buyer/documents/{documentId}
```

---

# 26. Notifications Screen

**Route:** `/buyer/notifications`

### API

```text
GET /notifications
PATCH /notifications/{notificationId}/read
POST /notifications/read-all
```

### UX

Unread notifications should be visually distinct.

---

# 27. Supplier Portal

## 27.1 Supplier Dashboard

**Route:** `/supplier`

### Dashboard cards

```text
New Orders
Pending Fulfillment
Low Stock
Sales
Settlement
Verification
Operational Alerts
```

### API

```text
GET /supplier/dashboard
```

### Performance

Use a dedicated aggregate endpoint rather than many blocking requests.

---

# 28. Supplier Orders Screen

**Route:** `/supplier/orders`

### Components

- order filters
- status tabs
- order list
- search
- date filters

### API

```text
GET /supplier/orders
```

---

# 29. Supplier Order Detail

**Route:** `/supplier/orders/{orderId}`

### Display

- fulfillment items
- quantities
- buyer delivery information allowed for fulfillment
- packing instructions
- order status
- actions

### Actions

```text
Accept
Reject
Pack
Ready
```

### APIs

```text
GET /supplier/orders/{orderId}
POST /supplier/orders/{orderId}/accept
POST /supplier/orders/{orderId}/reject
```

Fulfillment transition endpoints should be used according to the final API contract.

---

# 30. Supplier Inventory Screen

**Route:** `/supplier/inventory`

### Components

- SKU/product search
- stock
- reserved
- available
- low-stock indicator
- batch/expiry information where required
- filters
- bulk update

### API

```text
GET /supplier/inventory
PATCH /supplier/inventory/{inventoryId}
POST /supplier/inventory/bulk-update
```

---

# 31. Supplier Inventory Import Screen

**Route:** `/supplier/inventory/import`

### Flow

```text
Select file
 ↓
Upload
 ↓
Validate
 ↓
Preview errors
 ↓
Confirm
 ↓
Process
 ↓
Results
```

### API

```text
POST /supplier/inventory/imports
GET /supplier/inventory/imports/{importId}
```

### UX

Show:

- total rows
- valid rows
- invalid rows
- processed rows
- failed rows
- downloadable error report where implemented

---

# 32. Supplier Product/Listings Screen

**Route:** `/supplier/products`

### Display

- supplier listings
- active/inactive
- price
- stock
- product status
- search/filter

### API

```text
GET /supplier/listings
POST /supplier/listings
PATCH /supplier/listings/{listingId}
```

---

# 33. Supplier Listing Editor

**Route:** `/supplier/products/{listingId}/edit`

### Sections

- product selection
- commercial price
- stock settings
- availability
- service areas
- applicable listing metadata

Catalog master data must not be casually duplicated into supplier-specific records.

---

# 34. Supplier Settlements Screen

**Route:** `/supplier/settlements`

### Display

- settlement period
- gross sales
- deductions
- commission
- adjustments
- net amount
- payout status

### API

```text
GET /supplier/settlements
GET /supplier/settlements/{settlementId}
```

---

# 35. Supplier Profile Screen

**Route:** `/supplier/profile`

### Sections

- business profile
- verification
- service areas
- documents
- bank/settlement information

Sensitive financial information must be masked.

---

# 36. Supplier Verification Documents Screen

**Route:** `/supplier/profile/documents`

### Display

- document type
- status
- submitted date
- expiry where applicable
- replacement/upload

### API

```text
GET /suppliers/me/documents
POST /suppliers/me/documents
```

---

# 37. Admin Dashboard

**Route:** `/admin`

### Dashboard areas

```text
Orders
GMV/revenue metrics
Active suppliers
Active buyers
Pending verification
Payment issues
Delivery issues
Returns
Disputes
Risk alerts
System alerts
```

Use backend aggregate/reporting APIs rather than performing expensive client-side aggregation.

---

# 38. Admin Users Screen

**Route:** `/admin/users`

### Features

- search
- filters
- role
- status
- user detail
- suspend/restore

### API

```text
GET /admin/users
GET /admin/users/{userId}
PATCH /admin/users/{userId}
POST /admin/users/{userId}/suspend
POST /admin/users/{userId}/restore
```

---

# 39. Admin Buyer Screen

**Route:** `/admin/buyers`

### Features

- buyer search
- verification status
- business information
- compliance status
- account status

### API

```text
GET /admin/buyers
GET /admin/buyers/{buyerId}
POST /admin/buyers/{buyerId}/verify
POST /admin/buyers/{buyerId}/suspend
```

---

# 40. Admin Supplier Screen

**Route:** `/admin/suppliers`

### Features

- supplier search
- verification queue
- status
- business details
- documents
- service areas
- operational status

### API

```text
GET /admin/suppliers
GET /admin/suppliers/{supplierId}
POST /admin/suppliers/{supplierId}/verify
POST /admin/suppliers/{supplierId}/reject
POST /admin/suppliers/{supplierId}/suspend
POST /admin/suppliers/{supplierId}/activate
```

---

# 41. Supplier Review Screen

**Route:** `/admin/suppliers/{supplierId}`

### Layout

```text
Supplier identity
Business information
Licences
Documents
Verification history
Service areas
Bank/settlement status
Operational history
Actions
```

Administrative actions require confirmation and reason capture where required.

---

# 42. Admin Catalog Screen

**Route:** `/admin/catalog/products`

### Features

- product search
- category filter
- manufacturer filter
- status
- moderation
- product creation/editing

### API

```text
GET /admin/products
POST /admin/products
PATCH /admin/products/{productId}
POST /admin/products/{productId}/approve
POST /admin/products/{productId}/reject
```

---

# 43. Admin Orders Screen

**Route:** `/admin/orders`

### Features

- search
- order state
- supplier
- buyer
- payment state
- delivery state
- date filters

### API

```text
GET /admin/orders
GET /admin/orders/{orderId}
POST /admin/orders/{orderId}/cancel
```

---

# 44. Admin Order Detail

**Route:** `/admin/orders/{orderId}`

### Sections

```text
Order
Items
Supplier fulfillments
Inventory reservations
Payment
Refunds
Delivery
Timeline
Support
Audit
Risk
```

This screen is an operational investigation surface and must expose only authorized information.

---

# 45. Admin Payments Screen

**Route:** `/admin/payments`

### Features

- payment search
- provider
- status
- amount
- order
- transaction/reference ID
- failure reason

### API

```text
GET /admin/payments
GET /admin/payments/{paymentId}
POST /admin/payments/{paymentId}/review
```

---

# 46. Admin Logistics Screen

**Route:** `/admin/logistics`

### Features

- active deliveries
- delayed deliveries
- provider status
- order/fulfillment
- delivery assignment
- reassign where supported

### API

```text
GET /admin/deliveries
GET /admin/deliveries/{deliveryId}
POST /admin/deliveries/{deliveryId}/reassign
```

---

# 47. Admin Returns Screen

**Route:** `/admin/returns`

### Features

- return queue
- eligibility
- status
- supplier
- buyer
- order
- reason

The screen should link to the original order and fulfillment.

---

# 48. Admin Disputes Screen

**Route:** `/admin/disputes`

### Features

- queue
- priority
- status
- buyer/supplier
- order
- evidence
- resolution

### API

```text
GET /admin/disputes
GET /admin/disputes/{disputeId}
POST /admin/disputes/{disputeId}/resolve
```

---

# 49. Admin Settlements Screen

**Route:** `/admin/settlements`

### Features

- settlement periods
- supplier
- amount
- status
- payout
- exceptions

Financial actions must show confirmation and audit context.

---

# 50. Admin Risk Screen

**Route:** `/admin/risk`

### Features

- flagged orders
- risk state
- review queue
- manual review
- resolution

Sensitive risk details should be permission-scoped.

---

# 51. Admin Audit Screen

**Route:** `/admin/audit`

### Filters

- actor
- entity type
- entity ID
- action
- date range

### API

```text
GET /admin/audit/events
```

Audit records should be read-only in the UI.

---

# 52. Admin Configuration Screen

**Route:** `/admin/configuration`

### Configuration areas

- delivery slots
- delivery fees
- instant delivery fee
- payment methods
- commissions
- promotions
- feature flags
- operational limits

### API

```text
GET /admin/configuration/{key}
PUT /admin/configuration/{key}
```

Changes require confirmation and audit logging.

---

# 53. Common Components

The following components should be shared across screens.

## Marketplace

```text
Header
SearchBar
CategoryStrip
ProductCard
ProductGrid
FilterPanel
SortSelector
PriceDisplay
AvailabilityBadge
QuantitySelector
```

## Commerce

```text
CartItem
CartSummary
AddressCard
DeliveryOption
DeliverySlotCard
CheckoutSummary
PaymentMethodCard
OrderCard
OrderTimeline
```

## Operations

```text
StatusBadge
DataTable
FilterBar
BulkActionBar
DocumentViewer
AuditTimeline
ConfirmDialog
ReasonDialog
```

## System

```text
PageLoader
Skeleton
EmptyState
ErrorState
RetryButton
Toast
Modal
Drawer
```

---

# 54. Responsive Behavior

## Desktop

Use:

- multi-column product grids
- persistent navigation where appropriate
- side filters
- dense operational tables

## Tablet

Use:

- adaptive grids
- collapsible filters
- compact navigation

## Mobile

Use:

- bottom navigation for buyer core actions
- stacked cards
- bottom sheets for filters
- simplified tables
- sticky checkout summary where useful
- touch-friendly controls

---

# 55. Mobile Buyer Bottom Navigation

Recommended:

```text
Home
Categories
Search
Cart
Account
```

Orders may be accessible through Account or a dedicated shortcut depending on final UX testing.

---

# 56. Mobile Supplier Navigation

Recommended:

```text
Dashboard
Orders
Inventory
Products
Account
```

Frequently used operational actions should be reachable quickly.

---

# 57. Screen Loading Standards

Each screen should avoid blocking on unrelated data.

Example buyer home:

```text
render shell
 ↓
render search
 ↓
render categories
 ↓
render primary products
 ↓
load recommendations
```

Do not wait for recommendation APIs before showing core marketplace content.

---

# 58. Empty-State Standards

Every list must define an intentional empty state.

Examples:

### Empty cart

```text
Your cart is empty.
Start by searching for a medicine.
```

### No orders

```text
You have no orders yet.
```

### No inventory

```text
No inventory records match your filters.
```

### No supplier listings

```text
This product is currently unavailable from eligible suppliers.
```

---

# 59. Error-State Standards

Errors must include:

- understandable message
- retry where safe
- support path where needed
- request ID/reference where appropriate

Do not expose stack traces or internal infrastructure details.

---

# 60. Accessibility Standards

Every screen must support:

- keyboard access on web
- screen-reader labels
- semantic controls
- focus management
- visible focus
- accessible errors
- touch targets
- sufficient contrast
- accessible modal/drawer behavior

---

# 61. Analytics by Screen

Recommended events:

### Marketplace

```text
home_viewed
category_viewed
search_performed
product_viewed
```

### Cart

```text
cart_viewed
cart_item_added
cart_item_removed
```

### Checkout

```text
checkout_started
address_selected
delivery_selected
payment_started
order_created
```

### Orders

```text
order_viewed
tracking_viewed
cancel_requested
return_requested
```

### Supplier

```text
supplier_dashboard_viewed
inventory_updated
listing_updated
order_accepted
order_rejected
```

Analytics must follow the privacy/data-governance requirements.

---

# 62. Screen Performance Budgets

The exact numeric budgets should be finalized and measured in CI/observability, but implementation must explicitly monitor:

- initial render
- useful content visibility
- route transition
- search response
- product detail load
- cart mutation
- checkout transition
- order tracking refresh

The target is a consistently responsive experience rather than an unmeasurable promise of literal zero latency.

---

# 63. Navigation Architecture

The frontend should use protected route groups.

Conceptually:

```text
(public)
(auth)
(buyer)
(supplier)
(admin)
```

Route-level authorization must be paired with API authorization.

---

# 64. Deep Linking

Mobile should support deep links for:

- product
- category
- order
- notification
- supplier workflow where appropriate

Example:

```text
bezzo://product/{productId}
bezzo://order/{orderId}
```

Web links should resolve to equivalent pages.

---

# 65. Session Expiry UX

If a session expires:

```text
save safe navigation context
 ↓
attempt refresh
 ↓
if failed:
 show login
 ↓
after login:
return to permitted destination
```

Do not expose private data while the session is unresolved.

---

# 66. Destructive Action UX

Actions such as:

- account deletion
- supplier suspension
- order cancellation
- refund
- payout
- configuration changes

should require appropriate confirmation.

Financial and administrative actions may additionally require:

- reason
- second confirmation
- elevated permission

---

# 67. Frontend Implementation Checklist Per Screen

Before coding a screen, define:

```text
Route
Role
Purpose
Entry points
API dependencies
Query keys
Mutations
Permissions
Components
Loading
Empty
Error
Offline
Analytics
Accessibility
Responsive behavior
Performance budget
Tests
```

---

# 68. Definition of Ready

A screen is ready for implementation when:

- UX flow is approved
- API dependencies exist or are contract-defined
- required data fields are known
- permission rules are known
- empty/error states are defined
- mobile/web behavior is defined
- analytics requirements are known

---

# 69. Definition of Done

A screen is complete when:

- responsive implementation works
- API integration is complete
- loading/empty/error states exist
- authorization behavior is correct
- accessibility checks pass
- unit/component tests pass
- critical E2E coverage exists
- performance is acceptable
- analytics are implemented where required
- no sensitive information leaks
- code review is approved

---

# 70. Recommended Implementation Sequence

## Stage 1 — Application foundation

1. global shell
2. authentication
3. session restoration
4. role routing
5. design system primitives

## Stage 2 — Buyer marketplace

6. home
7. categories
8. search
9. product detail
10. cart

## Stage 3 — Checkout

11. address
12. delivery
13. review
14. payment
15. confirmation

## Stage 4 — Orders

16. order list
17. order detail
18. tracking
19. cancellation
20. returns

## Stage 5 — Supplier

21. onboarding
22. dashboard
23. orders
24. inventory
25. products/listings
26. settlements
27. profile

## Stage 6 — Admin

28. dashboard
29. users
30. buyers
31. suppliers
32. catalog
33. orders
34. payments
35. logistics
36. returns
37. disputes
38. settlements
39. risk
40. audit
41. configuration

---

# 71. Final Engineering Position

Bezzo should be implemented screen-by-screen against stable API contracts rather than building an uncontrolled collection of UI pages.

Every screen must have a defined relationship between:

```text
User
 ↓
Route
 ↓
Feature
 ↓
Query/Mutation
 ↓
API
 ↓
Domain state
 ↓
UI state
```

The buyer experience should remain fast, simple and marketplace-oriented. The supplier experience should prioritize operational throughput. The admin experience should prioritize controlled investigation and action.

All three experiences must share the same design system, API contracts, authentication model, observability standards and security boundaries while maintaining strict role-specific data access.

This specification is the baseline for converting Bezzo's product requirements into an implementable frontend screen inventory.

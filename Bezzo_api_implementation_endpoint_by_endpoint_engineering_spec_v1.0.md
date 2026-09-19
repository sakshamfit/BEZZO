# Bezzo API Implementation & Endpoint-by-Endpoint Engineering Specification v1.0

**Product:** Bezzo B2B Pharmaceutical Marketplace  
**Document Type:** API Engineering Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Primary API Style:** REST/JSON over HTTPS  
**API Version:** `/api/v1`  
**Backend:** Node.js + NestJS + TypeScript  
**Primary Database:** PostgreSQL  
**Cache/Coordination:** Redis  
**Search:** OpenSearch-compatible  
**Object Storage:** S3-compatible  
**Audience:** Backend engineers, frontend/mobile engineers, QA, DevOps, security, product and technical leads

---

## 1. Purpose

This document defines the implementation-level API contract for Bezzo.

It converts the previously defined product, architecture, database, security, order, inventory, payment, logistics, notification, support, and administrative requirements into an endpoint-oriented engineering contract.

The API must support:

- medical-store buyers
- verified pharmaceutical suppliers/wholesalers
- supplier-specific catalog and inventory
- product discovery and search
- cart and checkout
- multi-supplier order fulfillment
- payments and refunds
- scheduled and instant delivery
- Porter integration through a logistics abstraction
- notifications
- returns and disputes
- promotions and commercial rules
- supplier settlements
- administrative operations
- auditability
- future ERP/POS/API integrations

The API is a backend contract. UI behavior must consume these contracts rather than implement business rules independently.

---

# 2. API Design Principles

## 2.1 Contract-first

API contracts should be defined in OpenAPI and reviewed before implementation.

Required workflow:

1. define endpoint contract
2. define request/response schemas
3. define authorization rules
4. define business-state transitions
5. define validation and error behavior
6. generate/update OpenAPI
7. implement
8. write automated tests
9. integrate frontend/mobile clients

## 2.2 Server-authoritative business rules

Clients must never be trusted for:

- price
- stock availability
- supplier selection
- discount calculation
- tax calculation
- payment success
- delivery fee
- fulfillment assignment
- refund amount
- settlement amount
- permissions
- compliance status

The server recalculates or verifies these values.

## 2.3 Tenant and ownership isolation

Every authenticated request must be evaluated against:

- user identity
- organization/store/supplier ownership
- role
- resource ownership
- resource status
- operation scope

A buyer must never be able to access another buyer's order, address, documents, or account data.

A supplier must never be able to access another supplier's private inventory, purchase costs, settlement records, or operational data unless explicitly authorized by an administrative workflow.

## 2.4 Idempotency

Mutation endpoints that may be retried must support idempotency where duplicate execution could create financial, inventory, order, fulfillment, or notification side effects.

Primary candidates:

- checkout/order creation
- payment initiation
- refund
- return creation
- supplier payout action
- inventory reservation
- logistics booking
- bulk import
- administrative state transitions

## 2.5 Explicit state machines

The API must reject illegal state transitions.

Examples:

- CANCELLED order cannot become CONFIRMED
- REFUNDED payment cannot become PAID
- EXPIRED reservation cannot be fulfilled
- REJECTED supplier cannot be activated without a valid administrative workflow

## 2.6 Stable external contracts

Internal implementation may change, but public API contracts should remain backward compatible within a major API version.

---

# 3. Base API Structure

Base URL:

```text
https://api.bezzo.com/api/v1
```

Environment-specific domains/configuration may differ.

All API traffic must use HTTPS.

Example:

```http
GET /api/v1/products
Authorization: Bearer <access_token>
X-Request-ID: 2b7c...
```

---

# 4. Standard Headers

## 4.1 Request headers

Required or recommended headers:

```text
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
X-Request-ID: <uuid>
X-Client-Platform: web | android | ios | admin
X-Client-Version: <version>
Idempotency-Key: <uuid>
```

`Idempotency-Key` is required for endpoints explicitly marked as idempotent mutations.

## 4.2 Response headers

Recommended:

```text
X-Request-ID: <uuid>
ETag: <etag>
Cache-Control: <policy>
Retry-After: <seconds>
```

---

# 5. Authentication Model

Bezzo uses token-based authentication.

Recommended model:

- short-lived access token
- rotating refresh token
- secure refresh-token storage
- server-side refresh-token family tracking
- revocation support
- device/session tracking

Access tokens must not contain sensitive data unnecessarily.

JWT claims should be minimal, for example:

```json
{
  "sub": "user_uuid",
  "sid": "session_uuid",
  "role": "BUYER",
  "iat": 0,
  "exp": 0
}
```

Authorization must still be checked against current server state.

---

# 6. Roles

Core roles:

```text
BUYER
SUPPLIER
ADMIN
SUPPORT_AGENT
OPERATIONS_AGENT
FINANCE_AGENT
COMPLIANCE_AGENT
SUPER_ADMIN
```

Roles are not sufficient by themselves for sensitive operations.

Authorization must combine:

```text
role + permission + resource ownership + resource state
```

---

# 7. Standard Response Envelope

For successful non-list operations:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

For lists:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "uuid",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 120,
      "totalPages": 6
    }
  }
}
```

For cursor pagination:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "uuid",
    "pagination": {
      "nextCursor": "opaque_cursor",
      "hasMore": true
    }
  }
}
```

---

# 8. Error Contract

All expected API errors use:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_CANCELLABLE",
    "message": "The order cannot be cancelled in its current state.",
    "details": {
      "currentStatus": "OUT_FOR_DELIVERY"
    },
    "fieldErrors": []
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

## 8.1 Standard HTTP status mapping

| Status | Meaning |
|---|---|
| 400 | malformed or invalid request |
| 401 | authentication required/invalid |
| 403 | authenticated but not permitted |
| 404 | resource not found or intentionally hidden |
| 409 | state/conflict/idempotency conflict |
| 422 | semantic validation failure |
| 429 | rate limit exceeded |
| 500 | unexpected server error |
| 502 | upstream integration failure |
| 503 | temporary service unavailable |

Error codes must be stable machine-readable identifiers.

---

# 9. Pagination

Default list pagination:

```text
page=1
pageSize=20
```

Maximum page size should be enforced server-side.

High-volume operational APIs should prefer cursor pagination.

Never allow arbitrary unlimited result sets.

---

# 10. Filtering, Sorting and Search

Filters must be explicitly allow-listed.

Example:

```text
GET /products?categoryId=...&manufacturerId=...&dosageForm=TABLET
```

Sorting must use supported fields only:

```text
sort=price_asc
sort=price_desc
sort=relevance
sort=created_desc
```

Clients must not send raw SQL-like expressions.

---

# 11. API Modules

Primary API modules:

1. Authentication and sessions
2. Users and accounts
3. Buyer profiles
4. Supplier onboarding
5. Supplier operations
6. Catalog
7. Supplier listings
8. Inventory
9. Search
10. Cart
11. Checkout
12. Orders
13. Fulfillments
14. Payments
15. Billing
16. Logistics
17. Notifications
18. Returns/refunds
19. Promotions
20. Supplier settlements
21. Support/disputes
22. Fraud/risk
23. Admin/backoffice
24. Audit
25. Configuration
26. Health/operations
27. Integration/webhooks

---

# 12. Authentication API

## POST `/auth/register`

Creates a user account and starts onboarding.

**Auth:** Public

Request:

```json
{
  "phone": "+91XXXXXXXXXX",
  "email": "optional@example.com",
  "password": "optional",
  "role": "BUYER"
}
```

Response:

```json
{
  "userId": "uuid",
  "verificationRequired": true
}
```

Validation:

- phone/email uniqueness
- supported role
- credential policy
- anti-abuse controls

---

## POST `/auth/verify-otp`

Verifies OTP.

**Auth:** Public

Request:

```json
{
  "challengeId": "uuid",
  "otp": "123456"
}
```

Response:

```json
{
  "verified": true,
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

## POST `/auth/login`

Authenticates an existing user.

**Auth:** Public

---

## POST `/auth/refresh`

Rotates refresh token and issues a new access token.

**Auth:** Refresh token

---

## POST `/auth/logout`

Terminates current session.

**Auth:** Authenticated

---

## POST `/auth/logout-all`

Terminates all user sessions.

**Auth:** Authenticated

---

## GET `/auth/sessions`

Lists active sessions.

**Auth:** Authenticated

---

## DELETE `/auth/sessions/{sessionId}`

Revokes a selected session.

**Auth:** Authenticated + ownership

---

# 13. User and Account APIs

## GET `/me`

Returns authenticated user summary.

## PATCH `/me`

Updates permitted profile fields.

## GET `/me/security`

Returns security/session configuration metadata.

## PATCH `/me/password`

Changes password where password authentication is enabled.

## DELETE `/me`

Starts account deletion/deactivation workflow subject to retention requirements.

Deletion must not bypass legally required records.

---

# 14. Buyer APIs

## GET `/buyer/profile`

Returns buyer business profile.

## PATCH `/buyer/profile`

Updates buyer business profile.

Potential fields:

```text
storeName
legalName
businessType
gstin
drugLicenseDetails
contactPerson
phone
email
```

Sensitive documents should not be returned as unrestricted raw objects.

---

## POST `/buyer/documents`

Uploads a buyer compliance document.

**Content:** multipart/form-data or pre-signed object-storage workflow.

---

## GET `/buyer/documents`

Lists buyer documents and verification status.

---

## DELETE `/buyer/documents/{documentId}`

Deletes/replaces a document where allowed.

---

## GET `/buyer/addresses`

Lists delivery addresses.

## POST `/buyer/addresses`

Creates address.

## GET `/buyer/addresses/{addressId}`

Gets owned address.

## PATCH `/buyer/addresses/{addressId}`

Updates owned address.

## DELETE `/buyer/addresses/{addressId}`

Deletes address if not blocked by active orders or legal retention.

---

# 15. Supplier Onboarding APIs

## POST `/suppliers/applications`

Creates supplier onboarding application.

## GET `/suppliers/me/application`

Returns current supplier application.

## PATCH `/suppliers/me/application`

Updates onboarding information.

## POST `/suppliers/me/documents`

Uploads supplier verification document.

## GET `/suppliers/me/documents`

Lists supplier documents.

## POST `/suppliers/me/submit-for-review`

Submits application.

State transitions must be enforced.

---

# 16. Supplier Profile and Operations APIs

## GET `/suppliers/me`

Returns supplier profile.

## PATCH `/suppliers/me`

Updates permitted supplier profile data.

## GET `/suppliers/me/service-areas`

Lists supported delivery/service areas.

## PUT `/suppliers/me/service-areas`

Replaces service-area configuration.

## GET `/suppliers/me/dashboard`

Returns supplier dashboard aggregates.

Dashboard data must be optimized and should not require many sequential client requests.

---

# 17. Catalog APIs

## GET `/categories`

Returns active medicine categories.

## GET `/categories/{categoryId}`

Returns category details.

## GET `/categories/{categoryId}/children`

Returns child categories.

## GET `/manufacturers`

Lists manufacturers.

## GET `/manufacturers/{manufacturerId}`

Returns manufacturer details.

## GET `/products`

Public/authenticated catalog discovery endpoint.

Supported filters may include:

```text
query
categoryId
manufacturerId
dosageForm
strength
prescriptionRequired
availability
```

The endpoint must return only products/listings appropriate for the requesting buyer and compliance rules.

## GET `/products/{productId}`

Returns product detail.

---

# 18. Supplier Listing APIs

A product is the canonical catalog entity; supplier listings represent supplier-specific commercial availability.

## GET `/products/{productId}/listings`

Returns eligible supplier listings.

Sensitive supplier information must be filtered according to marketplace policy.

## GET `/supplier/listings`

Lists current supplier's listings.

## POST `/supplier/listings`

Creates supplier listing.

## GET `/supplier/listings/{listingId}`

Returns supplier-owned listing.

## PATCH `/supplier/listings/{listingId}`

Updates listing.

## POST `/supplier/listings/{listingId}/activate`

Activates listing.

## POST `/supplier/listings/{listingId}/pause`

Pauses listing.

---

# 19. Inventory APIs

## GET `/supplier/inventory`

Returns supplier inventory.

## GET `/supplier/inventory/{inventoryId}`

Returns one inventory record.

## PATCH `/supplier/inventory/{inventoryId}`

Updates stock.

The server must validate:

- quantity
- batch/expiry information where applicable
- listing status
- supplier ownership
- inventory rules

## POST `/supplier/inventory/bulk-update`

Bulk inventory update.

Requires validation and partial-failure reporting.

## POST `/supplier/inventory/imports`

Starts CSV/API/import workflow.

## GET `/supplier/inventory/imports/{importId}`

Returns import status.

---

# 20. Stock Reservation APIs

Reservations are primarily internal/backend operations.

## POST `/internal/inventory/reservations`

Creates reservation.

## POST `/internal/inventory/reservations/{reservationId}/release`

Releases reservation.

## POST `/internal/inventory/reservations/{reservationId}/commit`

Commits reserved stock.

These endpoints must be restricted to trusted backend services or privileged internal roles.

---

# 21. Search APIs

## GET `/search/products`

Searches product catalog.

Parameters:

```text
q
categoryId
manufacturerId
availability
page
pageSize
```

Search must support:

- typo tolerance where appropriate
- synonyms
- generic/brand lookup
- composition search
- structured filters
- relevance ranking
- pagination

Search results must still be filtered by authoritative database/business rules before purchase.

---

## GET `/search/suggestions`

Returns lightweight suggestions.

Response should be small and cacheable.

---

# 22. Cart APIs

## GET `/cart`

Returns current buyer cart.

## POST `/cart/items`

Adds item.

Request:

```json
{
  "listingId": "uuid",
  "quantity": 10
}
```

Server revalidates listing and stock.

## PATCH `/cart/items/{itemId}`

Updates quantity.

## DELETE `/cart/items/{itemId}`

Removes item.

## DELETE `/cart`

Clears cart.

---

# 23. Checkout APIs

## POST `/checkout/quote`

Generates a server-side checkout quote.

The quote must include:

- item totals
- supplier allocation
- discounts
- tax
- delivery fee
- payment amount
- warnings
- expiry time

The quote is not proof of successful payment.

---

## POST `/checkout/validate`

Revalidates cart and checkout constraints immediately before order creation.

---

## POST `/orders`

Creates order from validated checkout.

**Idempotency:** Required

The server must:

1. validate buyer
2. validate address
3. validate compliance restrictions
4. revalidate prices
5. revalidate inventory
6. reserve stock
7. calculate final totals
8. create order
9. create supplier fulfillments
10. initiate payment where applicable
11. emit domain events

A failed transaction must not leave inconsistent stock/order state.

---

# 24. Order APIs

## GET `/orders`

Buyer order history.

## GET `/orders/{orderId}`

Returns buyer-owned order.

## POST `/orders/{orderId}/cancel`

Requests cancellation.

**Idempotency:** Required

Cancellation must respect order state and fulfillment progress.

## GET `/orders/{orderId}/items`

Returns order items.

## GET `/orders/{orderId}/timeline`

Returns customer-visible order timeline.

---

# 25. Supplier Order APIs

## GET `/supplier/orders`

Returns supplier-owned order/fulfillment records.

## GET `/supplier/orders/{orderId}`

Returns supplier-authorized order details.

Supplier API must not expose unrelated supplier information.

## POST `/supplier/orders/{orderId}/accept`

Accepts fulfillment where supplier confirmation is required.

## POST `/supplier/orders/{orderId}/reject`

Rejects fulfillment with structured reason.

---

# 26. Fulfillment APIs

## GET `/orders/{orderId}/fulfillments`

Returns customer-visible fulfillment information.

## GET `/fulfillments/{fulfillmentId}`

Returns fulfillment detail according to caller permissions.

## POST `/internal/fulfillments/{fulfillmentId}/assign`

Assigns supplier fulfillment.

## POST `/internal/fulfillments/{fulfillmentId}/pack`

Marks fulfillment packed.

## POST `/internal/fulfillments/{fulfillmentId}/ready`

Marks fulfillment ready for dispatch.

## POST `/internal/fulfillments/{fulfillmentId}/cancel`

Cancels fulfillment.

---

# 27. Payment APIs

## POST `/payments`

Creates payment attempt for an order.

**Idempotency:** Required

## GET `/payments/{paymentId}`

Returns payment status.

## POST `/payments/{paymentId}/retry`

Creates/restarts an eligible payment attempt.

## POST `/payments/{paymentId}/cancel`

Cancels an eligible payment.

Payment success must never be determined solely from a client redirect.

---

# 28. Payment Webhooks

## POST `/webhooks/payments/{provider}`

Receives provider callbacks.

Requirements:

- signature verification
- replay protection
- event idempotency
- raw payload retention according to policy
- mapping provider status to internal status
- audit record
- asynchronous processing where safe

Webhook processing must be safe when the same event is delivered multiple times.

---

# 29. Refund APIs

## POST `/orders/{orderId}/refund-request`

Creates refund request where buyer workflow permits.

## GET `/orders/{orderId}/refunds`

Lists refunds visible to buyer.

## POST `/internal/refunds`

Creates administrative/system refund.

**Idempotency:** Required

Refund amount must be calculated server-side.

---

# 30. Billing and Invoice APIs

## GET `/orders/{orderId}/invoice`

Returns invoice metadata/download workflow.

## GET `/orders/{orderId}/billing`

Returns billing summary.

## GET `/supplier/settlements/{settlementId}/statement`

Returns supplier financial statement.

Invoice generation should be asynchronous where document generation is expensive.

---

# 31. Logistics APIs

## GET `/delivery-slots`

Returns available scheduled delivery slots for the selected address/order context.

## POST `/orders/{orderId}/delivery-selection`

Selects instant or scheduled delivery.

Request:

```json
{
  "mode": "SCHEDULED",
  "slotId": "uuid"
}
```

or:

```json
{
  "mode": "INSTANT"
}
```

Delivery availability must be recalculated server-side.

---

## GET `/orders/{orderId}/delivery`

Returns delivery status.

## GET `/orders/{orderId}/tracking`

Returns customer tracking timeline.

---

# 32. Porter Integration APIs

Porter must be hidden behind the logistics adapter.

Internal integration interface:

```text
createDelivery()
cancelDelivery()
getDeliveryStatus()
getTracking()
estimateDelivery()
```

External API endpoints should not expose provider-specific implementation details.

---

# 33. Logistics Webhooks

## POST `/webhooks/logistics/{provider}`

Responsibilities:

- verify provider signature where supported
- deduplicate event
- update internal delivery state
- update order/fulfillment state
- emit notification event
- append audit entry

---

# 34. Notification APIs

## GET `/notifications`

Returns in-app notifications.

## PATCH `/notifications/{notificationId}/read`

Marks notification read.

## POST `/notifications/read-all`

Marks notifications read.

## GET `/notification-preferences`

Returns user notification preferences.

## PATCH `/notification-preferences`

Updates permitted preferences.

Notification delivery should be asynchronous.

---

# 35. Returns APIs

## POST `/orders/{orderId}/return-requests`

Creates return request.

Request:

```json
{
  "items": [
    {
      "orderItemId": "uuid",
      "quantity": 2
    }
  ],
  "reasonCode": "DAMAGED"
}
```

The server determines eligibility.

## GET `/orders/{orderId}/return-requests`

Lists return requests.

## GET `/returns/{returnId}`

Returns return status.

## POST `/returns/{returnId}/cancel`

Cancels an eligible return request.

---

# 36. Promotions APIs

## GET `/promotions`

Returns promotions applicable to the buyer/context.

## POST `/cart/apply-coupon`

Applies coupon to current cart.

## DELETE `/cart/coupon`

Removes coupon.

Promotion calculation must be server-authoritative.

Supplier-specific and marketplace-funded discounts must remain distinguishable internally for settlement purposes.

---

# 37. Supplier Settlement APIs

These are primarily private supplier/admin APIs.

## GET `/supplier/settlements`

Lists supplier settlements.

## GET `/supplier/settlements/{settlementId}`

Returns settlement detail.

## GET `/supplier/settlements/{settlementId}/transactions`

Returns underlying transactions.

## POST `/internal/settlements/{settlementId}/approve`

Approves settlement.

## POST `/internal/settlements/{settlementId}/payout`

Initiates payout.

**Idempotency:** Required

Financial records must be immutable after posting except through compensating entries.

---

# 38. Support APIs

## POST `/support/tickets`

Creates support ticket.

## GET `/support/tickets`

Lists caller's tickets.

## GET `/support/tickets/{ticketId}`

Gets ticket.

## POST `/support/tickets/{ticketId}/messages`

Adds ticket message.

## POST `/support/tickets/{ticketId}/attachments`

Uploads attachment.

Support access must be role-scoped and audited.

---

# 39. Dispute APIs

## POST `/orders/{orderId}/disputes`

Creates dispute.

## GET `/orders/{orderId}/disputes`

Lists disputes.

## GET `/disputes/{disputeId}`

Gets dispute.

## POST `/internal/disputes/{disputeId}/resolve`

Resolves dispute.

Resolution must create appropriate financial/order audit events where applicable.

---

# 40. Fraud and Risk APIs

Risk endpoints are primarily internal.

## POST `/internal/risk/evaluate-order`

Evaluates order risk.

## GET `/internal/risk/orders/{orderId}`

Returns risk evaluation.

## POST `/internal/risk/orders/{orderId}/review`

Creates/manualizes review.

Sensitive risk data must never be exposed to ordinary buyers or suppliers.

---

# 41. Admin APIs

All admin endpoints require explicit permissions.

## Users

```text
GET    /admin/users
GET    /admin/users/{userId}
PATCH  /admin/users/{userId}
POST   /admin/users/{userId}/suspend
POST   /admin/users/{userId}/restore
```

## Suppliers

```text
GET    /admin/suppliers
GET    /admin/suppliers/{supplierId}
POST   /admin/suppliers/{supplierId}/verify
POST   /admin/suppliers/{supplierId}/reject
POST   /admin/suppliers/{supplierId}/suspend
POST   /admin/suppliers/{supplierId}/activate
```

## Buyers

```text
GET    /admin/buyers
GET    /admin/buyers/{buyerId}
POST   /admin/buyers/{buyerId}/verify
POST   /admin/buyers/{buyerId}/suspend
```

## Catalog

```text
GET    /admin/products
POST   /admin/products
PATCH  /admin/products/{productId}
POST   /admin/products/{productId}/approve
POST   /admin/products/{productId}/reject
```

## Orders

```text
GET    /admin/orders
GET    /admin/orders/{orderId}
POST   /admin/orders/{orderId}/cancel
```

## Payments

```text
GET    /admin/payments
GET    /admin/payments/{paymentId}
POST   /admin/payments/{paymentId}/review
```

## Logistics

```text
GET    /admin/deliveries
GET    /admin/deliveries/{deliveryId}
POST   /admin/deliveries/{deliveryId}/reassign
```

## Disputes

```text
GET    /admin/disputes
GET    /admin/disputes/{disputeId}
POST   /admin/disputes/{disputeId}/resolve
```

---

# 42. Audit APIs

Audit data is sensitive.

## GET `/admin/audit/events`

Supports controlled filters:

```text
actorId
entityType
entityId
action
dateFrom
dateTo
```

Audit logs must not be mutable through ordinary application APIs.

---

# 43. Configuration APIs

Administrative configuration may include:

- delivery slot definitions
- delivery fees
- instant delivery surcharge
- payment methods
- marketplace commission
- promotional limits
- feature flags
- order thresholds
- supported service areas

## GET `/admin/configuration/{key}`

## PUT `/admin/configuration/{key}`

Configuration changes must be audited.

Sensitive secrets must never be exposed through configuration APIs.

---

# 44. Health and Operational APIs

## GET `/health`

Basic liveness response.

## GET `/ready`

Readiness response including required dependencies.

Example:

```json
{
  "status": "ready",
  "dependencies": {
    "database": "ok",
    "redis": "ok",
    "search": "ok"
  }
}
```

Do not expose credentials, internal hostnames, stack traces, or sensitive infrastructure information.

---

# 45. Webhook Security

All inbound webhooks must support:

1. provider authentication/signature verification
2. timestamp/replay validation where supported
3. event ID deduplication
4. payload validation
5. audit logging
6. controlled retry
7. dead-letter handling for persistent failures

Webhook handlers must be small and deterministic.

Recommended pattern:

```text
receive
→ verify
→ persist event
→ acknowledge
→ process asynchronously
```

where provider timeout constraints make asynchronous processing appropriate.

---

# 46. API Rate Limiting

Rate limits should vary by operation.

Examples:

| API class | Strategy |
|---|---|
| Login/OTP | strict per IP + identity |
| Search | moderate |
| Product detail | moderate/high |
| Cart | moderate |
| Checkout | strict |
| Payment | strict |
| Admin | strict |
| Webhooks | provider-aware |
| Health | high but protected |

Rate-limit responses use HTTP 429.

---

# 47. API Security Requirements

Must implement:

- HTTPS
- secure headers
- authentication middleware
- authorization guards
- input validation
- output serialization
- SQL parameterization/ORM safety
- upload validation
- malware scanning where applicable
- SSRF protections for server-side URL fetching
- webhook signature verification
- brute-force protection
- rate limiting
- audit logging
- secrets management
- PII minimization
- sensitive-field redaction in logs

Never log:

- passwords
- OTP values
- access tokens
- refresh tokens
- payment credentials
- full sensitive identity documents

---

# 48. File Upload API Pattern

Large documents/images should use object storage rather than sending large binary payloads through application servers where practical.

Pattern:

```text
POST /uploads/presign
        ↓
client uploads directly to object storage
        ↓
POST /uploads/complete
        ↓
server validates object
        ↓
domain entity references object
```

Upload authorization must bind the object to:

- user
- organization/supplier
- document type
- expected MIME type
- maximum size
- lifecycle

---

# 49. API Caching

Cacheable endpoints include:

- categories
- manufacturer summaries
- product detail where appropriate
- search suggestions
- configuration that is intentionally public

Do not cache private responses across users.

Never use shared caches for sensitive user-specific responses without strict cache-key isolation.

---

# 50. Concurrency Requirements

Critical concurrent operations:

- stock reservation
- cart checkout
- coupon redemption
- payment state transition
- refund
- supplier acceptance
- delivery assignment

Use database transactions, row/version locking, atomic Redis operations, or other appropriate mechanisms.

Inventory must never rely on a read-then-write sequence without concurrency control.

---

# 51. Transaction Boundaries

Order creation transaction should cover the minimum authoritative set of changes required for consistency.

Conceptual flow:

```text
BEGIN
  validate order
  lock/check stock
  reserve inventory
  create order
  create order items
  create fulfillments
  create financial pending records
COMMIT
```

External payment or logistics calls should generally occur outside long-running database transactions.

Use state machines and retryable orchestration for external calls.

---

# 52. Async Processing

Use asynchronous workers for:

- notifications
- search indexing
- invoice generation
- bulk catalog import
- inventory import processing
- webhook post-processing
- analytics events
- settlement generation
- document processing
- logistics status synchronization

Do not block checkout on non-essential asynchronous work.

---

# 53. Observability

Every API request should have:

```text
requestId
userId where authenticated
route
method
status
duration
service/module
errorCode where applicable
```

Metrics:

- request rate
- latency p50/p95/p99
- error rate
- 4xx/5xx rate
- rate-limit events
- checkout failures
- payment failures
- inventory reservation failures
- webhook failures
- queue depth

Sensitive values must be redacted.

---

# 54. API Versioning

Current version:

```text
/api/v1
```

Breaking changes require a new major API version.

Non-breaking changes may include:

- adding optional response fields
- adding optional request fields
- adding new endpoints
- adding new enum values only when clients are designed to tolerate them

Clients should not assume unknown fields or enum values can never appear.

---

# 55. Deprecation

Deprecated endpoints must include:

```text
Deprecation: true
Sunset: <date>
```

Documentation must provide replacement endpoint information.

Deprecation should be announced before removal.

---

# 56. OpenAPI Requirements

The API implementation must produce an OpenAPI document covering:

- paths
- methods
- parameters
- request bodies
- response schemas
- authentication
- authorization requirements
- error schemas
- examples
- pagination
- idempotency requirements

The OpenAPI document becomes the primary machine-readable API contract.

Recommended repository structure:

```text
docs/
  openapi/
    bezzo-v1.yaml
```

or generated from decorators/schema definitions where the generated output is validated in CI.

---

# 57. DTO and Validation Standards

Every endpoint request must use a validated DTO/schema.

Validation must include:

- required fields
- string length
- enum membership
- numeric range
- date/time validity
- UUID format
- nested object validation
- conditional validation
- business-specific semantic validation

Do not trust TypeScript types as runtime validation.

---

# 58. Controller/Service/Repository Separation

Recommended NestJS layering:

```text
Controller
   ↓
Application Service
   ↓
Domain/Business Service
   ↓
Repository / External Adapter
```

Controllers should not contain complex business logic.

Example:

```text
OrderController
  → CreateOrderService
      → PricingService
      → InventoryReservationService
      → FulfillmentService
      → PaymentOrchestrator
```

---

# 59. External Adapter Pattern

External providers must be hidden behind interfaces.

Example:

```ts
interface PaymentGateway {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  refund(input: RefundPaymentInput): Promise<RefundResult>;
}
```

Likewise:

```ts
interface LogisticsProvider {
  createDelivery(input: CreateDeliveryInput): Promise<DeliveryResult>;
  cancelDelivery(input: CancelDeliveryInput): Promise<void>;
  getStatus(input: GetDeliveryStatusInput): Promise<DeliveryStatus>;
}
```

Porter is one implementation of the logistics interface, not the core domain model.

---

# 60. API Contract for Multi-Supplier Orders

The customer-facing order should remain a single order.

Example:

```json
{
  "orderId": "ORDER-123",
  "status": "CONFIRMED",
  "fulfillments": [
    {
      "fulfillmentId": "FUL-1",
      "status": "READY",
      "supplierDisplayName": "Supplier A"
    },
    {
      "fulfillmentId": "FUL-2",
      "status": "PACKED",
      "supplierDisplayName": "Supplier B"
    }
  ]
}
```

Internal supplier-specific data must not leak unnecessarily.

---

# 61. API Contract for Scheduled Delivery

Example:

```json
{
  "mode": "SCHEDULED",
  "deliveryDate": "2026-09-20",
  "slot": {
    "id": "slot_uuid",
    "label": "Morning"
  }
}
```

The server must validate:

- address coverage
- slot availability
- cutoff time
- supplier readiness
- operational capacity
- holiday/blackout configuration
- route constraints

---

# 62. API Contract for Instant Delivery

Example:

```json
{
  "mode": "INSTANT",
  "estimatedMinutes": 60,
  "fee": {
    "amount": 30,
    "currency": "INR"
  }
}
```

The fee and ETA are server-calculated/configured and must not be trusted from the client.

The ₹30 example is configuration, not a hard-coded business rule.

---

# 63. API Testing Requirements

Every endpoint requires:

### Unit tests

- validation
- business rules
- state transitions
- calculations

### Integration tests

- database
- Redis
- object storage
- search
- payment adapter
- logistics adapter

### API tests

- success response
- validation failure
- authentication failure
- authorization failure
- ownership isolation
- duplicate request
- concurrent request
- state conflict

### Security tests

- IDOR/BOLA
- privilege escalation
- injection
- broken access control
- rate-limit bypass
- token abuse
- file upload abuse

---

# 64. Contract Testing

Frontend/mobile clients and backend should use contract tests to verify:

- request schema
- response schema
- error schema
- required fields
- enum compatibility
- pagination behavior

Provider adapters should have contract tests against mocked provider contracts.

---

# 65. Endpoint Acceptance Criteria

An endpoint is implementation-ready when:

- route is documented
- request schema is documented
- response schema is documented
- authorization is defined
- ownership rules are defined
- validation is defined
- error codes are defined
- idempotency behavior is defined where needed
- transaction boundaries are defined
- events are defined where applicable
- metrics/logging are defined
- tests are specified

An endpoint is done when:

- implementation passes unit tests
- integration tests pass
- API contract tests pass
- security tests pass
- OpenAPI is updated
- observability is implemented
- documentation is current
- code review is approved

---

# 66. Recommended Initial Implementation Order

## Phase 1 — Foundation

1. auth
2. sessions
3. users
4. roles/permissions
5. buyer profile
6. supplier onboarding

## Phase 2 — Catalog

7. categories
8. manufacturers
9. products
10. supplier listings
11. inventory

## Phase 3 — Commerce

12. search
13. cart
14. checkout quote
15. order creation
16. fulfillment

## Phase 4 — Money

17. payments
18. payment webhooks
19. invoices
20. refunds
21. settlements

## Phase 5 — Delivery

22. delivery slots
23. logistics abstraction
24. Porter adapter
25. tracking
26. logistics webhooks

## Phase 6 — Operations

27. notifications
28. returns
29. disputes
30. support
31. promotions
32. admin

## Phase 7 — Scale and Controls

33. fraud/risk
34. advanced reporting
35. integration APIs
36. performance optimization
37. partner/ERP integrations

---

# 67. API Definition of Done

The Bezzo API layer is production-ready only when:

- all production endpoints have OpenAPI definitions
- authentication and authorization are enforced centrally
- buyer/supplier tenant isolation is tested
- state transitions are server-controlled
- financial mutations are idempotent
- inventory mutations are concurrency-safe
- payment webhooks are verified and deduplicated
- logistics callbacks are verified and deduplicated
- sensitive data is redacted from logs
- rate limiting is active
- observability is active
- database transactions are defined for critical operations
- automated tests cover critical workflows
- API compatibility is governed
- deployment checks validate migrations and contracts
- production secrets are externalized
- failure and retry behavior is documented

---

# 68. Final Engineering Position

Bezzo's API must act as the authoritative boundary between clients, marketplace business rules, suppliers, financial providers, logistics providers, and internal operations.

The API is not merely a CRUD layer.

It must enforce:

- identity
- authorization
- pharmaceutical marketplace rules
- supplier isolation
- inventory consistency
- order state
- payment state
- delivery state
- financial integrity
- auditability
- integration safety

The implementation should favor clear domain modules, strong contracts, transactional consistency for critical operations, asynchronous processing for non-critical work, and provider abstractions for payments and logistics.

The first production API should remain maintainable as a modular backend while preserving boundaries that allow high-volume modules to be extracted later if actual traffic and operational requirements justify that change.

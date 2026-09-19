# Bezo API Specification v1.0

## 1. Purpose

This document defines the initial REST API contract for Bezo.

It follows the approved implementation direction:

- REST API
- `/api/v1` versioning
- NestJS + TypeScript backend
- PostgreSQL as primary database
- Redis for caching/temporary state
- OpenSearch-compatible search
- Object storage for files/images
- Payment provider abstraction
- Logistics provider abstraction with Porter as the initial adapter

This is an implementation contract. Exact pharmaceutical/legal requirements must be validated separately before production launch.

---

# 2. API Base

Production:

```text
https://api.bezo.com/api/v1
```

Local example:

```text
http://localhost:3000/api/v1
```

All endpoints use JSON unless explicitly stated otherwise.

---

# 3. Authentication

Use bearer authentication:

```http
Authorization: Bearer <access_token>
```

Example:

```http
GET /api/v1/me
Authorization: Bearer eyJ...
```

Unauthenticated endpoints should be explicitly documented.

---

# 4. Standard Headers

Recommended:

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>
X-Request-ID: <uuid>
```

For important write operations:

```http
Idempotency-Key: <unique-key>
```

---

# 5. Standard Success Response

Example:

```json
{
  "success": true,
  "data": {},
  "requestId": "req_123"
}
```

For lists:

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 20,
    "total": 0
  },
  "requestId": "req_123"
}
```

---

# 6. Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Requested quantity is unavailable.",
    "details": {}
  },
  "requestId": "req_123"
}
```

Do not expose:

- SQL errors
- Stack traces
- Internal service names
- Secrets
- Provider credentials
- Internal infrastructure details

---

# 7. HTTP Status Codes

Use conventional status codes:

```text
200 OK
201 Created
202 Accepted
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests

500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
```

---

# 8. Authentication APIs

## POST `/auth/register`

Create a user account.

Request:

```json
{
  "phone": "+91XXXXXXXXXX",
  "email": "user@example.com",
  "password": "********",
  "role": "BUYER"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "userId": "usr_123",
    "verificationRequired": true
  },
  "requestId": "req_123"
}
```

---

## POST `/auth/login`

Request:

```json
{
  "identifier": "+91XXXXXXXXXX",
  "password": "********"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 900,
    "user": {
      "id": "usr_123",
      "role": "BUYER",
      "status": "ACTIVE"
    }
  },
  "requestId": "req_123"
}
```

---

## POST `/auth/refresh`

Request:

```json
{
  "refreshToken": "..."
}
```

Returns a new access token.

---

## POST `/auth/logout`

Invalidates the relevant session/refresh token.

---

## POST `/auth/forgot-password`

Request:

```json
{
  "identifier": "user@example.com"
}
```

The response should not reveal whether an account exists.

---

## POST `/auth/reset-password`

Request:

```json
{
  "token": "...",
  "newPassword": "********"
}
```

---

# 9. Current User APIs

## GET `/me`

Returns the authenticated user's basic profile.

---

## PATCH `/me`

Update permitted profile information.

---

## GET `/me/sessions`

Returns active sessions/devices where supported.

---

## DELETE `/me/sessions/:sessionId`

Revoke a session.

---

# 10. Buyer APIs

## POST `/buyers/profile`

Create/update buyer business profile.

Example:

```json
{
  "businessName": "ABC Medical Store",
  "businessType": "PHARMACY",
  "phone": "+91XXXXXXXXXX",
  "address": {
    "line1": "Example Street",
    "city": "Kanpur",
    "state": "Uttar Pradesh",
    "postalCode": "208001",
    "country": "IN"
  }
}
```

---

## GET `/buyers/profile`

Returns the authenticated buyer profile.

---

## PATCH `/buyers/profile`

Updates permitted buyer information.

---

# 11. Supplier APIs

## POST `/suppliers/profile`

Create supplier profile.

Possible fields:

```json
{
  "businessName": "ABC Pharma Distributors",
  "gstNumber": "GST...",
  "phone": "+91XXXXXXXXXX",
  "email": "supplier@example.com",
  "address": {}
}
```

---

## GET `/suppliers/profile`

Returns the authenticated supplier's profile.

---

## PATCH `/suppliers/profile`

Updates supplier profile fields allowed for the current verification state.

---

## GET `/suppliers/verification`

Returns verification state and required documents.

Example:

```json
{
  "status": "UNDER_REVIEW",
  "requiredDocuments": [
    "WHOLESALE_DRUG_LICENSE",
    "GST_DOCUMENT"
  ],
  "submittedDocuments": []
}
```

---

# 12. Supplier Documents

## POST `/suppliers/documents/upload-url`

Request:

```json
{
  "fileName": "license.pdf",
  "contentType": "application/pdf",
  "documentType": "WHOLESALE_DRUG_LICENSE"
}
```

Response:

```json
{
  "uploadUrl": "...",
  "fileId": "file_123",
  "expiresAt": "2026-01-01T00:00:00Z"
}
```

The upload URL should be short-lived.

---

## POST `/suppliers/documents/:fileId/complete`

Marks the upload as completed and starts validation/scanning.

---

## GET `/suppliers/documents`

Returns documents belonging only to the authenticated supplier.

---

# 13. Admin Supplier Verification

Admin-only endpoints.

## GET `/admin/suppliers`

Filters:

```text
status
createdFrom
createdTo
search
page
pageSize
```

---

## GET `/admin/suppliers/:supplierId`

Returns supplier verification information.

---

## POST `/admin/suppliers/:supplierId/verify`

Marks a supplier as verified if all required checks have passed.

---

## POST `/admin/suppliers/:supplierId/reject`

Request:

```json
{
  "reasonCode": "DOCUMENT_INVALID",
  "notes": "..."
}
```

---

## POST `/admin/suppliers/:supplierId/suspend`

Request:

```json
{
  "reason": "..."
}
```

---

# 14. Category APIs

## GET `/categories`

Returns active categories.

Possible query:

```text
parentId
```

---

## GET `/categories/:categoryId`

Returns category details.

---

## POST `/admin/categories`

Admin-only category creation.

---

## PATCH `/admin/categories/:categoryId`

Admin-only category update.

---

# 15. Product APIs

## GET `/products`

Buyer-facing catalog search endpoint.

Query parameters may include:

```text
q
categoryId
brand
manufacturer
dosageForm
strength
minPrice
maxPrice
available
supplierId
sort
page
pageSize
```

Example:

```text
GET /products?q=paracetamol&categoryId=abc&page=1&pageSize=20
```

The backend must enforce all applicable product, supplier, eligibility, and compliance filters.

---

## GET `/products/:productId`

Returns product details.

Buyer-facing response should not expose private supplier information unnecessarily.

---

# 16. Supplier Product APIs

## POST `/suppliers/products`

Creates a supplier listing for a canonical product or approved catalog entry.

Example:

```json
{
  "productId": "prd_123",
  "sellingPrice": 120.50,
  "mrp": 140,
  "minimumOrderQuantity": 1
}
```

---

## GET `/suppliers/products`

Returns only the authenticated supplier's listings.

---

## GET `/suppliers/products/:supplierProductId`

Returns one supplier listing.

---

## PATCH `/suppliers/products/:supplierProductId`

Updates permitted listing fields.

---

## POST `/suppliers/products/:supplierProductId/publish`

Publishes a listing after required validation.

---

## POST `/suppliers/products/:supplierProductId/unpublish`

Unpublishes a listing.

---

# 17. Product Images

## POST `/suppliers/products/:supplierProductId/images/upload-url`

Request:

```json
{
  "fileName": "front.webp",
  "contentType": "image/webp",
  "type": "FRONT"
}
```

---

## POST `/suppliers/products/:supplierProductId/images/:fileId/complete`

Completes the upload pipeline.

---

## DELETE `/suppliers/products/:supplierProductId/images/:fileId`

Deletes an image if permitted.

---

# 18. Inventory APIs

## GET `/suppliers/inventory`

Supplier-only inventory list.

Query:

```text
supplierProductId
lowStock
outOfStock
page
pageSize
```

---

## PATCH `/suppliers/inventory/:supplierProductId`

Request:

```json
{
  "availableQuantity": 150
}
```

The backend should record the inventory change.

---

## POST `/suppliers/inventory/bulk-update`

For CSV/import workflows later.

Example:

```json
{
  "items": [
    {
      "supplierProductId": "sp_1",
      "availableQuantity": 100
    }
  ]
}
```

---

# 19. Search APIs

## GET `/search/products`

Query:

```text
q
categoryId
brand
manufacturer
strength
dosageForm
available
page
pageSize
```

Response should be optimized for marketplace rendering.

---

# 20. Cart APIs

## GET `/cart`

Returns the authenticated buyer's active cart.

---

## POST `/cart/items`

Request:

```json
{
  "supplierProductId": "sp_123",
  "quantity": 5
}
```

---

## PATCH `/cart/items/:itemId`

Request:

```json
{
  "quantity": 10
}
```

---

## DELETE `/cart/items/:itemId`

Removes an item.

---

## DELETE `/cart`

Clears the active cart.

---

# 21. Delivery Slot APIs

## GET `/delivery-slots`

Query:

```text
date
postalCode
mode
```

Response:

```json
{
  "items": [
    {
      "id": "slot_1",
      "name": "MORNING",
      "startTime": "08:00",
      "endTime": "12:00",
      "available": true
    }
  ]
}
```

Slot times must be configurable.

---

# 22. Checkout APIs

## POST `/checkout/validate`

Validates:

- Buyer
- Cart
- Product availability
- Supplier status
- Pricing
- Delivery address
- Delivery mode
- Delivery slot

Request:

```json
{
  "deliveryAddressId": "addr_123",
  "deliveryMode": "SCHEDULED",
  "deliverySlotId": "slot_123"
}
```

---

## POST `/checkout/quote`

Returns the server-calculated checkout totals.

Example:

```json
{
  "subtotal": 1000,
  "tax": 50,
  "deliveryFee": 40,
  "instantFee": 0,
  "discount": 0,
  "total": 1090,
  "currency": "INR"
}
```

---

# 23. Order APIs

## POST `/orders`

Creates an order from a validated checkout.

Required:

```http
Idempotency-Key: <unique-key>
```

Request:

```json
{
  "deliveryAddressId": "addr_123",
  "deliveryMode": "INSTANT",
  "deliverySlotId": null,
  "paymentMethod": "UPI"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "orderId": "ord_123",
    "paymentId": "pay_123",
    "status": "PAYMENT_PENDING"
  },
  "requestId": "req_123"
}
```

---

## GET `/orders`

Buyer order history.

Query:

```text
status
from
to
page
pageSize
```

---

## GET `/orders/:orderId`

Returns a buyer-visible order.

---

## POST `/orders/:orderId/cancel`

Cancellation must verify whether the current order state allows cancellation.

---

# 24. Supplier Order APIs

## GET `/suppliers/orders`

Returns supplier-specific fulfillment/orders only.

Filters:

```text
status
from
to
page
pageSize
```

---

## GET `/suppliers/orders/:fulfillmentId`

Returns supplier-specific fulfillment information.

---

## POST `/suppliers/fulfillments/:fulfillmentId/accept`

Supplier accepts eligible fulfillment.

---

## POST `/suppliers/fulfillments/:fulfillmentId/ready`

Marks fulfillment ready for pickup.

---

# 25. Fulfillment APIs

Internal/service APIs may include:

```text
POST /fulfillments/allocate
POST /fulfillments/:id/reserve
POST /fulfillments/:id/allocate
POST /fulfillments/:id/pack
POST /fulfillments/:id/ready
```

These endpoints should generally not be exposed directly to ordinary buyers.

---

# 26. Payment APIs

## POST `/payments`

Creates a payment attempt.

Required:

```http
Idempotency-Key: <unique-key>
```

---

## GET `/payments/:paymentId`

Returns payment status for authorized users.

---

## POST `/payments/:paymentId/retry`

Creates a retry where allowed.

---

## POST `/payments/:paymentId/refund`

Admin/authorized operations only.

---

# 27. Payment Webhook

## POST `/webhooks/payments/:provider`

Provider sends payment event.

Required processing:

```text
Receive request
→ Verify signature
→ Validate event
→ Check event ID/idempotency
→ Persist webhook event
→ Update payment
→ Update order
→ Trigger downstream events
```

Return quickly after durable acceptance where asynchronous processing is used.

---

# 28. Logistics APIs

## GET `/orders/:orderId/delivery`

Returns delivery status.

---

## GET `/orders/:orderId/tracking`

Returns tracking information appropriate for the buyer.

---

## POST `/orders/:orderId/delivery/cancel`

Cancellation is allowed only when the order/delivery state permits it.

---

# 29. Logistics Webhook

## POST `/webhooks/logistics/:provider`

Receives provider status events.

Example event:

```json
{
  "eventId": "evt_123",
  "type": "DELIVERY_STATUS_CHANGED",
  "deliveryId": "del_123",
  "status": "PICKED_UP"
}
```

Provider-specific payloads must be translated into Bezo's internal logistics event model.

---

# 30. Notification APIs

## GET `/notifications`

Returns the authenticated user's notifications.

---

## POST `/notifications/:notificationId/read`

Marks notification as read.

---

## POST `/notifications/read-all`

Marks all eligible notifications as read.

Notification creation should normally happen through backend events rather than direct buyer requests.

---

# 31. Address APIs

## GET `/addresses`

Returns the authenticated user's addresses.

---

## POST `/addresses`

Creates an address.

---

## PATCH `/addresses/:addressId`

Updates an owned address.

---

## DELETE `/addresses/:addressId`

Deletes an owned address if not required by historical records.

Historical orders must preserve their own delivery-address snapshot.

---

# 32. Admin APIs

Admin API namespace:

```text
/admin/*
```

Core resources:

```text
/admin/users
/admin/suppliers
/admin/buyers
/admin/products
/admin/categories
/admin/orders
/admin/payments
/admin/logistics
/admin/audit-logs
/admin/configuration
```

All admin endpoints require explicit admin/operations permissions.

---

# 33. Audit API

## GET `/admin/audit-logs`

Filters:

```text
actorId
actorRole
action
resourceType
resourceId
from
to
page
pageSize
```

Audit logs should be append-oriented and protected from ordinary application-user modification.

---

# 34. Health APIs

## GET `/health`

Basic service health.

---

## GET `/health/ready`

Readiness check.

May verify required dependencies:

```text
Database
Redis
Search
```

---

## GET `/health/live`

Basic process liveness.

Do not make liveness depend on every external dependency.

---

# 35. API Authorization Matrix

| Resource | Buyer | Supplier | Admin | Operations |
|---|---:|---:|---:|---:|
| Own profile | RW | RW | RW | RW |
| Product browsing | R | R | RW | RW |
| Own supplier products | - | RW | RW | RW |
| Own inventory | - | RW | RW | RW |
| Other supplier inventory | - | - | RW | RW |
| Cart | RW | - | Support | Support |
| Own orders | RW* | RW* | RW | RW |
| Supplier fulfillment | - | RW | RW | RW |
| Payments | Own | Relevant | RW | RW |
| Supplier verification | - | R | RW | RW |
| Audit logs | - | Limited | R | R |

`RW*` means only actions permitted by the order state.

---

# 36. Pagination

Use cursor pagination for very large/high-frequency datasets where appropriate.

For simpler administrative lists, page-based pagination is acceptable.

Example:

```text
?page=1&pageSize=50
```

Maximum page size should be enforced server-side.

Example:

```text
pageSize <= 100
```

---

# 37. Sorting

Only allow whitelisted sort fields.

Bad:

```text
?sort=<arbitrary database expression>
```

Good:

```text
?sort=createdAt
?sort=-createdAt
?sort=price
```

---

# 38. Filtering

Filters must be explicitly mapped to supported query fields.

Do not convert arbitrary query strings directly into SQL.

---

# 39. API Idempotency

Use idempotency for:

```text
POST /orders
POST /payments
POST /refunds
POST /logistics deliveries
```

Recommended storage:

```text
idempotency_key
user_id
endpoint
request_hash
response_status
response_body
created_at
expires_at
```

A reused key with a different request body should return an error.

---

# 40. Concurrency Rules

Important operations require transactional protection.

Examples:

```text
Inventory reservation
Inventory release
Order creation
Payment state update
Fulfillment allocation
Refund
```

Never solve a concurrency problem only in frontend code.

---

# 41. API Security

Implement:

- JWT/session validation
- RBAC
- Resource ownership checks
- Input validation
- Rate limiting
- Secure headers
- CORS policy
- Request-size limits
- Upload restrictions
- Webhook signature validation
- Audit logging
- Secret management

---

# 42. API Documentation

Generate OpenAPI documentation from the NestJS application.

Maintain:

```text
docs/api/openapi.yaml
```

The API specification must be updated whenever a contract changes.

Breaking changes require a versioning decision.

---

# 43. API Versioning Policy

Current:

```text
v1
```

Breaking changes should not silently modify the existing contract.

Potential future:

```text
/api/v2
```

Deprecation must include:

- Documentation
- Migration plan
- Sunset date
- Client communication

---

# 44. Event Contracts

Important domain events should use stable schemas.

Examples:

```text
UserRegistered
SupplierSubmittedForReview
SupplierVerified
ProductPublished
InventoryChanged
InventoryReserved
InventoryReleased
OrderCreated
PaymentAuthorized
PaymentFailed
OrderAllocated
FulfillmentReady
DeliveryCreated
DeliveryPickedUp
DeliveryDelivered
OrderCancelled
RefundCompleted
```

Example:

```json
{
  "eventId": "evt_123",
  "eventType": "InventoryChanged",
  "occurredAt": "2026-01-01T10:00:00Z",
  "aggregateType": "SupplierProduct",
  "aggregateId": "sp_123",
  "version": 1,
  "payload": {
    "availableQuantity": 100
  }
}
```

---

# 45. Outbox Pattern

For important database-to-event workflows, use an outbox pattern.

Example:

```text
Database transaction
    |
    +-- business record
    |
    +-- outbox event
             |
             ↓
        worker/dispatcher
             |
             ↓
        queue/event bus
```

This reduces the risk of:

```text
Database updated
but event never published
```

---

# 46. Search Consistency

Search is eventually consistent.

The source of truth remains PostgreSQL.

Example:

```text
PostgreSQL says stock = 0
OpenSearch temporarily says stock = 10
```

Checkout must always verify current inventory from the transactional source.

Search results must never be treated as final inventory truth.

---

# 47. External Provider Failures

Payment and logistics providers can fail.

The system should distinguish:

```text
business failure
temporary provider failure
permanent provider failure
unknown outcome
```

Unknown payment outcomes require reconciliation rather than blindly creating a second payment.

---

# 48. Retry Policy

Use bounded retries with backoff.

Example concept:

```text
1st retry → short delay
2nd retry → longer delay
3rd retry → longer delay
then dead-letter/manual review
```

Do not retry permanently invalid requests.

---

# 49. Dead-Letter Handling

Failed background jobs should move to a dead-letter state after retry exhaustion.

Operations dashboard should show:

```text
job type
failure reason
attempt count
last attempt
next action
```

Critical jobs require operational alerts.

---

# 50. Final API Implementation Rule

The API is the enforcement layer for Bezo's business rules.

The frontend may improve user experience, but the backend remains authoritative for:

```text
identity
roles
permissions
supplier verification
product state
inventory
pricing
payment
order state
fulfillment
delivery
refunds
audit
```

No client application should be able to bypass these controls.

---

# 51. API Completion Criteria

The API specification is considered implementation-ready when:

- Every MVP screen has defined backend operations.
- Every protected operation has an authorization rule.
- Every important write has an idempotency strategy where needed.
- Inventory mutations are transactional.
- Payment webhooks are verified and idempotent.
- Logistics webhooks are verified and idempotent.
- Supplier tenant isolation is tested.
- Error codes are standardized.
- OpenAPI documentation is generated.
- Integration tests cover critical flows.
- API performance is measured under realistic load.

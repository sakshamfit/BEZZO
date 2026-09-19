# Bezzo API Error Handling, Idempotency & Integration Contract Specification v1.0

## Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | API Error Handling, Idempotency & Integration Contract Specification |
| Version | 1.0 |
| Status | Baseline / Implementation Reference |
| Primary Audience | Backend, frontend, mobile, DevOps, QA, security, integration teams |
| Applies To | Bezzo Web, Android, iOS, Admin, Supplier Portal, internal services, external integrations |

---

## 1. Purpose

This specification defines the common API contract used across Bezzo.

It establishes:

- response envelopes
- success and error formats
- stable error codes
- HTTP status conventions
- validation behavior
- authentication and authorization errors
- business-rule and state-transition errors
- inventory, pricing and payment errors
- external-provider failure handling
- idempotency
- request/correlation tracing
- pagination, filtering and sorting conventions
- API versioning
- webhook contracts
- integration security
- retry and timeout behavior
- rate limiting
- observability
- contract testing
- OpenAPI requirements

The objective is to make every Bezzo API predictable for clients and safe for distributed operations.

---

# 2. Scope

This specification applies to:

1. Buyer APIs
2. Supplier APIs
3. Admin APIs
4. Authentication APIs
5. Catalog APIs
6. Inventory APIs
7. Cart and checkout APIs
8. Order APIs
9. Payment APIs
10. Logistics APIs
11. Notification APIs
12. Returns/refunds APIs
13. Settlement/payout APIs
14. Support/dispute APIs
15. Reporting APIs
16. Internal service-to-service APIs
17. External provider webhooks and callbacks

It applies to synchronous HTTP APIs and asynchronous integration contracts where applicable.

---

# 3. Contract Principles

Bezzo APIs SHALL follow these principles:

- Consistent response structures
- Machine-readable stable error codes
- Human-readable error messages
- No sensitive information in errors
- Explicit distinction between validation, authorization, business, provider and system errors
- Safe retries for operations designed to be retryable
- Idempotency for financial and mutation operations where duplicate execution could cause harm
- Correlation of every request through traceable identifiers
- Explicit API versioning
- Backward-compatible evolution whenever possible
- Contract-first OpenAPI documentation
- Provider-specific details hidden behind internal adapters
- State-machine rules enforced server-side

Clients SHALL NOT depend on human-readable error text for program logic.

---

# 4. API Base Structure

Recommended public API base:

```text
/api/v1
```

Examples:

```text
GET    /api/v1/products
GET    /api/v1/products/{productId}
POST   /api/v1/cart/items
POST   /api/v1/checkout
POST   /api/v1/orders
GET    /api/v1/orders/{orderId}
POST   /api/v1/payments
```

Internal APIs MAY use separate internal routing while preserving the same contract principles.

---

# 5. Request Identification

Every API request SHALL have a server-generated request identifier.

Recommended headers:

```http
X-Request-ID: req_01J...
X-Correlation-ID: corr_01J...
```

## 5.1 X-Request-ID

Identifies one HTTP request.

If a trusted client supplies a request ID, the server MAY accept it after validation. Otherwise the server generates one.

## 5.2 X-Correlation-ID

Connects multiple requests belonging to the same business operation.

Example:

```text
Checkout
  |
  +-- Order creation
  +-- Inventory reservation
  +-- Payment authorization
  +-- Fulfillment creation
  +-- Logistics request
```

All related operations should retain the same correlation ID.

## 5.3 Response Headers

Responses SHOULD include:

```http
X-Request-ID: req_01J...
X-Correlation-ID: corr_01J...
```

These identifiers SHALL be present in logs and traces.

---

# 6. Standard Success Response

For APIs returning a resource:

```json
{
  "success": true,
  "data": {
    "id": "ord_123",
    "status": "CONFIRMED"
  },
  "meta": {
    "requestId": "req_123",
    "correlationId": "corr_123"
  }
}
```

For collection responses:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "req_123",
    "correlationId": "corr_123",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

For commands without meaningful response data:

```json
{
  "success": true,
  "data": null,
  "meta": {
    "requestId": "req_123",
    "correlationId": "corr_123"
  }
}
```

---

# 7. Standard Error Response

All API errors SHALL use a common structure.

```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_MODIFIABLE",
    "message": "The order can no longer be modified.",
    "category": "BUSINESS_RULE",
    "retryable": false,
    "details": null
  },
  "meta": {
    "requestId": "req_123",
    "correlationId": "corr_123"
  }
}
```

The `message` is intended for display/logging but SHALL NOT be used as a stable programmatic identifier.

---

# 8. Error Object

| Field | Required | Description |
|---|---:|---|
| code | Yes | Stable machine-readable error code |
| message | Yes | Safe human-readable explanation |
| category | Yes | Error classification |
| retryable | Yes | Whether retry may succeed |
| details | No | Structured additional information |

Recommended categories:

```text
VALIDATION
AUTHENTICATION
AUTHORIZATION
NOT_FOUND
CONFLICT
BUSINESS_RULE
INVENTORY
PAYMENT
INTEGRATION
RATE_LIMIT
SECURITY
SYSTEM
```

---

# 9. HTTP Status Mapping

| HTTP | Meaning | Typical Bezzo Use |
|---:|---|---|
| 200 | Success | Read/update operations |
| 201 | Created | Resource creation |
| 202 | Accepted | Asynchronous processing |
| 204 | No Content | Successful deletion/no-body response where appropriate |
| 400 | Bad Request | Malformed request |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Authenticated but not permitted |
| 404 | Not Found | Resource does not exist or is intentionally hidden |
| 409 | Conflict | State/version/idempotency conflict |
| 422 | Unprocessable Entity | Valid JSON but validation/business input failure |
| 429 | Too Many Requests | Rate limit |
| 500 | Internal Server Error | Unexpected server failure |
| 502 | Bad Gateway | Upstream provider failure |
| 503 | Service Unavailable | Temporary service unavailability |
| 504 | Gateway Timeout | Upstream timeout |

The backend SHALL avoid using 200 for failed business operations.

---

# 10. Stable Error Code Registry

Error codes SHALL be uppercase, underscore-separated and stable.

## 10.1 Generic

```text
INVALID_REQUEST
VALIDATION_FAILED
MALFORMED_JSON
RESOURCE_NOT_FOUND
CONFLICT
INTERNAL_ERROR
SERVICE_UNAVAILABLE
RATE_LIMIT_EXCEEDED
```

## 10.2 Authentication

```text
AUTH_REQUIRED
INVALID_TOKEN
TOKEN_EXPIRED
INVALID_OTP
OTP_EXPIRED
OTP_ATTEMPTS_EXCEEDED
SESSION_EXPIRED
ACCOUNT_DISABLED
ACCOUNT_LOCKED
```

## 10.3 Authorization

```text
FORBIDDEN
ROLE_NOT_ALLOWED
TENANT_ACCESS_DENIED
RESOURCE_ACCESS_DENIED
ADMIN_PERMISSION_REQUIRED
```

## 10.4 Supplier

```text
SUPPLIER_NOT_VERIFIED
SUPPLIER_SUSPENDED
SUPPLIER_DOCUMENTS_PENDING
SUPPLIER_NOT_ACTIVE
SUPPLIER_PRODUCT_NOT_ALLOWED
```

## 10.5 Catalog

```text
PRODUCT_NOT_FOUND
PRODUCT_INACTIVE
PRODUCT_NOT_APPROVED
PRODUCT_DUPLICATE
INVALID_PRODUCT_DATA
```

## 10.6 Inventory

```text
OUT_OF_STOCK
INSUFFICIENT_STOCK
STOCK_RESERVATION_FAILED
RESERVATION_EXPIRED
INVENTORY_VERSION_CONFLICT
INVENTORY_UPDATE_CONFLICT
```

## 10.7 Cart / Checkout

```text
CART_NOT_FOUND
CART_EMPTY
CART_ITEM_NOT_FOUND
CART_ITEM_UNAVAILABLE
PRICE_CHANGED
CHECKOUT_EXPIRED
CHECKOUT_VALIDATION_FAILED
SUPPLIER_NO_LONGER_ELIGIBLE
```

## 10.8 Order

```text
ORDER_NOT_FOUND
ORDER_NOT_MODIFIABLE
INVALID_ORDER_STATE
ORDER_ALREADY_CANCELLED
ORDER_CANNOT_BE_CANCELLED
FULFILLMENT_NOT_FOUND
FULFILLMENT_STATE_INVALID
```

## 10.9 Payment

```text
PAYMENT_REQUIRED
PAYMENT_FAILED
PAYMENT_PENDING
PAYMENT_ALREADY_PROCESSED
PAYMENT_AMOUNT_MISMATCH
PAYMENT_PROVIDER_ERROR
PAYMENT_VERIFICATION_FAILED
REFUND_FAILED
REFUND_NOT_ALLOWED
```

## 10.10 Logistics

```text
DELIVERY_ADDRESS_INVALID
DELIVERY_UNAVAILABLE
LOGISTICS_PROVIDER_UNAVAILABLE
LOGISTICS_QUOTE_FAILED
LOGISTICS_BOOKING_FAILED
DELIVERY_CANNOT_BE_CANCELLED
```

## 10.11 Promotions

```text
PROMO_NOT_FOUND
PROMO_EXPIRED
PROMO_NOT_ELIGIBLE
PROMO_USAGE_LIMIT_REACHED
PROMO_MINIMUM_ORDER_NOT_MET
PROMO_ALREADY_USED
```

## 10.12 Integration

```text
UPSTREAM_TIMEOUT
UPSTREAM_UNAVAILABLE
UPSTREAM_INVALID_RESPONSE
UPSTREAM_REJECTED
WEBHOOK_SIGNATURE_INVALID
WEBHOOK_DUPLICATE
WEBHOOK_REPLAY_REJECTED
```

---

# 11. Validation Errors

Validation failures SHOULD return field-level details.

Example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "category": "VALIDATION",
    "retryable": false,
    "details": {
      "fields": [
        {
          "field": "quantity",
          "code": "MIN_VALUE",
          "message": "Quantity must be greater than zero."
        },
        {
          "field": "deliveryAddressId",
          "code": "REQUIRED",
          "message": "Delivery address is required."
        }
      ]
    }
  },
  "meta": {
    "requestId": "req_123"
  }
}
```

Field paths SHOULD support nested structures:

```text
items[0].quantity
items[2].productId
address.postalCode
```

---

# 12. Authentication Errors

Authentication failures SHALL NOT reveal unnecessary security details.

Example:

```json
{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication is required.",
    "category": "AUTHENTICATION",
    "retryable": false
  }
}
```

The API SHALL NOT reveal whether a submitted identifier belongs to an account when doing so would facilitate account enumeration.

---

# 13. Authorization and Tenant Isolation

A valid token does not automatically grant access to a resource.

Every protected resource SHALL pass authorization checks.

Example:

```text
Authenticated Supplier A
        |
        +-- Supplier A products -> ALLOWED
        +-- Supplier B products -> DENIED
        +-- Buyer private order -> DENIED
        +-- Admin resource -> DENIED unless permitted
```

Cross-tenant access attempts SHOULD return:

```text
403 RESOURCE_ACCESS_DENIED
```

or, where resource existence must be hidden:

```text
404 RESOURCE_NOT_FOUND
```

---

# 14. Business Rule Errors

Business rules are distinct from malformed requests.

Example:

```text
POST /api/v1/orders/{id}/cancel
```

If the order is already dispatched:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_CANNOT_BE_CANCELLED",
    "message": "The order cannot be cancelled in its current state.",
    "category": "BUSINESS_RULE",
    "retryable": false,
    "details": {
      "currentState": "OUT_FOR_DELIVERY"
    }
  }
}
```

The state-machine specification remains the source of truth for legal transitions.

---

# 15. Inventory and Concurrency Errors

Inventory is concurrency-sensitive.

When two buyers attempt to reserve the final available units, only one reservation may succeed.

The losing transaction may receive:

```text
INSUFFICIENT_STOCK
```

or:

```text
STOCK_RESERVATION_FAILED
```

If optimistic versioning is used:

```text
INVENTORY_VERSION_CONFLICT
```

Clients SHOULD refresh availability before offering the user a retry path.

---

# 16. Price Change Contract

Prices may change between catalog browsing and checkout.

Checkout SHALL revalidate:

- product availability
- supplier eligibility
- current price
- taxes
- applicable discounts
- delivery fee
- payment amount

If the price changed:

```json
{
  "success": false,
  "error": {
    "code": "PRICE_CHANGED",
    "message": "One or more item prices changed before checkout.",
    "category": "CONFLICT",
    "retryable": false,
    "details": {
      "items": [
        {
          "productId": "prod_123",
          "oldUnitPrice": 120.00,
          "newUnitPrice": 125.00
        }
      ]
    }
  }
}
```

The client SHALL not silently alter the payable amount without presenting the updated checkout state.

---

# 17. Payment Error Contract

Payment APIs SHALL distinguish:

1. Payment failed
2. Payment still pending
3. Payment succeeded but client did not receive the response
4. Payment succeeded but order processing is pending
5. Payment amount mismatch
6. Refund pending/failed

The client SHALL not infer payment success from a timeout.

For uncertain payment outcomes, the client should query the server using the payment/order reference.

---

# 18. External Provider Errors

Bezzo SHALL hide provider-specific implementation details behind integration adapters.

Example internal mapping:

```text
Razorpay/Cashfree/PayU/etc.
        |
        v
Payment Adapter
        |
        v
Bezzo Payment Contract
```

Provider-specific errors SHOULD be normalized into stable Bezzo errors.

Example:

```text
provider_timeout
provider_invalid_request
provider_declined
```

becomes:

```text
UPSTREAM_TIMEOUT
UPSTREAM_REJECTED
PAYMENT_PROVIDER_ERROR
```

Raw provider responses SHALL be stored only in protected operational/audit contexts where required.

---

# 19. Retryability

Every error SHOULD communicate whether a retry may be useful.

### Usually retryable

```text
UPSTREAM_TIMEOUT
UPSTREAM_UNAVAILABLE
SERVICE_UNAVAILABLE
502
503
504
```

### Usually non-retryable without changing input/state

```text
VALIDATION_FAILED
FORBIDDEN
RESOURCE_NOT_FOUND
OUT_OF_STOCK
PRICE_CHANGED
ORDER_CANNOT_BE_CANCELLED
PROMO_NOT_ELIGIBLE
```

Retries SHALL use exponential backoff and jitter.

Example:

```text
1st retry: 250 ms
2nd retry: 500 ms
3rd retry: 1 s
4th retry: 2 s
```

Exact values SHALL be configurable per integration.

---

# 20. Idempotency

Idempotency prevents duplicate execution when clients retry mutation requests.

It is REQUIRED for high-risk operations including:

- order creation
- payment initiation
- refund creation
- supplier payout creation
- logistics booking
- important webhook processing
- other externally visible commands where duplicate execution is harmful

Recommended header:

```http
Idempotency-Key: 01JEXAMPLE...
```

---

# 21. Idempotency Key Requirements

Keys SHALL:

- be unique per logical operation
- be treated as opaque strings
- have a maximum accepted length
- be associated with authenticated principal and endpoint
- have a defined retention period
- be protected against cross-user reuse

Recommended minimum scope:

```text
tenant/user + HTTP method + route + idempotency key
```

For especially sensitive operations, include an operation type.

---

# 22. Idempotency Storage Model

Recommended table:

```text
idempotency_records
```

Suggested fields:

```text
id
scope
idempotency_key
request_hash
status
response_status
response_body
resource_type
resource_id
created_at
completed_at
expires_at
```

Unique constraint:

```text
(scope, idempotency_key)
```

The request hash prevents the same key from being reused with a different payload.

---

# 23. Idempotency Lifecycle

```text
REQUEST RECEIVED
      |
      v
LOOKUP KEY
      |
      +---- not found ----> CREATE PROCESSING RECORD
      |                           |
      |                           v
      |                      EXECUTE COMMAND
      |                           |
      |                     +-----+-----+
      |                     |           |
      |                  SUCCESS      FAILURE
      |                     |           |
      |                     v           v
      |                  STORE       STORE
      |                  RESPONSE    RESULT
      |
      +---- found ----> compare request hash
                              |
                    +---------+---------+
                    |                   |
                 SAME BODY          DIFFERENT BODY
                    |                   |
                    v                   v
              RETURN STORED       IDEMPOTENCY_KEY_REUSE
                 RESULT
```

If a request is still processing, the server MAY return:

```text
409 CONFLICT
```

with:

```text
IDEMPOTENCY_REQUEST_IN_PROGRESS
```

or a controlled retry response.

---

# 24. Idempotency Conflict

If the same key is reused with a different request body:

```json
{
  "success": false,
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSE",
    "message": "The idempotency key was already used with a different request.",
    "category": "CONFLICT",
    "retryable": false
  }
}
```

The original operation SHALL NOT be executed again.

---

# 25. Database Transaction Requirements

Idempotency records and the business command SHALL be coordinated carefully.

For operations that can be completed within one database transaction:

```text
BEGIN
  create idempotency record
  validate command
  mutate business state
  persist result
COMMIT
```

For operations involving external providers:

```text
BEGIN
  persist command intent
  persist idempotency state
COMMIT

execute provider operation

persist provider result
```

External calls SHOULD NOT be held inside long-running database transactions unless there is a strong technical reason.

---

# 26. Exactly-Once vs At-Least-Once

Bezzo SHALL NOT assume network systems provide true end-to-end exactly-once execution.

The architecture should assume:

```text
at-least-once delivery
```

and achieve business-level safety through:

- idempotency keys
- unique constraints
- state checks
- provider reference IDs
- deduplication
- transactional updates
- reconciliation jobs

---

# 27. Webhook Contract

Webhook endpoints SHALL be designed as idempotent consumers.

Example:

```http
POST /api/v1/webhooks/payment
```

Recommended headers:

```http
X-Webhook-ID
X-Webhook-Timestamp
X-Webhook-Signature
```

Payload:

```json
{
  "eventId": "evt_123",
  "eventType": "payment.succeeded",
  "occurredAt": "2026-01-01T10:00:00Z",
  "provider": "payment_provider",
  "data": {
    "providerPaymentId": "pay_123",
    "orderId": "ord_123"
  }
}
```

---

# 28. Webhook Verification

Webhook verification SHALL occur before business processing.

Recommended sequence:

```text
Receive webhook
      |
      v
Validate headers
      |
      v
Verify signature
      |
      v
Validate timestamp/replay window
      |
      v
Check webhook/event ID
      |
      v
Persist receipt/deduplication record
      |
      v
Process event
      |
      v
Return acknowledgement
```

Invalid signatures SHALL be rejected.

---

# 29. Webhook Replay Protection

The server SHALL protect against replay attacks using:

- signed payloads
- timestamps
- bounded acceptance windows
- unique event IDs
- processed-event records

Example:

```text
WEBHOOK_REPLAY_REJECTED
```

The exact timestamp window is configurable by integration.

---

# 30. Webhook Duplicate Handling

If the same valid webhook is received twice:

```text
first delivery  -> process
second delivery -> recognize duplicate
```

The second delivery SHALL NOT repeat the business side effect.

It MAY return a successful acknowledgement because the desired state has already been achieved.

---

# 31. Integration Adapter Pattern

All major third-party systems SHALL be accessed through adapters.

Example:

```text
Application
    |
    +--> PaymentPort
    |       |
    |       +--> RazorpayAdapter
    |       +--> CashfreeAdapter
    |       +--> PayUAdapter
    |
    +--> LogisticsPort
            |
            +--> PorterAdapter
            +--> FutureProviderAdapter
```

The domain/application layer SHALL depend on interfaces rather than provider SDKs directly.

---

# 32. Provider Reference Storage

For external operations store:

```text
provider
provider_account
provider_reference
operation_type
request_reference
status
created_at
updated_at
```

Provider references SHALL be unique where the provider guarantees uniqueness.

Never use a provider reference as the sole internal primary key.

---

# 33. Timeout Policy

Every external request SHALL have a timeout.

The timeout SHALL be:

- explicit
- configurable
- monitored
- appropriate for the operation

Avoid indefinite network waits.

Example categories:

```text
connect timeout
read timeout
overall request timeout
```

A timeout does not necessarily mean the provider did not process the request.

Therefore uncertain operations SHALL be reconciled before blindly creating a duplicate operation.

---

# 34. Circuit Breaker

High-volume external integrations SHOULD use circuit breakers.

States:

```text
CLOSED
  |
  | failures exceed threshold
  v
OPEN
  |
  | recovery interval
  v
HALF_OPEN
  |
  +---- success ----> CLOSED
  |
  +---- failure ----> OPEN
```

Circuit-breaker state SHALL be observable.

---

# 35. Queue and Dead-Letter Handling

Asynchronous integrations SHOULD use queues for:

- notifications
- webhook processing where appropriate
- scheduled fulfillment
- settlement processing
- reconciliation
- non-blocking provider operations
- analytics events

Failed messages SHOULD be retried according to policy.

After retry exhaustion:

```text
dead-letter queue
```

The system SHALL expose operational tooling for investigating and replaying eligible messages.

---

# 36. Pagination

Collection APIs SHALL use a consistent pagination strategy.

Initial implementation may use page-based pagination:

```http
GET /api/v1/products?page=1&pageSize=20
```

Response:

```json
"pagination": {
  "page": 1,
  "pageSize": 20,
  "total": 100,
  "totalPages": 5
}
```

For high-volume feeds/search, cursor pagination SHOULD be preferred.

Example:

```http
GET /api/v1/products?limit=20&cursor=eyJpZCI6...
```

The chosen method SHALL be documented per endpoint.

---

# 37. Filtering

Filters SHALL use explicit query parameters.

Example:

```text
GET /api/v1/products
  ?categoryId=cat_123
  &supplierId=sup_123
  &availability=IN_STOCK
```

Avoid ambiguous free-form filter syntax in public APIs unless formally specified.

---

# 38. Sorting

Sorting SHALL be explicit.

Example:

```text
?sort=createdAt
&order=desc
```

Allowed sort fields SHALL be endpoint-specific and validated server-side.

---

# 39. Search Parameters

Search endpoints may support:

```text
q
categoryId
manufacturerId
supplierId
availability
dosageForm
prescriptionRequired
```

Search behavior SHALL be documented separately in the search/discovery specification.

---

# 40. Optimistic Concurrency

For mutable resources where concurrent updates matter, Bezzo MAY use:

```http
If-Match: "version-17"
```

or:

```http
If-Match: "etag-value"
```

A stale update SHALL return:

```text
409 CONFLICT
```

with a stable code such as:

```text
RESOURCE_VERSION_CONFLICT
```

This is especially relevant to:

- inventory
- supplier offers
- order operations
- administrative configuration

---

# 41. API Versioning

Public APIs SHALL be versioned.

Initial version:

```text
/v1
```

Breaking changes SHALL require a new major API version.

Examples:

```text
/v1/orders
/v2/orders
```

Non-breaking changes MAY include:

- adding optional response fields
- adding new optional request fields
- adding new endpoints
- adding new enum values only when clients are designed to tolerate them

Clients SHALL avoid assuming that an enum can never gain new values.

---

# 42. Deprecation

Deprecated APIs SHALL include:

- deprecation date
- replacement API
- migration guidance
- planned removal date
- monitoring of remaining consumers

Where supported:

```http
Deprecation: true
```

and documentation SHOULD clearly identify the replacement.

---

# 43. Security Requirements

APIs SHALL enforce:

- TLS
- authentication where required
- RBAC
- tenant isolation
- input validation
- output encoding where relevant
- rate limiting
- secure headers
- request-size limits
- upload restrictions
- secret management
- audit logging for sensitive actions

Tokens and secrets SHALL never be returned in normal API responses.

---

# 44. Sensitive Error Data

Error responses SHALL NOT expose:

- passwords
- OTP values
- access tokens
- refresh tokens
- payment secrets
- provider credentials
- database connection information
- stack traces
- SQL statements
- internal hostnames
- encryption keys
- sensitive personal data not required by the client

Internal logs may contain additional diagnostic information subject to the security and data-governance policies.

---

# 45. Rate Limiting

Rate limits SHALL be applied by risk and endpoint category.

Examples:

```text
Authentication endpoints -> strict
OTP endpoints            -> very strict
Search endpoints         -> moderate
Read APIs                -> moderate/high
Order creation           -> controlled
Admin APIs               -> strict
Webhooks                 -> provider-aware
```

Rate-limit responses SHOULD include:

```http
Retry-After: 30
```

when appropriate.

---

# 46. Request Size Limits

The server SHALL enforce maximum request sizes.

Separate limits SHOULD exist for:

- JSON APIs
- multipart uploads
- image uploads
- document uploads
- bulk imports

Oversized requests SHALL be rejected before expensive processing.

---

# 47. File Upload API Contracts

Upload endpoints SHALL validate:

- authenticated user
- authorization
- MIME type
- extension
- file size
- malware/security policy where applicable
- object-storage path
- ownership
- document type

Client-provided filenames SHALL NOT determine trusted storage paths.

---

# 48. Bulk Import APIs

Bulk operations SHALL be asynchronous when processing can exceed normal HTTP request limits.

Example:

```text
POST /api/v1/catalog/imports
```

Response:

```http
202 Accepted
```

```json
{
  "success": true,
  "data": {
    "importId": "imp_123",
    "status": "QUEUED"
  }
}
```

Progress can be queried through:

```text
GET /api/v1/catalog/imports/{importId}
```

---

# 49. Long-Running Operations

Long-running tasks SHALL NOT keep HTTP connections open unnecessarily.

Use:

```text
202 Accepted
```

with a resource representing the operation.

Example:

```text
POST /api/v1/reports/generate
GET  /api/v1/reports/jobs/{jobId}
```

---

# 50. API Command Semantics

Mutation endpoints SHALL correspond to explicit business commands.

Examples:

```text
POST /orders
POST /orders/{id}/cancel
POST /orders/{id}/confirm
POST /payments
POST /payments/{id}/refund
POST /fulfillments/{id}/dispatch
```

Avoid generic endpoints that allow arbitrary state mutation such as:

```text
PATCH /orders/{id}
{
  "status": "DELIVERED"
}
```

Clients SHALL NOT directly choose protected state transitions.

---

# 51. State Transition Errors

State-changing commands SHALL validate:

1. resource exists
2. caller is authorized
3. current state permits transition
4. required conditions are satisfied
5. transition is atomic
6. audit/event records are generated where required

Invalid transitions return a stable error such as:

```text
INVALID_ORDER_STATE
```

---

# 52. API and Event Consistency

Synchronous API response and asynchronous events SHALL describe the same business state.

Example:

```text
POST /orders
```

may return:

```text
status = CONFIRMED
```

and publish:

```text
order.confirmed
```

Consumers SHALL treat events as notifications of state changes, not as permission to bypass domain rules.

---

# 53. Event IDs

Every asynchronous event SHALL have:

```text
eventId
eventType
occurredAt
aggregateType
aggregateId
correlationId
version
data
```

Example:

```json
{
  "eventId": "evt_123",
  "eventType": "order.confirmed",
  "occurredAt": "2026-01-01T10:00:00Z",
  "aggregateType": "order",
  "aggregateId": "ord_123",
  "correlationId": "corr_123",
  "version": 4,
  "data": {}
}
```

---

# 54. Outbox Pattern

For important domain events, Bezzo SHOULD use a transactional outbox.

Pattern:

```text
BEGIN TRANSACTION
  update business entity
  insert outbox event
COMMIT

Outbox worker
     |
     v
publish event
     |
     v
mark published
```

This prevents a successful database transaction from losing its corresponding event because of a process/network failure.

---

# 55. Reconciliation

External integrations SHALL have reconciliation mechanisms.

Examples:

### Payments

Compare:

```text
Bezzo payment records
vs
provider payment records
```

### Logistics

Compare:

```text
Bezzo fulfillment/logistics records
vs
provider booking/status records
```

### Settlements

Compare:

```text
supplier settlement ledger
vs
payment gateway/bank settlement
```

Reconciliation jobs SHALL detect mismatches and create operational cases rather than silently modifying financial history.

---

# 56. API Observability

Each request SHOULD capture:

```text
requestId
correlationId
userId where permitted
tenant/supplier/buyer scope
route
HTTP method
status code
latency
error code
service
provider
```

Sensitive values SHALL be redacted.

Metrics SHOULD include:

- request rate
- error rate
- latency percentiles
- timeout rate
- retry rate
- rate-limit rate
- provider failure rate
- webhook failure rate
- idempotency conflict rate

---

# 57. Logging

Structured JSON logs are recommended.

Example:

```json
{
  "timestamp": "2026-01-01T10:00:00Z",
  "level": "ERROR",
  "service": "order-service",
  "requestId": "req_123",
  "correlationId": "corr_123",
  "route": "POST /api/v1/orders",
  "errorCode": "INSUFFICIENT_STOCK",
  "durationMs": 142
}
```

Logs SHALL avoid secrets and unnecessary personal data.

---

# 58. Contract Testing

Every public API SHALL have contract tests covering:

- success schema
- validation schema
- authentication behavior
- authorization behavior
- error codes
- HTTP statuses
- pagination
- idempotency where applicable
- version compatibility

Integration adapters SHALL have provider-contract tests where feasible.

---

# 59. OpenAPI Requirements

The API specification SHALL be maintained in OpenAPI.

Every endpoint SHOULD define:

- method
- path
- summary
- description
- authentication
- authorization requirements
- request schema
- response schemas
- error responses
- examples
- pagination
- idempotency requirements
- headers
- rate-limit behavior

Generated client SDKs MAY be used where beneficial, but server-side domain contracts remain authoritative.

---

# 60. Example: Create Order

```http
POST /api/v1/orders
Authorization: Bearer <token>
Idempotency-Key: order-create-abc
X-Correlation-ID: corr_123
Content-Type: application/json
```

Request:

```json
{
  "cartId": "cart_123",
  "deliveryAddressId": "addr_123",
  "deliveryMode": "SCHEDULED",
  "deliverySlotId": "slot_123",
  "paymentMethod": "UPI"
}
```

Success:

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "orderId": "ord_123",
    "status": "PENDING_PAYMENT"
  },
  "meta": {
    "requestId": "req_123",
    "correlationId": "corr_123"
  }
}
```

Retrying the exact same request with the same idempotency key returns the same logical result rather than creating a second order.

---

# 61. Example: Duplicate Idempotency Request

```http
POST /api/v1/orders
Idempotency-Key: order-create-abc
```

Same payload:

```text
return stored result
```

Different payload:

```text
409 Conflict
IDEMPOTENCY_KEY_REUSE
```

---

# 62. Example: Payment Timeout

Client sends payment request.

Provider call times out.

The server MUST NOT immediately assume:

```text
PAYMENT_FAILED
```

if the provider outcome is unknown.

Preferred flow:

```text
PAYMENT_PENDING
      |
      v
provider status query/reconciliation
      |
      +--> SUCCESS
      |
      +--> FAILED
```

This prevents duplicate financial operations.

---

# 63. Example: Logistics Booking Timeout

A Porter booking request times out.

Bezzo SHALL treat the outcome as uncertain until:

- provider status can be queried, or
- reconciliation determines the final result.

Do not blindly submit another booking request unless the integration contract guarantees idempotency.

---

# 64. Client Retry Guidance

Clients MAY automatically retry:

- GET requests
- explicitly documented retry-safe requests
- transient 502/503/504 failures
- selected network failures

Clients SHOULD NOT blindly retry:

- payment creation without an idempotency key
- order creation without an idempotency key
- refund creation without an idempotency key
- logistics booking without an idempotency mechanism

---

# 65. API Client Error Handling

Web/mobile clients SHALL map errors to predictable UX.

Example:

```text
OUT_OF_STOCK
    -> refresh item availability

PRICE_CHANGED
    -> show updated price and recalculate cart

PAYMENT_PENDING
    -> show payment status and provide refresh

RATE_LIMIT_EXCEEDED
    -> wait according to Retry-After

AUTH_REQUIRED
    -> refresh/login session

FORBIDDEN
    -> show access denied

SERVICE_UNAVAILABLE
    -> retry with controlled backoff
```

Clients SHALL not expose raw server errors directly to end users.

---

# 66. Admin and Internal APIs

Admin APIs require stronger controls.

Recommended:

- dedicated admin roles
- MFA
- IP/device controls where appropriate
- elevated audit logging
- stricter rate limits
- explicit permission checks
- confirmation for destructive actions
- reason capture for sensitive overrides

Administrative overrides SHALL not silently bypass audit requirements.

---

# 67. Financial API Requirements

Financial mutations SHALL:

- use idempotency
- create immutable ledger/audit records where required
- record actor and source
- retain provider references
- support reconciliation
- avoid destructive updates
- use explicit currency and monetary precision

Money SHALL NOT be represented internally as floating-point values.

Use integer minor units or fixed-precision decimal semantics.

Example:

```text
₹125.50
```

may be represented as:

```text
12550 paise
```

where appropriate.

---

# 68. Date and Time

APIs SHALL use ISO 8601 timestamps.

Example:

```text
2026-01-01T10:00:00Z
```

Business-local delivery slots SHALL preserve the relevant operating timezone.

Stored timestamps SHOULD be normalized to UTC.

---

# 69. Currency

The initial marketplace currency is expected to be INR.

API responses involving money SHOULD make currency explicit:

```json
{
  "amount": 12550,
  "currency": "INR",
  "scale": 2
}
```

The exact representation SHALL be standardized across the codebase.

---

# 70. Nullability and Optional Fields

OpenAPI schemas SHALL clearly distinguish:

- required
- optional
- nullable

Clients SHALL tolerate newly added optional response fields.

Servers SHOULD avoid changing the meaning of an existing field.

---

# 71. Empty Collections

Collection endpoints SHALL return an empty collection rather than null.

Preferred:

```json
"data": []
```

Avoid:

```json
"data": null
```

unless null has an explicit semantic meaning.

---

# 72. Security Event Handling

Security-relevant API failures SHOULD produce security events for monitoring, including:

- repeated authentication failures
- OTP abuse
- privilege escalation attempts
- cross-tenant access attempts
- invalid webhook signatures
- suspicious idempotency behavior
- abnormal API-rate behavior

These events SHALL be handled according to the security and fraud specifications.

---

# 73. Data Privacy

API responses SHALL follow data minimization.

For example, a buyer API does not need unrestricted access to:

- supplier bank information
- supplier internal notes
- internal procurement costs
- private operational identifiers

Likewise, suppliers SHALL not receive unrelated buyer information.

---

# 74. Error Localization

The API should primarily return stable codes plus a default safe message.

Localization SHOULD occur at the client layer when feasible.

This prevents business logic from depending on translated strings.

---

# 75. Integration Failure Matrix

| Failure | Response | Retry | Additional Action |
|---|---|---|---|
| Validation failure | 422 | No | Fix request |
| Unauthorized | 401 | No | Authenticate |
| Forbidden | 403 | No | Check permissions |
| Not found | 404 | No | Refresh/resource check |
| State conflict | 409 | Usually no | Refresh state |
| Rate limit | 429 | Yes, delayed | Honor Retry-After |
| Provider timeout | 502/504 | Controlled | Reconcile if mutation |
| Provider unavailable | 503/502 | Yes | Backoff/circuit breaker |
| Internal failure | 500 | Controlled | Investigate |
| Payment uncertain | 202/appropriate business response | Query status | Reconcile |
| Webhook duplicate | 2xx acknowledgement | No | Ignore duplicate side effect |
| Invalid webhook signature | 401/403 | No | Security event |

---

# 76. Required Database Structures

The following structures are recommended to support this contract:

```text
idempotency_records
api_request_logs / telemetry reference
webhook_events
outbox_events
integration_operations
provider_references
reconciliation_jobs
```

Exact schema definitions remain part of the database specification.

---

# 77. Implementation Sequence

### Phase 1 — Core Contract

1. Define response DTOs
2. Define error DTO
3. Define error-code registry
4. Implement global exception handling
5. Implement request/correlation IDs
6. Add OpenAPI baseline

### Phase 2 — Reliability

7. Implement idempotency middleware/service
8. Add transaction-safe idempotency storage
9. Add retry utilities
10. Add timeout policies
11. Add circuit breaker abstraction

### Phase 3 — Integrations

12. Define payment port
13. Define logistics port
14. Define notification port
15. Implement webhook verification
16. Implement webhook deduplication
17. Implement reconciliation framework

### Phase 4 — Platform Controls

18. Rate limiting
19. API security controls
20. audit/observability integration
21. contract tests
22. load tests
23. failure-injection tests

---

# 78. Acceptance Criteria

This specification is considered implemented when:

- All APIs use a consistent response contract.
- All client-visible errors have stable codes.
- HTTP status mapping is consistent.
- Validation errors support field-level details.
- Authentication and authorization failures are separated.
- Business-state errors are deterministic.
- Order creation is idempotent.
- Payment mutations are idempotent.
- Refund mutations are idempotent.
- Logistics mutations have safe duplicate handling.
- Webhooks are signature-verified.
- Webhooks are replay-protected.
- Duplicate webhooks do not repeat side effects.
- Request and correlation IDs are traceable.
- External provider failures are normalized.
- Timeouts and retries are explicit.
- Circuit breakers exist for suitable integrations.
- Rate limits are enforced.
- Sensitive data is excluded from error responses.
- OpenAPI accurately describes implemented endpoints.
- Contract tests validate response/error schemas.
- Reconciliation exists for financially or operationally critical integrations.

---

# 79. Definition of Done

For every new Bezzo API endpoint:

- [ ] Endpoint is documented in OpenAPI.
- [ ] Request schema is defined.
- [ ] Success response is defined.
- [ ] Error responses are defined.
- [ ] Stable error codes are selected.
- [ ] Authorization is enforced.
- [ ] Tenant isolation is enforced where applicable.
- [ ] Validation is implemented.
- [ ] Idempotency is implemented when required.
- [ ] Concurrency behavior is defined.
- [ ] Audit requirements are defined.
- [ ] Logs contain request/correlation identifiers.
- [ ] Sensitive data is redacted.
- [ ] Contract tests exist.
- [ ] Integration tests exist where applicable.
- [ ] Retry behavior is documented.
- [ ] Metrics are emitted.
- [ ] Client UX behavior is defined for important errors.

---

# 80. Final Architecture Position

Bezzo SHALL treat API contracts as a first-class platform boundary.

The most important rules are:

```text
Stable error codes
        +
Consistent response envelopes
        +
Strong authorization
        +
Idempotent mutations
        +
Safe webhook processing
        +
Explicit timeouts/retries
        +
Provider abstraction
        +
Reconciliation
        +
Observability
        +
OpenAPI + contract testing
```

This contract provides the reliability layer between Bezzo clients, backend modules and external providers.

It is intended to work with the Bezzo Business Rules & State Machine Specification, Database Specification, Payment & Billing Specification, Logistics & Porter Integration Specification, Security & Compliance Specification, DevOps Specification and Testing/QA Strategy.


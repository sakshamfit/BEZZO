# Bezzo Backend Architecture & Engineering Standards Specification v1.0

**Product:** Bezzo  
**Document:** Backend Architecture & Engineering Standards  
**Version:** 1.0  
**Status:** Baseline / Engineering Specification  
**Primary Backend Stack:** Node.js, NestJS, TypeScript  
**Primary Database:** PostgreSQL  
**Cache:** Redis  
**Search:** OpenSearch / Elasticsearch-compatible  
**Object Storage:** S3-compatible storage  

---

# 1. Purpose

This document defines the backend architecture and engineering standards for Bezzo.

It establishes the implementation model for:

- backend modules
- domain boundaries
- application services
- repositories
- API controllers
- authentication
- authorization
- transactions
- concurrency
- inventory
- orders
- payments
- logistics
- notifications
- search
- background jobs
- events
- caching
- observability
- security
- testing
- configuration
- deployment
- code review

The backend must support a multi-supplier B2B pharmaceutical marketplace while maintaining strong data integrity, security, auditability, and operational scalability.

---

# 2. Architecture Position

Bezzo should begin with a **modular monolith / small number of deployables**, not a large microservice fleet.

The architecture must have explicit module boundaries so that high-load or independently scalable domains can later be extracted into services without redesigning the entire application.

Conceptually:

```text
Clients
  |
API / Edge
  |
Backend Application
  |
+------------------------------------------------+
| Auth | Users | Catalog | Search | Cart         |
| Orders | Fulfillment | Inventory | Payments    |
| Logistics | Notifications | Support | Admin    |
| Settlement | Promotions | Audit | Analytics    |
+------------------------------------------------+
  |
+----------------+----------------+---------------+
| PostgreSQL     | Redis          | Object Store |
+----------------+----------------+---------------+
                         |
                    Search Engine
```

---

# 3. Core Backend Principles

## 3.1 Backend is authoritative

The backend is authoritative for:

- identity
- permissions
- pricing
- inventory
- order state
- payment state
- delivery state
- supplier verification
- settlement
- refunds
- compliance decisions

The client is never trusted as the source of truth.

## 3.2 Strong consistency where money or inventory is involved

Financial and inventory operations require transactional integrity.

Examples:

- inventory reservation
- order creation
- payment state changes
- refund recording
- supplier settlement

## 3.3 Explicit domain boundaries

Modules must own their domain rules.

A payment module should not directly manipulate inventory tables.

An inventory module should expose operations to other modules rather than allowing arbitrary cross-module writes.

## 3.4 Idempotency by design

Critical mutation endpoints must support safe retries.

Examples:

- payment callbacks
- order creation
- inventory reservation
- refund
- logistics booking
- notification dispatch

---

# 4. Backend Layering

Each module should generally follow:

```text
Controller
   ↓
Application Service
   ↓
Domain Logic
   ↓
Repository / External Adapter
   ↓
Database / External Service
```

A controller should not contain complex business logic.

---

# 5. Module Structure

Recommended backend modules:

```text
auth
users
buyers
suppliers
catalog
inventory
search
cart
checkout
orders
fulfillment
payments
billing
logistics
notifications
support
returns
promotions
settlements
fraud
analytics
admin
audit
configuration
```

Modules should expose narrow interfaces.

---

# 6. NestJS Module Standards

Each business module should have a clear NestJS module boundary.

Example:

```text
catalog/
├── catalog.module.ts
├── controllers/
├── application/
├── domain/
├── repositories/
├── dto/
├── entities/
├── events/
└── tests/
```

Do not create one enormous `AppService` or generic service layer containing unrelated business logic.

---

# 7. Controller Standards

Controllers are responsible for:

- HTTP routing
- authentication context
- request validation
- calling application services
- response mapping
- HTTP-specific concerns

Controllers should not contain:

- SQL
- complex inventory logic
- payment calculation
- settlement calculation
- multi-step business workflows

---

# 8. DTO Standards

Use explicit request/response DTOs.

Example:

```ts
class CreateCartItemDto {
  productId: string;
  quantity: number;
}
```

DTOs should define the API contract.

Do not expose database entities directly as public API responses.

---

# 9. Domain Models

Database models and API DTOs should not automatically be treated as the same abstraction.

Example:

```text
Database entity
      ↓
Domain model
      ↓
Response DTO
```

This protects the API from accidental database schema exposure.

---

# 10. Service Standards

Application services should represent meaningful use cases.

Examples:

```text
CreateOrder
ReserveInventory
ReleaseInventory
VerifySupplier
ProcessPaymentWebhook
CreateFulfillment
ScheduleDelivery
CreateRefund
ApproveReturn
```

Avoid generic methods such as:

```text
process()
handle()
executeEverything()
```

unless their purpose is explicit from the surrounding abstraction.

---

# 11. Repository Standards

Repositories abstract persistence.

Example:

```text
ProductRepository
OrderRepository
InventoryRepository
PaymentRepository
SupplierRepository
```

Repositories may contain:

- queries
- persistence mapping
- transaction-aware operations
- locking operations

Repositories should not contain unrelated business decisions.

---

# 12. Database Access

PostgreSQL is the source of truth for transactional data.

Database access must follow the database indexing/query optimization specification.

Required practices include:

- indexed queries
- bounded result sets
- pagination
- transaction boundaries
- safe locking
- query-plan review
- connection pooling
- migration discipline

---

# 13. Transaction Standards

Transactions must be used where multiple writes must succeed or fail together.

Example:

```text
Create Order
  ↓
Create Order Items
  ↓
Reserve Inventory
  ↓
Create Fulfillment
  ↓
Commit
```

If a required operation fails, the transaction should roll back where the workflow is designed to be atomic.

Do not hold database transactions open while waiting for slow external HTTP calls unless there is a deliberate and justified design.

---

# 14. Concurrency

Concurrency must be considered explicitly for:

- inventory
- checkout
- payment
- refunds
- supplier allocation
- order transitions
- settlement

Use appropriate:

- database locks
- optimistic versioning
- atomic updates
- uniqueness constraints
- idempotency keys

---

# 15. Inventory Reservation

Inventory is one of the highest-risk concurrency areas.

Conceptually:

```text
available
   ↓
reserve
   ↓
reserved
   ↓
confirm
   ↓
sold
```

or:

```text
reserved
   ↓
release
   ↓
available
```

Two buyers must not be able to reserve the same finite stock beyond available quantity.

The database must enforce the critical invariant.

---

# 16. Multi-Supplier Allocation

When a buyer purchases products that may be fulfilled by multiple suppliers:

```text
Buyer Order
    |
    +---- Supplier A Fulfillment
    |
    +---- Supplier B Fulfillment
```

The customer-facing order remains coherent.

Internally, fulfillment records maintain supplier-specific operations.

Supplier allocation must consider:

- inventory
- supplier eligibility
- service area
- product eligibility
- delivery capability
- commercial rules
- compliance restrictions

---

# 17. Order Creation

Order creation should be treated as a controlled workflow.

Conceptual sequence:

```text
Validate Cart
   ↓
Validate Buyer
   ↓
Validate Address
   ↓
Validate Product Availability
   ↓
Calculate Authoritative Totals
   ↓
Allocate Suppliers
   ↓
Reserve Inventory
   ↓
Create Order
   ↓
Create Fulfillments
   ↓
Initiate Payment
```

Exact transaction boundaries should follow the order and payment specifications.

---

# 18. State Machines

Important entities must use explicit state transitions.

Examples:

### Order

```text
PENDING
CONFIRMED
PROCESSING
READY_FOR_PICKUP
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
```

### Payment

```text
PENDING
AUTHORIZED
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
CANCELLED
```

### Supplier

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
REJECTED
SUSPENDED
ACTIVE
```

Invalid transitions must be rejected.

---

# 19. Business Rule Location

Business rules belong in domain/application services.

Do not duplicate important rules across:

- controllers
- mobile clients
- web clients
- admin UI

For example, COD eligibility must be determined by backend rules.

---

# 20. Authentication

Authentication must support:

- registration
- login
- logout
- session/token refresh
- account recovery
- device/session management
- verification workflows

The implementation must support secure authentication for web and mobile clients.

---

# 21. Authorization

Authorization must be enforced server-side.

Core roles include:

```text
BUYER
SUPPLIER
ADMIN
```

Additional permissions may exist for operational staff.

Authorization should consider:

- role
- capability
- ownership
- supplier tenancy
- resource state
- administrative scope

---

# 22. Tenant/Data Isolation

Supplier data must be isolated.

A supplier must not be able to access:

- another supplier's inventory
- another supplier's orders
- another supplier's settlement
- another supplier's documents
- another supplier's internal analytics

Every supplier-scoped query must apply the correct tenant boundary.

---

# 23. Resource Ownership

Protected resources must verify ownership.

Example:

```text
GET /orders/:orderId
```

must verify that the authenticated buyer or authorized operational user may access that order.

Knowing an ID is never sufficient authorization.

---

# 24. API Versioning

The API should support controlled versioning.

Example:

```text
/api/v1/...
```

Breaking API changes should not silently alter existing client behavior.

---

# 25. HTTP Standards

Use standard HTTP semantics.

Examples:

```text
GET
POST
PUT/PATCH
DELETE
```

Status codes should communicate the outcome clearly.

Examples:

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
```

---

# 26. API Response Standards

Responses should be predictable.

Success example:

```json
{
  "data": {},
  "meta": {}
}
```

Error example:

```json
{
  "error": {
    "code": "INVENTORY_CONFLICT",
    "message": "Requested quantity is no longer available",
    "requestId": "..."
  }
}
```

The exact envelope must remain consistent with the approved API specification.

---

# 27. Idempotency

Critical POST operations should support idempotency where duplicate requests could cause harm.

Example:

```text
Idempotency-Key: <unique-key>
```

Server behavior:

```text
First request
  ↓
process
  ↓
store result

Retry with same key
  ↓
return stored result
```

This is especially important for:

- payments
- order creation
- refunds
- logistics bookings

---

# 28. Payment Integration

Payment gateways must be accessed through an abstraction.

Conceptually:

```text
PaymentService
    |
    +--- Razorpay Adapter
    +--- Cashfree Adapter
    +--- PayU Adapter
```

The domain must not depend directly on a specific gateway.

---

# 29. Payment Webhooks

Payment webhooks must be:

- authenticated/verified
- idempotent
- logged
- audited
- state-machine aware

Never mark a payment successful solely because a browser/mobile client reports success.

---

# 30. Logistics Integration

Logistics must use an adapter architecture.

```text
LogisticsService
      |
      +--- PorterAdapter
      +--- FutureProviderAdapter
      +--- BezzoFleetAdapter
```

This keeps the core order system independent of a single logistics provider.

---

# 31. Scheduled Delivery

Scheduled delivery requires backend scheduling.

Conceptual flow:

```text
Order Created
   ↓
Delivery Date + Slot Stored
   ↓
Scheduled Queue
   ↓
Dispatch Window
   ↓
Batching
   ↓
Logistics Booking
   ↓
Pickup
   ↓
Delivery
```

Scheduled orders should not be dispatched immediately unless business rules explicitly require it.

---

# 32. Instant Delivery

Instant delivery should use configurable delivery rules.

Possible inputs:

- service area
- distance
- supplier readiness
- delivery capacity
- fee
- operating hours
- logistics availability

Do not hard-code business pricing such as a fixed delivery fee into application logic.

---

# 33. Background Jobs

Long-running or asynchronous work should use background jobs.

Examples:

- notifications
- scheduled order dispatch
- supplier settlement generation
- analytics processing
- search indexing
- document processing
- reconciliation
- retries

The API request should not wait unnecessarily for these operations.

---

# 34. Job Design

Jobs should be:

- idempotent
- retryable
- observable
- bounded
- safely recoverable

Job states may include:

```text
QUEUED
PROCESSING
COMPLETED
FAILED
RETRYING
DEAD_LETTER
```

---

# 35. Event-Driven Architecture

Domain events should be used where asynchronous decoupling is valuable.

Examples:

```text
OrderPlaced
PaymentConfirmed
InventoryReserved
OrderReadyForPickup
OrderDelivered
RefundCompleted
SupplierVerified
```

Events should represent meaningful business facts.

---

# 36. Event Standards

Events should include:

```text
eventId
eventType
occurredAt
aggregateId
aggregateType
version
metadata
payload
```

Consumers must be prepared for duplicate delivery.

---

# 37. Caching

Redis may be used for:

- frequently accessed reference data
- sessions where appropriate
- rate limiting
- short-lived availability data
- idempotency records
- job coordination
- temporary workflow state

Do not use cache as the authoritative source for financial records or inventory truth.

---

# 38. Cache Invalidation

Every cache has an invalidation strategy.

Before adding a cache, define:

```text
What is cached?
Who writes it?
How long is it valid?
What invalidates it?
What happens if it is stale?
```

A cache without an invalidation strategy is a correctness risk.

---

# 39. Search Architecture

Search should be separated from transactional PostgreSQL query responsibilities where scale requires it.

Conceptually:

```text
PostgreSQL
    |
Indexing Pipeline
    |
OpenSearch
    |
Search API
```

Search results must be treated as discovery results.

Final price/inventory/orderability must be validated against authoritative transactional systems when necessary.

---

# 40. Search Index Updates

Catalog changes should trigger index updates.

Possible flow:

```text
Product Updated
   ↓
ProductChanged Event
   ↓
Search Index Job
   ↓
OpenSearch Update
```

Failed indexing should be retryable.

---

# 41. Notifications

Notifications should be asynchronous where possible.

Examples:

```text
Order confirmation
Payment confirmation
Supplier order alert
Delivery update
Refund update
Verification result
Support response
```

Channel adapters may include:

- push
- SMS
- email
- in-app
- approved messaging integrations

---

# 42. Notification Reliability

Notification delivery should not determine whether the underlying business transaction succeeds.

For example:

```text
Order successfully created
      ↓
notification job queued
```

not:

```text
Order creation waits for SMS provider
```

---

# 43. File Storage

Object storage should be used for:

- product images
- supplier documents
- verification files
- invoices
- other approved artifacts

Binary files should not be stored directly in PostgreSQL unless explicitly justified.

---

# 44. Secure File Access

Private documents should use controlled access.

Potential pattern:

```text
Authenticated Request
       ↓
Authorization Check
       ↓
Short-lived Signed URL
       ↓
Object Storage
```

A supplier document must not become publicly accessible merely because its URL is known.

---

# 45. Data Validation

Validate data at multiple levels.

Examples:

- DTO validation
- domain validation
- database constraints
- external provider validation

Important invariants should have database-level protection where appropriate.

---

# 46. Database Constraints

Use database constraints for invariants such as:

- uniqueness
- non-null requirements
- foreign keys
- valid relationships
- unique idempotency keys
- safe state relationships where practical

Application logic alone should not protect critical invariants when PostgreSQL can enforce them.

---

# 47. Security Standards

Backend security must include:

- TLS
- secure headers
- authentication
- authorization
- rate limiting
- input validation
- output sanitization where required
- secure file handling
- secrets management
- audit logging
- dependency security
- database access controls

---

# 48. Rate Limiting

Rate limits should be applied according to risk.

Higher-risk endpoints may require stricter limits:

- login
- OTP
- password reset
- payment operations
- document uploads
- search abuse-sensitive endpoints
- administrative actions

Rate limiting should distinguish legitimate high-volume business usage from abusive patterns where practical.

---

# 49. Abuse Protection

Backend systems should detect:

- repeated failed authentication
- abnormal order attempts
- coupon abuse
- excessive cancellations
- suspicious payment patterns
- inventory manipulation
- automated scraping
- supplier account abuse

Detailed fraud behavior is governed by the fraud/risk specification.

---

# 50. Audit Logging

Sensitive administrative and compliance-relevant actions must be auditable.

Examples:

```text
supplier_verified
supplier_suspended
product_approved
product_rejected
price_changed
refund_approved
order_status_overridden
user_permission_changed
```

Audit records should capture actor, action, resource, timestamp, and relevant metadata.

---

# 51. Observability

Every backend request should have a correlation/request identifier.

Observability should include:

```text
Logs
Metrics
Traces
```

Important measurements:

- request latency
- error rate
- database latency
- queue latency
- external provider latency
- payment failures
- logistics failures
- inventory conflicts

---

# 52. Logging Standards

Logs should be structured.

Example conceptual record:

```json
{
  "level": "info",
  "event": "order_created",
  "orderId": "...",
  "requestId": "...",
  "timestamp": "..."
}
```

Never log secrets or unnecessary sensitive information.

---

# 53. Health Checks

Backend applications should expose appropriate health checks.

Separate:

```text
liveness
readiness
dependency health
```

A temporary external dependency problem should not necessarily cause the process to be considered dead.

---

# 54. Graceful Shutdown

The backend must support graceful shutdown.

Shutdown should:

1. stop accepting new work
2. finish or safely terminate in-flight requests
3. stop job consumers
4. close database connections
5. close external clients
6. exit cleanly

---

# 55. Configuration

Configuration must be environment-specific.

Examples:

```text
development
test
staging
production
```

Secrets must be injected through secure secret management.

Do not commit:

- database passwords
- payment secrets
- signing keys
- API secrets
- private certificates

---

# 56. External Provider Adapters

External integrations should be isolated.

Examples:

```text
payments/
  gateway-interface.ts
  razorpay-adapter.ts

logistics/
  logistics-interface.ts
  porter-adapter.ts

notifications/
  sms-interface.ts
  provider-adapter.ts
```

This allows provider replacement without rewriting domain logic.

---

# 57. Retry Standards

Retries must only be used where safe.

Good retry candidates:

- transient network failure
- temporary provider unavailability
- queue delivery
- search indexing

Dangerous retry candidates require idempotency:

- payment creation
- order creation
- refund creation
- logistics booking

Never blindly retry all failed requests.

---

# 58. Timeout Standards

Every external network call should have a defined timeout.

A backend request should not remain blocked indefinitely because an external provider stops responding.

Timeouts should be observable and classified.

---

# 59. Circuit Breaking / Provider Protection

External providers may become unavailable.

The integration layer should be designed so repeated failures do not overwhelm:

- Bezzo
- provider systems
- worker pools
- connection pools

Circuit-breaking or equivalent protection can be introduced where justified by traffic and failure patterns.

---

# 60. Testing Standards

Backend tests should include:

### Unit

- domain rules
- calculations
- state transitions
- validation

### Integration

- database repositories
- transactions
- external adapters
- queue behavior

### API

- authentication
- authorization
- validation
- response contracts

### E2E

- complete business workflows

---

# 61. Critical Backend Test Scenarios

At minimum:

```text
Two buyers competing for last unit of stock
Duplicate payment webhook
Duplicate order request
Unauthorized supplier data access
Expired authentication
Invalid order transition
Failed logistics booking
Payment timeout
Refund retry
Supplier suspension
Product moderation rejection
Scheduled delivery dispatch
```

---

# 62. Concurrency Testing

Inventory and financial workflows require concurrency tests.

Example:

```text
Stock = 1

Buyer A → reserve 1
Buyer B → reserve 1
```

Expected result:

```text
Exactly one reservation succeeds.
```

The test must validate the actual database transaction behavior, not only mocked application logic.

---

# 63. Performance Testing

Backend performance testing should measure:

- API latency
- throughput
- database latency
- concurrent users
- concurrent checkout
- inventory contention
- queue throughput
- search latency
- external provider latency

Load tests must represent realistic marketplace traffic.

---

# 64. Migration Standards

Database migrations must be:

- version-controlled
- repeatable
- reviewed
- backward-aware where required
- safe for production deployment

Avoid long blocking migrations on large tables without a deployment plan.

---

# 65. Backward Compatibility

Deployments should consider mixed-version operation.

For rolling deployments:

```text
Old application
+
New application
```

may temporarily run simultaneously.

API and database changes must not break currently running instances unexpectedly.

---

# 66. Deployment Architecture

A typical production path:

```text
Internet
   ↓
CDN / WAF
   ↓
Load Balancer
   ↓
Backend Containers
   ↓
PostgreSQL / Redis / Search / Object Storage
```

Workers may run separately for:

- background jobs
- scheduled processing
- search indexing
- notifications

---

# 67. Horizontal Scaling

Backend instances should remain as stateless as practical.

Do not store essential session/workflow state only in local process memory.

Shared infrastructure should provide:

- cache
- session state where applicable
- queues
- database
- object storage

---

# 68. Background Worker Scaling

Workers should be independently scalable.

Example:

```text
API instances:  N
Worker instances: M
```

A notification spike should not require scaling the entire API fleet if worker capacity can be scaled independently.

---

# 69. Backend Coding Standards

Code should favor:

- small functions
- explicit dependencies
- dependency injection
- pure domain logic where practical
- typed interfaces
- clear error types
- testable services
- deterministic behavior

Avoid:

- global mutable state
- hidden side effects
- circular module dependencies
- database access from controllers
- provider-specific logic in domain services

---

# 70. Dependency Injection

NestJS dependency injection should be used for:

- repositories
- services
- adapters
- configuration
- external clients

This improves:

- testability
- replacement of integrations
- separation of concerns

---

# 71. Domain Events vs Direct Calls

Use direct synchronous calls when the caller needs an immediate authoritative result.

Use events/jobs when:

- work can happen asynchronously
- consumers are independent
- retries are useful
- immediate completion is not required

Example:

```text
Create Order
  → synchronous

Send Notification
  → asynchronous event/job
```

---

# 72. API Documentation

Every public/internal API contract should document:

- endpoint
- method
- authentication
- authorization
- request
- response
- validation
- errors
- idempotency
- pagination
- side effects

The API specification remains the authoritative contract.

---

# 73. Backend Definition of Ready

A backend feature is ready when:

- domain responsibility is identified
- state transitions are known
- API contract is defined
- authorization rules are defined
- persistence requirements are defined
- transaction boundaries are known
- idempotency requirements are identified
- external integrations are identified
- failure modes are documented
- tests are defined

---

# 74. Backend Definition of Done

A backend feature is complete when:

- code follows module boundaries
- TypeScript checks pass
- linting passes
- unit tests pass
- integration tests pass where applicable
- API tests pass
- authorization is tested
- transactions are tested
- concurrency risks are addressed
- logging/metrics are implemented
- API documentation is updated
- migrations are reviewed
- security implications are addressed
- deployment configuration is complete

---

# 75. Engineering Quality Gates

Recommended CI flow:

```text
Install Dependencies
        ↓
Type Check
        ↓
Lint
        ↓
Unit Tests
        ↓
Integration Tests
        ↓
Build
        ↓
API Contract Validation
        ↓
Security / Dependency Scan
        ↓
Migration Validation
        ↓
E2E / Critical Workflow Tests
        ↓
Artifact Creation
```

---

# 76. Implementation Sequence

## Phase 1 — Backend Foundation

- NestJS application
- configuration
- logging
- database
- Redis
- API structure
- authentication foundation
- error handling
- validation
- observability

## Phase 2 — Identity and Onboarding

- users
- buyers
- suppliers
- verification
- permissions

## Phase 3 — Catalog and Inventory

- products
- categories
- supplier listings
- inventory
- search indexing

## Phase 4 — Commerce

- cart
- checkout
- orders
- fulfillment
- pricing
- promotions

## Phase 5 — Payments and Logistics

- payment adapters
- payment webhooks
- refunds
- logistics adapters
- delivery scheduling
- tracking

## Phase 6 — Operations

- notifications
- support
- disputes
- returns
- settlements
- fraud controls
- admin workflows

## Phase 7 — Scale and Hardening

- performance
- concurrency testing
- load testing
- caching optimization
- read scaling
- observability
- disaster recovery validation

---

# 77. Acceptance Criteria

The backend architecture is accepted when:

- modules have explicit boundaries
- controllers remain thin
- application services represent business use cases
- repositories isolate persistence
- PostgreSQL remains transactional source of truth
- Redis is used selectively
- external providers are abstracted
- authentication and authorization are server-enforced
- supplier tenant isolation is enforced
- critical mutations support idempotency
- inventory concurrency is protected
- state transitions are explicit
- asynchronous work uses reliable jobs/events
- observability is built in
- sensitive data is not logged
- database migrations are controlled
- testing covers critical workflows
- the system can scale horizontally
- the architecture permits later service extraction

---

# 78. Final Architecture Position

Bezzo backend should be implemented as a **modular, strongly typed, transactionally safe backend platform**.

The core architecture is:

```text
Next.js / React
React Native
      ↓
API Layer
      ↓
NestJS Modular Backend
      ↓
Application Services
      ↓
Domain Rules
      ↓
Repositories / Adapters
      ↓
PostgreSQL
Redis
Search
Object Storage
External Providers
```

The most important engineering rule is that the system must preserve correctness while scaling.

In particular:

- inventory must remain accurate under concurrency
- payments must be authoritative and idempotent
- orders must have controlled state transitions
- supplier data must remain isolated
- external providers must be replaceable
- background processing must be retryable
- all sensitive administrative actions must be auditable
- frontend clients must never become the source of truth

This architecture provides Bezzo with a strong foundation for the initial B2B pharmaceutical marketplace while leaving a controlled path toward higher scale and future service extraction.

---

**End of Specification**

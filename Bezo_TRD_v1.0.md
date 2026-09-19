# Bezo --- Technical Requirements Document (TRD)

**Version:** 1.0\
**Status:** Planning / Pre-development\
**Product:** Bezo B2B Pharmaceutical Marketplace\
**Primary Market:** India

------------------------------------------------------------------------

## 1. Purpose

This TRD converts the Bezo PRD into concrete technical requirements.

Bezo must support:

-   Medical-store buyers
-   Pharmaceutical wholesalers/suppliers
-   Admin/operations
-   Product catalog and search
-   Supplier inventory
-   Multi-supplier fulfillment
-   Payments
-   Instant and scheduled delivery
-   Porter integration
-   Web, Android and iOS clients
-   High availability and horizontal scalability

------------------------------------------------------------------------

# 2. Recommended Technical Direction

## 2.1 Architecture

Use an **API-first modular architecture**.

For the initial product, prefer a **modular monolith or small number of
deployable services** rather than immediately creating dozens of
microservices.

Design strict internal modules so services can be extracted later.

Recommended evolution:

``` text
Phase 1
Modular Backend
      ↓
Phase 2
Extract high-load services
      ↓
Phase 3
Service-oriented / microservice architecture
```

This reduces early operational complexity while preserving a path to
large-scale architecture.

------------------------------------------------------------------------

# 3. Client Applications

## 3.1 Web

Recommended:

-   Next.js
-   React
-   TypeScript

The web application should support:

-   Medical-store marketplace
-   Supplier dashboard
-   Admin portal

Role-specific routes should share the same application shell where
practical.

Example:

``` text
bezo.com/
├── buyer/
├── supplier/
└── admin/
```

The backend remains the security boundary.

------------------------------------------------------------------------

## 3.2 Mobile

Recommended:

-   React Native
-   TypeScript

One mobile codebase can target:

-   Android
-   iOS

Native modules may be used where required for:

-   Notifications
-   Camera
-   Barcode scanning
-   Location
-   Secure storage
-   Payment SDKs

------------------------------------------------------------------------

# 4. Backend

Recommended primary backend:

**Node.js + TypeScript**

Framework candidate:

**NestJS**

Reasons:

-   Strong TypeScript support
-   Modular architecture
-   Dependency injection
-   Validation
-   Authentication integration
-   REST APIs
-   Background jobs
-   Good structure for a growing engineering team

Alternative backend technologies can be evaluated later if workload
characteristics justify them.

------------------------------------------------------------------------

# 5. API Style

Primary API:

**REST/JSON**

Potential future use:

-   WebSockets for real-time order tracking
-   Internal events for asynchronous workflows
-   GraphQL only if a demonstrated client/data requirement justifies it

Example:

``` text
/api/v1/auth
/api/v1/users
/api/v1/suppliers
/api/v1/stores
/api/v1/products
/api/v1/categories
/api/v1/inventory
/api/v1/cart
/api/v1/orders
/api/v1/payments
/api/v1/logistics
/api/v1/notifications
```

All public APIs should be versioned.

------------------------------------------------------------------------

# 6. Authentication

Authentication should support:

-   Mobile/email
-   OTP verification
-   Password authentication if selected
-   Refresh tokens
-   Access tokens
-   Session/device management

Recommended pattern:

``` text
Client
  ↓
Login
  ↓
Authentication Service
  ↓
Access Token + Refresh Token
  ↓
API Requests
```

Tokens must be securely stored on clients.

The server must never trust role information supplied by the frontend.

------------------------------------------------------------------------

# 7. Authorization

Use RBAC.

Initial roles:

``` text
MEDICAL_STORE
WHOLESALER
ADMIN
```

Future roles:

``` text
OPERATIONS
SUPPORT
FINANCE
COMPLIANCE
```

Authorization must be checked server-side on every protected operation.

Example:

``` text
GET /supplier/inventory
```

must return inventory belonging to the authenticated supplier, not
inventory selected by an arbitrary request parameter.

------------------------------------------------------------------------

# 8. Primary Database

Recommended:

**PostgreSQL**

Use PostgreSQL for:

-   Users
-   Supplier accounts
-   Medical stores
-   Products
-   Inventory
-   Orders
-   Order items
-   Fulfillment
-   Payments
-   Addresses
-   Delivery slots
-   Audit records
-   Financial records

PostgreSQL should be the source of truth for transactional business
data.

------------------------------------------------------------------------

# 9. Cache

Recommended:

**Redis**

Use Redis for:

-   Hot product data
-   Session-related data where appropriate
-   Rate limiting
-   Short-lived inventory/availability caches
-   Delivery-slot availability
-   Distributed locks where required
-   Background-job coordination

Redis should not become the permanent source of truth for orders or
payments.

------------------------------------------------------------------------

# 10. Search

A dedicated search engine should be used once catalog/search
requirements justify it.

Candidate:

**OpenSearch / Elasticsearch-compatible search**

Search index can contain:

-   Medicine name
-   Brand
-   Generic composition
-   Manufacturer
-   Category
-   Strength
-   Dosage form
-   Pack size
-   Search aliases
-   Availability metadata

PostgreSQL remains the source of truth.

Search indexes are derived data.

------------------------------------------------------------------------

# 11. Object Storage

Use object storage for:

-   Product images
-   Supplier documents
-   Medical-store documents
-   Invoices
-   Other permitted attachments

Example cloud implementation:

-   Amazon S3 or equivalent object storage

Never store large images/documents directly inside PostgreSQL.

------------------------------------------------------------------------

# 12. CDN

A CDN should deliver:

-   Product images
-   Static web assets
-   Public/approved media

Use an image transformation/optimization pipeline where possible.

The application servers should not repeatedly serve large original
images.

------------------------------------------------------------------------

# 13. Load Balancing

Production architecture:

``` text
Internet
   ↓
DNS
   ↓
CDN / WAF
   ↓
Application Load Balancer
   ↓
+---------+---------+---------+
| App 01  | App 02  | App N   |
+---------+---------+---------+
```

The load balancer must support:

-   Health checks
-   TLS termination
-   HTTP/HTTPS
-   Routing
-   Connection management
-   Automatic removal of unhealthy instances

------------------------------------------------------------------------

# 14. WAF

A Web Application Firewall should protect public traffic.

Controls should include:

-   Common attack protection
-   Rate limiting
-   IP/risk rules
-   Request-size restrictions
-   Bot/risk controls where appropriate

------------------------------------------------------------------------

# 15. Compute

Production application servers should be stateless.

Recommended starting model:

-   Containerized backend
-   Managed container platform
-   Multiple application instances
-   Autoscaling

Potential cloud choices:

-   AWS
-   Google Cloud
-   Azure

AWS is a strong default candidate for the first infrastructure design
because of its mature managed services ecosystem.

Final provider selection belongs in `server-infrastructure.md`.

------------------------------------------------------------------------

# 16. Containerization

Use Docker for:

-   Backend
-   Worker processes
-   Supporting services where appropriate

Example:

``` text
Docker
  ├── API
  ├── Worker
  └── Admin/utility processes
```

Containers make staging and production environments more reproducible.

------------------------------------------------------------------------

# 17. Kubernetes

Kubernetes should not automatically be required on day one.

For the MVP, a managed container platform may be simpler.

Introduce Kubernetes when:

-   Number of services increases
-   Deployment requirements become complex
-   Team has operational maturity
-   Traffic/workload requires it

The architecture must remain Kubernetes-compatible if future adoption is
desired.

------------------------------------------------------------------------

# 18. Background Jobs

Long-running/non-critical tasks should not block API requests.

Examples:

-   Email
-   SMS
-   Push notifications
-   Image processing
-   Search indexing
-   Supplier inventory synchronization
-   Invoice generation
-   Scheduled-order processing
-   Reconciliation
-   Analytics events

Architecture:

``` text
API
 ↓
Queue
 ↓
Worker
 ↓
External Service / Database
```

Candidate technologies:

-   Redis-backed queues
-   RabbitMQ
-   Kafka for future high-volume event streaming

For MVP, a Redis-backed job queue can be sufficient.

------------------------------------------------------------------------

# 19. Event Architecture

Important domain events may include:

``` text
USER_VERIFIED
SUPPLIER_APPROVED
PRODUCT_CREATED
INVENTORY_UPDATED
ORDER_CREATED
PAYMENT_CONFIRMED
ORDER_CONFIRMED
FULFILLMENT_CREATED
ORDER_READY
DELIVERY_ASSIGNED
DELIVERY_PICKED_UP
ORDER_DELIVERED
REFUND_COMPLETED
```

Events should be designed so downstream systems can react without
tightly coupling every module.

------------------------------------------------------------------------

# 20. Inventory Requirements

Inventory is one of the most critical components.

Each supplier has inventory records.

Conceptually:

``` text
Supplier
   ↓
Product
   ↓
Inventory
```

Inventory must support:

-   Available quantity
-   Reserved quantity
-   Sellable quantity
-   Low-stock threshold
-   Last synchronization time
-   Inventory source
-   Updated timestamp

Example:

``` text
physical/available stock = 100
reserved = 20
sellable = 80
```

Do not rely only on a simple `stock = 100` field.

------------------------------------------------------------------------

# 21. Inventory Reservation

At checkout/order confirmation:

``` text
Check stock
   ↓
Reserve quantity
   ↓
Confirm payment/order
   ↓
Convert reservation to sale
```

If payment/order creation fails:

``` text
Release reservation
```

Reservation must have an expiry mechanism.

------------------------------------------------------------------------

# 22. Concurrent Orders

Two buyers may attempt to purchase the last unit simultaneously.

The database must prevent overselling using transactional locking/atomic
updates.

Conceptually:

``` text
BEGIN TRANSACTION

verify sellable quantity

reserve quantity

create order

COMMIT
```

If the transaction cannot safely reserve stock, the order must not claim
the inventory.

------------------------------------------------------------------------

# 23. Multi-Supplier Routing

Routing service should consider:

-   Product availability
-   Supplier eligibility
-   Delivery area
-   Supplier operating hours
-   Price/business rules
-   Fulfillment capacity
-   Delivery ETA
-   Supplier performance rules
-   Compliance restrictions

Example:

``` text
Requested Product
      ↓
Eligible Suppliers
      ↓
Inventory Check
      ↓
Routing Rules
      ↓
Selected Supplier
```

Routing rules must be configurable.

------------------------------------------------------------------------

# 24. Order Model

A customer order should be separate from supplier fulfillment.

Example:

``` text
Customer Order
   ├── Fulfillment A → Supplier A
   └── Fulfillment B → Supplier B
```

This allows one customer order to contain products from multiple
suppliers.

------------------------------------------------------------------------

# 25. Order State Machine

Recommended:

``` text
CREATED
  ↓
PAYMENT_PENDING
  ↓
CONFIRMED
  ↓
FULFILLMENT
  ↓
READY_FOR_PICKUP
  ↓
PICKED_UP
  ↓
IN_TRANSIT
  ↓
OUT_FOR_DELIVERY
  ↓
DELIVERED
```

Failure branches:

``` text
CANCELLED
FAILED
PARTIALLY_FULFILLED
RETURNED
REFUNDED
```

Transitions must be validated server-side.

------------------------------------------------------------------------

# 26. Payment Technical Requirements

Payment gateway integration should use:

-   Payment order/intent creation
-   Gateway SDK/API
-   Server-side verification
-   Webhooks
-   Idempotency
-   Refund APIs
-   Reconciliation

Never mark an order `PAID` solely because the client says payment
succeeded.

------------------------------------------------------------------------

# 27. Payment Idempotency

Payment requests must be idempotent.

If a user taps:

**Pay**

multiple times, Bezo must not create multiple payments/orders
accidentally.

Use unique idempotency keys and gateway transaction identifiers.

------------------------------------------------------------------------

# 28. Instant Delivery

Instant delivery should be represented as a delivery service/option.

Example:

``` text
delivery_type = INSTANT
delivery_fee = configurable
```

Before confirming:

-   Check service area
-   Check supplier readiness
-   Check inventory
-   Check logistics availability
-   Estimate delivery
-   Calculate fee

------------------------------------------------------------------------

# 29. Scheduled Delivery

Scheduled orders contain:

``` text
delivery_date
slot_id
slot_start
slot_end
```

Example:

``` text
Morning
08:00–12:00

Afternoon
12:00–16:00

Evening
16:00–20:00
```

These are configurable values, not hard-coded requirements.

------------------------------------------------------------------------

# 30. Scheduled Delivery Processing

A scheduler/worker should find upcoming orders.

Example:

``` text
Scheduled Orders
       ↓
Slot Processor
       ↓
Orders approaching dispatch time
       ↓
Fulfillment preparation
       ↓
Route batching
       ↓
Logistics
```

This allows Bezo to group multiple deliveries into a route or van run.

------------------------------------------------------------------------

# 31. Logistics Abstraction

Do not integrate Porter directly into every order module.

Use:

``` text
Order Service
     ↓
Fulfillment Service
     ↓
Logistics Service
     ↓
Porter Adapter
```

Future:

``` text
Logistics Service
 ├── Porter
 ├── Provider B
 └── Bezo Fleet
```

This prevents vendor lock-in.

------------------------------------------------------------------------

# 32. API Security

Every API must have:

-   Authentication where required
-   Authorization
-   Input validation
-   Rate limits
-   Request size limits
-   Secure headers
-   Error handling
-   Audit logging for sensitive operations

Do not expose internal database errors to clients.

------------------------------------------------------------------------

# 33. File Upload Security

Supplier/license/product uploads must use:

-   MIME/type validation
-   Size limits
-   File extension validation
-   Malware scanning where appropriate
-   Random object keys
-   Private storage for sensitive documents
-   Signed URLs for authorized access

Sensitive supplier documents must never be publicly accessible.

------------------------------------------------------------------------

# 34. Observability

Production monitoring should include:

### Metrics

-   Request latency
-   Error rate
-   CPU/memory
-   Database connections
-   Cache hit rate
-   Queue depth
-   Payment success rate
-   Order success rate
-   Inventory failures
-   Delivery failures

### Logs

Centralized structured logs.

### Tracing

Distributed tracing should be introduced as the number of services
grows.

------------------------------------------------------------------------

# 35. Performance Targets

The product requirement is a highly responsive experience.

Engineering should define explicit targets during performance testing.

Suggested initial targets:

-   API p95 for common reads: \< 300 ms excluding third-party latency
-   Search p95: \< 300 ms
-   Internal service calls: typically \< 100 ms
-   Critical write operations: target \< 500 ms where practical
-   Static assets: CDN delivered
-   Images: optimized/resized
-   Availability target: 99.9%+ for mature production infrastructure

Actual SLOs must be finalized after load testing.

------------------------------------------------------------------------

# 36. Caching Strategy

Cache:

-   Categories
-   Product metadata
-   Popular products
-   Search suggestions
-   Configuration
-   Delivery-slot configuration

Do not blindly cache:

-   Payment status
-   Critical inventory state
-   Order state

For critical state, PostgreSQL remains authoritative.

------------------------------------------------------------------------

# 37. Database Scaling

Initial:

``` text
Primary PostgreSQL
```

Growth:

``` text
Primary
   ├── Read Replica
   └── Read Replica
```

Later options:

-   Partitioning
-   Connection pooling
-   Query optimization
-   Archiving
-   Sharding only if demonstrated necessary

Do not introduce database sharding prematurely.

------------------------------------------------------------------------

# 38. Backup & Disaster Recovery

Database:

-   Automated backups
-   Point-in-time recovery where supported
-   Periodic restore tests

Object storage:

-   Versioning where appropriate
-   Lifecycle policies
-   Backup/replication for critical documents

Production recovery objectives must be defined separately:

-   RPO
-   RTO

------------------------------------------------------------------------

# 39. CI/CD

Pipeline:

``` text
Git Push
   ↓
Lint
   ↓
Unit Tests
   ↓
Integration Tests
   ↓
Security Checks
   ↓
Build
   ↓
Deploy Staging
   ↓
Smoke Tests
   ↓
Production Approval/Deployment
```

Database migrations must be version-controlled.

------------------------------------------------------------------------

# 40. Testing

Required test categories:

-   Unit tests
-   Integration tests
-   API tests
-   Database tests
-   Authentication/authorization tests
-   Payment tests
-   Inventory concurrency tests
-   Logistics integration tests
-   End-to-end tests
-   Load tests
-   Security tests

Critical workflows must have automated end-to-end coverage.

------------------------------------------------------------------------

# 41. Recommended Project Structure

A possible backend structure:

``` text
bezo-backend/
├── src/
│   ├── auth/
│   ├── users/
│   ├── suppliers/
│   ├── stores/
│   ├── compliance/
│   ├── catalog/
│   ├── inventory/
│   ├── search/
│   ├── pricing/
│   ├── cart/
│   ├── orders/
│   ├── fulfillment/
│   ├── payments/
│   ├── logistics/
│   ├── notifications/
│   ├── admin/
│   ├── analytics/
│   └── common/
├── migrations/
├── tests/
└── infrastructure/
```

The exact structure may change with the implementation framework.

------------------------------------------------------------------------

# 42. Recommended Initial Technology Stack

  -------------------------------------------------------------------------
  Layer                               Recommendation
  ----------------------------------- -------------------------------------
  Web                                 Next.js + React + TypeScript

  Mobile                              React Native + TypeScript

  Backend                             Node.js + NestJS + TypeScript

  Primary DB                          PostgreSQL

  Cache                               Redis

  Search                              OpenSearch/Elasticsearch-compatible

  Object Storage                      S3-compatible storage

  CDN                                 Cloud CDN provider

  Load Balancer                       Managed HTTP/HTTPS load balancer

  WAF                                 Managed cloud WAF

  Containers                          Docker

  Compute                             Managed containers

  Queue                               Redis-backed queue initially

  Observability                       Managed logs/metrics +
                                      OpenTelemetry-compatible tracing

  CI/CD                               GitHub Actions or equivalent

  IaC                                 Terraform

  Payments                            Gateway selected in payment-system.md

  Logistics                           Porter adapter through Logistics
                                      Service
  -------------------------------------------------------------------------

------------------------------------------------------------------------

# 43. Architecture Principle

The system should follow:

``` text
Clients
   ↓
API
   ↓
Business Modules
   ↓
Transactional Database

Supporting systems:
Redis
Search
Object Storage
Queue
External APIs
```

Do not add infrastructure simply because a large company uses it.

Every component should have a demonstrated requirement.

------------------------------------------------------------------------

# 44. Security Boundaries

Critical boundaries:

``` text
Internet
   ↓
CDN/WAF
   ↓
Load Balancer
   ↓
API
   ↓
Authorization
   ↓
Business Logic
   ↓
Database
```

Private infrastructure should not be directly exposed to the internet.

Database should accept connections only from authorized application
infrastructure.

------------------------------------------------------------------------

# 45. Multi-Tenant Supplier Isolation

Supplier data is logically multi-tenant.

Every supplier-owned resource should have an ownership relationship.

Example:

``` text
supplier_id
```

must be associated with:

-   Products
-   Inventory
-   Fulfillment
-   Supplier documents
-   Supplier settings

Authorization queries must scope data to the authenticated supplier.

------------------------------------------------------------------------

# 46. Compliance-Aware Design

The system must allow configurable restrictions for:

-   Prescription products
-   Restricted/controlled products
-   State-specific availability
-   Supplier eligibility
-   Buyer eligibility
-   Storage requirements
-   Product recall
-   Expired products

Compliance rules must not be assumed to be identical across every Indian
jurisdiction.

------------------------------------------------------------------------

# 47. Initial Development Phases

## Phase 0 --- Research & Specification

Deliver:

-   PRD
-   TRD
-   Architecture
-   Database design
-   Compliance requirements
-   Payment design
-   Logistics design

## Phase 1 --- Foundation

Build:

-   Repository
-   Authentication
-   Roles
-   Database
-   CI/CD
-   Infrastructure
-   Monitoring

## Phase 2 --- Supplier

Build:

-   Supplier onboarding
-   Document submission
-   Admin verification
-   Supplier dashboard
-   Product management
-   Inventory

## Phase 3 --- Buyer

Build:

-   Buyer onboarding
-   Marketplace UI
-   Categories
-   Search
-   Product pages
-   Cart

## Phase 4 --- Commerce

Build:

-   Checkout
-   Orders
-   Payments
-   Supplier fulfillment
-   Inventory reservation

## Phase 5 --- Logistics

Build:

-   Porter integration
-   Instant delivery
-   Scheduled delivery
-   Tracking

## Phase 6 --- Hardening

Build:

-   Load testing
-   Security testing
-   Monitoring
-   Disaster recovery
-   Performance optimization
-   Production readiness

------------------------------------------------------------------------

# 48. MVP Architecture Goal

The MVP should be:

-   Fast
-   Secure
-   Simple to operate
-   Cost-controlled
-   Horizontally scalable
-   Modular
-   Easy to maintain

Avoid premature complexity.

The goal is not to recreate a huge enterprise infrastructure before Bezo
has users.

The goal is to create a strong foundation that can evolve into one.

------------------------------------------------------------------------

# 49. Technical Acceptance Criteria

The system is technically acceptable when:

1.  Buyer and supplier roles are securely isolated.
2.  Authentication works across web and mobile.
3.  Supplier documents can be securely uploaded.
4.  Admin can verify suppliers.
5.  Products can be created and searched.
6.  Inventory cannot be oversold under concurrent orders.
7.  Orders support multiple supplier fulfillments.
8.  Payments are verified server-side.
9.  Payment retries are idempotent.
10. Instant delivery can be selected where available.
11. Scheduled slots can be selected and processed.
12. Porter is accessed through a logistics abstraction.
13. Application instances can scale horizontally.
14. Database backups work and restoration is tested.
15. Logs and metrics are available.
16. Critical workflows have automated tests.
17. Production secrets are not stored in source code.

------------------------------------------------------------------------

# 50. Relationship to Future Documents

This TRD is the technical baseline.

Next documents should be created in this order:

1.  `architecture.md`
2.  `database.md`
3.  `implementation.md`
4.  `payment-system.md`
5.  `logistics.md`
6.  `security.md`
7.  `compliance.md`
8.  `server-infrastructure.md`
9.  `cost-estimation.md`

Each document should remain consistent with the PRD and TRD.

------------------------------------------------------------------------

## TRD STATUS

**Version:** 1.0\
**Status:** Planning\
**Architecture:** API-first modular architecture\
**Web:** Next.js/React/TypeScript\
**Mobile:** React Native/TypeScript\
**Backend:** Node.js/NestJS/TypeScript\
**Primary database:** PostgreSQL\
**Cache:** Redis\
**Search:** OpenSearch/Elasticsearch-compatible\
**Deployment:** Containerized managed cloud infrastructure\
**Initial logistics:** Porter\
**Primary requirement:** High-performance, secure, scalable B2B
pharmaceutical marketplace

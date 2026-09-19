# Bezo — System Architecture Document

**Version:** 1.0  
**Status:** Planning / Pre-development  
**Product:** Bezo B2B Pharmaceutical Marketplace  
**Primary Market:** India

> This document expands the PRD/TRD architecture direction. The PRD defines a high-level flow of Web/Android/iOS → CDN/WAF → Load Balancer → API Gateway → modular services → event/message layer → PostgreSQL/Redis/Search/Object Storage → Logistics Service → Porter. fileciteturn0file0

---

## 1. Architecture Goal

Bezo must provide a fast, secure, highly available marketplace connecting verified medical stores with verified pharmaceutical wholesalers.

The architecture must support:

- Shared buyer marketplace UI
- Private supplier dashboards
- Admin operations
- Multi-supplier inventory
- Supplier substitution/routing
- Order splitting
- Digital payments and COD where permitted
- Instant and scheduled delivery
- Porter integration
- Horizontal scaling
- Strong transactional consistency
- Future multi-city expansion

---

# 2. Recommended Architecture Strategy

Do **not** start with dozens of independently deployed microservices.

Use a **modular monolith / small-service architecture** initially.

The codebase has strict domain modules, but only a small number of deployable applications.

Recommended initial deployables:

```text
1. Web application
2. Mobile application
3. API application
4. Background worker
5. PostgreSQL
6. Redis
7. Search engine
```

As traffic and team size grow, extract high-load modules into independent services.

This gives Bezo:

- Faster MVP development
- Lower infrastructure complexity
- Easier debugging
- Lower initial cost
- Clear migration path to microservices

---

# 3. Complete System

```text
                         INTERNET
                            |
                     DNS / Domain
                            |
                     CDN + WAF
                            |
                  HTTPS Load Balancer
                            |
              +-------------+-------------+
              |                           |
         Web Application              API Layer
              |                           |
              |                    Authentication
              |                           |
              |                    Authorization
              |                           |
              |                    Business Modules
              |                           |
              |          +----------------+----------------+
              |          |                |                |
              |       Catalog          Orders          Payments
              |          |                |                |
              |       Inventory       Fulfillment       Gateway
              |          |                |                |
              |          +--------+-------+----------------+
              |                   |
              |              Event/Queue
              |                   |
              |              Background Worker
              |                   |
       +------+-------------------+-------------------+
       |              |            |                  |
   PostgreSQL       Redis       Search          Object Storage
       |              |            |                  |
       +--------------+------------+------------------+
                            |
                    Logistics Service
                            |
                          Porter
```

---

# 4. Client Layer

## 4.1 Web

Recommended:

- Next.js
- React
- TypeScript

The web application serves:

```text
Medical Store
Wholesaler
Admin
```

The UI can share a common application shell while providing different route groups.

```text
/buyer/*
/supplier/*
/admin/*
```

The frontend must never be responsible for enforcing authorization.

---

## 4.2 Mobile

Recommended:

- React Native
- TypeScript

Targets:

- Android
- iOS

The mobile application uses the same public backend APIs.

---

# 5. Edge Layer

## DNS

Domain:

```text
bezo.com
```

Subdomains can eventually be used for operational separation:

```text
api.bezo.com
admin.bezo.com
```

---

## CDN

CDN handles:

- Static web assets
- Product images
- Approved media
- Cacheable content

Benefits:

- Lower latency
- Lower origin traffic
- Faster images
- Better scalability

---

## WAF

WAF protects public endpoints from common web attacks and allows rate/security policies.

---

# 6. Load Balancer

Architecture:

```text
Internet
   |
CDN/WAF
   |
Load Balancer
   |
+------+------+------+
|      |      |      |
API  API    API    API
01    02     03     N
```

Application instances are stateless.

If API instance 01 fails, traffic moves to healthy instances.

Required capabilities:

- HTTPS
- Health checks
- Connection handling
- Routing
- Autoscaling integration
- Availability-zone distribution

---

# 7. API Layer

The API layer is the primary entry point for application business operations.

Recommended:

**Node.js + NestJS + TypeScript**

API version:

```text
/api/v1/*
```

Example:

```text
/api/v1/auth
/api/v1/products
/api/v1/inventory
/api/v1/cart
/api/v1/orders
/api/v1/payments
/api/v1/logistics
```

---

# 8. Authentication Architecture

```text
Client
  |
  | Login / OTP
  v
Auth Module
  |
  +--> User verification
  |
  +--> Credential verification
  |
  +--> Session/token creation
  |
  v
Access Token + Refresh Token
```

Authentication identifies the user.

Authorization determines what the user may access.

---

# 9. Authorization

Roles:

```text
MEDICAL_STORE
WHOLESALER
ADMIN
```

Future:

```text
OPERATIONS
SUPPORT
FINANCE
COMPLIANCE
```

Every protected request must be authorized server-side.

Example:

```text
Supplier A requests inventory
        |
        v
Authenticated Supplier A
        |
        v
Query scoped to supplier_id = A
        |
        v
Supplier A inventory only
```

---

# 10. Core Business Modules

The initial backend should contain these modules:

```text
Auth
Users
Medical Stores
Suppliers
Compliance
Catalog
Categories
Inventory
Search
Pricing
Cart
Orders
Fulfillment
Payments
Logistics
Notifications
Admin
Analytics
Audit
```

Modules should have clear interfaces so high-load modules can later become services.

---

# 11. Supplier Architecture

Each supplier is logically isolated.

```text
Supplier
   |
   +-- Business Profile
   +-- Documents
   +-- Products
   +-- Inventory
   +-- Orders
   +-- Fulfillments
   +-- Pricing
   +-- Payouts
```

Supplier A cannot access Supplier B's private information.

---

# 12. Buyer Architecture

All medical stores use the same marketplace application architecture.

```text
Medical Store
    |
    +-- Home
    +-- Categories
    +-- Search
    +-- Product
    +-- Cart
    +-- Checkout
    +-- Orders
    +-- Account
```

Each store has separate data.

---

# 13. Catalog Architecture

The catalog should separate:

### Product master

The pharmaceutical product identity.

### Supplier listing

A supplier's offering of that product.

Conceptually:

```text
Product
   |
   +--- Supplier Listing A
   |       |
   |       +-- Price
   |       +-- Inventory
   |
   +--- Supplier Listing B
           |
           +-- Price
           +-- Inventory
```

This is important because the same medicine may be sold by multiple wholesalers.

---

# 14. Inventory Architecture

Inventory is supplier-specific.

```text
Product
   |
Supplier
   |
Inventory
```

Recommended fields conceptually:

```text
supplier_id
product_id
available_quantity
reserved_quantity
low_stock_threshold
last_synced_at
source
status
```

Sellable quantity:

```text
available_quantity - reserved_quantity
```

The exact schema belongs in `database.md`.

---

# 15. Inventory Reservation

When an order is confirmed:

```text
Check inventory
      |
      v
Reserve stock
      |
      v
Create fulfillment
      |
      v
Confirm transaction
```

Reservation must be atomic.

This prevents two customers from purchasing the same final units simultaneously.

---

# 16. Multi-Supplier Routing

When the requested supplier has no stock:

```text
Order Item
    |
    v
Inventory Check
    |
    +---- Supplier A: unavailable
    |
    +---- Supplier B: available
    |
    +---- Supplier C: available
    |
    v
Routing Engine
    |
    v
Eligible Supplier
    |
    v
Inventory Reservation
```

Routing can eventually consider:

- Stock
- Delivery area
- Supplier operating status
- Price
- Delivery time
- Fulfillment capacity
- Business rules
- Compliance

---

# 17. Order Architecture

Separate:

**Customer Order**

from:

**Supplier Fulfillment**

Example:

```text
ORDER BZ-2026-000001
        |
        +---- Fulfillment #1
        |       Supplier A
        |       Items 1, 2
        |
        +---- Fulfillment #2
                Supplier B
                Item 3
```

The customer can see one order while internal fulfillment remains supplier-specific.

---

# 18. Order State Machine

```text
CREATED
   |
PAYMENT_PENDING
   |
CONFIRMED
   |
FULFILLMENT
   |
READY_FOR_PICKUP
   |
PICKED_UP
   |
IN_TRANSIT
   |
OUT_FOR_DELIVERY
   |
DELIVERED
```

Exception states:

```text
CANCELLED
FAILED
PARTIALLY_FULFILLED
RETURNED
REFUNDED
```

Only valid transitions are allowed.

---

# 19. Payment Architecture

```text
Buyer
  |
Checkout
  |
Order / Payment Intent
  |
Payment Gateway
  |
UPI / Card / Other
  |
Gateway Webhook
  |
Bezo Payment Service
  |
Verify
  |
Payment = PAID
  |
Order = CONFIRMED
```

The client-side payment-success screen is never the authoritative source.

Webhooks/server-side verification are authoritative.

Payment operations must support idempotency.

---

# 20. COD Architecture

For permitted orders:

```text
Checkout
   |
Payment Method = COD
   |
Order Confirmed
   |
Delivery
   |
Cash Collected
   |
Settlement/Reconciliation
```

COD rules should be configurable.

---

# 21. Instant Delivery

```text
Checkout
   |
Select Instant
   |
Check:
   - Area
   - Inventory
   - Supplier readiness
   - Logistics availability
   |
Calculate Fee
   |
Create Delivery Request
   |
Porter
```

The initial business concept is a configurable extra fee, initially discussed as ₹30.

---

# 22. Scheduled Delivery

```text
Checkout
   |
Select Date
   |
Select Slot
   |
Morning / Afternoon / Evening
   |
Order Scheduled
   |
Scheduling Queue
   |
Dispatch Window
   |
Route/Van Batching
   |
Logistics
```

Example slots:

```text
Morning   08:00–12:00
Afternoon 12:00–16:00
Evening   16:00–20:00
```

Actual times must be configurable.

---

# 23. Scheduled Route Batching

Scheduled deliveries can be grouped.

```text
Morning Slot
     |
     +-- Order A
     +-- Order B
     +-- Order C
     +-- Order D
     |
     v
Route Planning
     |
     v
Van / Logistics Provider
```

This is a major opportunity to reduce per-order delivery cost.

---

# 24. Logistics Abstraction

Never make the Order Service directly depend on Porter.

Use:

```text
Order
  |
Fulfillment
  |
Logistics Service
  |
+---------+---------+
|         |         |
Porter   Future     Bezo Fleet
Provider
```

This permits future provider changes.

---

# 25. Background Worker

Worker processes should handle:

- Notifications
- Search indexing
- Image processing
- Scheduled-order processing
- Inventory synchronization
- Payment reconciliation
- Invoice generation
- Analytics events
- Retryable third-party operations

Architecture:

```text
API
 |
Queue
 |
Worker
 |
External service / DB
```

---

# 26. Redis

Redis is a supporting system, not the primary database.

Use it for:

- Cache
- Rate limiting
- Temporary state
- Short-lived locks
- Job queues
- Frequently accessed configuration

Critical order/payment truth remains in PostgreSQL.

---

# 27. Search

Recommended search architecture:

```text
PostgreSQL
    |
    | Product changes
    v
Search Indexer
    |
    v
OpenSearch
    |
    v
Search API
    |
    v
Buyer
```

Search engine is derived data.

PostgreSQL remains the source of truth.

---

# 28. Object Storage

Use object storage for:

```text
Product images
Supplier documents
Medical-store documents
Invoices
Approved attachments
```

Sensitive documents should be private.

Access should use authorized/signed URLs.

---

# 29. Database Architecture

Initial:

```text
Application
    |
Connection Pool
    |
PostgreSQL Primary
```

Growth:

```text
                 PostgreSQL
                     |
              +------+------+
              |             |
           Primary       Read Replica
```

Database scaling should start with:

- Correct schema
- Indexing
- Query optimization
- Connection pooling
- Read replicas

Sharding should be considered only when required by measured scale.

---

# 30. Event Architecture

Important events:

```text
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

Events allow notifications, analytics, search indexing and other workflows to remain decoupled.

---

# 31. Security Architecture

```text
Internet
   |
CDN/WAF
   |
Load Balancer
   |
API
   |
Authentication
   |
Authorization
   |
Validation
   |
Business Logic
   |
Database
```

Database and internal services should not be directly internet-accessible.

---

# 32. Sensitive Documents

Supplier/license documents must:

- Use private object storage
- Be encrypted at rest
- Have restricted access
- Have audit logs
- Use signed/temporary URLs
- Have file-size/type validation
- Be scanned where appropriate

---

# 33. Audit Architecture

Sensitive actions create audit records.

Examples:

```text
Supplier approved
License changed
Product created
Inventory changed
Price changed
Order state changed
Payment refunded
Admin suspended user
```

Audit records should identify:

- Actor
- Action
- Target
- Timestamp
- Relevant previous/new values
- Request/source metadata where appropriate

---

# 34. Observability

Monitor:

### Infrastructure

- CPU
- Memory
- Disk
- Network
- Instance health

### Application

- Request rate
- p50/p95/p99 latency
- Error rate
- Queue depth
- Worker failures

### Business

- Orders/minute
- Payment success
- Inventory failures
- Order cancellations
- Delivery failures

---

# 35. High Availability

Avoid single points of failure.

Production should use:

- Multiple application instances
- Availability-zone distribution
- Managed database with high availability
- Automated backups
- Health checks
- Load balancer
- Redundant critical components

---

# 36. Deployment Environments

```text
Development
     |
Staging
     |
Production
```

Production should use isolated credentials and infrastructure.

---

# 37. CI/CD

```text
Git
 |
Build
 |
Lint
 |
Unit Tests
 |
Integration Tests
 |
Security Checks
 |
Container Build
 |
Staging
 |
Smoke Tests
 |
Production
```

Database migrations must be version-controlled.

---

# 38. Recommended Infrastructure Direction

Initial cloud architecture should use managed services rather than manually operated servers.

Preferred characteristics:

- Managed PostgreSQL
- Managed Redis
- Managed load balancer
- Managed object storage
- Managed CDN/WAF
- Managed container runtime
- Managed monitoring
- Automated backups

A specific provider and instance sizing belongs in `server-infrastructure.md`.

---

# 39. Scaling Model

Scale application servers horizontally:

```text
Low traffic
   |
2 instances

Higher traffic
   |
4 instances

Peak traffic
   |
N instances
```

The load balancer distributes requests.

Application instances remain stateless.

---

# 40. Performance Architecture

Performance strategy:

```text
CDN
 ↓
Browser/App Cache
 ↓
Redis
 ↓
Optimized API
 ↓
Indexed PostgreSQL/Search
```

Use:

- Pagination
- Lazy loading
- Image optimization
- Compression
- Connection pooling
- Query optimization
- Cache-aside where appropriate
- Background processing

---

# 41. Failure Handling

Third-party systems can fail.

Examples:

- Payment gateway unavailable
- Porter API unavailable
- SMS provider unavailable
- Search temporarily unavailable

Bezo should use:

- Timeouts
- Retries with limits
- Exponential backoff
- Idempotency
- Circuit breakers where appropriate
- Dead-letter handling for failed asynchronous jobs

Never retry payment or logistics operations blindly.

---

# 42. Recommended Initial Deployment

```text
                         Users
                           |
                      CDN + WAF
                           |
                    Load Balancer
                           |
              +------------+------------+
              |                         |
         Web / Frontend            API Instances
                                        |
                                +-------+-------+
                                |               |
                            PostgreSQL        Redis
                                |
                           Object Storage

API
 |
 +---- Search
 |
 +---- Payment Gateway
 |
 +---- Porter
 |
 +---- Queue
          |
        Worker
```

---

# 43. Future Evolution

When usage grows:

```text
Modular Backend
      |
      +---- Auth Service
      +---- Catalog Service
      +---- Inventory Service
      +---- Order Service
      +---- Payment Service
      +---- Logistics Service
      +---- Search Service
```

Only extract services when there is a clear reason such as:

- Independent scaling
- Independent deployment
- Team ownership
- Isolation
- Reliability requirements
- High traffic

---

# 44. Architecture Decision Summary

| Area | Direction |
|---|---|
| Web | Next.js + React + TypeScript |
| Mobile | React Native + TypeScript |
| Backend | Node.js + NestJS + TypeScript |
| Initial architecture | Modular monolith / small services |
| Primary DB | PostgreSQL |
| Cache | Redis |
| Search | OpenSearch/Elasticsearch-compatible |
| Object storage | S3-compatible |
| Edge | CDN + WAF |
| Load balancing | Managed HTTP/HTTPS load balancer |
| Compute | Managed containers |
| Queue | Redis-backed queue initially |
| Payments | Payment gateway abstraction |
| Logistics | Logistics abstraction → Porter |
| Scaling | Horizontal |
| Infrastructure | Managed cloud services |
| IaC | Terraform |
| Observability | Metrics + logs + tracing |

---

# 45. Architecture Acceptance Criteria

The architecture is ready for implementation when:

1. Buyer and supplier experiences are separated by authorization.
2. Supplier data is tenant-isolated.
3. Product catalog supports multiple suppliers.
4. Inventory reservations prevent overselling.
5. Orders can split into supplier fulfillments.
6. Payments are verified server-side.
7. Instant and scheduled deliveries are represented independently.
8. Logistics is abstracted from Porter.
9. API instances are stateless and horizontally scalable.
10. PostgreSQL is the transactional source of truth.
11. Redis is used only for appropriate supporting workloads.
12. Search is decoupled from the transactional database.
13. Sensitive documents are private.
14. Critical actions are audited.
15. Production has health checks, backups and monitoring.
16. The MVP can evolve toward independent services without rewriting the entire system.

---

## STATUS

**Architecture Version:** 1.0  
**Stage:** Pre-development  
**Primary goal:** Fast, secure, modular and horizontally scalable foundation for Bezo.


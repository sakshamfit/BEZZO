# Bezo Implementation Plan v1.0

## 1. Purpose

This document converts the Bezo PRD, TRD, architecture, and database design into an executable engineering plan.

The goal is to build Bezo as a production-grade B2B pharmaceutical marketplace connecting:

- Medical store owners / pharmacy buyers
- Verified medicine wholesalers / suppliers
- Logistics providers, initially through Porter
- Bezo operations/admin teams

The implementation should prioritize correctness, pharmaceutical compliance, security, reliability, and measurable performance.

---

## 2. Implementation Principles

1. Build the smallest production-capable system first.
2. Keep domain boundaries clean so high-load modules can later become independent services.
3. Never trust client-side payment, inventory, price, role, or verification state.
4. Make every important external operation idempotent.
5. Treat inventory reservation as a concurrency-sensitive operation.
6. Keep supplier data isolated from other suppliers.
7. Keep buyer private data isolated between accounts.
8. Make delivery-provider integrations replaceable.
9. Make payment-provider integrations replaceable.
10. Record important business actions in audit logs.
11. Prefer managed infrastructure over unnecessary operational complexity.
12. Measure performance instead of describing the system as having “zero latency.”

---

# 3. Recommended Repository Strategy

Use a TypeScript monorepo.

Suggested structure:

```text
bezo/
├── apps/
│   ├── web/
│   ├── mobile/
│   ├── api/
│   └── admin/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── validation/
│   ├── config/
│   ├── api-client/
│   ├── auth/
│   ├── domain/
│   └── observability/
│
├── infrastructure/
│   ├── terraform/
│   ├── docker/
│   └── scripts/
│
├── docs/
│   ├── prd/
│   ├── trd/
│   ├── architecture/
│   ├── database/
│   ├── api/
│   └── operations/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

Recommended tooling:

- Package manager: pnpm
- Monorepo orchestration: Turborepo
- Language: TypeScript
- Formatting: Prettier
- Linting: ESLint
- Git hooks: Husky + lint-staged
- Commit convention: Conventional Commits

---

# 4. Application Stack

## Web

- Next.js
- React
- TypeScript
- Server-side rendering where useful
- Client components only where interaction requires them
- CDN caching for public/static content

## Mobile

- React Native
- TypeScript
- Shared API/domain types with web
- Native device capabilities where required

## Backend

- Node.js
- NestJS
- TypeScript
- REST API initially
- OpenAPI documentation

## Data

- PostgreSQL
- Redis
- OpenSearch-compatible search
- S3-compatible object storage

## Infrastructure

- Managed containers/compute
- Managed PostgreSQL
- Managed Redis
- Managed object storage
- CDN
- WAF
- Load balancer
- Queue/background workers
- Centralized logs
- Metrics
- Distributed tracing

---

# 5. Environment Strategy

Create three primary environments:

```text
local
staging
production
```

Optional later:

```text
development
preview
```

Each environment must have separate:

- Database
- Redis
- Object-storage namespace/bucket
- API credentials
- Payment credentials
- Logistics credentials
- Authentication secrets
- Notification credentials

Never use production credentials locally.

---

# 6. Configuration and Secrets

Use environment variables for configuration.

Example:

```text
NODE_ENV
DATABASE_URL
REDIS_URL
SEARCH_URL
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY

JWT_PRIVATE_KEY
JWT_PUBLIC_KEY

PAYMENT_PROVIDER
PAYMENT_API_KEY
PAYMENT_WEBHOOK_SECRET

PORTER_API_KEY
PORTER_WEBHOOK_SECRET

SMS_PROVIDER_KEY
EMAIL_PROVIDER_KEY
PUSH_PROVIDER_KEY
```

Production secrets should be stored in a managed secrets manager.

Never commit secrets to Git.

---

# 7. Backend Module Architecture

The NestJS API should be organized by business domain rather than by technical layer alone.

Suggested modules:

```text
src/
├── auth/
├── users/
├── buyers/
├── suppliers/
├── verification/
├── catalog/
├── categories/
├── products/
├── inventory/
├── search/
├── carts/
├── checkout/
├── orders/
├── fulfillment/
├── payments/
├── logistics/
├── delivery-slots/
├── notifications/
├── admin/
├── pricing/
├── promotions/
├── audit/
├── files/
├── health/
└── common/
```

Each module should have clear:

```text
controller
service
domain logic
repository/data-access layer
DTOs
validators
events
tests
```

Do not allow arbitrary cross-module database access.

---

# 8. Authentication Implementation

Implement authentication before business features that depend on identity.

Required capabilities:

- Registration
- Login
- Logout/session invalidation
- Access token
- Refresh token
- Password reset
- Phone/email verification as required
- Device/session management
- Account suspension
- Role assignment

Roles should include at least:

```text
BUYER
SUPPLIER
ADMIN
OPERATIONS
SUPPORT
```

Never rely on the frontend to enforce roles.

Backend authorization must verify:

1. authenticated user
2. role
3. ownership/tenant relationship
4. resource state
5. requested operation

---

# 9. Supplier Isolation

Every supplier-owned resource must be scoped to the authenticated supplier.

Examples:

```text
supplier_products
supplier_inventory
supplier_orders
supplier_prices
supplier_documents
supplier_reports
```

A supplier API request must not be able to access another supplier's records simply by changing an ID.

Example bad pattern:

```text
GET /products/:id
```

without ownership validation.

Correct logic:

```text
product.id = requestedId
AND product.supplier_id = authenticatedSupplierId
```

Apply the same principle to updates, deletes, downloads, analytics, and exports.

---

# 10. Buyer Onboarding

Build the buyer onboarding flow after authentication.

Typical stages:

```text
ACCOUNT_CREATED
PROFILE_PENDING
BUSINESS_DETAILS_PENDING
DOCUMENTS_PENDING
ACTIVE
SUSPENDED
```

Capture applicable business information and documentation.

The exact legal requirements must be validated for the operating jurisdiction before production launch.

---

# 11. Supplier Onboarding

Supplier onboarding is a high-priority compliance workflow.

Suggested state machine:

```text
REGISTERED
   ↓
DOCUMENTS_PENDING
   ↓
UNDER_REVIEW
   ├──→ REJECTED
   │
   ↓
VERIFIED
   ↓
ACTIVE
   ↓
SUSPENDED
```

Collect applicable information such as:

- Business identity
- GST/business information
- Applicable wholesale drug licence
- Identity information
- Premises/storage information
- Qualified person/pharmacist documentation where required
- Bank details
- Supporting documents

Do not hard-code legal assumptions into the product without regulatory validation.

---

# 12. Document Upload Pipeline

Documents and product images should never be stored directly in PostgreSQL.

Use object storage.

Flow:

```text
Client
  ↓
Request upload authorization
  ↓
Backend validates file metadata
  ↓
Signed upload URL
  ↓
Object storage
  ↓
Virus/security scanning
  ↓
Metadata persisted
  ↓
Moderation/verification
```

Validate:

- MIME type
- File size
- File extension
- Malware/security status
- Ownership/access permissions

Private documents should use private object-storage access.

---

# 13. Product Catalog Implementation

Supplier product creation should require structured fields.

Example:

```text
product
├── name
├── generic_name
├── brand
├── composition
├── strength
├── dosage_form
├── manufacturer
├── pack_size
├── category
├── prescription_status
├── storage_conditions
└── media
```

Supplier-specific commercial data should remain separate:

```text
supplier_product
├── supplier_id
├── product_id
├── selling_price
├── mrp
├── available_quantity
├── minimum_order_quantity
├── status
└── timestamps
```

This separation allows one canonical product to be offered by multiple suppliers.

---

# 14. Product Image Requirements

Support multiple images where useful:

```text
front
back
side
label
packaging
```

Image processing pipeline:

```text
Upload
→ Validate
→ Scan
→ Resize
→ Optimize
→ Generate thumbnails
→ Store
→ CDN
```

Use WebP/AVIF where compatible while preserving original files when legally/operationally necessary.

Do not allow an uploaded image to execute as application content.

---

# 15. Search Implementation

Search should not query PostgreSQL for every marketplace search request once the catalog grows.

Use OpenSearch-compatible infrastructure.

Index fields such as:

- Product name
- Generic name
- Brand
- Composition
- Manufacturer
- Category
- Dosage form
- Strength
- Supplier availability
- Relevant searchable attributes

Search pipeline:

```text
Product change
      ↓
Domain event
      ↓
Queue
      ↓
Search index worker
      ↓
OpenSearch
```

Search results should be filtered by:

- Active/verified supplier
- Product availability
- Buyer eligibility
- Applicable prescription/compliance restrictions
- Geographic/serviceability rules

---

# 16. Inventory Implementation

Inventory is one of the most important correctness areas.

Represent inventory with:

```text
available_quantity
reserved_quantity
```

Available stock should not simply be decremented permanently when an item enters a cart.

Recommended lifecycle:

```text
AVAILABLE
   ↓
RESERVED
   ↓
ALLOCATED
   ↓
FULFILLED
```

Failed/expired reservations return stock to available inventory.

---

# 17. Inventory Reservation

Reservation must be atomic.

Example transaction concept:

```sql
UPDATE inventory
SET available_quantity = available_quantity - :qty,
    reserved_quantity = reserved_quantity + :qty
WHERE supplier_product_id = :id
  AND available_quantity >= :qty;
```

Verify that exactly one row was updated.

If zero rows were updated:

```text
OUT_OF_STOCK
```

Use database transactions and appropriate locking/isolation where multiple items or supplier allocations are involved.

Do not trust frontend stock numbers.

---

# 18. Inventory Expiration

Reservations need an expiration time.

Example:

```text
reservation_created_at
reservation_expires_at
```

Background worker:

```text
Find expired reservations
→ release inventory
→ mark reservation expired
→ notify checkout/order subsystem if required
```

Make the release operation idempotent.

---

# 19. Supplier Stock Synchronization

MVP:

```text
Supplier dashboard
→ Manual inventory update
```

Later:

```text
ERP/POS/API
→ Integration adapter
→ Inventory service
→ Event
→ Search index
```

Possible future integrations:

- Supplier ERP
- POS
- CSV/import
- Scheduled APIs
- Webhooks

Do not build every integration before the core marketplace is validated.

---

# 20. Multi-Supplier Product Fulfillment

A buyer may purchase multiple products from one or multiple suppliers.

The customer-facing object should remain:

```text
Order
```

Internally use:

```text
Order
 ├── Fulfillment A → Supplier A
 ├── Fulfillment B → Supplier B
 └── Fulfillment C → Supplier C
```

This allows:

- Supplier-specific inventory
- Supplier-specific packing
- Supplier-specific invoices
- Supplier-specific logistics
- Supplier-specific settlement

The buyer should not need to understand the internal complexity unless necessary.

---

# 21. Supplier Selection

Create a supplier allocation component.

Inputs may include:

- Product availability
- Quantity
- Supplier verification status
- Serviceability
- Price
- Delivery capability
- Delivery slot
- Business rules

The allocation engine should return eligible fulfillment candidates.

Do not encode supplier selection permanently inside the checkout controller.

---

# 22. Cart Implementation

Cart responsibilities:

- Add item
- Remove item
- Change quantity
- Validate availability
- Calculate pricing
- Calculate applicable fees
- Prepare checkout

Cart data may be stored in Redis for fast temporary state, while important finalized data is persisted in PostgreSQL.

Never treat a stale cart quantity as guaranteed inventory.

---

# 23. Checkout Flow

Recommended flow:

```text
Cart
 ↓
Validate buyer
 ↓
Validate products
 ↓
Validate supplier eligibility
 ↓
Check inventory
 ↓
Calculate prices
 ↓
Calculate taxes/fees
 ↓
Select delivery mode
 ↓
Select delivery slot
 ↓
Reserve inventory
 ↓
Create order
 ↓
Create payment
 ↓
Confirm payment
 ↓
Create fulfillment(s)
 ↓
Create logistics task
```

Each critical stage should be recoverable.

---

# 24. Pricing

Never trust client-submitted totals.

The backend calculates:

```text
subtotal
+ applicable taxes
+ delivery fee
+ instant fee
- discounts
= payable amount
```

Persist the calculated amounts on the order so historical orders do not change if catalog pricing changes later.

---

# 25. Payment Integration

Implement a payment abstraction:

```text
PaymentProvider
├── createPayment()
├── verifyPayment()
├── refundPayment()
└── handleWebhook()
```

Possible providers can be configured independently.

Payment success must be established server-side.

Do not mark an order paid merely because the frontend says:

```text
payment_success = true
```

---

# 26. Payment Webhooks

Webhook flow:

```text
Gateway
 ↓
POST /webhooks/payment
 ↓
Verify signature
 ↓
Check idempotency/event ID
 ↓
Persist event
 ↓
Update payment
 ↓
Update order
 ↓
Trigger fulfillment
```

Webhook processing must be idempotent.

The same webhook may be delivered more than once.

---

# 27. Order State Machine

Use explicit states.

Example:

```text
CREATED
PAYMENT_PENDING
PAID
ALLOCATING
ALLOCATED
PACKING
READY_FOR_PICKUP
PICKED_UP
IN_TRANSIT
DELIVERED
CANCELLED
FAILED
REFUNDED
```

Do not allow arbitrary status transitions.

Create a transition validator.

---

# 28. Instant Delivery

Instant delivery should be configurable.

Example concept:

```text
delivery_mode = INSTANT
instant_fee = configured_amount
```

The previously discussed ₹30 is a product/business configuration example, not a permanent technical constant.

Flow:

```text
Order paid
→ Fulfillment ready
→ Logistics request
→ Porter
→ Pickup
→ Delivery
→ Completion
```

---

# 29. Scheduled Delivery

Represent:

```text
delivery_date
delivery_slot
```

Example configurable slots:

```text
MORNING
AFTERNOON
EVENING
```

Example time windows used for implementation testing may be:

```text
08:00–12:00
12:00–16:00
16:00–20:00
```

These must remain configurable.

Scheduled order flow:

```text
Order created
→ Scheduled queue
→ Approaching dispatch window
→ Batch eligible orders
→ Route planning
→ Logistics assignment
→ Pickup
→ Delivery
```

---

# 30. Logistics Abstraction

Do not integrate Porter directly throughout the order code.

Create:

```text
LogisticsProvider
```

with operations such as:

```text
createDelivery()
cancelDelivery()
trackDelivery()
getQuote()
```

Then implement:

```text
PorterAdapter
```

This makes future providers or Bezo-owned fleet support possible without rewriting order logic.

---

# 31. Porter Integration

Implementation must be based on Porter's current API documentation and commercial integration agreement.

The adapter should isolate:

- Authentication
- Quote requests
- Delivery creation
- Pickup details
- Drop details
- Tracking
- Cancellation
- Webhooks
- Error mapping

Do not assume API field names until verified against the current provider documentation.

---

# 32. Notifications

Create a notification service rather than sending messages directly from every business module.

Supported channels may include:

```text
PUSH
SMS
EMAIL
IN_APP
WHATSAPP
```

Example event:

```text
ORDER_PAID
```

Notification service decides which channels are enabled.

---

# 33. Background Jobs

Use workers for tasks that should not block user requests.

Examples:

- Search indexing
- Image processing
- Document scanning
- Reservation expiration
- Scheduled-order dispatch
- Notifications
- Payment reconciliation
- Logistics status synchronization
- Analytics events
- Reports
- Data exports

Every worker should support retry and idempotency.

---

# 34. Admin Portal

Admin capabilities should include:

## Supplier management

- Review applications
- Review documents
- Verify/reject
- Suspend/reactivate

## Buyer management

- View account
- Review business information
- Suspend/reactivate

## Catalog

- Product moderation
- Category management
- Product corrections

## Orders

- Search
- Inspect status
- Inspect fulfillments
- Handle operational exceptions

## Payments

- Payment status
- Refunds
- Reconciliation

## Logistics

- Delivery status
- Failed deliveries
- Exceptions

## Audit

- Who performed an action
- What changed
- When it changed

---

# 35. API Design

Version APIs:

```text
/api/v1/
```

Example:

```text
POST /api/v1/auth/login
GET  /api/v1/products
GET  /api/v1/products/:id

POST /api/v1/cart/items
POST /api/v1/checkout

POST /api/v1/orders
GET  /api/v1/orders/:id

POST /api/v1/payments/webhook
```

Use consistent response/error formats.

Example:

```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Requested quantity is unavailable."
  },
  "requestId": "..."
}
```

Avoid exposing internal stack traces or database details.

---

# 36. API Validation

Validate all external input.

Use schema validation for:

- Request body
- Query parameters
- Path parameters
- Headers where required
- Uploaded files
- Webhooks

Reject unexpected fields where appropriate.

---

# 37. Database Migrations

Use version-controlled migrations.

Rules:

1. Never manually modify production schema without a migration.
2. Every schema change gets a migration.
3. Migrations must be reviewed.
4. Destructive migrations require a staged rollout.
5. Test migrations against a production-like database.

---

# 38. Testing Strategy

Use a testing pyramid.

## Unit tests

Test:

- Pricing
- Inventory calculations
- State transitions
- Supplier allocation
- Permissions
- Delivery slot rules

## Integration tests

Test:

- PostgreSQL repositories
- Redis interactions
- Payment webhooks
- Logistics adapters
- Search indexing

## API tests

Test:

- Authentication
- Authorization
- Buyer flows
- Supplier flows
- Admin flows
- Checkout

## End-to-end tests

Critical flows:

```text
Supplier onboarding
Buyer onboarding
Product discovery
Cart
Checkout
Payment
Order fulfillment
Delivery tracking
```

---

# 39. Security Testing

Test:

- Broken access control
- IDOR/resource enumeration
- SQL injection
- XSS
- CSRF where applicable
- SSRF
- File-upload attacks
- Rate-limit bypass
- Authentication bypass
- Session abuse
- Webhook forgery
- Privilege escalation

Supplier isolation must have dedicated automated tests.

---

# 40. Performance Targets

Use measurable objectives.

Initial engineering targets should be finalized through load testing, but the application should aim for:

- Fast initial page rendering
- Low API latency for common read operations
- Efficient database queries
- CDN delivery for static assets
- Search responses suitable for interactive use
- No unnecessary blocking network calls
- Background processing for expensive operations

Track:

```text
p50 latency
p95 latency
p99 latency
error rate
throughput
CPU
memory
DB connections
cache hit rate
search latency
queue lag
```

Do not use “0 seconds latency” as a literal requirement.

---

# 41. Frontend Performance

Web implementation:

- Server-render public/catalog content where beneficial
- Minimize client JavaScript
- Lazy-load noncritical components
- Optimize images
- Use CDN
- Cache safe read requests
- Avoid unnecessary re-renders
- Virtualize large product lists
- Prefetch likely navigation targets
- Paginate or infinite-scroll large catalogs appropriately

Mobile:

- Cache safe data locally
- Avoid unnecessary API calls
- Compress images
- Paginate lists
- Handle offline/intermittent connectivity gracefully

---

# 42. Caching Strategy

Use Redis for:

- Sessions where applicable
- Short-lived cart state
- Rate limits
- Frequently accessed configuration
- Temporary reservation data where appropriate
- Cacheable read results

Do not cache sensitive mutable business data without a clear invalidation strategy.

Cache keys must be scoped by tenant/user where required.

---

# 43. Observability

Every request should have a request/correlation ID.

Track:

- API request metrics
- Error rates
- DB latency
- Redis latency
- Search latency
- Queue lag
- Payment failures
- Logistics failures
- Order state failures

Use distributed tracing across:

```text
API
→ database
→ queue
→ payment
→ logistics
```

---

# 44. Audit Logging

Audit events should include:

```text
actor
actor_role
action
resource_type
resource_id
timestamp
request_id
metadata
```

Examples:

```text
SUPPLIER_VERIFIED
SUPPLIER_SUSPENDED
PRODUCT_APPROVED
PRICE_CHANGED
ORDER_CANCELLED
REFUND_ISSUED
ADMIN_LOGIN
```

Avoid putting unnecessary sensitive personal information into logs.

---

# 45. CI/CD

Every pull request should run:

```text
install
→ typecheck
→ lint
→ unit tests
→ integration tests
→ build
```

Production deployment:

```text
merge
→ CI
→ build
→ security checks
→ deploy staging
→ smoke tests
→ approval
→ production
```

Use automated rollback where practical.

---

# 46. Docker

Create production-ready images for:

```text
api
worker
web
admin
```

Images should:

- Use minimal base images
- Run as non-root
- Pin important dependencies
- Include health checks
- Avoid secrets inside the image

---

# 47. Infrastructure as Code

Use Terraform for:

- Networking
- Database
- Redis
- Object storage
- Load balancer
- CDN
- WAF
- Compute
- Queues
- Monitoring
- Secrets integration

Infrastructure changes should be reviewed like application code.

---

# 48. Deployment Topology

Initial production topology:

```text
                    Internet
                       |
                    CDN/WAF
                       |
                Load Balancer
                 /           \
              Web             API
                               |
                -------------------------
                |           |           |
             PostgreSQL   Redis      Search
                |
             Object Storage

API → Queue → Workers
API → Payment Provider
API → Porter
```

As traffic increases, independently scale:

- API
- Workers
- Search
- Database read capacity
- Cache

---

# 49. Disaster Recovery

Implement:

- Automated PostgreSQL backups
- Point-in-time recovery where supported
- Object-storage versioning where appropriate
- Backup retention policy
- Infrastructure recreation through Terraform
- Restore testing

A backup that has never been restored is not considered verified.

---

# 50. Rate Limiting

Apply rate limits to:

- Login
- OTP requests
- Password reset
- Search
- Product creation
- Checkout
- Payment creation
- Webhooks
- File upload authorization
- Admin authentication

Use stricter limits on security-sensitive endpoints.

---

# 51. Idempotency

Use idempotency keys for operations such as:

```text
Create order
Create payment
Create logistics delivery
Refund
```

Example:

```text
Idempotency-Key: <unique-request-id>
```

The server stores the result and safely returns it if the same operation is retried.

---

# 52. Error Handling

Define domain error codes.

Examples:

```text
UNAUTHORIZED
FORBIDDEN
RESOURCE_NOT_FOUND
VALIDATION_ERROR
SUPPLIER_NOT_VERIFIED
PRODUCT_UNAVAILABLE
OUT_OF_STOCK
PAYMENT_FAILED
DELIVERY_UNAVAILABLE
INVALID_STATE_TRANSITION
RATE_LIMITED
```

Errors should be actionable for clients without exposing internal implementation details.

---

# 53. Development Phases

## Phase 0 — Foundation

Build:

- Monorepo
- TypeScript configuration
- CI
- Docker
- Local development environment
- Database migrations
- Logging
- Error handling
- Authentication foundation

Acceptance:

- All apps start locally
- CI passes
- Database migrations run
- Health endpoints work

---

## Phase 1 — Identity and Onboarding

Build:

- Buyer registration
- Supplier registration
- Login
- Roles
- Supplier verification workflow
- Buyer profile
- Document uploads
- Admin review

Acceptance:

- Supplier cannot sell until verified
- Admin can approve/reject
- Buyer account is isolated
- Unauthorized users cannot access protected resources

---

## Phase 2 — Catalog

Build:

- Categories
- Product model
- Supplier products
- Product images
- Supplier pricing
- Inventory
- Admin moderation

Acceptance:

- Verified supplier can publish products
- Supplier can only modify own products
- Buyer can browse active products

---

## Phase 3 — Search

Build:

- OpenSearch
- Indexing worker
- Search API
- Filters
- Sorting
- Pagination
- Availability filtering

Acceptance:

- Product changes reach search index reliably
- Search remains responsive under load
- Index failures can be retried

---

## Phase 4 — Cart and Checkout

Build:

- Cart
- Pricing engine
- Inventory validation
- Reservation
- Checkout
- Order creation

Acceptance:

- Overselling is prevented
- Expired reservations release inventory
- Totals are server calculated

---

## Phase 5 — Payments

Build:

- Payment abstraction
- Gateway adapter
- Webhooks
- Idempotency
- Refunds
- Reconciliation foundation

Acceptance:

- Frontend cannot fake payment success
- Duplicate webhooks do not duplicate orders/fulfillments
- Payment and order state remain consistent

---

## Phase 6 — Fulfillment

Build:

- Supplier allocation
- Fulfillment records
- Packing states
- Multi-supplier orders

Acceptance:

- One order can contain multiple fulfillments
- Supplier sees only own fulfillment
- Buyer sees consolidated order status

---

## Phase 7 — Logistics

Build:

- Logistics abstraction
- Porter adapter
- Delivery creation
- Tracking
- Cancellation
- Webhooks

Acceptance:

- Logistics failures are recoverable
- Porter-specific code is isolated
- Order state follows delivery events correctly

---

## Phase 8 — Scheduled Delivery

Build:

- Delivery slots
- Scheduled queue
- Dispatch-window worker
- Route batching foundation

Acceptance:

- Scheduled orders are not dispatched early
- Orders are grouped by eligible dispatch window
- Failed scheduling jobs can retry safely

---

## Phase 9 — Notifications

Build:

- Notification service
- Push
- SMS
- Email
- In-app notifications

Acceptance:

- Important order events produce expected notifications
- Notification retries do not create uncontrolled duplicates

---

## Phase 10 — Operations and Hardening

Build:

- Admin dashboards
- Audit logs
- Reconciliation
- Monitoring
- Security hardening
- Load testing
- Backup/restore testing
- Incident procedures

Acceptance:

- Production readiness checklist passes
- Critical flows have monitoring
- Restore procedure has been tested

---

# 54. MVP Scope

The first production MVP should focus on:

```text
Authentication
Supplier verification
Buyer onboarding
Catalog
Supplier inventory
Search
Cart
Checkout
Payments
Order management
Supplier fulfillment
Porter delivery
Instant delivery
Scheduled delivery
Notifications
Admin
Audit logs
Monitoring
```

Avoid initially building:

- Full ERP suite
- Advanced recommendation engine
- Complex loyalty program
- Multi-country tax engine
- Warehouse robotics
- Large microservice fleet
- Kubernetes unless operationally justified
- Every payment/logistics provider
- Every ERP integration

---

# 55. Definition of Done

A feature is not complete merely because the UI works.

A production feature must include:

```text
Requirement implemented
+ Backend validation
+ Authorization
+ Database migration
+ Error handling
+ Logging
+ Tests
+ Monitoring where needed
+ Documentation
+ Security review
+ Performance consideration
+ Deployment support
```

---

# 56. Release Checklist

Before production release:

## Application

- [ ] TypeScript passes
- [ ] Lint passes
- [ ] Tests pass
- [ ] Production build passes
- [ ] Environment variables verified

## Security

- [ ] Authentication tested
- [ ] Authorization tested
- [ ] Supplier isolation tested
- [ ] File upload security tested
- [ ] Rate limits enabled
- [ ] Secrets secured

## Data

- [ ] Migrations tested
- [ ] Backups enabled
- [ ] Restore tested
- [ ] Indexes verified

## Payments

- [ ] Webhook signatures verified
- [ ] Idempotency tested
- [ ] Refund flow tested
- [ ] Reconciliation process documented

## Logistics

- [ ] Porter integration tested
- [ ] Cancellation tested
- [ ] Tracking tested
- [ ] Failure/retry tested

## Operations

- [ ] Monitoring enabled
- [ ] Alerts configured
- [ ] Logs accessible
- [ ] Incident runbook available

---

# 57. First Engineering Backlog

The initial backlog should be implemented in approximately this order:

1. Monorepo initialization
2. Local PostgreSQL
3. Local Redis
4. NestJS API
5. Next.js web
6. React Native mobile
7. Shared TypeScript packages
8. Authentication
9. RBAC
10. Database migrations
11. Buyer onboarding
12. Supplier onboarding
13. Supplier document upload
14. Admin verification
15. Category management
16. Product management
17. Product images
18. Supplier inventory
19. Search indexing
20. Search UI
21. Cart
22. Reservation engine
23. Checkout
24. Payment abstraction
25. Payment gateway
26. Payment webhook
27. Orders
28. Fulfillments
29. Supplier order dashboard
30. Delivery slots
31. Porter adapter
32. Instant delivery
33. Scheduled delivery
34. Notifications
35. Admin operations
36. Audit logs
37. Monitoring
38. Load testing
39. Security testing
40. Production deployment

---

# 58. Engineering Rule for Bezo

When implementing any new feature, ask:

```text
Who owns this data?
Who is allowed to read it?
Who is allowed to modify it?
What happens if the request is duplicated?
What happens if it fails halfway?
What happens if two users act simultaneously?
What happens if an external provider is unavailable?
Can it be audited?
Can it be monitored?
Can it scale?
Can it be rolled back?
```

This checklist should be applied consistently across the platform.

---

# 59. Final Implementation Direction

Bezo should begin as a modular, strongly typed production system rather than a large collection of independent microservices.

The initial architecture should keep clear boundaries around:

```text
Identity
Supplier
Buyer
Catalog
Inventory
Search
Cart
Checkout
Orders
Fulfillment
Payments
Logistics
Notifications
Admin
Audit
```

As actual traffic and operational requirements become measurable, the highest-load or highest-risk modules can be extracted into independently deployable services.

The implementation should therefore optimize for:

**correctness first → security → compliance → reliability → measurable performance → scale.**


# Bezzo Testing & QA Strategy v1.0

## 1. Purpose

This document defines the quality-assurance strategy for Bezzo across:

- Web
- Android
- iOS
- Backend API
- Supplier dashboard
- Buyer marketplace
- Admin portal
- Database
- Search
- Payments
- Logistics
- Notifications
- Infrastructure

The objective is not simply to verify that screens work.

The objective is to prove that Bezzo is:

**correct, secure, reliable, compliant-aware, performant, recoverable, and production-ready.**

---

# 2. Quality Principles

1. Test business rules, not only UI behavior.
2. Test authorization on the server.
3. Test supplier tenant isolation explicitly.
4. Treat inventory as a concurrency problem.
5. Treat payments as asynchronous and failure-prone.
6. Treat logistics as an external dependency.
7. Test duplicate requests and duplicate webhooks.
8. Test partial failures.
9. Test real-device mobile behavior.
10. Measure performance under realistic load.
11. Automate regression tests for critical flows.
12. Test recovery, not only happy paths.

---

# 3. Test Pyramid

Bezzo should use:

```text
                 E2E
               /     \
          Integration
          /           \
       API / Contract
       /               \
    Unit Tests       Component Tests
```

The majority of tests should be fast unit/API tests.

E2E tests should focus on high-value user journeys.

---

# 4. Test Environments

## Local

Used for:

- Unit tests
- Component tests
- Basic integration tests
- Developer debugging

## Staging

Production-like environment for:

- Full integration testing
- Payment sandbox
- Logistics sandbox/mock
- E2E
- Load testing
- Release validation

## Production

Use controlled smoke checks and monitoring.

Do not perform destructive test scenarios against production.

---

# 5. Test Data Strategy

Create deterministic test fixtures.

Examples:

```text
buyer_verified
buyer_unverified
supplier_verified
supplier_pending
supplier_rejected
supplier_suspended
product_available
product_out_of_stock
product_restricted
order_paid
order_pending
order_cancelled
```

Never use real customer personal data in test environments unless specifically authorized, anonymized, and legally appropriate.

---

# 6. Test Data Isolation

Every environment must use separate data.

Do not allow:

```text
staging → production database
test → production payment credentials
test → production logistics account
```

---

# 7. Unit Testing

Unit tests should cover pure business logic.

High-priority units:

- Pricing calculation
- Delivery fee calculation
- Supplier allocation
- Inventory reservation
- Inventory release
- Order-state transitions
- Payment-state transitions
- Delivery-slot rules
- Permission checks
- Product eligibility
- Licence-expiry logic
- Notification routing

---

# 8. Pricing Unit Tests

Test:

```text
subtotal
tax
delivery fee
instant fee
discount
total
```

Cases:

```text
Normal order
Zero discount
Large order
Multiple suppliers
Instant delivery
Scheduled delivery
Rounding
Tax changes
Invalid prices
```

The backend result must be deterministic.

---

# 9. Inventory Unit Tests

Cases:

```text
Reserve available stock
Reserve exact final quantity
Reserve more than available
Release reservation
Release expired reservation
Duplicate release
Concurrent reservation
Cancelled order
Fulfilled order
```

Critical invariant:

```text
available_quantity >= 0
```

and the same inventory must never be released twice.

---

# 10. Supplier Allocation Tests

Test:

```text
One supplier available
Multiple suppliers available
Supplier out of stock
Supplier not verified
Supplier not serviceable
Partial availability
Different delivery windows
Supplier suspension during allocation
```

Allocation must return only eligible suppliers.

---

# 11. Order State Tests

Test valid transitions:

```text
CREATED → PAYMENT_PENDING
PAYMENT_PENDING → PAID
PAID → ALLOCATING
ALLOCATING → ALLOCATED
ALLOCATED → PACKING
PACKING → READY_FOR_PICKUP
READY_FOR_PICKUP → PICKED_UP
PICKED_UP → IN_TRANSIT
IN_TRANSIT → DELIVERED
```

Test invalid transitions:

```text
DELIVERED → PACKING
CANCELLED → PAID
REFUNDED → IN_TRANSIT
```

Invalid transitions must be rejected.

---

# 12. Payment State Tests

Test:

```text
Payment created
Payment authorized
Payment captured/paid
Payment failed
Payment refunded
Partial refund
Duplicate webhook
Out-of-order webhook
Invalid webhook signature
Unknown payment state
Provider timeout
```

---

# 13. Integration Testing

Integration tests should use real test instances/services where practical.

Test:

```text
API → PostgreSQL
API → Redis
API → Search
API → Object Storage
API → Queue
Worker → PostgreSQL
Worker → Search
Worker → Notification provider
```

---

# 14. Database Integration Tests

Verify:

- Migrations
- Constraints
- Foreign keys
- Unique indexes
- Transaction behavior
- Row locking
- Concurrent updates
- Rollback behavior
- Query correctness

Test against PostgreSQL itself rather than replacing it with an incompatible mock.

---

# 15. Transaction Tests

Critical transactions:

```text
Inventory reservation
Order creation
Payment state update
Fulfillment creation
Inventory release
Refund state update
```

Test both:

```text
Commit
Rollback
```

---

# 16. API Contract Testing

Every public API endpoint should have contract coverage.

Validate:

- Request schema
- Response schema
- Error schema
- Authorization
- Status code
- Pagination
- Validation behavior

OpenAPI should remain synchronized with implementation.

---

# 17. Authentication Tests

Test:

```text
Valid login
Invalid password
Unknown user
Locked account
Expired token
Invalid token
Revoked session
Refresh token rotation
Password reset
OTP abuse
Concurrent sessions
Logout
```

---

# 18. Authorization Tests

Test every role:

```text
BUYER
SUPPLIER
ADMIN
OPERATIONS
SUPPORT
```

For each endpoint verify:

```text
Allowed
Denied
Wrong tenant
Wrong resource owner
Wrong state
```

---

# 19. Supplier Isolation Tests

This is mandatory.

Scenario:

```text
Supplier A
Supplier B
```

Supplier A attempts:

```text
Read Supplier B product
Update Supplier B product
Delete Supplier B product
Read Supplier B inventory
Read Supplier B fulfillment
Download Supplier B document
```

Expected:

```text
DENIED
```

Run these tests automatically in CI.

---

# 20. Buyer Privacy Tests

Buyer A attempts to access Buyer B:

```text
Orders
Addresses
Notifications
Documents
Payment information
Private profile data
```

Expected:

```text
DENIED
```

---

# 21. Admin Permission Tests

Verify that:

```text
Support
Operations
Admin
```

have only their intended privileges.

For example, support should not automatically receive:

```text
Refund permission
Supplier verification permission
Security audit access
```

unless explicitly assigned.

---

# 22. File Upload Tests

Test:

```text
Valid PDF
Valid image
Oversized file
Invalid MIME type
Invalid extension
Corrupt file
Malicious file
Executable renamed as image
Malformed image
Large decompression payload
```

Expected behavior:

```text
Reject
Scan
Quarantine
or Accept
```

according to the security pipeline.

---

# 23. Search Testing

Test:

```text
Exact product name
Partial product name
Generic name
Brand
Composition
Strength
Dosage form
No results
Typo/variant
Filters
Sorting
Pagination
Unavailable product
Inactive supplier
```

Verify search results never bypass authoritative eligibility/inventory checks.

---

# 24. Search Index Consistency

Scenario:

```text
Product created
→ indexed
```

Then:

```text
Price changed
→ index updated
```

Then:

```text
Product unpublished
→ removed/disabled
```

Then:

```text
Inventory becomes zero
→ search availability reflects change
```

Search can be eventually consistent, but checkout must always use the transactional source of truth.

---

# 25. Cart Testing

Test:

```text
Add item
Remove item
Change quantity
Empty cart
Multiple suppliers
Out-of-stock item
Price change
Product unpublished
Supplier suspended
Expired cart
```

Cart must recover gracefully when product state changes.

---

# 26. Checkout Testing

Critical scenarios:

```text
Normal checkout
Empty cart
Out of stock
Partial stock
Supplier unavailable
Price changed
Delivery slot unavailable
Invalid address
Payment failure
Payment timeout
Duplicate checkout request
Network retry
```

The customer must never be charged twice because of a client retry.

---

# 27. Concurrency Testing

This is one of the highest-risk test areas.

Scenario:

```text
Stock = 1

Buyer A → quantity 1
Buyer B → quantity 1
```

Both requests arrive nearly simultaneously.

Expected:

```text
One reservation succeeds
One fails with OUT_OF_STOCK
```

Repeat under high concurrency.

---

# 28. Idempotency Testing

Send the same request multiple times:

```text
POST /orders
Idempotency-Key: abc123
```

Expected:

```text
Exactly one order
```

Test same key with different body.

Expected:

```text
Idempotency conflict
```

---

# 29. Payment Webhook Testing

Send:

```text
Valid webhook
Duplicate webhook
Out-of-order webhook
Invalid signature
Malformed payload
Unknown payment
Delayed webhook
```

Expected:

- Invalid webhook rejected
- Duplicate webhook does not duplicate state changes
- Unknown payment is handled safely
- Final payment state remains consistent

---

# 30. Payment Failure Scenarios

Test:

```text
Provider timeout
Provider unavailable
Payment declined
User closes app
Network interruption
Payment succeeds but callback delayed
Callback duplicated
Payment status unknown
```

The order system must have a reconciliation path.

---

# 31. Refund Testing

Test:

```text
Full refund
Partial refund
Duplicate refund request
Refund after cancellation
Provider refund failure
Refund webhook
```

Never assume a refund succeeded because a client request was submitted.

---

# 32. COD Testing

Test:

```text
COD allowed
COD blocked
COD order created
COD delivered
COD not collected
COD returned
COD reconciliation
Duplicate settlement
```

---

# 33. Multi-Supplier Testing

Scenario:

```text
Order:
Product A → Supplier 1
Product B → Supplier 2
Product C → Supplier 1
```

Verify:

```text
One buyer order
Two internal fulfillments
Supplier 1 sees A/C
Supplier 2 sees B
Buyer sees consolidated order
```

---

# 34. Fulfillment Testing

Test:

```text
Supplier accepts
Supplier rejects where permitted
Supplier starts packing
Supplier marks ready
Supplier delays
Supplier becomes unavailable
```

Invalid actions must be rejected according to state rules.

---

# 35. Logistics Testing

Mock or sandbox Porter integration.

Test:

```text
Quote success
Quote failure
Delivery creation
Delivery creation timeout
Duplicate delivery request
Pickup
In transit
Delivered
Cancelled
Provider webhook
Unknown status
```

---

# 36. Scheduled Delivery Testing

Test:

```text
Valid slot
Unavailable slot
Slot capacity reached
Order created before cutoff
Order created after cutoff
Dispatch worker
Batching
Route assignment
Provider failure
Rescheduling
```

Times and cutoff rules should be configurable.

---

# 37. Notification Testing

Test:

```text
Order placed
Payment confirmed
Order packed
Picked up
Out for delivery
Delivered
Payment failed
Verification approved
Verification rejected
```

For each notification:

```text
Correct recipient
Correct content
Correct channel
No sensitive leakage
Retry behavior
Duplicate protection
```

---

# 38. Web Testing

Use browser automation for critical flows.

Recommended tools can include:

- Playwright
- Browser-based CI runners

Critical E2E:

```text
Buyer registration
Buyer search
Product view
Add to cart
Checkout
Order tracking

Supplier registration
Document upload
Product creation
Inventory update
Order fulfillment

Admin login
Supplier review
Order inspection
```

---

# 39. Mobile Testing

Test on:

## Android

- Current supported Android versions
- Representative low/mid/high devices

## iOS

- Current supported iOS versions
- Representative iPhone screen sizes

Test:

```text
Login
Search
Cart
Checkout
Payment
Orders
Tracking
Notifications
Deep links
App resume
Network loss
Slow network
Background/foreground transitions
```

---

# 40. Device Matrix

Maintain a practical device matrix rather than testing every device.

Example categories:

```text
Low-end Android
Mid-range Android
High-end Android
Small iPhone
Standard iPhone
Large iPhone
Tablet where supported
```

Review the matrix periodically based on actual user analytics.

---

# 41. Network Testing

Test:

```text
Fast Wi-Fi
4G
Slow 4G
Poor connectivity
Intermittent connectivity
Offline
Reconnect
```

Important flows must handle interrupted requests safely.

---

# 42. Accessibility Testing

Test:

- Keyboard navigation
- Screen reader
- Focus order
- Form labels
- Error announcements
- Contrast
- Touch targets
- Text scaling
- Reduced-motion preferences where appropriate

---

# 43. Visual Regression Testing

Use screenshot-based tests for stable critical screens:

```text
Home
Search
Product detail
Cart
Checkout
Order tracking
Supplier dashboard
Admin dashboard
```

Do not allow harmless dynamic timestamps or IDs to create constant false failures.

---

# 44. Performance Testing

Measure:

```text
Page load
API latency
Search latency
Checkout latency
Database latency
Queue processing latency
Worker throughput
```

Report:

```text
p50
p95
p99
```

---

# 45. Load Testing

Load test:

```text
Product browsing
Search
Cart
Checkout
Order creation
Payment webhook bursts
Scheduled delivery dispatch
Supplier bulk inventory updates
```

Test both normal and peak conditions.

---

# 46. Stress Testing

Push the system beyond expected load to find failure boundaries.

Measure:

```text
Maximum throughput
Latency degradation
Queue growth
DB saturation
Redis saturation
Search saturation
Recovery time
```

The objective is to understand failure behavior, not simply achieve a benchmark number.

---

# 47. Soak Testing

Run realistic traffic for an extended period.

Look for:

- Memory leaks
- Connection leaks
- Queue accumulation
- Database connection exhaustion
- Search degradation
- Log growth
- Container instability

---

# 48. Spike Testing

Simulate sudden traffic spikes.

Examples:

```text
Large pharmacy campaign
Sudden supplier inventory import
Payment callback burst
Scheduled delivery cutoff
```

Observe autoscaling and queue behavior.

---

# 49. Security Testing

Run:

```text
SAST
Dependency scanning
Secret scanning
Container scanning
DAST
Authorization tests
Penetration testing
```

High-risk endpoints receive additional manual review.

---

# 50. OWASP API Testing

Test specifically for:

```text
Broken object-level authorization
Broken authentication
Broken property-level authorization
Unrestricted resource consumption
Broken function-level authorization
Unrestricted access to sensitive business flows
SSRF
Security misconfiguration
Improper inventory/state validation
```

---

# 51. SQL Injection Testing

Test all user-controlled:

```text
Search
Filters
Sorting
IDs
Query parameters
Form inputs
Admin filters
```

Use parameterized queries/ORM-safe methods.

---

# 52. XSS Testing

Test:

```text
Product names
Supplier names
Business names
Address fields
Support messages
Admin-entered content
```

User-generated content must be safely encoded/sanitized according to where it is rendered.

---

# 53. CSRF Testing

Where cookie-based authentication is used, test:

```text
State-changing requests
Cross-site requests
Origin/CSRF protections
```

If token-based APIs are used, still review browser credential behavior and CORS carefully.

---

# 54. SSRF Testing

Review any feature that accepts URLs or fetches remote resources.

Examples:

```text
Image import
Webhook configuration
External integrations
URL previews
```

Restrict outbound network access.

---

# 55. Authorization Fuzzing

Generate requests where users modify:

```text
userId
supplierId
orderId
productId
documentId
fulfillmentId
paymentId
```

Verify ownership/permission checks cannot be bypassed.

---

# 56. Data Leakage Testing

Check API responses for accidental exposure of:

```text
Internal supplier data
Other buyer information
Private documents
Bank details
Payment secrets
Internal risk scores
Admin notes
Infrastructure details
```

---

# 57. Compliance QA

Verify:

```text
Supplier cannot sell before verification
Expired applicable licence triggers appropriate restrictions
Buyer eligibility is enforced where required
Restricted products follow configured rules
Expired inventory cannot be sold
Audit events exist for privileged actions
Invoices contain required configured fields
```

Exact legal acceptance criteria must be supplied/approved by the compliance/legal function.

---

# 58. Batch/Expiry Testing

If batch tracking is enabled:

```text
Valid batch
Expired batch
Near-expiry batch
Duplicate batch
Incorrect expiry
Quantity adjustment
Recall
```

Expected:

```text
Expired inventory cannot be offered for sale
```

subject to the validated regulatory/business rules.

---

# 59. Recall Testing

Test:

```text
Batch recalled
→ Listing blocked
→ Inventory restricted
→ Affected orders identified
→ Operations notified
```

Do not rely only on search indexing to enforce a recall.

---

# 60. Database Migration Testing

For every migration:

```text
Fresh database
Existing database
Large dataset
Rollback/recovery plan
Application compatibility
```

Test production-like data volume for high-risk migrations.

---

# 61. Backup/Restore Testing

At regular intervals:

```text
Create backup
→ Restore
→ Validate schema
→ Validate critical orders
→ Validate audit data
→ Validate object references
→ Run application smoke tests
```

Record restore duration.

---

# 62. Disaster Recovery Testing

Simulate:

```text
Database outage
Redis outage
Search outage
API deployment failure
Worker outage
Object-storage failure
Payment provider outage
Logistics provider outage
```

Verify the system enters safe states.

---

# 63. Chaos Testing

Do this after the core system is stable.

Examples:

```text
Kill one API instance
Stop worker
Introduce Redis latency
Introduce search failure
Delay provider response
Drop selected network calls
```

Observe:

```text
Retry
Failover
User experience
Recovery
Alerts
```

---

# 64. Release Testing

Every release should have:

```text
Automated CI
Staging deployment
Database migration validation
Smoke tests
Critical E2E
Security checks
Performance sanity check
Production deployment
Post-deployment smoke
```

---

# 65. Smoke Test Suite

Minimum production smoke:

```text
GET /health
Login
Search
Product detail
Cart
Checkout quote
Payment initialization where safe
Order retrieval
Supplier dashboard
Admin dashboard
```

Production payment actions should use a safe verification approach rather than arbitrary live transactions.

---

# 66. Regression Suite

Every critical bug should result in:

```text
Bug fixed
+
Regression test added
```

Do not rely on manual memory to prevent recurrence.

---

# 67. Bug Severity

Recommended:

## P0 — Critical

Examples:

- Payment corruption
- Cross-user data access
- Order duplication at scale
- Production outage
- Security breach

## P1 — High

Examples:

- Checkout broken
- Supplier cannot fulfill orders
- Delivery integration broken
- Major mobile crash

## P2 — Medium

Examples:

- Important feature malfunction
- Non-critical UI issue

## P3 — Low

Examples:

- Minor visual issue
- Cosmetic problem

---

# 68. Bug Report Format

Every bug should contain:

```text
Title
Environment
Version
User role
Preconditions
Steps to reproduce
Expected result
Actual result
Logs/request ID
Screenshots/video
Severity
Frequency
```

---

# 69. Test Automation Structure

Suggested:

```text
tests/
├── unit/
├── integration/
├── api/
├── e2e/
├── security/
├── performance/
├── fixtures/
└── helpers/
```

Mobile:

```text
mobile-tests/
├── android/
├── ios/
└── e2e/
```

---

# 70. CI Test Gates

Pull request:

```text
Lint
Typecheck
Unit
Component
API
Security scan
Build
```

Merge/staging:

```text
Integration
E2E
Migration tests
```

Release:

```text
Full critical regression
Load/performance sanity
Security checks
```

---

# 71. Test Coverage

Coverage should be measured, but coverage percentage alone is not a quality metric.

Prioritize high-risk business logic:

```text
Inventory
Payments
Orders
Authorization
Supplier isolation
Fulfillment
Compliance rules
```

---

# 72. Quality Gates

A release should be blocked when:

```text
Critical tests fail
Critical security vulnerability exists
Payment/order integrity test fails
Supplier isolation test fails
Database migration is unsafe
Production smoke test fails
```

Exceptions require explicit approval.

---

# 73. Definition of Test Complete

A feature is test-complete when:

- Unit tests exist for business logic
- API contract is tested
- Authorization is tested
- Error paths are tested
- Integration is tested
- E2E exists for critical journeys
- Security implications are reviewed
- Performance implications are reviewed
- Regression coverage exists
- Monitoring is defined where appropriate

---

# 74. MVP Critical E2E Journeys

## Buyer

```text
Register
→ Verify
→ Complete business profile
→ Search medicine
→ View product
→ Add to cart
→ Checkout
→ Select delivery
→ Pay
→ View order
→ Track delivery
```

## Supplier

```text
Register
→ Upload documents
→ Verification
→ Add product
→ Add inventory
→ Receive order
→ Accept
→ Pack
→ Mark ready
→ Track fulfillment
```

## Admin

```text
Login
→ Review supplier
→ Verify/reject
→ Review products
→ Inspect order
→ Inspect payment
→ Inspect logistics
```

---

# 75. Critical Failure Journeys

Test:

```text
Buyer pays but order confirmation is delayed
Supplier goes out of stock during checkout
Payment webhook arrives twice
Porter delivery creation times out
Scheduled slot becomes unavailable
Supplier is suspended after product listing
Licence expires after supplier verification
Database transaction rolls back
Worker crashes during reservation release
```

---

# 76. Performance Acceptance

The final thresholds should be established through load testing and business requirements.

Track:

```text
p50
p95
p99
Error %
Throughput
Queue lag
DB utilization
Cache hit rate
Search latency
```

Performance acceptance must be based on real measurements.

---

# 77. Production QA Checklist

## Functional

- [ ] Authentication
- [ ] Buyer onboarding
- [ ] Supplier onboarding
- [ ] Supplier verification
- [ ] Product catalog
- [ ] Inventory
- [ ] Search
- [ ] Cart
- [ ] Checkout
- [ ] Payment
- [ ] Orders
- [ ] Fulfillment
- [ ] Instant delivery
- [ ] Scheduled delivery
- [ ] Tracking
- [ ] Notifications
- [ ] Admin

## Security

- [ ] RBAC
- [ ] Tenant isolation
- [ ] Buyer privacy
- [ ] File security
- [ ] Payment webhook verification
- [ ] Rate limiting
- [ ] Security scanning

## Reliability

- [ ] Duplicate request handling
- [ ] Retry handling
- [ ] Queue recovery
- [ ] Provider failure
- [ ] Backup restore
- [ ] Disaster recovery

## Performance

- [ ] Load test
- [ ] Stress test
- [ ] Spike test
- [ ] Soak test
- [ ] Mobile performance
- [ ] Search performance

---

# 78. Final QA Strategy

Bezzo should treat quality as a continuous engineering process:

```text
Design
 ↓
Implementation
 ↓
Automated tests
 ↓
Integration
 ↓
Security
 ↓
Performance
 ↓
Staging
 ↓
Production
 ↓
Monitoring
 ↓
Regression
```

The highest testing priority should remain:

**authorization → inventory correctness → payment integrity → order state → fulfillment → logistics → data protection.**

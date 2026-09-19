# Bezzo Caching, Performance & Scalability Specification v1.0

## Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Caching, Performance & Scalability Specification |
| Version | 1.0 |
| Status | Baseline / Implementation Reference |
| Primary Audience | Backend, frontend, mobile, DevOps, QA, architecture |
| Related Documents | Bezzo TRD, Architecture, Database, DevOps, Testing/QA, API, Event-Driven Architecture |

---

# 1. Purpose

This specification defines how Bezzo achieves fast, predictable and scalable application performance across:

- Web
- Android
- iOS
- API services
- PostgreSQL
- Redis
- Search
- Object storage
- background workers
- external integrations
- scheduled delivery workflows
- supplier inventory operations
- multi-supplier order processing

The goal is not literal zero latency. The goal is a marketplace that feels consistently fast, avoids avoidable blocking, degrades gracefully under load, and scales horizontally as traffic and transaction volume increase.

---

# 2. Performance Principles

Bezzo SHALL follow these principles:

1. Measure before optimizing.
2. Keep user-facing critical paths short.
3. Avoid unnecessary network round trips.
4. Cache read-heavy data where safe.
5. Never cache authoritative transactional state in a way that can cause incorrect business decisions.
6. Use asynchronous processing for non-critical side effects.
7. Prevent database overload through indexing, query discipline and connection management.
8. Prefer horizontal scaling over oversized single instances.
9. Use CDN/edge caching for suitable static assets.
10. Use search infrastructure for search workloads rather than forcing PostgreSQL to perform all discovery work.
11. Design every cache with invalidation and failure behavior.
12. Load-test realistic marketplace workflows.

---

# 3. Performance Objectives

Initial targets should be treated as engineering objectives and validated through load testing.

## 3.1 API Targets

For normal authenticated read APIs under expected production load:

```text
p50: <= 150 ms
p95: <= 400 ms
p99: <= 800 ms
```

For critical lightweight commands:

```text
p95: <= 500 ms
```

These are targets, not guarantees.

External-provider operations may have separate latency budgets.

---

# 4. User Experience Targets

The application should feel responsive through:

- fast initial rendering
- skeleton/loading states
- optimistic UI only where safe
- local state reuse
- prefetching
- image optimization
- pagination/infinite loading
- background refresh
- asynchronous processing
- immediate acknowledgement of long-running operations

A slow external operation should not unnecessarily block unrelated UI.

---

# 5. Core Performance Budget

Recommended initial budget:

```text
DNS/TLS/connection      -> minimize
CDN/static assets       -> edge served
API processing          -> <= 400 ms p95 target
Database queries        -> generally <= 100 ms for hot-path queries
Redis reads             -> generally single-digit milliseconds
Search requests         -> <= 300 ms p95 target
```

These values must be validated against real infrastructure and traffic.

---

# 6. Performance-Critical User Journeys

The following journeys receive priority:

1. Login / OTP verification
2. Home marketplace load
3. Product search
4. Product detail
5. Add to cart
6. Cart load
7. Checkout
8. Order placement
9. Payment status
10. Order tracking
11. Supplier inventory update
12. Supplier order processing
13. Admin operational dashboards

---

# 7. Critical Path Classification

Every operation should be classified as:

### Critical synchronous

Must complete before the user can proceed.

Examples:

```text
authentication
cart mutation
checkout validation
inventory reservation
order creation
```

### Asynchronous but user-visible

Can continue after immediate acknowledgement.

Examples:

```text
report generation
bulk catalog import
large image processing
scheduled route preparation
```

### Background

Should not block user operations.

Examples:

```text
analytics
search indexing
notification delivery
recommendation refresh
reconciliation
```

---

# 8. Architecture for Performance

Recommended baseline:

```text
                    CDN / WAF
                       |
             +---------+---------+
             |                   |
            Web               API LB
                                 |
                     +-----------+-----------+
                     |                       |
                API instances          Worker instances
                     |
          +----------+----------+
          |          |          |
      PostgreSQL   Redis      Search
          |
      Object Storage
```

All major application tiers should support horizontal scaling.

---

# 9. CDN Strategy

CDN should serve:

- web static assets
- JavaScript bundles
- CSS
- fonts
- public product images
- suitable public catalog assets
- other cache-safe resources

CDN SHALL NOT cache private buyer/supplier responses unless explicit private caching controls are used.

---

# 10. Static Asset Optimization

Web and mobile-facing assets should use:

- compressed images
- modern image formats where supported
- responsive image sizes
- lazy loading
- cache-busting/versioned filenames
- code splitting
- tree shaking
- minification
- preloading only critical assets

Avoid shipping large unused libraries to clients.

---

# 11. Image Performance

Medicine/product imagery can become a major performance cost.

Images SHOULD be processed into multiple sizes.

Example:

```text
thumbnail
small
medium
large
original
```

UI should request the smallest suitable image.

Product listing pages should not download full-resolution originals.

---

# 12. Image Delivery

Recommended flow:

```text
Object Storage
      |
      v
Image Processing
      |
      +--> thumbnail
      +--> card
      +--> detail
      +--> original
      |
      v
CDN
```

Use immutable/versioned object URLs where practical.

---

# 13. Redis Responsibilities

Redis may be used for:

- cache
- session-related short-lived state where architecture requires it
- rate limiting
- idempotency support where appropriate
- temporary checkout state
- locks
- queue infrastructure
- hot configuration
- frequently accessed read models

Redis SHALL NOT become the authoritative store for critical business data.

---

# 14. Cache Categories

Bezzo caches should be classified as:

### Public/static

Examples:

```text
category tree
public catalog metadata
product images
```

### User-scoped

Examples:

```text
buyer preferences
recent search state
private dashboard summaries
```

### Supplier-scoped

Examples:

```text
supplier dashboard aggregates
supplier catalog summaries
```

### Operational

Examples:

```text
rate limits
temporary locks
short-lived jobs
```

Each category requires separate TTL and invalidation rules.

---

# 15. Cache-Aside Pattern

Default application cache strategy:

```text
Request
  |
  v
Check Redis
  |
  +---- HIT ----> return
  |
  +---- MISS
        |
        v
     Database
        |
        v
     Store cache
        |
        v
      return
```

This is preferred for read-heavy data.

---

# 16. Cache-Aside Example

For product category tree:

```text
GET categories
      |
      v
Redis category_tree:v1
      |
      +--> hit -> return
      |
      +--> miss -> PostgreSQL
                    |
                    v
                 Redis
                    |
                    v
                  return
```

The category tree should have a controlled TTL and explicit invalidation after administrative changes.

---

# 17. Cache TTL Strategy

TTL should depend on volatility.

Example starting guidance:

| Data | Suggested TTL |
|---|---:|
| Static configuration | 15–60 min |
| Category tree | 5–30 min |
| Product metadata | 1–10 min |
| Search suggestions | 1–10 min |
| Supplier dashboard aggregates | 30 sec–5 min |
| Delivery configuration | 30 sec–5 min |
| User session/temporary state | Short, policy-defined |
| Inventory availability | Very short or event-driven |

These are starting values, not fixed requirements.

---

# 18. Inventory Caching

Inventory is high-risk because stale data can cause overselling.

Therefore:

```text
cached inventory
```

must not be treated as authoritative for final reservation.

Recommended:

```text
Browsing
   -> cached/near-real-time availability

Checkout
   -> authoritative inventory transaction
```

The reservation transaction is the source of truth.

---

# 19. Price Caching

Catalog prices can be cached for browsing.

At checkout:

```text
cached price
      |
      X
      |
current authoritative price
      |
      v
checkout calculation
```

If the price changed, return:

```text
PRICE_CHANGED
```

rather than silently using stale pricing.

---

# 20. Supplier Eligibility Caching

Supplier verification/eligibility may be cached for read paths.

High-risk actions must validate authoritative status.

Examples:

```text
supplier product browsing -> cache acceptable
order allocation -> authoritative verification
payout -> authoritative verification
```

---

# 21. Cache Invalidation

Cache invalidation SHALL be tied to domain changes.

Example:

```text
product.updated
     |
     +--> invalidate product cache
     +--> refresh/search index
```

For inventory:

```text
inventory.updated
     |
     +--> invalidate availability cache
```

For supplier verification:

```text
supplier.verified
     |
     +--> invalidate supplier eligibility cache
```

---

# 22. Cache Stampede Protection

When a popular cache expires, thousands of requests may attempt to regenerate it simultaneously.

Use:

- request coalescing
- short locks
- stale-while-revalidate where appropriate
- randomized TTL jitter
- background refresh

Avoid a synchronized cache-expiry spike.

---

# 23. Negative Caching

Short-lived negative caching may be used for expensive repeated misses.

Example:

```text
product ID does not exist
```

Use very short TTLs.

Do not negatively cache states that can change rapidly without an appropriate invalidation strategy.

---

# 24. Cache Failure Behavior

If Redis becomes unavailable:

```text
Redis failure
     |
     v
application continues where safe
     |
     v
database fallback
```

Caching must improve performance, not become a single point of failure for core transactional functionality.

Some features such as rate limiting or temporary queues may have different failure policies.

---

# 25. Cache Key Standards

Cache keys should be namespaced.

Example:

```text
bezzo:v1:product:prod_123
bezzo:v1:category-tree
bezzo:v1:supplier:sup_123:dashboard
bezzo:v1:buyer:usr_123:summary
```

Keys should avoid leaking sensitive information.

---

# 26. Database Performance

PostgreSQL remains the transactional source of truth.

Performance depends heavily on:

- correct indexes
- efficient queries
- bounded result sets
- connection pooling
- transaction duration
- avoiding N+1 queries
- correct data types
- partitioning only when justified
- query monitoring

---

# 27. Database Connection Pooling

Application instances SHALL use connection pooling.

Do not allow each request to create a new database connection.

Pool sizing must account for:

```text
number of API instances
worker instances
database max connections
background jobs
admin/reporting workloads
```

Too many application connections can overload PostgreSQL.

---

# 28. Query Performance Rules

Every hot-path query should:

- use an appropriate index
- select only required columns
- avoid unnecessary joins
- avoid unbounded results
- use pagination
- avoid N+1 access patterns
- have a measurable execution plan

Use:

```text
EXPLAIN ANALYZE
```

during optimization.

---

# 29. Indexing Strategy

Indexes should support real access patterns.

Likely high-value indexes include:

```text
products(category_id, status)
supplier_offers(supplier_id, status)
inventory(product_id, supplier_id)
orders(buyer_id, created_at)
orders(supplier_id, created_at)
fulfillments(order_id, status)
payments(order_id)
notifications(user_id, created_at)
```

Exact indexes must be finalized from the database schema and query workload.

---

# 30. Avoid Over-Indexing

Every index has a write and storage cost.

Do not add indexes simply because a field exists.

Index decisions should be based on:

- query frequency
- selectivity
- sort/filter behavior
- write volume
- measured execution plans

---

# 31. N+1 Query Prevention

Bad:

```text
get 50 orders
for each order:
    query fulfillment
```

Preferred:

```text
get 50 orders
join/batch-load required fulfillment data
```

Use:

- joins where appropriate
- batch queries
- DataLoader-style batching
- carefully designed read models

---

# 32. API Response Optimization

Responses should contain only what the client needs.

Avoid returning huge objects from list APIs.

Example:

```text
GET /products
```

should return listing fields.

Product detail can return richer fields.

---

# 33. Response Compression

Enable compression for suitable textual responses.

Use modern compression where infrastructure supports it.

Do not compress already compressed assets unnecessarily.

---

# 34. Request Batching

Where multiple dependent resources are needed, consider:

- composite endpoints
- batch APIs
- server-side aggregation
- GraphQL only if justified by product needs

Do not create excessive API round trips for basic screens.

---

# 35. Web Performance

Next.js web application should use:

- server rendering where appropriate
- static generation for suitable public pages
- streaming where useful
- route-level code splitting
- image optimization
- client caching
- prefetching
- skeleton states

Do not make every page fully client-rendered by default.

---

# 36. Mobile Performance

React Native applications should:

- virtualize long lists
- paginate catalog data
- cache safe data locally
- avoid unnecessary re-renders
- optimize image sizes
- debounce search input
- avoid blocking the JS thread
- batch non-critical work

Large product catalogs must never be loaded entirely into memory.

---

# 37. Search Performance

Search should be handled through OpenSearch/compatible search infrastructure where configured.

Search requests should:

- use bounded result sizes
- support pagination/cursors
- use indexed fields
- avoid expensive unrestricted wildcard patterns
- return lightweight listing documents

Autocomplete should have stricter latency and result limits.

---

# 38. Search Cache

Safe high-frequency queries may be cached.

Example:

```text
search suggestions
popular categories
common discovery queries
```

Cache keys must include all parameters affecting the result.

Do not cache user-specific results under shared public keys.

---

# 39. Checkout Performance

Checkout is a critical path.

Recommended sequence:

```text
Load cart
   |
Validate buyer
   |
Validate addresses
   |
Validate supplier eligibility
   |
Validate inventory
   |
Validate prices
   |
Apply promotions
   |
Calculate delivery
   |
Create order/payment intent
```

Avoid unnecessary external API calls before core validation.

---

# 40. External Provider Latency

Payment and logistics providers can dominate request latency.

Use:

- strict timeouts
- provider adapters
- asynchronous status reconciliation
- idempotency
- circuit breakers
- provider-specific monitoring

Do not allow one slow provider to exhaust all API worker resources.

---

# 41. Async Processing

Move non-critical work to workers:

```text
notifications
analytics
search indexing
image processing
report generation
bulk imports
reconciliation
settlement processing
```

The API should return quickly after durable acceptance.

---

# 42. Worker Scaling

Workers should scale based on:

- queue depth
- processing latency
- CPU
- memory
- event lag

Example:

```text
queue depth rises
      |
      v
worker replicas increase
      |
      v
queue drains
```

Scaling thresholds must be tuned from production metrics.

---

# 43. Scheduled Delivery Performance

Scheduled orders create predictable workload windows.

Architecture:

```text
Scheduled orders
      |
      v
dispatch-window queue
      |
      v
route batching
      |
      v
logistics booking
```

The system should avoid creating a massive synchronous spike when a delivery slot begins.

---

# 44. Instant Delivery Performance

Instant delivery has a tighter latency budget.

Optimize:

- delivery-area lookup
- supplier availability
- quote retrieval
- fulfillment selection
- logistics booking

Provider calls should be bounded by explicit timeouts.

---

# 45. Multi-Supplier Allocation Performance

Supplier allocation should avoid sequentially checking hundreds of suppliers.

Preferred:

```text
candidate supplier query
       |
       v
filter by:
- serviceability
- verification
- availability
- product eligibility
- pricing
       |
       v
rank candidates
       |
       v
reserve inventory
```

Inventory reservation remains authoritative.

---

# 46. Read Models

For expensive dashboards, use precomputed read models or cached aggregates.

Examples:

```text
supplier dashboard summary
admin marketplace metrics
buyer order summary
```

Do not calculate expensive aggregates from millions of transactional rows on every page load.

---

# 47. Dashboard Aggregation

Example:

```text
orders
payments
fulfillments
inventory
```

should not necessarily be joined in a giant real-time dashboard query.

Prefer:

```text
domain events
    |
    v
analytics/read model
    |
    v
dashboard
```

where exact real-time consistency is not required.

---

# 48. Reporting

Large reports SHALL be asynchronous.

Example:

```text
POST /reports
      |
      v
202 Accepted
      |
      v
background generation
      |
      v
report ready
```

Do not hold an API request open for a multi-minute export.

---

# 49. Large Exports

Exports should:

- stream where appropriate
- paginate database reads
- avoid loading entire datasets into memory
- write directly to object storage
- provide temporary secure download access
- expire generated files

---

# 50. Horizontal Scaling

Stateless API instances should be horizontally scalable.

Example:

```text
Load Balancer
    |
    +--> API 1
    +--> API 2
    +--> API 3
    +--> API N
```

Do not store required request state only in local process memory.

---

# 51. Stateless Application Design

Application instances should not depend on:

```text
local session state
local uploaded files
local in-memory queues
local-only locks
```

Use shared infrastructure:

```text
Redis
PostgreSQL
Object Storage
Queue
```

where state must survive instance replacement.

---

# 52. Autoscaling

Autoscaling should consider:

- CPU
- memory
- request count
- latency
- queue depth
- database capacity

Do not scale API instances without considering database saturation.

---

# 53. Database Scaling Path

Initial:

```text
Single PostgreSQL primary
```

Then, as justified:

```text
Primary
  |
  +--> read replicas
```

Later:

- partitioning
- workload-specific replicas
- managed scaling
- archival strategies

Database sharding should be considered only after measurable need.

---

# 54. Read Replicas

Read replicas may be used for:

- reporting
- analytics
- non-critical reads
- operational dashboards

Do not route a read to a replica when the user immediately requires read-after-write consistency.

Example:

```text
Order created
   |
   v
immediate order lookup
   |
   v
primary / consistent read
```

---

# 55. Cache Consistency Levels

Each cached resource SHALL define:

```text
authoritative source
acceptable staleness
TTL
invalidation trigger
fallback behavior
```

Example:

| Resource | Source | Staleness |
|---|---|---|
| Category tree | PostgreSQL | Minutes acceptable |
| Product metadata | PostgreSQL | Short |
| Inventory browse availability | Inventory domain | Very short |
| Final inventory reservation | PostgreSQL transaction | None |
| Payment status | Payment domain/provider | Must be verified |
| Order state | Order domain | Strong consistency required for commands |

---

# 56. Performance and Correctness

Performance optimizations SHALL never weaken:

- inventory correctness
- payment correctness
- authorization
- tenant isolation
- compliance controls
- auditability
- financial ledger integrity

A slower correct operation is preferable to a faster incorrect financial or inventory operation.

---

# 57. Rate Limiting and Abuse

Performance protection includes:

- per-IP limits
- per-user limits
- per-supplier limits
- endpoint-specific limits
- burst controls
- bot/abuse detection
- expensive-query protection

Rate limiting should prevent one client from exhausting shared resources.

---

# 58. Resource Quotas

Define configurable limits for:

```text
catalog import rows
file upload size
API page size
report range
bulk update count
search result count
concurrent jobs
```

Avoid allowing arbitrary unbounded requests.

---

# 59. Performance Isolation

Heavy workloads should not starve transactional workloads.

Separate resources where necessary:

```text
Transactional API
      |
      +--> primary DB

Reporting/analytics
      |
      +--> read model / replica

Workers
      |
      +--> queue + worker resources
```

Admin reporting should not degrade buyer checkout.

---

# 60. Graceful Degradation

If non-critical systems fail:

```text
Analytics unavailable
    -> checkout continues

Search indexing delayed
    -> existing indexed catalog remains usable

Notification provider unavailable
    -> order continues; notification retries

Recommendation unavailable
    -> default catalog/discovery continues
```

If critical dependencies fail:

```text
inventory unavailable
payment unavailable
authorization unavailable
```

the relevant transaction should fail safely rather than guessing.

---

# 61. Performance Monitoring

Track:

### API

```text
RPS
p50
p95
p99
error rate
timeout rate
```

### Database

```text
CPU
connections
query latency
slow queries
locks
deadlocks
cache hit ratio
storage
```

### Redis

```text
memory
hit ratio
evictions
latency
connections
```

### Search

```text
query latency
error rate
cluster health
CPU
memory
indexing lag
```

### Queues

```text
depth
consumer lag
processing latency
retry count
dead letters
```

---

# 62. Performance Budgets in CI/CD

Where practical, CI should detect:

- bundle-size regressions
- query-count regressions
- API latency regressions
- image-size regressions
- database migration risks

Performance tests should be part of release qualification for major changes.

---

# 63. Load Testing

Load tests SHALL simulate realistic marketplace behavior.

Example mix:

```text
40% product browsing
20% search
10% product detail
10% cart operations
5% checkout
5% order tracking
5% supplier operations
5% admin/reporting
```

Actual production-like distribution should replace these example ratios after telemetry exists.

---

# 64. Stress Testing

Stress tests should identify:

- API saturation
- database saturation
- Redis limits
- queue backlog
- search limits
- worker saturation
- connection exhaustion
- memory leaks

The objective is to determine failure thresholds and safe operating limits.

---

# 65. Soak Testing

Run long-duration tests to identify:

- memory leaks
- connection leaks
- queue accumulation
- cache degradation
- database growth problems
- log-volume problems
- periodic job collisions

---

# 66. Failure Testing

Test:

```text
Redis unavailable
database latency increased
search unavailable
payment provider timeout
Porter unavailable
queue unavailable
worker crash
API instance terminated
network interruption
```

The expected behavior must be documented for each failure.

---

# 67. Capacity Planning

Capacity planning should track:

```text
daily active buyers
daily active suppliers
orders/day
peak orders/minute
search requests/minute
catalog size
inventory rows
events/day
notification volume
image storage
database size
```

Capacity models should be updated using actual production measurements.

---

# 68. Scaling Triggers

Example triggers requiring architecture review:

```text
API p95 consistently exceeds target
database CPU consistently high
connection pool saturation
queue lag increasing
search latency increasing
cache hit ratio deteriorating
storage growth accelerating
single-region capacity limits
```

Do not wait for an outage before capacity planning.

---

# 69. Performance Incident Process

When performance degrades:

```text
Detect
  |
  v
Measure
  |
  v
Identify bottleneck
  |
  v
Mitigate
  |
  v
Restore
  |
  v
Root cause analysis
  |
  v
Prevent recurrence
```

Avoid random infrastructure scaling without evidence.

---

# 70. Performance Documentation

For every critical API, document:

```text
expected latency
dependency list
cache behavior
database queries
timeout
retry policy
rate limit
failure behavior
scaling behavior
```

---

# 71. Definition of Done

For a performance-sensitive feature:

- [ ] Critical path identified.
- [ ] Latency target defined.
- [ ] Database queries measured.
- [ ] Indexes reviewed.
- [ ] Cache strategy defined where appropriate.
- [ ] Cache invalidation defined.
- [ ] External timeouts defined.
- [ ] Async work separated.
- [ ] Rate limits defined.
- [ ] Observability added.
- [ ] Load test added.
- [ ] Failure behavior tested.
- [ ] Security/correctness constraints preserved.
- [ ] Production capacity impact reviewed.

---

# 72. Acceptance Criteria

This specification is considered implemented when:

- API latency objectives are measurable.
- CDN is used for suitable static/public assets.
- Redis caching is standardized.
- Critical transactional data is not incorrectly served from stale caches.
- Product/catalog reads use appropriate caching/search.
- Checkout validates authoritative price and inventory.
- API instances can scale horizontally.
- Workers scale independently.
- Database connection pooling is configured.
- Slow-query monitoring exists.
- Search has defined performance targets.
- Large reports are asynchronous.
- Image delivery is optimized.
- Cache stampede controls exist for hot resources.
- Graceful degradation exists for non-critical dependencies.
- Load/stress/soak tests are part of release validation.
- Performance metrics are visible in production.
- Capacity thresholds are documented.

---

# 73. Final Architecture Position

Bezzo performance should be built around a simple rule:

```text
Fast reads
+
Authoritative writes
+
Aggressive optimization where safe
+
Asynchronous non-critical work
+
Measured database access
+
Controlled caching
+
Horizontal scaling
+
Graceful degradation
```

The most important distinction is:

```text
CACHE FOR SPEED
DATABASE/DOMAIN FOR TRUTH
```

Browsing can tolerate controlled staleness.

Final inventory reservation, pricing validation, payment state, authorization and financial records cannot rely on stale cache data.

The initial architecture should remain operationally simple while being designed for growth:

```text
CDN
  |
Load Balancer
  |
Stateless API
  |
+---------+---------+---------+
|         |         |         |
Postgres Redis   Search    Queue/Workers
  |
Object Storage
```

As measured load increases, Bezzo can selectively introduce:

```text
read replicas
dedicated workers
specialized services
dedicated brokers
projection stores
partitioning
regional infrastructure
```

only when actual workload justifies the additional operational complexity.

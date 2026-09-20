# Bezzo API Gateway, Rate Limiting & Traffic Management Engineering Specification v1.0

## 1. Purpose

This document defines the production traffic-management layer for Bezzo.

It covers:
- API gateway architecture
- ingress and routing
- authentication handoff
- rate limiting
- abuse protection
- request validation
- quotas
- throttling
- concurrency control
- traffic shaping
- load balancing
- API version routing
- tenant-aware limits
- provider protection
- maintenance controls
- observability
- failure handling
- implementation standards
- testing
- Definition of Done

The gateway is a traffic-control boundary. It is not the authoritative business or authorization layer.

---

## 2. Core Principles

1. Protect backend services before they become saturated.
2. Authenticate and authorize requests at the correct layers.
3. Apply rate limits server-side.
4. Separate public, authenticated, supplier, admin and internal traffic policies.
5. Protect expensive endpoints more aggressively.
6. Keep limits deterministic and observable.
7. Fail safely during overload.
8. Never use gateway controls to bypass application security.
9. Preserve idempotency for retryable transactional requests.
10. Make traffic policies configurable but governed.

---

## 3. High-Level Architecture

```text
                    Internet
                       |
                       v
                    DNS / CDN
                       |
                       v
                    WAF / Edge
                       |
                       v
                Load Balancer
                       |
                       v
                  API Gateway
                       |
          +------------+-------------+
          |            |             |
          v            v             v
        Web API     Mobile API     Admin API
          |            |             |
          +------------+-------------+
                       |
                       v
                 Backend Services
             /         |                      v          v           v
       PostgreSQL    Redis      OpenSearch
```

Internal workers and service-to-service traffic should use separate internal networking and policies.

---

## 4. Gateway Responsibilities

The gateway may handle:

- TLS termination
- routing
- request size limits
- IP-level abuse controls
- rate limiting
- authentication token handoff/validation where supported
- API version routing
- CORS policy where applicable
- request correlation IDs
- basic schema/format validation
- timeout enforcement
- connection limits
- upstream health checks
- traffic shaping
- maintenance responses

Business authorization remains inside the application.

---

## 5. What the Gateway Must Not Own

The gateway must not become the source of truth for:

- order state
- payment state
- inventory reservation
- supplier ownership
- buyer eligibility
- pharmaceutical eligibility
- final pricing
- commissions
- refunds
- dispute decisions

Those remain application/domain responsibilities.

---

## 6. API Domains

Logical API domains may include:

```text
/api/v1/auth
/api/v1/catalog
/api/v1/search
/api/v1/cart
/api/v1/orders
/api/v1/payments
/api/v1/logistics
/api/v1/notifications
/api/v1/support
/api/v1/supplier
/api/v1/admin
```

Version routing must be explicit.

---

## 7. API Versioning

Use URI or equivalent explicit versioning:

```text
/api/v1/...
/api/v2/...
```

The gateway may route versions to different backend deployments.

Version changes must preserve:
- authentication semantics
- security controls
- idempotency
- observability

Deprecated versions should have documented sunset dates.

---

## 8. Routing

Routing should be based on stable API paths rather than arbitrary client input.

Example:

```text
/api/v1/search/*     -> Search module
/api/v1/orders/*     -> Order module
/api/v1/payments/*   -> Payment module
/api/v1/admin/*      -> Admin module
```

The gateway must reject unknown routes with a controlled error.

---

## 9. TLS

Production traffic must use HTTPS/TLS.

Recommended:
- TLS at the edge
- secure upstream connections where required
- modern TLS configuration
- certificate automation
- certificate-expiry monitoring

HTTP should redirect or be rejected according to edge policy.

---

## 10. Request Size Limits

Set bounded request limits.

Examples:
- JSON API payload
- multipart metadata
- query string
- headers
- uploaded files

Large media uploads should use signed object-storage uploads rather than passing large binaries through the API gateway.

---

## 11. Timeout Policy

Every upstream request must have a bounded timeout.

Conceptual hierarchy:

```text
Client timeout
   >
Gateway timeout
   >
Service timeout
   >
Database/provider timeout
```

Avoid retrying requests automatically when the operation is non-idempotent.

---

## 12. Rate Limiting Model

Rate limits should be multi-dimensional.

Potential dimensions:

```text
IP
authenticated user
buyer organization
supplier
API key/service identity
endpoint
global service
```

Use the most appropriate dimensions for each endpoint.

---

## 13. Rate Limit Algorithms

Possible algorithms:

### Token bucket

Good for burst tolerance.

### Leaky bucket

Good for controlled throughput.

### Fixed window

Simple but has boundary burst behavior.

### Sliding window

More precise but potentially more expensive.

Bezzo should prefer token-bucket or sliding-window approaches for production API protection where practical.

---

## 14. Redis-Based Rate Limiting

Redis can provide distributed rate-limit state.

Conceptually:

```text
Request
  |
  v
Rate-limit key
  |
  v
Redis
  |
  +--> allowed
  |
  +--> rejected
```

Rate-limit keys must include the appropriate security scope.

Do not use only IP addresses for authenticated marketplace limits because many legitimate users may share an IP.

---

## 15. Endpoint Classification

Endpoints should be classified by risk/cost.

### Low cost
- health
- static metadata

### Standard
- catalog
- search
- product detail

### Moderate
- cart
- recommendations
- supplier operations

### High cost / sensitive
- login
- OTP
- password reset
- checkout
- payment initiation
- document operations
- exports
- reports
- admin actions

High-risk endpoints require stricter controls.

---

## 16. Authentication Abuse Controls

Authentication endpoints should have:
- IP rate limits
- account/identifier rate limits
- device/session controls where appropriate
- brute-force protection
- temporary lockout/throttling
- suspicious-attempt monitoring

Do not reveal whether a sensitive account identifier exists when the product's privacy model requires generic responses.

---

## 17. OTP Protection

OTP endpoints need separate limits for:

```text
phone/email identifier
IP
device/session where applicable
request type
```

Controls should prevent:
- OTP flooding
- brute force
- repeated resend abuse

OTP verification must also enforce attempt limits.

---

## 18. Login Protection

Use:
- rate limits
- failed-attempt monitoring
- credential-stuffing detection
- device/session signals where supported
- progressive throttling

Do not rely solely on IP blocking.

---

## 19. Search Rate Limits

Search is high-volume but normally low-risk.

Use:
- per-user limits
- per-IP limits
- endpoint concurrency
- query length limits
- result-page limits
- aggregation limits

Autocomplete can use a separate higher-throughput policy with compact responses.

---

## 20. Expensive Endpoint Protection

Expensive operations include:
- exports
- analytics reports
- large searches
- bulk imports
- bulk supplier updates
- reindex operations

Use:
- strict quotas
- asynchronous jobs
- concurrency limits
- maximum execution duration
- admin authorization

Do not allow a client to trigger unlimited synchronous work.

---

## 21. Bulk API Protection

Bulk endpoints must enforce:
- maximum item count
- maximum request size
- per-user/supplier quotas
- processing time limits
- asynchronous processing where appropriate

Example:

```text
POST /bulk-import
       |
       v
Validate
       |
       v
Create Job
       |
       v
Queue
       |
       v
Worker
```

---

## 22. Concurrency Limits

Rate limits alone do not control long-running concurrent requests.

Use concurrency limits for:
- reports
- exports
- media processing requests
- search-heavy endpoints
- external provider operations

Example:

```text
supplier_id = S1
max_concurrent_exports = 2
```

---

## 23. Quotas

Quotas can be:
- hourly
- daily
- monthly

Potential quota dimensions:
- supplier
- buyer
- organization
- API consumer
- endpoint class

Quota exhaustion should return a deterministic response.

---

## 24. HTTP Responses for Throttling

Use appropriate status semantics such as:

```text
429 Too Many Requests
```

Where practical, return retry guidance such as:

```text
Retry-After
```

Do not expose internal capacity details.

---

## 25. Idempotency

Gateway retries and clients can create duplicate transactional requests.

Critical operations should support idempotency keys:

```text
POST /orders
POST /payments
POST /refunds
POST /logistics
```

The application layer remains authoritative for idempotency.

The gateway should preserve the idempotency key rather than inventing a new one.

---

## 26. Automatic Retries

Gateway retries should be conservative.

Safe candidates are generally:
- idempotent reads
- explicitly idempotent operations

Avoid automatic retries for:
- payment creation
- order creation
- refund creation
- logistics booking

unless the downstream contract explicitly guarantees safe retry semantics.

---

## 27. Load Balancing

Use health-aware load balancing across API instances.

Support:
- connection draining
- health checks
- gradual deployment
- instance removal
- autoscaling

Do not send traffic to unhealthy instances.

---

## 28. Deployment Traffic Control

Support:
- rolling deployment
- blue/green where required
- canary routing where useful

Example:

```text
v1 stable: 95%
v2 canary: 5%
```

Canary routing should be observable and reversible.

---

## 29. Maintenance Mode

The gateway can provide controlled maintenance behavior.

Possible modes:

```text
NORMAL
DEGRADED
READ_ONLY
MAINTENANCE
```

Read-only mode must still be enforced by application/domain rules for transactional endpoints.

---

## 30. Graceful Degradation

During partial failure:

```text
Recommendations unavailable
        |
        v
Marketplace remains usable
```

Similarly:
- analytics failure should not block orders
- notification failure should not necessarily block checkout
- search failure should not permit unsafe transactional assumptions

The gateway should not convert partial failures into false success.

---

## 31. WAF Integration

Use WAF controls for:
- common web attacks
- malicious payload patterns
- bot abuse
- IP reputation
- request anomalies
- geographic rules where justified

WAF policies must be tested to avoid blocking legitimate pharmacy businesses.

---

## 32. Bot Protection

Potential controls:
- rate limits
- behavioral detection
- challenge mechanisms where appropriate
- API authentication
- suspicious request patterns

Do not use aggressive challenges that unnecessarily degrade legitimate B2B users.

---

## 33. CORS

CORS should be explicitly configured.

Allow only approved origins for browser APIs.

Never use unrestricted production:

```text
Access-Control-Allow-Origin: *
```

for authenticated sensitive APIs unless the architecture explicitly requires and secures it.

---

## 34. Security Headers

Apply appropriate headers at the edge/application boundary, such as:
- HSTS
- content-type protection
- frame restrictions
- referrer policy
- controlled CORS

Exact policy depends on web architecture.

---

## 35. Request Correlation

Every request should receive or propagate:

```text
X-Request-ID
```

or an equivalent correlation identifier.

Propagate it through:

```text
Gateway
 -> API
 -> worker/event
 -> external provider
```

Do not put sensitive personal data in request IDs.

---

## 36. Distributed Tracing

Propagate tracing context across:
- gateway
- services
- database calls
- queues
- payment providers
- Porter
- notification providers

Trace sampling should follow the observability specification.

---

## 37. Gateway Metrics

Track:

### Traffic
- requests/sec
- bytes
- active connections

### Performance
- p50/p95/p99 latency
- upstream latency
- gateway latency

### Reliability
- 4xx rate
- 5xx rate
- timeout rate
- upstream failures

### Protection
- rate-limit rejects
- WAF blocks
- authentication failures
- quota exhaustion

---

## 38. Endpoint Metrics

Track by bounded endpoint group:

```text
method
route template
status class
service
environment
```

Do not use arbitrary URL strings or user IDs as high-cardinality metric labels.

---

## 39. Traffic Anomaly Detection

Detect:
- sudden request spikes
- unusual login failures
- OTP flooding
- search scraping
- bulk endpoint abuse
- unexpected geographic traffic
- repeated 5xx responses

Automated responses should be conservative and reversible.

---

## 40. Tenant-Aware Limits

B2B tenants should have configurable policies.

Example:

```text
buyer_standard
buyer_high_volume
supplier_standard
supplier_integrated
admin
internal_service
```

Limits can differ by role/capability.

Tenant-specific limits must never bypass authorization.

---

## 41. Supplier Integration Limits

ERP/POS integrations require:
- API quotas
- webhook limits
- polling limits
- payload limits
- per-supplier concurrency limits

A supplier's integration should not consume unlimited shared platform capacity.

---

## 42. External Provider Protection

Gateway/service clients should protect:
- payment providers
- Porter
- SMS
- email
- ERP/POS connectors

Use:
- rate limits
- concurrency limits
- timeouts
- circuit breakers
- bounded retries

Provider protection belongs near the integration boundary rather than relying solely on the public gateway.

---

## 43. Circuit Breakers

Circuit breakers can use:

```text
CLOSED
  |
  | repeated failures
  v
OPEN
  |
  | cooldown
  v
HALF_OPEN
  |
  +--> success -> CLOSED
  +--> failure -> OPEN
```

Circuit breakers should prevent cascading failure.

---

## 44. Request Validation

The gateway may perform lightweight validation:
- HTTP method
- body size
- required headers
- content type
- malformed syntax

Business schema validation remains in the application.

Do not duplicate complex domain validation at the gateway.

---

## 45. Header Controls

Strip or normalize unsafe/untrusted headers.

Trusted identity headers must be generated by trusted infrastructure.

Never trust a public client-supplied header such as:

```text
X-User-Role
X-Supplier-ID
X-Admin
```

unless it is overwritten by trusted authentication infrastructure.

---

## 46. Authentication Handoff

Preferred model:

```text
Client
  |
  v
Gateway / Auth layer
  |
  v
Validated identity context
  |
  v
Application
```

The application must still enforce authorization.

Identity context should be integrity-protected.

---

## 47. Admin API Protection

Admin traffic should have:
- separate route/policy
- stricter rate limits
- stronger authentication
- stronger audit requirements
- optional IP/network restrictions
- privileged role checks

Do not expose unrestricted admin endpoints to ordinary marketplace clients.

---

## 48. Internal Service Traffic

Internal services should use:
- private networking
- service identity
- TLS/mTLS where appropriate
- service authorization
- separate rate/concurrency policies

Do not assume internal traffic is automatically trusted.

---

## 49. Gateway Configuration

Gateway configuration should include:

```text
routes
upstreams
timeouts
rate limits
quotas
CORS
WAF references
maintenance state
circuit breakers
health checks
```

Configuration should be managed through the Bezzo configuration-control system.

---

## 50. Configuration Safety

Changes to:
- global rate limits
- authentication routes
- WAF rules
- admin access
- payment endpoints
- provider routing

should have strong authorization and audit logging.

Invalid gateway configuration must fail validation before deployment.

---

## 51. API Error Format

Gateway errors should use a consistent envelope where possible:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests.",
    "request_id": "uuid"
  }
}
```

Do not expose stack traces, infrastructure details, or provider secrets.

---

## 52. Health Endpoints

Use separate:

```text
liveness
readiness
health
```

Readiness should reflect whether the instance can safely receive traffic.

Do not make public health endpoints reveal sensitive infrastructure information.

---

## 53. Graceful Shutdown

API instances should:
1. stop receiving new traffic
2. finish safe in-flight requests
3. close connections
4. release resources
5. terminate

Gateway load balancing must support connection draining.

---

## 54. Capacity Planning

Plan for:
- average traffic
- peak traffic
- promotional spikes
- supplier bulk imports
- scheduled order processing
- catalog updates
- search traffic
- authentication bursts

Use measured traffic to update limits and autoscaling.

---

## 55. Load Testing

Test:
- normal load
- peak load
- sudden spike
- sustained overload
- rate-limit behavior
- gateway failure
- upstream failure
- Redis rate-limit failure
- database saturation
- OpenSearch latency
- provider outage

Verify graceful degradation rather than only maximum throughput.

---

## 56. Security Testing

Test:
- rate-limit bypass
- header spoofing
- tenant-limit bypass
- IP spoofing assumptions
- authentication abuse
- CORS bypass
- oversized requests
- malformed requests
- WAF evasion
- admin route access
- API version access

---

## 57. Abuse Scenarios

Model:
- credential stuffing
- OTP flooding
- product scraping
- search abuse
- supplier API scraping
- bulk-import abuse
- report/export abuse
- payment endpoint abuse
- webhook flooding

Each scenario should have:
- detection
- prevention
- response
- recovery

---

## 58. Implementation Structure

Recommended gateway/infrastructure layout:

```text
infrastructure/gateway/
  routes/
  policies/
  rate-limits/
  waf/
  cors/
  timeouts/
  health-checks/
  traffic-shaping/
  deployment/
```

Backend protection modules:

```text
src/platform/traffic/
  rate-limit/
  concurrency/
  circuit-breaker/
  retry/
  request-context/
```

---

## 59. Redis Failure

If Redis is unavailable:
- do not silently remove all protection
- use bounded local emergency limits where practical
- fail closed for highly sensitive abuse-prone endpoints if required
- alert immediately

The exact fallback depends on endpoint criticality.

---

## 60. Gateway Failure

Use redundant gateway/load-balancing infrastructure.

A single gateway instance must never be a single point of failure.

Infrastructure health should support automated replacement.

---

## 61. Rate-Limit Response Strategy

When a request is rejected:
- return deterministic status
- include retry guidance where appropriate
- record metrics
- avoid exposing internal quota configuration unnecessarily

Do not repeatedly retry throttled requests automatically from clients.

---

## 62. Client Backoff

Official clients should implement bounded backoff for transient responses.

For example:

```text
429 / 503
  ->
wait
  ->
retry with jitter
```

Do not retry non-idempotent operations without idempotency support.

---

## 63. Cost Controls

Traffic controls should protect against accidental cloud-cost spikes.

Examples:
- maximum worker scale
- report quotas
- export concurrency
- search aggregation limits
- upload limits
- API quotas

Cost controls must remain subordinate to required reliability and security.

---

## 64. Deployment Strategy

Gateway changes should support:
- configuration validation
- staging tests
- canary/blue-green where appropriate
- automated rollback
- route health verification

A bad route configuration must not be promoted blindly.

---

## 65. Disaster Recovery

Maintain:
- version-controlled gateway configuration
- IaC
- documented routing
- WAF configuration
- rate-limit policies
- DNS configuration
- certificates/automation
- recovery runbook

Recovery should be reproducible without undocumented manual steps.

---

## 66. Operational Runbooks

Required runbooks:

```text
gateway outage
rate-limit incident
WAF false positive
traffic spike
DDoS/abuse event
Redis rate-limit failure
upstream service outage
payment provider outage
Porter outage
certificate issue
bad deployment
route misconfiguration
```

---

## 67. Definition of Done

Complete when:

- HTTPS/TLS is enforced
- WAF/edge protection is configured
- load balancing works
- routing is versioned
- request-size limits exist
- timeouts are bounded
- rate limiting works
- distributed rate limiting is tested
- authentication abuse controls exist
- OTP protection exists
- concurrency limits exist
- quotas exist
- idempotency is preserved
- automatic retries are controlled
- circuit breakers exist where needed
- tenant-aware policies work
- supplier integration limits work
- admin routes are protected
- request correlation exists
- gateway metrics exist
- anomaly detection exists
- graceful degradation works
- load/security tests pass
- gateway configuration is version controlled
- recovery runbooks exist

---

## 68. Final Architecture

```text
                         INTERNET
                            |
                            v
                      DNS / CDN / WAF
                            |
                            v
                       Load Balancer
                            |
                            v
                       API Gateway
                 /          |                          /           |                          v            v            v
          Public API    Authenticated   Admin API
               |             |            |
               +-------------+------------+
                             |
                             v
                       Backend Services
              /             |                           v              v               v
        PostgreSQL        Redis          OpenSearch
             |
             v
      External Integrations
       /       |           Payments   Porter   ERP/POS
```

**Core rule: the gateway protects traffic and infrastructure; domain services remain authoritative for business correctness and security decisions.**

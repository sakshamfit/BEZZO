# Bezzo DevOps & Infrastructure Specification v1.0

## 1. Naming

The official application name is:

**Bezzo**

Use `Bezzo` consistently in all new documentation, code, repositories, package names, environments, dashboards, and infrastructure labels.

Earlier documents that use `Bezo` should be treated as legacy naming and should be renamed/revised to `Bezzo` before final project documentation is consolidated.

---

# 2. Purpose

This document defines the infrastructure, deployment, CI/CD, cloud, networking, observability, backup, scaling, and operational strategy for Bezzo.

The infrastructure should support:

- Web
- Android/iOS backend APIs
- Supplier dashboard
- Buyer marketplace
- Admin portal
- PostgreSQL
- Redis
- Search
- Object storage
- Background workers
- Payment integrations
- Porter/logistics integration
- Notifications
- Monitoring and auditing

The first production architecture should be scalable without introducing unnecessary operational complexity.

---

# 3. Infrastructure Principles

1. Infrastructure must be reproducible.
2. Production must not depend on manually configured servers.
3. Secrets must never be stored in Git.
4. Databases must not be publicly exposed.
5. Services should be horizontally scalable.
6. Background jobs should be independently scalable.
7. Deployments should be reversible.
8. Observability must exist before large-scale launch.
9. Backups must be automated and restoration must be tested.
10. Use managed cloud services wherever they reduce operational burden.
11. Do not introduce Kubernetes solely because the application is intended to scale.
12. Infrastructure should support later extraction into microservices.

---

# 4. Recommended Cloud Model

Use one major cloud provider initially rather than distributing infrastructure across multiple clouds.

Recommended logical components:

```text
Cloud Account
├── Networking
├── CDN/WAF
├── Load Balancer
├── Web Compute
├── API Compute
├── Worker Compute
├── PostgreSQL
├── Redis
├── Search
├── Object Storage
├── Queue
├── Container Registry
├── Secrets Manager
├── Monitoring
└── Logging
```

The exact cloud vendor can be selected based on cost, Indian-region availability, operational requirements, and team expertise.

---

# 5. Environment Structure

Use:

```text
local
staging
production
```

Potential later:

```text
preview
development
```

Each environment must be isolated.

Do not share production databases with staging.

---

# 6. Suggested Cloud Accounts

For larger operations, separate:

```text
Organization
├── Security
├── Shared Services
├── Staging
└── Production
```

For early-stage development, separate environments can initially exist within one controlled account if organizational complexity is not yet justified.

---

# 7. Region Strategy

Start with an India-based cloud region appropriate for the operating geography and service availability.

Primary region should be selected based on:

- Latency to target users
- Service availability
- Regulatory/data-location requirements
- Cost
- Disaster-recovery options

Do not hard-code a region into application logic.

---

# 8. Network Architecture

Logical topology:

```text
                         INTERNET
                            |
                       DNS / CDN
                            |
                         WAF
                            |
                     Load Balancer
                      /          \
                    Web          API
                                  |
                       Private Application
                              Network
                       /        |        \
                   API       Workers    Admin
                    |           |
          -------------------------------
          |              |              |
       PostgreSQL       Redis        Search
          |
     Object Storage
```

The database and internal data services should remain private.

---

# 9. VPC/VNet Layout

Use separate network zones/subnets.

Example:

```text
Public
├── Load Balancer
└── Edge components

Private App
├── API
├── Workers
└── Internal services

Private Data
├── PostgreSQL
├── Redis
└── Search
```

Only the load balancer should accept normal public application traffic.

---

# 10. Security Groups / Firewall

Allow only required communication.

Example:

```text
Internet
→ CDN/WAF

CDN/WAF
→ Load Balancer

Load Balancer
→ Web/API

API
→ PostgreSQL
→ Redis
→ Search
→ Object Storage
→ Queue

Workers
→ PostgreSQL
→ Redis
→ Search
→ Object Storage
→ External providers
```

Database should not accept arbitrary internet connections.

---

# 11. DNS

Recommended domain structure:

```text
bezzo.com
www.bezzo.com

api.bezzo.com
admin.bezzo.com

cdn.bezzo.com
assets.bezzo.com
```

Potential later:

```text
status.bezzo.com
docs.bezzo.com
```

DNS should be managed through a reliable DNS provider with:

- DNSSEC where supported
- Health checks where useful
- Controlled TTLs
- Audit logging

---

# 12. CDN

Use CDN for:

- Web static assets
- Product images
- Public catalog media
- JavaScript/CSS
- Fonts where appropriate

Do not cache private account data publicly.

Private documents must use authenticated/signed access.

---

# 13. WAF

WAF should protect public web/API endpoints against common attacks.

Configure protections for:

- Injection
- Automated abuse
- Malicious bots
- Suspicious requests
- Excessive request rates

WAF rules must be tested so legitimate pharmacy/supplier traffic is not blocked.

---

# 14. Load Balancer

Use a managed HTTPS load balancer.

Responsibilities:

- TLS termination
- Routing
- Health checks
- Connection management
- Multiple API instances
- Web routing where required

Example:

```text
api.bezzo.com
       ↓
Load Balancer
   /       \
API-1     API-2
```

---

# 15. Container Strategy

Package production services as containers.

Initial containers:

```text
bezzo-web
bezzo-api
bezzo-worker
bezzo-admin
```

Later:

```text
bezzo-search-worker
bezzo-notification-worker
bezzo-reconciliation-worker
```

Do not split services until independent scaling or operational ownership justifies it.

---

# 16. Container Requirements

Each container should:

- Run as non-root
- Have a health endpoint
- Use minimal base image
- Pin dependency versions
- Avoid embedded secrets
- Emit structured logs
- Handle SIGTERM gracefully
- Support graceful shutdown

---

# 17. Container Registry

Use a private container registry.

Image naming:

```text
bezzo/api:<version>
bezzo/web:<version>
bezzo/worker:<version>
bezzo/admin:<version>
```

Prefer immutable version tags.

Avoid relying exclusively on:

```text
latest
```

for production.

---

# 18. Web Deployment

Recommended flow:

```text
Git
 ↓
CI
 ↓
Build
 ↓
Test
 ↓
Security scan
 ↓
Deploy staging
 ↓
Smoke test
 ↓
Production
```

The web layer can be deployed independently from the API where useful.

---

# 19. API Deployment

Run multiple API instances behind the load balancer.

Example:

```text
API Instance 1
API Instance 2
API Instance 3
```

Instances must be stateless wherever possible.

Do not store critical session state only in local process memory.

---

# 20. Worker Deployment

Workers process:

- Search indexing
- Notifications
- Reservation expiration
- Scheduled delivery dispatch
- Payment reconciliation
- Logistics synchronization
- Document processing
- Analytics jobs

Workers should scale independently from the API.

---

# 21. Auto Scaling

Scale API based on measurable signals such as:

```text
CPU
Memory
Request rate
Latency
Queue depth
```

Workers:

```text
Queue depth
Processing latency
Job age
```

Search/database scaling should be based on real usage rather than arbitrary thresholds.

---

# 22. PostgreSQL

Use managed PostgreSQL.

Production configuration should support:

- Automated backups
- Point-in-time recovery
- High availability where justified
- Encryption
- Monitoring
- Connection limits
- Read replicas later if required

Start with one primary database architecture unless traffic requires more.

---

# 23. PostgreSQL Connection Management

API instances must use connection pooling.

Avoid opening a new DB connection for every request.

As API instances scale:

```text
API instances ↑
DB connections ↑
```

Therefore connection limits must be designed centrally.

A managed connection pooler may become necessary at scale.

---

# 24. Database Scaling Path

Initial:

```text
Primary PostgreSQL
```

Later:

```text
Primary
├── Read Replica
└── Read Replica
```

Much later, if justified:

```text
Partitioning
Specialized databases
Service-owned databases
```

Do not introduce sharding prematurely.

---

# 25. Redis

Use managed Redis.

Responsibilities may include:

- Cache
- Rate limiting
- Temporary cart state
- Short-lived session data
- Distributed locks where justified
- Queue backend where appropriate

Do not treat Redis as the permanent source of truth for orders or payments.

---

# 26. Redis High Availability

Production should use managed redundancy appropriate to the selected Redis service.

Application behavior must tolerate:

```text
Redis unavailable
```

For critical persistent business data, PostgreSQL remains authoritative.

---

# 27. Search Infrastructure

Use OpenSearch-compatible managed search where possible.

Architecture:

```text
PostgreSQL
   ↓
Outbox/Event
   ↓
Queue
   ↓
Search Worker
   ↓
OpenSearch
```

Search can be rebuilt from PostgreSQL if the index is lost.

---

# 28. Search Index Recovery

Never make search the only source of product truth.

Provide an administrative/recovery job:

```text
Read canonical products
→ transform
→ bulk index
→ verify count
→ switch/activate index
```

---

# 29. Object Storage

Use object storage for:

- Product images
- Supplier documents
- Buyer documents
- Generated invoices
- Reports
- Other approved media

Separate public-safe and private content logically.

Example:

```text
bezzo-public-assets
bezzo-private-documents
bezzo-generated-documents
```

---

# 30. Object Storage Security

Private objects:

- No public ACL
- Signed URLs
- Access policy
- Encryption
- Audit logging where available

Product images may use a CDN-backed public-safe delivery model after validation.

---

# 31. Queue Architecture

Use a queue for asynchronous processing.

Initial queue categories:

```text
search
notifications
documents
orders
payments
logistics
scheduled-delivery
reconciliation
```

The exact queue technology can initially be Redis-backed if operationally appropriate.

Move to RabbitMQ/Kafka or another dedicated system only when scale/requirements justify it.

---

# 32. Job Design

Every job should contain:

```text
jobId
type
attempt
createdAt
payload
```

Workers must be idempotent.

Example:

```text
InventoryReleaseJob
```

must safely execute twice without releasing inventory twice.

---

# 33. Dead Letter Queues

Jobs that repeatedly fail should enter a dead-letter workflow.

Example:

```text
Pending
→ Retry
→ Retry
→ Retry
→ Dead Letter
```

Operations must be able to inspect and replay eligible jobs.

---

# 34. CI Pipeline

Every pull request:

```text
Checkout
↓
Install dependencies
↓
Typecheck
↓
Lint
↓
Unit tests
↓
Integration tests
↓
Build
↓
Security scan
```

---

# 35. CD Pipeline

Recommended:

```text
Merge to main
↓
Build immutable artifacts
↓
Deploy staging
↓
Run smoke tests
↓
Approval
↓
Production deployment
↓
Health validation
```

Production deployments should not rebuild different source code from the tested artifact.

---

# 36. Deployment Strategy

Start with rolling deployments.

Later, if required:

```text
Blue/Green
Canary
Feature flags
```

For high-risk payment/order changes, feature flags are strongly recommended.

---

# 37. Database Deployment Safety

Application deployment and DB migration must be compatible.

Prefer:

```text
Expand
→ Deploy compatible application
→ Backfill
→ Switch behavior
→ Contract/remove old schema
```

Avoid destructive migrations in the same deployment that still depends on the old schema.

---

# 38. Rollback Strategy

Application rollback:

```text
Previous immutable image
```

Database rollback should not depend on blindly reversing migrations.

Prefer forward-compatible migrations.

For destructive data changes:

```text
Backup
→ validation
→ staged migration
→ rollback/restore plan
```

---

# 39. Feature Flags

Use feature flags for:

- New checkout
- New payment provider
- New logistics provider
- Scheduled delivery
- New search behavior
- Promotional features
- Experimental UI

Flags should be controlled server-side where business/security decisions are involved.

---

# 40. Observability Stack

Implement:

```text
Metrics
Logs
Traces
Alerts
Dashboards
```

Track at minimum:

```text
API latency
API errors
DB latency
Redis latency
Search latency
Queue depth
Worker failures
Payment failures
Delivery failures
Order conversion
```

---

# 41. Structured Logging

Use JSON logs.

Example:

```json
{
  "timestamp": "2026-01-01T10:00:00Z",
  "level": "INFO",
  "service": "api",
  "requestId": "req_123",
  "userId": "usr_123",
  "event": "ORDER_CREATED",
  "orderId": "ord_123"
}
```

Do not log passwords, tokens, CVV, or unnecessary personal data.

---

# 42. Distributed Tracing

Trace important flows:

```text
HTTP request
→ PostgreSQL
→ Redis
→ Queue
→ Payment
→ Logistics
```

This becomes especially important when an order spans multiple asynchronous systems.

---

# 43. Alerting

Create alerts for:

## Critical

- API unavailable
- Database unavailable
- Payment webhook failures
- Order creation failure spike
- Cross-tenant authorization failures
- Large queue backlog

## High

- Elevated latency
- High payment failure rate
- Logistics failure spike
- Search outage
- Worker failure spike

## Medium

- Low disk capacity
- Backup failure
- Increased error rate

---

# 44. Monitoring Dashboards

Create:

```text
Executive
├── Orders
├── GMV/revenue where applicable
├── Delivery
└── Supplier activity

Engineering
├── API
├── Database
├── Redis
├── Search
└── Queue

Operations
├── Supplier verification
├── Orders
├── Payments
└── Logistics

Security
├── Authentication
├── Authorization
├── WAF
└── Suspicious activity
```

---

# 45. Backup Strategy

PostgreSQL:

```text
Automated backups
Point-in-time recovery
Retention policy
Restore testing
```

Object storage:

```text
Versioning where appropriate
Lifecycle policies
Backup/replication where required
```

Configuration:

```text
Infrastructure as Code
Secret-manager configuration
Documented recovery procedure
```

---

# 46. Recovery Objectives

Define before production:

```text
RPO — maximum acceptable data loss
RTO — maximum acceptable recovery time
```

Example targets should be chosen based on business requirements rather than copied blindly from another company.

---

# 47. Disaster Recovery

Document:

```text
Database recovery
Redis recovery
Search rebuild
Object storage recovery
Application redeployment
DNS recovery
Secret recovery
Third-party credential recovery
```

Run disaster-recovery exercises periodically.

---

# 48. Infrastructure as Code

Terraform structure:

```text
infrastructure/
├── modules/
│   ├── network/
│   ├── database/
│   ├── redis/
│   ├── search/
│   ├── storage/
│   ├── compute/
│   ├── monitoring/
│   └── security/
│
└── environments/
    ├── staging/
    └── production/
```

All infrastructure changes should be reviewed.

---

# 49. Terraform State

Terraform state must be stored remotely and protected.

Use:

- Encryption
- Versioning
- Locking
- Restricted access
- Backup/recovery

Never store production Terraform state only on a developer laptop.

---

# 50. Secrets Management

Use a cloud secrets manager.

Separate:

```text
staging/payment
production/payment

staging/database
production/database
```

Access should be granted to workloads using workload identity/managed identity where possible.

---

# 51. Domain Certificates

Use managed TLS certificates where possible.

Certificates must automatically renew.

Never allow production services to run with expired certificates.

---

# 52. Mobile Infrastructure

Mobile apps communicate with:

```text
api.bezzo.com
```

Do not expose database or internal service endpoints to mobile clients.

Mobile configuration should support:

```text
Development API
Staging API
Production API
```

with release-specific configuration.

---

# 53. Mobile Release Pipeline

Android:

```text
Build
→ Test
→ Sign
→ Internal testing
→ Staged rollout
→ Production
```

iOS:

```text
Build
→ Test
→ Sign
→ TestFlight
→ Review
→ Staged rollout
```

Signing keys/certificates must be protected.

---

# 54. Web Deployment Environments

Local:

```text
developer machine
```

Staging:

```text
staging.bezzo.com
api-staging.bezzo.com
```

Production:

```text
www.bezzo.com
api.bezzo.com
admin.bezzo.com
```

Use no production customer data in staging unless explicitly anonymized and approved.

---

# 55. Production Data Access

Developers should not have unrestricted production database access.

Prefer:

```text
Application access
Operations access
Break-glass access
```

Break-glass access should be:

- Time-limited
- Audited
- Justified
- Revoked automatically where possible

---

# 56. Cost Controls

Monitor:

```text
Compute
Database
Redis
Search
Storage
CDN
Bandwidth
Logs
Third-party APIs
```

Create budget alerts.

Avoid accidentally retaining high-volume logs indefinitely.

---

# 57. Autoscaling Guardrails

Autoscaling must not create runaway costs.

Use:

```text
Minimum instances
Maximum instances
Scale-up threshold
Scale-down threshold
Budget alerts
```

Review scaling behavior during load tests.

---

# 58. Performance Testing

Before launch, test:

```text
Product browsing
Search
Product detail
Cart
Checkout
Order creation
Payment webhook
Supplier dashboard
Admin dashboard
```

Test with realistic concurrency.

Measure:

```text
p50
p95
p99
error rate
throughput
```

---

# 59. Load Testing Scenarios

Scenario 1:

```text
Large number of buyers search simultaneously
```

Scenario 2:

```text
Many buyers attempt checkout at once
```

Scenario 3:

```text
Multiple buyers attempt to purchase the last inventory units
```

Scenario 4:

```text
Payment webhook burst
```

Scenario 5:

```text
Scheduled delivery dispatch window
```

Scenario 6:

```text
Supplier bulk inventory update
```

---

# 60. Capacity Planning

Track:

```text
Daily active buyers
Active suppliers
Products
Inventory records
Orders/day
Peak orders/minute
Search requests/minute
Payment transactions
Delivery requests
Database size
Object storage growth
```

Use real measurements to determine when to scale.

---

# 61. Scaling Path

Initial:

```text
2+ API instances
1 worker pool
Managed PostgreSQL
Managed Redis
Managed search
Object storage
CDN/WAF
```

Growth:

```text
More API instances
More workers
Read replica
Search scaling
Dedicated queue
Dedicated notification workers
```

Large scale:

```text
Service extraction
Independent scaling
Event-driven architecture
Database partitioning where justified
```

---

# 62. Microservice Extraction Rules

A module should become a separate service only when one or more are true:

- It has substantially different scaling needs.
- It has a different deployment cadence.
- It requires separate reliability boundaries.
- It has independent ownership.
- It has heavy asynchronous workloads.
- It has a technology requirement that does not fit the core API.

Do not split services merely to make architecture diagrams look sophisticated.

---

# 63. Initial Service Boundaries

Keep these inside the primary modular backend initially:

```text
Auth
Users
Buyers
Suppliers
Catalog
Inventory
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

Potential future extraction:

```text
Search
Notifications
Payments
Logistics
Analytics
```

---

# 64. Operational Runbooks

Create runbooks for:

```text
API outage
Database outage
Redis outage
Search outage
Payment outage
Porter outage
Queue backlog
Failed deployment
Security incident
Data restore
Certificate failure
High error rate
```

Each runbook should contain:

```text
Symptoms
Checks
Containment
Recovery
Escalation
Post-incident actions
```

---

# 65. Deployment Runbook

Example:

```text
1. Verify CI
2. Verify staging
3. Verify database compatibility
4. Verify migrations
5. Create release
6. Deploy
7. Monitor health
8. Monitor error rate
9. Monitor checkout
10. Monitor payments
11. Monitor logistics
12. Confirm release
```

---

# 66. Post-Deployment Verification

After production deployment verify:

```text
Web loads
API health passes
Login works
Search works
Product detail works
Cart works
Checkout works
Payment initiation works
Webhook processing works
Order creation works
Supplier dashboard works
Admin dashboard works
Notifications work
```

Use automated smoke tests where possible.

---

# 67. Security Deployment Gates

Production deployment should fail if:

```text
Critical vulnerability found
Secret detected
Required test fails
Migration validation fails
Artifact integrity fails
Security configuration is invalid
```

Exceptions must require explicit approval and documentation.

---

# 68. Infrastructure Repository Rules

Infrastructure changes require:

```text
Pull request
Plan output
Review
Apply
Post-apply verification
```

Do not allow developers to manually change production infrastructure without an auditable emergency procedure.

---

# 69. Naming Convention

Use consistent names.

Examples:

```text
bezzo-prod-api
bezzo-prod-worker
bezzo-prod-postgres
bezzo-prod-redis
bezzo-prod-search
bezzo-prod-assets
bezzo-prod-private-documents
```

Environment should always be identifiable.

---

# 70. Tags/Labels

Resources should carry:

```text
application = bezzo
environment = production
owner = engineering
component = api
managed_by = terraform
```

This improves cost reporting and operational management.

---

# 71. Production Readiness Checklist

## Infrastructure

- [ ] Production network configured
- [ ] CDN configured
- [ ] WAF configured
- [ ] Load balancer configured
- [ ] TLS active
- [ ] API deployed
- [ ] Web deployed
- [ ] Workers deployed
- [ ] Database configured
- [ ] Redis configured
- [ ] Search configured
- [ ] Object storage configured

## Security

- [ ] Secrets manager configured
- [ ] IAM least privilege
- [ ] Database private
- [ ] Admin access protected
- [ ] Security monitoring active
- [ ] Dependency scanning active

## Reliability

- [ ] Backups active
- [ ] Restore tested
- [ ] Health checks active
- [ ] Auto scaling tested
- [ ] Deployment rollback tested
- [ ] Queue retry/dead-letter tested

## Observability

- [ ] Metrics
- [ ] Logs
- [ ] Traces
- [ ] Alerts
- [ ] Dashboards

## Application

- [ ] Smoke tests
- [ ] Load tests
- [ ] Payment tests
- [ ] Logistics tests
- [ ] Supplier isolation tests
- [ ] Buyer privacy tests

---

# 72. Recommended Initial Production Topology

```text
                         ┌─────────────────┐
                         │    Internet     │
                         └────────┬────────┘
                                  │
                           DNS / CDN / WAF
                                  │
                         ┌────────▼────────┐
                         │ Load Balancer   │
                         └───────┬─────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
             ┌─────▼─────┐               ┌─────▼─────┐
             │    Web    │               │    API    │
             └───────────┘               └─────┬─────┘
                                               │
                 ┌─────────────────────────────┼────────────────────┐
                 │                             │                    │
          ┌──────▼──────┐              ┌──────▼──────┐      ┌──────▼──────┐
          │ PostgreSQL  │              │    Redis    │      │   Search    │
          └─────────────┘              └─────────────┘      └─────────────┘
                 │
          ┌──────▼──────────┐
          │ Object Storage  │
          └─────────────────┘

API
 │
 ├── Queue ──► Workers
 │
 ├── Payment Provider
 │
 ├── Porter
 │
 └── Notification Providers
```

---

# 73. Final Infrastructure Direction

Bezzo should start with a **managed, modular, horizontally scalable architecture**.

The correct progression is:

```text
Reliable modular application
        ↓
Measured traffic
        ↓
Horizontal scaling
        ↓
Independent workers
        ↓
Read scaling/search scaling
        ↓
Service extraction where justified
```

The infrastructure should never become more complicated than the business requires.

The core operational priorities are:

**security → reliability → observability → performance → controlled scale → cost discipline.**

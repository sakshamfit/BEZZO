# Bezzo Infrastructure Cost Optimization & Cloud FinOps Engineering Specification v1.0

## 1. Purpose

This document defines the engineering and operational approach for controlling Bezzo cloud infrastructure cost while preserving security, availability, performance, pharmaceutical marketplace correctness, and future scalability.

The objective is not simply to minimize infrastructure spend. The objective is to optimize:

```text
Cost
+
Performance
+
Reliability
+
Security
+
Scalability
```

Any cost optimization that materially weakens a required security, compliance, availability, or data-integrity control is unacceptable.

---

## 2. FinOps Principles

Bezzo infrastructure should follow these principles:

1. Every major resource has an owner.
2. Production and non-production resources are clearly separated.
3. Costs are attributable to environments and workloads.
4. Autoscaling is preferred over permanent over-provisioning.
5. Managed services are preferred where operational savings justify their cost.
6. Reserved/committed capacity is introduced only after stable usage is measured.
7. Storage lifecycle policies are mandatory for long-lived data.
8. Observability must include cost signals.
9. Cost anomalies must generate alerts.
10. Architecture decisions should consider total cost of ownership.

---

## 3. Cost Domains

Primary infrastructure cost domains:

```text
Compute
Database
Redis / Cache
OpenSearch
Object Storage
CDN
Network
Queues / Messaging
Observability
Backups
External SaaS / APIs
CI/CD
Development / Staging
```

External business costs such as payment gateway fees, Porter delivery fees, SMS and transactional messaging should be tracked separately from infrastructure FinOps.

---

## 4. Cost Architecture

```text
                    Bezzo Cloud
                        |
        +---------------+---------------+
        |               |               |
      Compute         Data            Edge
        |               |               |
   API / Workers   PostgreSQL       CDN / WAF
   Web / Jobs      Redis            Load Balancer
                   OpenSearch
                   Storage
        |
        v
    Observability
        |
        v
  Cost Metrics / Billing
        |
        v
   FinOps Dashboard
```

---

## 5. Resource Ownership

Every production resource should have ownership metadata:

```text
application = bezzo
environment = production
domain = payments/search/catalog/etc
owner = team/service
cost_center = ...
managed_by = terraform
criticality = ...
```

Use cloud tags/labels consistently.

Minimum recommended dimensions:

- application
- environment
- service
- team
- owner
- cost center
- region
- data classification
- managed-by

---

## 6. Environment Cost Separation

Environments:

```text
development
staging
production
```

Development and staging should not silently run production-sized infrastructure.

Non-production resources should use:
- smaller instances
- lower replica counts where safe
- scheduled shutdown
- reduced retention
- synthetic/test datasets
- reduced log volume

Never disable required security controls merely to save cost.

---

## 7. Compute Cost Optimization

Compute includes:
- API
- web
- background workers
- scheduled workers
- search/index workers
- image processing
- analytics jobs

Use horizontal autoscaling based on:
- CPU
- memory
- request rate
- queue depth
- latency
- workload-specific signals

Avoid scaling only on CPU for queue-driven workers.

---

## 8. API Autoscaling

API capacity should scale with:
- requests per second
- p95/p99 latency
- CPU
- memory
- active requests

Keep a small baseline capacity for production availability.

Scale out before saturation.

Scale in only after a stabilization window to avoid oscillation.

---

## 9. Worker Autoscaling

Worker scaling should consider queue depth.

Example:

```text
queue_depth rises
      ->
worker replicas increase
      ->
backlog decreases
      ->
workers scale down
```

Separate worker pools may be used for:
- notifications
- search indexing
- media processing
- scheduled orders
- payment reconciliation
- analytics
- reports

This prevents one workload from consuming all worker capacity.

---

## 10. Database Cost Optimization

PostgreSQL is a critical authoritative system.

Optimize using:
- proper indexes
- query optimization
- connection pooling
- read replicas when justified
- archival
- partitioning where justified
- storage lifecycle
- efficient schema design

Do not reduce database resources solely based on average load. Account for peak order/payment workloads.

---

## 11. Connection Pooling

Use connection pooling to prevent excessive database connections.

Recommended architecture:

```text
API instances
     |
     v
Connection Pool
     |
     v
PostgreSQL
```

Connection limits must be calculated against maximum application replicas.

Avoid creating one unbounded connection pool per application instance.

---

## 12. Database Read Scaling

Introduce read replicas only when:
- read load materially affects primary performance
- query workload has been measured
- application read/write separation is clear

Do not add replicas merely because the architecture is designed to scale.

---

## 13. Redis Cost Optimization

Redis is intended for:
- cache
- sessions where applicable
- short-lived state
- rate limiting
- queues where configured

Do not use Redis as the authoritative source for transactional data.

Control cost through:
- TTLs
- eviction policy
- bounded key size
- avoiding unnecessary large objects
- workload-specific cache sizing

---

## 14. OpenSearch Cost Optimization

OpenSearch can become a significant cost center.

Optimize through:
- appropriate shard count
- appropriate replicas
- bounded mappings
- avoiding unnecessary fields
- efficient queries
- controlled aggregations
- query caching
- lifecycle policies
- measured node sizing

Avoid excessive shards and oversized clusters.

---

## 15. Search Capacity Planning

Measure:

```text
documents
index size
query RPS
indexing RPS
p95 latency
heap usage
disk usage
replica requirements
```

Scale OpenSearch from actual workload rather than theoretical maximums.

Reindexing capacity must also be considered.

---

## 16. Object Storage Cost

Object storage categories:

```text
Original product images
Processed derivatives
Private supplier documents
Support/dispute attachments
Operational files
Exports/reports
Backups
```

Apply different retention policies.

For example:
- product originals: long retention
- derivatives: regenerable
- temporary uploads: short retention
- failed/quarantine files: short controlled retention
- compliance documents: policy-driven retention

Never apply one global deletion policy to all media.

---

## 17. Storage Lifecycle

Use lifecycle transitions where appropriate:

```text
Hot
 ->
Infrequent Access
 ->
Archive
 ->
Deletion
```

The exact transition depends on:
- retrieval frequency
- legal retention
- business requirements
- recovery objectives

Regulated records must follow compliance retention policies first.

---

## 18. CDN Cost Optimization

CDN reduces origin load and improves user performance.

Optimize:
- cacheable immutable image URLs
- long TTLs for versioned product images
- compression
- responsive image variants
- correct cache keys
- avoiding unnecessary origin requests

Product images should use immutable/versioned URLs to reduce purge operations.

---

## 19. Network Cost

Monitor:
- cross-zone traffic
- cross-region traffic
- internet egress
- object-storage egress
- CDN origin traffic
- database traffic
- OpenSearch traffic

Prefer same-region placement for tightly coupled production services where reliability requirements permit.

Avoid unnecessary cross-region chatter.

---

## 20. Architecture Placement

Recommended initial placement:

```text
Application
Database
Redis
OpenSearch
Queues
Object Storage
```

should be located in a region strategy designed around:
- primary customer geography
- provider availability
- latency
- compliance
- disaster recovery

The final cloud region must be decided as part of deployment planning.

---

## 21. Availability vs Cost

Critical systems should retain appropriate redundancy.

Do not remove:
- production database backups
- payment reliability controls
- required replicas
- security monitoring
- disaster recovery mechanisms
- required WAF/CDN protections

Cost reduction should target waste before redundancy.

---

## 22. Autoscaling Guardrails

Every autoscaling policy should define:

```text
minimum replicas
maximum replicas
scale-out threshold
scale-in threshold
cooldown/stabilization
```

Maximum replicas prevent runaway cost during abnormal traffic.

Alerts should trigger when a service remains near maximum capacity.

---

## 23. Scheduled Non-Production Shutdown

Development environments can use schedules:

```text
working hours -> running
off hours      -> reduced/stopped
```

Do not automatically shut down shared staging if it is needed for:
- active testing
- release validation
- scheduled jobs
- integration testing

Use explicit environment ownership.

---

## 24. CI/CD Cost Optimization

CI/CD cost can be reduced through:
- dependency caching
- Docker layer caching
- parallelism only where beneficial
- affected-project builds
- test splitting
- artifact retention policies
- cleanup of old environments

Never skip required security or regression tests solely to reduce CI cost.

---

## 25. Container Optimization

Use:
- small production images
- multi-stage builds
- dependency pruning
- non-root execution
- minimal runtime packages

This reduces:
- image size
- transfer cost
- startup time
- attack surface

---

## 26. Logging Cost

Logs can become a major hidden cost.

Classify:

```text
ERROR
WARN
INFO
DEBUG
AUDIT
SECURITY
```

Production should not emit uncontrolled debug logs.

Use:
- structured logging
- sampling for high-volume traces
- retention tiers
- aggregation
- redaction

Never reduce mandatory audit/security logging merely to save cost.

---

## 27. Metrics Cost

Use metric cardinality controls.

Avoid labels such as:
- arbitrary user IDs
- request IDs
- product IDs

on high-frequency metric series unless explicitly justified.

Prefer bounded dimensions:

```text
service
environment
endpoint_group
status_class
region
```

---

## 28. Tracing Cost

Distributed tracing should use sampling.

Recommended concept:

```text
normal traffic -> sampled
errors -> retained
slow requests -> retained
critical flows -> higher sampling
```

Critical flows may include:
- payment
- checkout
- order placement
- logistics booking

Sampling configuration must remain observable.

---

## 29. Backup Cost

Backups should be tiered.

Maintain:
- frequent database backups
- point-in-time recovery where required
- periodic full snapshots
- object-storage protection
- configuration/IaC versioning

Delete expired backups according to documented retention.

Do not reduce backup retention below business continuity requirements merely to lower cost.

---

## 30. Disaster Recovery Cost

DR should be tiered according to criticality.

Example:

```text
Tier 0: payments/orders/core database
Tier 1: marketplace/search
Tier 2: analytics/reporting
```

Not every subsystem requires identical RTO/RPO.

Search can generally be rebuilt from authoritative sources, reducing the need for expensive primary-data duplication.

---

## 31. External Service Cost Tracking

Track external infrastructure/API costs separately:

- payment gateway
- Porter
- SMS
- email
- push notification provider
- identity provider
- maps/geocoding if used
- analytics tools
- monitoring/SaaS

Use service-level cost attribution.

---

## 32. Unit Economics

Introduce infrastructure unit-cost metrics such as:

```text
cloud cost / active buyer
cloud cost / supplier
cloud cost / order
cloud cost / 1,000 API requests
cloud cost / 1,000 searches
cloud cost / 1,000 images delivered
cloud cost / GB stored
```

These metrics should be tracked over time rather than treated as one-time measurements.

---

## 33. Cost per Order

A useful operational metric:

```text
Infrastructure Cost per Order
=
eligible infrastructure spend
/
completed orders
```

Exclude or separately identify one-time development and migration expenses.

Interpret alongside order volume because fixed costs distort small-volume periods.

---

## 34. Cost Allocation

Allocate shared costs using consistent rules.

Examples:

```text
OpenSearch -> Search
PostgreSQL -> Shared Core
Redis -> Shared Platform
CDN -> Media / Marketplace
Observability -> Platform
```

Shared infrastructure may be allocated proportionally using measured usage.

---

## 35. Budgeting

Each environment should have:

```text
monthly budget
forecast
actual spend
variance
```

Budgets should have alert thresholds such as:
- 50%
- 75%
- 90%
- 100%

Thresholds are operational warnings, not automatic shutdown triggers.

---

## 36. Cost Anomaly Detection

Alert on unusual changes such as:
- sudden compute increase
- unexpected OpenSearch growth
- storage growth
- egress spike
- logging spike
- CI/CD spike
- database scaling
- runaway worker count

Anomaly alerts should include:
- service
- environment
- time window
- expected baseline
- observed cost
- likely resource category

---

## 37. FinOps Dashboard

Dashboard sections:

### Executive
- total monthly cost
- forecast
- budget variance
- cost/order

### Platform
- compute
- database
- cache
- search
- storage
- CDN
- network

### Engineering
- API cost
- worker cost
- CI/CD
- observability

### Environment
- production
- staging
- development

---

## 38. Rightsizing

Rightsizing should be evidence-based.

Review:
- CPU utilization
- memory utilization
- network
- disk I/O
- request rate
- queue depth
- latency
- scaling behavior

Do not downsize critical systems based on short low-traffic windows.

---

## 39. Reserved/Committed Capacity

Consider reserved or committed-use discounts only after:
- workload stabilizes
- baseline capacity is known
- business growth assumptions are documented
- service architecture is mature

Do not lock into long commitments during uncertain early-stage usage.

---

## 40. Spot/Preemptible Capacity

Potentially suitable for:
- non-critical analytics
- rebuildable indexing jobs
- batch processing
- development workloads

Avoid for:
- primary transactional database
- payment processing
- critical order API
- stateful production components without suitable redundancy

---

## 41. Queue-Driven Cost Control

Background jobs should be prioritized.

Example:

```text
Priority 1
payment reconciliation
order-critical workflows

Priority 2
search indexing
notifications

Priority 3
analytics
reports
exports
```

The exact priorities are configured by workload criticality.

---

## 42. Image Processing Cost

Image processing can become expensive at scale.

Optimize through:
- asynchronous processing
- bounded dimensions
- avoiding unnecessary duplicate derivatives
- deduplication
- batching where practical
- reprocessing only changed versions

Original images should not be repeatedly processed unless required.

---

## 43. Search Reindex Cost

Full search reindexing should:
- run through controlled workers
- have bounded concurrency
- avoid impacting query capacity
- run during suitable windows where possible
- use temporary/versioned indexes
- delete obsolete indexes only after validation

Do not run unlimited parallel indexing.

---

## 44. Data Retention

Retention policies should distinguish:

```text
Transactional data
Audit data
Analytics events
Logs
Media
Backups
Temporary files
```

Deletion must follow:
- legal requirements
- compliance requirements
- business retention
- privacy requirements

Cost savings never justify unauthorized deletion.

---

## 45. FinOps Governance

Monthly review:

```text
Actual vs budget
Top cost increases
Top cost reductions
Unused resources
Rightsizing opportunities
Storage growth
Network anomalies
Service-level unit economics
```

Quarterly review:
- architecture cost efficiency
- reserved capacity
- region strategy
- managed service economics
- DR cost
- observability cost

---

## 46. Waste Detection

Identify:
- unattached disks
- unused load balancers
- idle IP resources
- old snapshots
- abandoned environments
- unused databases
- stale search indexes
- old container images
- forgotten test resources
- excessive log retention

Deletion must be controlled and ownership-confirmed.

---

## 47. Infrastructure as Code

All major cloud resources should be managed through Terraform or the selected IaC standard.

Benefits:
- repeatability
- cost configuration visibility
- environment consistency
- reviewable changes
- easier cleanup
- disaster recovery

Manual production infrastructure changes should be minimized.

---

## 48. Cost-Aware Architecture Reviews

Every major architecture proposal should include:

```text
Expected workload
Expected resource impact
Expected monthly cost range
Scaling behavior
Failure impact
Operational complexity
Alternative options
```

Exact cost estimates should be generated from current cloud pricing during implementation because provider pricing changes over time.

---

## 49. Security and FinOps

Cost controls must not weaken:
- encryption
- identity controls
- secrets management
- audit logging
- backups
- network isolation
- WAF/security monitoring
- vulnerability scanning

Security requirements remain mandatory.

---

## 50. Performance and FinOps

Optimize cost without violating agreed SLOs.

Example decision:

```text
Lower instance cost
       |
       v
p95 latency increases significantly
       |
       v
Reject optimization
```

The goal is cost efficiency within service-level objectives.

---

## 51. Cost Optimization Workflow

```text
Measure
  |
  v
Attribute
  |
  v
Find Waste
  |
  v
Model Impact
  |
  v
Change
  |
  v
Measure Again
  |
  v
Standardize
```

Every significant optimization should have before/after measurements.

---

## 52. FinOps Change Record

For meaningful cost changes record:

```text
change_id
service
environment
owner
reason
baseline_cost
expected_cost
actual_cost
performance_impact
reliability_impact
security_impact
date
rollback_plan
```

---

## 53. Launch Cost Readiness

Before production launch:

- resource tagging works
- budgets exist
- alerts exist
- non-production shutdown policy exists
- storage lifecycle exists
- logging retention is configured
- backup retention is configured
- autoscaling is configured
- max capacity is configured
- cost dashboards exist
- unit economics are defined
- external-service costs are tracked
- unused-resource cleanup process exists

---

## 54. Definition of Done

FinOps implementation is complete when:

- all major resources have owners
- environments are cost-attributable
- budgets and alerts are active
- compute autoscaling is configured
- worker autoscaling uses queue signals where appropriate
- database resources are monitored
- Redis usage is bounded
- OpenSearch is rightsized
- object-storage lifecycle policies exist
- CDN caching is optimized
- network costs are monitored
- observability retention is controlled
- backups follow documented retention
- CI/CD cleanup exists
- external API costs are tracked
- cost/order is measurable
- cost anomalies alert operations
- unused-resource detection exists
- IaC controls production infrastructure
- cost changes are reviewable
- security and SLO requirements remain intact

---

## 55. Final Architecture

```text
                    BEZZO PLATFORM
                         |
          +--------------+--------------+
          |              |              |
       Compute          Data           Edge
          |              |              |
       API/Workers   PostgreSQL      CDN/WAF
       Web/Jobs      Redis           LB
                     OpenSearch
                     Storage
          |              |              |
          +--------------+--------------+
                         |
                   Observability
                         |
                         v
                  Cost Attribution
                         |
                         v
                 FinOps Dashboard
                         |
             +-----------+-----------+
             |                       |
         Budgeting              Anomaly Alerts
             |                       |
             +-----------+-----------+
                         |
                         v
                Optimization Cycle
```

**Core rule: Bezzo optimizes total cost of ownership, not raw infrastructure spend.**

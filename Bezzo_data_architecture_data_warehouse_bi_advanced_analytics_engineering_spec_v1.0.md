# Bezzo Data Architecture, Data Warehouse, BI & Advanced Analytics Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Status:** Draft for Implementation  
**Version:** 1.0  
**Primary Scope:** Operational data architecture, analytical data platform, data warehouse, BI, product analytics, advanced analytics, governance, and production implementation

---

## 1. Purpose

This specification defines the data architecture required for Bezzo to operate a scalable B2B pharmaceutical marketplace while separating transactional workloads from analytical workloads.

The design covers:

- operational data sources
- canonical domain data
- event collection
- analytical ingestion
- lake/object-storage layers
- data warehouse
- dimensional modeling
- BI and reporting
- product analytics
- marketplace analytics
- supplier analytics
- fulfillment and logistics analytics
- payment and finance analytics
- inventory and catalog analytics
- customer-support analytics
- compliance analytics
- advanced analytics and ML readiness
- data quality
- lineage
- retention
- access control
- analytical performance
- data observability
- implementation standards

This document complements the Bezzo operational database, analytics/reporting, privacy, audit, compliance, event-driven, catalog, inventory, fulfillment, payment, and observability specifications.

---

## 2. Design Principles

### 2.1 Operational and analytical workloads are separated

PostgreSQL remains the system of record for transactional workflows.

Analytical workloads must not depend on unrestricted queries against production transactional tables.

The target architecture is:

```text
Operational Systems
      |
      +--> Domain Events
      |
      +--> CDC / Incremental Extraction
      |
      v
Object Storage / Raw Data Layer
      |
      v
Transformation / Quality Layer
      |
      v
Analytical Warehouse
      |
      +--> BI / Reporting
      +--> Product Analytics
      +--> Supplier Analytics
      +--> Finance Analytics
      +--> Operations Analytics
      +--> Compliance Analytics
      +--> Advanced Analytics / ML
```

### 2.2 Source-of-truth ownership is explicit

Every important dataset must have a defined owner.

Examples:

| Dataset | System of Record |
|---|---|
| Users | Identity/User domain |
| Supplier profile | Supplier domain |
| Buyer organization | Buyer/Account domain |
| Canonical product | Catalog domain |
| Supplier listing | Catalog/Supplier domain |
| Inventory | Inventory domain |
| Orders | Order domain |
| Fulfillments | Fulfillment domain |
| Payments | Payment domain |
| Settlements | Settlement domain |
| Logistics status | Logistics domain |
| Support cases | Support domain |
| Compliance records | Compliance domain |
| Audit events | Audit/event infrastructure |

The warehouse is an analytical representation. It must not silently become the operational source of truth.

### 2.3 Immutable raw data

Raw events and extracted records should be retained in an append-oriented storage layer before transformation.

Raw data should be treated as immutable except for controlled retention/deletion workflows.

### 2.4 Reproducibility

Every important analytical metric should be reproducible from:

- source dataset
- transformation version
- event/data timestamp
- processing timestamp
- applicable business-rule version

### 2.5 Time is a first-class dimension

Bezzo analytics must distinguish:

- event time
- business-effective time
- ingestion time
- processing time
- reporting date
- settlement date
- delivery date
- expiry date
- licence expiry date

This is particularly important for inventory, pharmaceutical compliance, orders, payments, refunds, recalls, and supplier performance.

---

# 3. Scope of the Data Platform

The data platform serves four broad purposes.

## 3.1 Operational analytics

Used by operations teams for:

- order monitoring
- fulfillment performance
- inventory health
- supplier operations
- delivery performance
- payment exceptions
- support queues
- compliance exceptions

## 3.2 Business intelligence

Used for:

- GMV
- net sales
- order volume
- active buyers
- active suppliers
- supplier performance
- category performance
- geographic performance
- margins and commissions
- payment performance
- delivery performance

## 3.3 Product analytics

Used for:

- search behavior
- product discovery
- catalog interaction
- cart behavior
- checkout funnel
- conversion
- reorder behavior
- buyer retention
- supplier portal usage

## 3.4 Advanced analytics

Used for:

- demand forecasting
- stock-out prediction
- supplier reliability modeling
- delivery ETA modeling
- fraud/risk signals
- recommendation systems
- assortment optimization
- price intelligence
- customer segmentation

Advanced models must respect the privacy, compliance, and pharmaceutical governance requirements defined elsewhere in the Bezzo documentation set.

---

# 4. High-Level Data Architecture

## 4.1 Logical architecture

```text
                     +----------------------+
                     | Web / Mobile Clients |
                     +----------+-----------+
                                |
                                v
                     +----------------------+
                     | Bezzo APIs / Backend  |
                     +----------+-----------+
                                |
              +-----------------+------------------+
              |                 |                  |
              v                 v                  v
        PostgreSQL         Redis / Queues      External Systems
        Operational DB                          Payment / Porter /
                                                ERP / POS / SMS etc.
              |
              +--------------------------+
              |                          |
              v                          v
        Domain Events                CDC / Extract
              |                          |
              +------------+-------------+
                           |
                           v
                 Raw Data / Object Storage
                           |
                           v
                 ETL / ELT Transformation
                           |
                  +--------+--------+
                  |                 |
                  v                 v
             Staging Layer     Data Quality
                  |                 |
                  +--------+--------+
                           |
                           v
                    Data Warehouse
                           |
       +-------------------+--------------------+
       |                   |                    |
       v                   v                    v
      BI             Product Analytics       Data Science
       |                   |                    |
       +-------------------+--------------------+
                           |
                           v
                    Decision Support
```

---

# 5. Data Layers

The platform should use explicit logical layers.

## 5.1 Source layer

Contains data from:

- PostgreSQL
- application event streams
- payment providers
- Porter/logistics integrations
- ERP/POS integrations
- supplier imports
- catalog imports
- support systems
- notification providers
- compliance workflows

## 5.2 Raw layer

Raw records are stored with minimal transformation.

Typical metadata:

```text
source_system
source_table
source_record_id
event_id
event_type
event_timestamp
ingestion_timestamp
schema_version
payload
partition_date
```

## 5.3 Staging layer

Staging normalizes source formats.

Responsibilities:

- type normalization
- field mapping
- deduplication
- basic validation
- timestamp normalization
- source-key preservation

## 5.4 Core warehouse layer

Contains governed business entities and dimensional/fact models.

This layer is where standardized business definitions are enforced.

## 5.5 Semantic/BI layer

Contains reusable business metrics and dimensions.

Examples:

- GMV
- net merchandise value
- completed orders
- fulfillment success rate
- cancellation rate
- supplier fill rate
- on-time delivery rate
- buyer activation rate

## 5.6 Data science layer

Contains feature datasets and model outputs.

Examples:

```text
buyer_features
supplier_features
product_demand_features
inventory_forecast_features
delivery_features
risk_features
recommendation_features
```

---

# 6. Data Warehouse Strategy

## 6.1 Warehouse responsibilities

The warehouse should support:

- historical reporting
- cross-domain joins
- time-series analysis
- business KPI computation
- cohort analysis
- supplier comparisons
- geographic analysis
- financial reconciliation
- operational trend analysis

## 6.2 Warehouse must not process transactional writes

Applications should never directly depend on warehouse writes for core order placement, payment authorization, inventory reservation, or fulfillment state transitions.

## 6.3 Analytical freshness tiers

Not every metric needs real-time processing.

Recommended tiers:

| Tier | Target freshness | Example |
|---|---:|---|
| Operational | seconds/minutes | active order monitoring |
| Near-real-time | <15 minutes | marketplace dashboards |
| Hourly | <1 hour | operational trends |
| Daily | <24 hours | finance reporting |
| Batch | scheduled | advanced models |

Targets are engineering objectives and may be tuned after production measurement.

---

# 7. Dimensional Modeling

The warehouse should use a dimensional model for BI workloads.

## 7.1 Core dimensions

Recommended dimensions include:

```text
dim_date
dim_time
dim_buyer
dim_supplier
dim_user
dim_product
dim_product_category
dim_manufacturer
dim_location
dim_warehouse
dim_delivery_slot
dim_payment_method
dim_payment_gateway
dim_order_status
dim_fulfillment_status
dim_logistics_provider
dim_device
dim_platform
dim_campaign
dim_coupon
dim_compliance_status
```

## 7.2 Core facts

Recommended fact tables:

```text
fact_orders
fact_order_items
fact_fulfillments
fact_inventory_snapshots
fact_inventory_movements
fact_payments
fact_refunds
fact_settlements
fact_commissions
fact_deliveries
fact_searches
fact_product_views
fact_cart_events
fact_checkout_events
fact_support_cases
fact_notifications
fact_supplier_activity
fact_buyer_activity
fact_compliance_events
fact_product_price_history
```

---

# 8. Order Analytics Model

## 8.1 Order grain

`fact_orders` should generally have one row per customer order.

Candidate measures:

```text
order_count
gross_order_value
discount_amount
tax_amount
delivery_fee
payment_fee
refund_amount
net_order_value
supplier_cost
commission_amount
```

## 8.2 Order-item grain

`fact_order_items` should have one row per product line within an order.

Useful attributes:

```text
order_id
buyer_id
supplier_id
product_id
batch_id
quantity
unit_price
discount
tax
line_value
fulfillment_status
```

## 8.3 Supplier fulfillment grain

Because one buyer order can be split across suppliers, analytics must distinguish:

```text
customer_order
supplier_fulfillment
fulfillment_item
delivery
```

A dashboard must never assume:

```text
1 order = 1 supplier
```

---

# 9. Inventory Analytics

Inventory analytics must support supplier-level and batch-level analysis.

## 9.1 Key metrics

- stock on hand
- available stock
- reserved stock
- damaged stock
- quarantined stock
- expired stock
- near-expiry stock
- stock-out rate
- inventory turnover
- sell-through
- supplier fill rate
- lost sales due to stock-out
- inventory aging

## 9.2 Batch analytics

Pharmaceutical inventory requires batch-aware analysis.

Important fields:

```text
batch_id
product_id
supplier_id
manufacturing_date
expiry_date
quantity
reserved_quantity
available_quantity
quarantine_status
recall_status
```

## 9.3 FEFO analytics

Analytics should identify whether fulfillment behavior is consistent with the configured FEFO policy.

Metrics may include:

```text
fefo_compliance_rate
near_expiry_dispatch_count
expired_inventory_dispatch_count
blocked_batch_attempts
```

The analytics layer must not bypass operational enforcement.

---

# 10. Supplier Analytics

Supplier dashboards should support private supplier-scoped analytics.

## 10.1 Supplier KPIs

Examples:

- listed products
- active products
- stock availability
- order count
- fulfilled quantity
- fill rate
- cancellation rate
- acceptance time
- dispatch time
- delivery performance
- return/refund rate
- customer issue rate
- revenue
- commissions
- settlement amount
- pending payout
- compliance status

## 10.2 Tenant isolation

A supplier must only see:

- its own operational records
- its own analytics
- permitted marketplace benchmarks where explicitly designed

Supplier analytics APIs must enforce supplier identity from authenticated context rather than accepting arbitrary supplier IDs from clients.

---

# 11. Buyer Analytics

Buyer analytics should support:

- active buyers
- new buyers
- repeat buyers
- reorder rate
- purchase frequency
- average order value
- category mix
- basket size
- search behavior
- checkout conversion
- fulfillment experience
- support interaction

Buyer-level analytics must follow the privacy and retention requirements defined in the Bezzo data privacy specification.

---

# 12. Search and Discovery Analytics

The search system should emit events for:

```text
search_started
search_submitted
search_results_viewed
search_result_clicked
product_viewed
filter_applied
sort_changed
no_results
add_to_cart
```

Recommended search metrics:

- searches per active buyer
- zero-result rate
- search-to-product-view rate
- search-to-cart rate
- search-to-order rate
- query reformulation rate
- top queries
- zero-result queries
- filter usage
- product ranking performance

Search analytics should distinguish:

```text
query
normalized_query
result_count
clicked_position
product_id
supplier_listing_id
session_id
buyer_id
timestamp
```

---

# 13. Product Analytics

## 13.1 Event model

The product analytics event envelope should contain:

```json
{
  "event_id": "uuid",
  "event_name": "product_viewed",
  "event_version": 1,
  "occurred_at": "timestamp",
  "anonymous_id": "id",
  "user_id": "id",
  "buyer_id": "id",
  "platform": "web",
  "app_version": "1.0.0",
  "session_id": "id",
  "properties": {}
}
```

## 13.2 Event naming

Use stable past-tense or clearly defined domain-event naming.

Examples:

```text
buyer_registered
supplier_registered
product_viewed
cart_item_added
checkout_started
order_placed
payment_completed
order_cancelled
refund_completed
delivery_completed
```

## 13.3 Event versioning

Events must be versioned.

Breaking changes require a new event version or migration strategy.

Historical events must remain interpretable.

---

# 14. Funnel Analytics

Core marketplace funnel:

```text
App/Web Open
    |
    v
Authenticated Buyer
    |
    v
Search/Browse
    |
    v
Product View
    |
    v
Add to Cart
    |
    v
Checkout
    |
    v
Payment Attempt
    |
    v
Order Created
    |
    v
Fulfillment
    |
    v
Delivered
```

Recommended funnel metrics:

```text
browse_to_product_view
product_view_to_cart
cart_to_checkout
checkout_to_payment
payment_to_order
order_to_fulfillment
fulfillment_to_delivery
```

Failures must be segmented by:

- platform
- app version
- buyer cohort
- geography
- supplier
- payment method
- product category
- delivery mode

---

# 15. Finance and Payment Analytics

Finance analytics must distinguish operational payment state from accounting/reporting state.

## 15.1 Payment metrics

- payment attempts
- successful payments
- failed payments
- authorization rate
- gateway failure rate
- refund amount
- refund rate
- COD collection
- settlement amounts
- payment gateway fees

## 15.2 Marketplace financial metrics

Recommended metric definitions:

```text
GMV
Gross Merchandise Value

Discounted GMV
GMV after applicable discounts

Net Merchandise Value
Applicable merchandise value after defined adjustments

Marketplace Commission
Commission recognized according to settlement rules

Supplier Payable
Amount owed to supplier

Customer Refund
Amount returned to buyer

Net Marketplace Revenue
Revenue recognized according to accounting policy
```

Financial definitions must be version-controlled and aligned with finance/accounting policy.

---

# 16. Logistics Analytics

Logistics analytics should support:

- instant delivery performance
- scheduled delivery performance
- slot utilization
- dispatch latency
- pickup latency
- delivery latency
- cancellation
- failed delivery
- distance
- delivery fee
- provider performance

Important dimensions:

```text
logistics_provider
delivery_mode
delivery_slot
city
zone
supplier
buyer
order
fulfillment
```

For scheduled delivery:

```text
scheduled_orders
orders_ready_before_cutoff
route_assigned
route_dispatched
route_completed
late_deliveries
```

This enables route and batch optimization later.

---

# 17. Support and Dispute Analytics

Support analytics should measure:

- ticket volume
- ticket category
- first response time
- resolution time
- reopen rate
- escalation rate
- refund rate
- supplier-related disputes
- delivery disputes
- payment disputes
- product/batch disputes
- compliance escalations

Pharmaceutical incidents should support specialized classification such as:

```text
expiry_issue
batch_issue
recall_issue
storage_issue
product_mismatch
license/compliance_issue
```

---

# 18. Compliance Analytics

Compliance analytics should never expose restricted documents unnecessarily.

Useful metrics:

- suppliers pending verification
- suppliers verified
- suppliers rejected
- licences expiring
- expired licences
- buyers requiring review
- restricted product attempts
- blocked batches
- recalled batches
- compliance escalations
- audit events
- unresolved compliance exceptions

Sensitive document contents should not be copied into general BI tables.

Prefer:

```text
compliance_record_id
status
jurisdiction
document_type
issued_at
expires_at
verification_state
verified_at
```

with controlled access to underlying documents.

---

# 19. Geographic Analytics

Geographic reporting may use:

```text
country
state
city
postal_code
zone
delivery_area
supplier_area
buyer_area
```

Exact address-level data should be minimized in analytical datasets.

Use aggregated geography wherever possible.

---

# 20. Data Warehouse Slowly Changing Dimensions

Dimensions with changing business attributes should use controlled history.

Examples:

- supplier verification status
- supplier category
- buyer organization attributes
- product category assignment
- supplier listing status
- geographic assignment

For historical reporting, use Type 2 slowly changing dimensions where appropriate.

Example:

```text
supplier_id
verification_status
valid_from
valid_to
is_current
```

This prevents historical reports from being rewritten by today's supplier state.

---

# 21. Metric Governance

Every executive or operational KPI must have a documented definition.

Example:

### Completed Orders

```text
Definition:
Customer orders that reach the configured completed/delivered terminal state.

Exclusions:
Cancelled orders before completion.

Owner:
Operations / Product Analytics.

Refresh:
Near-real-time or hourly depending on dashboard.

Source:
Order and fulfillment facts.
```

Metrics must not be independently reimplemented in every dashboard.

---

# 22. Semantic Layer

A semantic layer should expose reusable measures and dimensions.

Example:

```text
measure.completed_orders
measure.gmv
measure.net_sales
measure.average_order_value
measure.supplier_fill_rate
measure.delivery_on_time_rate
measure.payment_success_rate
```

Dimensions:

```text
buyer
supplier
product
category
location
date
platform
delivery_mode
payment_method
```

Business logic should live centrally wherever practical.

---

# 23. Data Pipelines

## 23.1 Ingestion patterns

Supported patterns:

1. event-driven ingestion
2. CDC
3. incremental API extraction
4. scheduled batch import
5. file-based ingestion
6. manual controlled upload

## 23.2 Pipeline properties

Every production pipeline should support:

- retries
- idempotency
- dead-letter handling
- schema validation
- monitoring
- lineage
- failure alerting
- backfill
- replay where safe

## 23.3 Incremental loading

Prefer watermark-based or change-data-based ingestion.

Typical watermark:

```text
updated_at > last_successful_watermark
```

Where available, use durable source change identifiers rather than timestamps alone.

---

# 24. Data Quality Framework

Each important dataset should have automated checks.

## 24.1 Completeness

Examples:

```text
order_id IS NOT NULL
product_id IS NOT NULL
supplier_id IS NOT NULL
```

## 24.2 Uniqueness

Examples:

```text
event_id unique
order_id unique at order grain
payment_transaction_id unique
```

## 24.3 Referential integrity

Examples:

```text
order_items.order_id exists
order_items.product_id exists
fulfillments.order_id exists
payments.order_id exists
```

## 24.4 Validity

Examples:

```text
quantity > 0
amount >= 0
expiry_date >= manufacturing_date
```

## 24.5 Timeliness

Measure:

```text
source_event_time -> warehouse_available_time
```

and alert when freshness exceeds target.

---

# 25. Data Contracts

Each major event and dataset should have a contract.

A contract should specify:

```text
dataset/event name
owner
schema version
field definitions
required fields
nullable fields
allowed values
PII classification
retention classification
source system
delivery SLA
quality rules
downstream consumers
```

Breaking contract changes require review.

---

# 26. Data Lineage

Lineage should allow an analyst to answer:

```text
Dashboard KPI
   -> semantic metric
      -> warehouse model
         -> transformation
            -> source table/event
               -> operational domain
```

Lineage metadata should include:

- source
- destination
- transformation
- owner
- version
- last successful run

---

# 27. BI Architecture

BI should be separated into:

### Executive dashboards

- GMV
- net sales
- order volume
- active buyers
- active suppliers
- marketplace growth
- fulfillment performance

### Operations dashboards

- live orders
- supplier exceptions
- stock-outs
- delayed deliveries
- payment failures
- support backlog

### Supplier dashboards

- supplier orders
- revenue
- fill rate
- stock
- returns
- settlements
- product performance

### Finance dashboards

- payments
- refunds
- commissions
- settlements
- gateway reconciliation
- COD reconciliation

### Compliance dashboards

- supplier verification
- licence expiry
- restricted-product events
- recalls
- compliance exceptions

---

# 28. Advanced Analytics

Advanced analytics must initially be treated as decision-support tooling.

Potential models:

## 28.1 Demand forecasting

Forecast:

```text
product x supplier x geography x time
```

Features may include:

- historical sales
- seasonality
- day of week
- product category
- stock availability
- price
- promotions
- buyer demand
- lead time

## 28.2 Stock-out prediction

Predict probability of stock-out within a defined future horizon.

## 28.3 Reorder recommendation

Potential recommendation:

```text
recommended_quantity
recommended_supplier
recommended_time
```

Recommendations must respect supplier eligibility, product restrictions, stock, expiry, and configured commercial rules.

## 28.4 Delivery prediction

Estimate delivery duration using:

- historical route time
- location
- slot
- time of day
- provider
- distance
- operational conditions

## 28.5 Fraud/risk analytics

Potential signals:

- abnormal order velocity
- unusual payment patterns
- account/device relationships
- refund anomalies
- supplier behavior anomalies
- repeated failed deliveries

Risk models must not automatically make high-impact decisions without appropriate review and controls.

---

# 29. Feature Store / ML Data Preparation

A formal feature store is not mandatory at initial launch.

Start with versioned feature tables.

Example:

```text
buyer_features_daily
supplier_features_daily
product_demand_features_daily
inventory_features_hourly
delivery_features_daily
risk_features_hourly
```

Each feature should document:

- definition
- source
- calculation window
- timestamp semantics
- leakage risk
- owner
- version

---

# 30. Machine Learning Data Leakage Controls

Training datasets must only use information available at prediction time.

Example:

For predicting tomorrow's stock-out:

Allowed:

```text
inventory before prediction timestamp
historical sales
historical supplier behavior
```

Not allowed:

```text
future sales
future stock adjustments
future fulfillment results
```

Training pipelines must explicitly define feature cutoff timestamps.

---

# 31. Recommendation Analytics

Recommendations may use:

- buyer purchase history
- product/category affinity
- frequently reordered products
- similar products
- supplier availability
- price
- delivery availability

The system must never recommend products solely because they generate more marketplace revenue if that conflicts with configured eligibility, availability, compliance, or buyer-specific rules.

---

# 32. Experimentation

Bezzo may use controlled experiments for product and UX changes.

Experiment model:

```text
experiment_id
variant
subject_id
assignment_timestamp
exposure_event
conversion_event
```

Important rules:

- assignment must be deterministic where possible
- experiment exposure must be logged
- analysis population must be defined
- primary metric must be predefined
- guardrail metrics must be monitored
- experiments must not bypass pharmaceutical/compliance requirements

---

# 33. Data Privacy in Analytics

Analytics datasets should follow data minimization.

Prefer:

```text
buyer_id
region
business_segment
cohort
```

over:

```text
full_name
full_address
phone_number
```

unless the latter is genuinely required.

Sensitive fields must be classified and access-controlled.

Where analytics does not require identity, use:

- anonymized identifiers
- pseudonymous identifiers
- aggregated data

---

# 34. Access Control

Recommended analytical roles:

```text
BI_ADMIN
DATA_ENGINEER
DATA_ANALYST
DATA_SCIENTIST
FINANCE_ANALYST
OPERATIONS_ANALYST
COMPLIANCE_ANALYST
SUPPLIER_ANALYST
EXECUTIVE_VIEWER
```

Access should be least privilege.

Supplier analytics must enforce tenant scope.

Compliance and sensitive datasets require stricter controls.

---

# 35. Warehouse Security

Controls should include:

- private network access
- encrypted connections
- encryption at rest
- role-based access
- secrets management
- audit logging
- query monitoring
- export controls
- restricted production access

Direct production database access for analysts should be minimized.

---

# 36. Analytical Data Retention

Retention must follow the Bezzo data lifecycle and compliance requirements.

Retention classes should be defined per dataset.

Example categories:

```text
short-lived operational telemetry
product analytics events
financial records
audit records
compliance records
aggregated BI datasets
model training data
```

Deletion or anonymization workflows must preserve required legal/accounting/audit records where retention is mandatory.

---

# 37. Data Backfills

Every important pipeline must support controlled backfill.

Backfill requirements:

- explicit date range
- dry-run mode
- idempotent writes
- isolated compute where possible
- monitoring
- reconciliation
- audit record
- rollback or correction strategy

Example:

```text
backfill orders from 2026-01-01 to 2026-01-31
```

must not duplicate existing facts.

---

# 38. Reconciliation

Critical datasets require reconciliation.

Examples:

### Orders

```text
operational order count
vs
warehouse order count
```

### Payments

```text
payment gateway transactions
vs
Bezzo payment records
vs
warehouse payment facts
```

### Inventory

```text
operational available inventory
vs
analytical inventory snapshot
```

### Settlements

```text
supplier payable
vs
settlement ledger
vs
payout provider result
```

Discrepancies should create monitored exceptions.

---

# 39. Data Observability

Monitor:

- freshness
- row volume
- null rate
- duplicate rate
- schema changes
- referential integrity
- pipeline duration
- failure rate
- warehouse query performance
- dashboard freshness

Example alert:

```text
fact_orders freshness > 60 minutes
```

should generate an operational alert according to the dashboard SLA.

---

# 40. Analytical Performance

Warehouse performance should be optimized through:

- partitioning
- clustering/sorting where supported
- incremental models
- materialized aggregates
- precomputed daily metrics
- selective joins
- column pruning
- appropriate indexing where supported
- query result caching

Do not optimize prematurely without query evidence.

---

# 41. Event Volume Management

High-volume events such as:

```text
product_viewed
search_submitted
screen_viewed
```

may generate significantly more data than:

```text
order_created
payment_completed
refund_completed
```

The event architecture should therefore support:

- sampling where analytically acceptable
- aggregation
- retention tiers
- compression
- partitioning
- selective downstream materialization

Business-critical transactional events should not be sampled.

---

# 42. Canonical IDs

All analytical datasets should preserve stable domain identifiers.

Examples:

```text
user_id
buyer_id
supplier_id
product_id
supplier_listing_id
batch_id
order_id
order_item_id
fulfillment_id
payment_id
refund_id
delivery_id
support_case_id
```

Do not use mutable display names as primary analytical keys.

---

# 43. Time and Timezone Standards

Store timestamps in UTC at the platform level.

For business reporting, retain the relevant business timezone.

India-focused operations should support:

```text
UTC storage
Asia/Kolkata reporting context
```

Delivery slots and business dates must be interpreted using the applicable operational timezone.

---

# 44. Catalog Analytics

Catalog reporting should distinguish:

```text
canonical product
supplier listing
supplier inventory
batch
```

Key metrics:

- active canonical products
- active supplier listings
- supplier coverage per product
- products with zero suppliers
- products with zero stock
- catalog completeness
- image completeness
- duplicate candidate rate
- rejected imports
- restricted product attempts

---

# 45. Marketplace Health Metrics

Recommended marketplace health dashboard:

```text
Active Buyers
Active Suppliers
Orders
GMV
Average Order Value
Supplier Fill Rate
Stock-out Rate
Payment Success Rate
Cancellation Rate
On-time Delivery Rate
Refund Rate
Support Rate
```

Metrics should be segmented by:

- day/week/month
- city
- state
- product category
- supplier
- buyer cohort
- delivery mode
- platform

---

# 46. Cohort Analytics

Buyer cohorts may be created by:

- first order month
- acquisition source
- geography
- buyer segment

Analyze:

```text
retention
repeat purchase
order frequency
GMV
average order value
category expansion
```

Supplier cohorts may be based on:

- onboarding month
- geography
- supplier type
- activation month

Analyze:

```text
activation
listing growth
order growth
fill rate
retention
settlement volume
```

---

# 47. Scheduled Delivery Analytics

Scheduled delivery requires slot-level reporting.

Metrics:

```text
slot_orders
slot_capacity
slot_utilization
orders_ready_before_cutoff
route_assignment_rate
on_time_dispatch_rate
on_time_delivery_rate
late_delivery_rate
```

This data can later feed route optimization.

---

# 48. Instant Delivery Analytics

Track:

```text
instant_delivery_requested
instant_delivery_accepted
instant_delivery_dispatched
instant_delivery_completed
instant_delivery_failed
instant_delivery_duration
```

Compare against configured delivery SLA.

---

# 49. Supplier Benchmarking

Supplier analytics may provide marketplace-level benchmarks where allowed.

Examples:

```text
supplier_fill_rate
median_dispatch_time
on_time_delivery_rate
cancellation_rate
```

Supplier-facing benchmark information must be intentionally designed and must not expose confidential competitor data.

---

# 50. BI Data Export

Exports should be:

- permission-controlled
- audited
- scoped
- rate-limited
- generated asynchronously for large datasets

Do not permit unrestricted bulk extraction of sensitive operational or compliance data.

---

# 51. API and Analytics Separation

Operational APIs should not become the BI query layer.

Use dedicated analytical endpoints or BI/warehouse access patterns.

Example:

```text
GET /api/v1/supplier/dashboard
```

may serve operational supplier dashboard data.

A warehouse-backed analytics service may serve:

```text
GET /api/v1/analytics/supplier/performance
```

with appropriate access control.

---

# 52. Data Platform Environments

Separate:

```text
development
test
staging
production
```

Analytical datasets should also be environment-isolated.

Production data must not be copied into development without approved masking/anonymization.

---

# 53. Local Development

Developers should have:

- seed data
- synthetic events
- synthetic orders
- synthetic suppliers
- synthetic products
- synthetic payments

Synthetic datasets should resemble production shapes without containing production PII.

---

# 54. Testing Strategy

Data platform testing should include:

### Unit tests

Transformation logic.

### Data tests

Schema, uniqueness, nullability, referential integrity.

### Pipeline tests

End-to-end ingestion.

### Contract tests

Producer/consumer compatibility.

### Reconciliation tests

Operational vs analytical totals.

### Backfill tests

Duplicate and historical correctness.

### Performance tests

Large-volume queries and dashboard latency.

### Security tests

Unauthorized dataset access.

---

# 55. Data Quality Severity

Recommended severity:

```text
P0 - critical business/reporting corruption
P1 - major dataset degradation
P2 - moderate issue
P3 - minor quality issue
```

Examples:

P0:
- payment facts materially corrupted
- financial reconciliation broken

P1:
- order fact freshness severely delayed

P2:
- product analytics event missing optional property

P3:
- non-critical descriptive field missing

---

# 56. Ownership Model

Recommended ownership:

| Area | Owner |
|---|---|
| Operational source data | Domain engineering team |
| Warehouse platform | Data engineering |
| BI metrics | Data/analytics + business owner |
| Finance metrics | Finance + data |
| Compliance metrics | Compliance + data |
| Product analytics | Product + data |
| ML features | Data science/data engineering |
| Data quality | Dataset owner |
| Data governance | Platform/data governance |

No critical dataset should exist without an owner.

---

# 57. Recommended Initial Technology Pattern

The exact vendor can be selected based on scale and cloud strategy.

A practical initial stack:

```text
PostgreSQL
Redis
Object Storage (S3-compatible)
Managed Data Warehouse
ETL/ELT framework
BI platform
Event ingestion
Observability platform
```

For a smaller initial deployment, the team may avoid introducing a separate data lake and warehouse immediately if operational volume does not justify it.

The architecture should preserve a migration path.

---

# 58. Initial Implementation Phases

## Phase 1 — Analytics foundation

Implement:

- event taxonomy
- event envelope
- warehouse connection
- raw event storage
- core dimensions
- order facts
- payment facts
- supplier facts
- inventory facts
- basic BI dashboards

## Phase 2 — Operational intelligence

Implement:

- fulfillment analytics
- logistics analytics
- support analytics
- compliance dashboards
- supplier dashboards
- reconciliation jobs

## Phase 3 — Product analytics

Implement:

- search analytics
- funnel analytics
- cohort analytics
- retention
- experiment instrumentation

## Phase 4 — Advanced analytics

Implement:

- demand forecasting
- stock-out prediction
- supplier performance models
- delivery prediction
- recommendations

---

# 59. Analytics Release Checklist

Before releasing a dataset:

- [ ] source owner defined
- [ ] business owner defined
- [ ] schema documented
- [ ] data contract documented
- [ ] PII classification completed
- [ ] retention defined
- [ ] access policy defined
- [ ] quality tests implemented
- [ ] freshness SLA defined
- [ ] lineage documented
- [ ] reconciliation implemented where required
- [ ] dashboard consumers identified
- [ ] alerting configured
- [ ] backfill strategy tested

---

# 60. Definition of Done

A data-platform feature is complete when:

1. source ownership is documented
2. schema is versioned
3. ingestion is implemented
4. transformations are tested
5. data quality checks exist
6. access controls are configured
7. retention is defined
8. lineage is documented
9. freshness is monitored
10. required BI/analytics outputs are validated
11. reconciliation exists for critical financial/operational datasets
12. production monitoring and alerting are enabled
13. rollback/reprocessing procedures are documented

---

# 61. Acceptance Criteria

The implementation should demonstrate:

### Data correctness

- operational order totals reconcile with warehouse facts
- payment records reconcile with gateway/source records
- supplier-scoped analytics do not leak other suppliers
- batch-level inventory remains traceable

### Performance

- common BI queries meet defined dashboard SLAs
- high-volume event ingestion does not degrade transactional APIs
- large exports are asynchronous

### Reliability

- failed pipelines retry
- duplicate events do not duplicate business facts
- backfills are repeatable
- alerts fire on freshness and quality failures

### Governance

- sensitive datasets are access-controlled
- retention policies are enforceable
- metric definitions are centralized
- lineage exists for critical dashboards

### Advanced analytics readiness

- historical data contains reliable timestamps
- features can be reproduced
- prediction-time cutoffs are enforceable
- model outputs can be traced to model/version/features

---

# 62. Final Architecture Summary

Bezzo's data architecture should evolve from a clean transactional foundation into a governed analytical platform.

The target flow is:

```text
Bezzo Operational Domains
        |
        +--> Domain Events
        +--> CDC / Incremental Data
        |
        v
Immutable Raw Data
        |
        v
Validated / Standardized Data
        |
        v
Warehouse Facts + Dimensions
        |
        +--> Semantic Metrics
        +--> BI Dashboards
        +--> Product Analytics
        +--> Supplier Analytics
        +--> Finance Analytics
        +--> Compliance Analytics
        +--> Operations Analytics
        |
        v
Advanced Analytics / ML
```

The central engineering principle is to keep transactional correctness and analytical flexibility separate while maintaining strong lineage between them.

Bezzo should start with the smallest data platform that supports reliable operational reporting, then expand toward advanced analytics as actual marketplace volume and business requirements justify additional infrastructure.

---

**Document End**

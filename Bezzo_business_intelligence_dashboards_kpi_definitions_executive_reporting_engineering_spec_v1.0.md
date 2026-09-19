# Bezzo Business Intelligence Dashboards, KPI Definitions & Executive Reporting Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Status:** Draft for Implementation  
**Version:** 1.0  
**Primary Scope:** BI architecture, governed KPI definitions, dashboard design, executive reporting, operational reporting, supplier analytics, finance reporting, compliance reporting, alerting, access control, and metric governance

---

# 1. Purpose

This specification defines the governed Business Intelligence (BI) layer for Bezzo.

It establishes:

- canonical marketplace KPIs
- metric definitions
- dashboard ownership
- dashboard audiences
- dimensional slicing
- executive reporting
- operational reporting
- supplier reporting
- finance reporting
- compliance reporting
- logistics reporting
- catalog and inventory reporting
- support reporting
- metric governance
- dashboard performance
- access control
- export controls
- reconciliation
- reporting schedules
- alerting
- implementation standards

The objective is to ensure that different Bezzo teams do not calculate the same business metric differently.

---

# 2. Core BI Principle

Bezzo must have:

```text
One metric definition
        ↓
One governed semantic implementation
        ↓
Many dashboards / consumers
```

The following must be avoided:

```text
Dashboard A calculates GMV one way
Dashboard B calculates GMV another way
Dashboard C calculates GMV a third way
```

Business-critical metrics must have an owner, definition, source, calculation logic, refresh target, and known exclusions.

---

# 3. BI Architecture

```text
Operational Domains
        |
        v
Events / CDC / Incremental Loads
        |
        v
Raw / Staging
        |
        v
Warehouse Facts + Dimensions
        |
        v
Semantic / Metric Layer
        |
        +-----------------------------+
        |             |               |
        v             v               v
Executive BI   Operational BI   Domain BI
                              |
                +-------------+-------------+
                |             |             |
                v             v             v
             Supplier       Finance      Compliance
                |
                v
         Scheduled Reports
         Alerts / Exports
```

BI dashboards must consume governed analytical datasets rather than directly querying transactional tables for complex reporting.

---

# 4. Dashboard Principles

Dashboards should be:

- decision-oriented
- fast
- visually consistent
- role-specific
- permission-aware
- traceable to metric definitions
- resistant to accidental misinterpretation

A dashboard should answer:

1. What happened?
2. Where did it happen?
3. When did it happen?
4. Why might it have happened?
5. What requires attention?

The fifth question should be supported by drill-down and alerts rather than unsupported automated conclusions.

---

# 5. Dashboard Hierarchy

Bezzo should organize BI into:

```text
Executive
  |
  +-- Marketplace
  +-- Finance
  +-- Operations
  +-- Supplier Network
  +-- Customer / Buyer
  +-- Logistics
  +-- Compliance

Operational
  |
  +-- Orders
  +-- Inventory
  +-- Fulfillment
  +-- Payments
  +-- Support
  +-- Catalog

Domain
  |
  +-- Supplier
  +-- Product
  +-- Search
  +-- Delivery
  +-- Promotions
```

---

# 6. Executive Dashboard

The executive dashboard should provide a compact view of marketplace health.

Primary metrics:

```text
Active Buyers
Active Suppliers
Orders
GMV
Net Sales
Average Order Value
Supplier Fill Rate
Payment Success Rate
Cancellation Rate
On-Time Delivery Rate
Refund Rate
```

The dashboard should show:

- current period
- previous comparable period
- trend
- relevant target where one has been formally defined
- segmentation
- exceptions

Avoid displaying a metric without its period.

---

# 7. Executive Marketplace Overview

Recommended layout:

```text
+------------------------------------------------+
| Marketplace Health                             |
+------------------------------------------------+
| GMV       | Orders      | Buyers | Suppliers  |
+-----------+-------------+--------+------------+
| AOV       | Fill Rate   | Pay %  | Delivery % |
+-----------+-------------+--------+------------+
| Trend: GMV / Orders                           |
+------------------------------------------------+
| Geographic / Category Breakdown                |
+------------------------------------------------+
| Operational Exceptions                         |
+------------------------------------------------+
```

The actual UI may evolve with the selected BI platform.

---

# 8. Standard Time Periods

All dashboards should support:

```text
Today
Yesterday
Last 7 days
Last 30 days
Current month
Previous month
Current quarter
Previous quarter
Current year
Custom range
```

Comparisons must explicitly identify the comparison period.

Examples:

```text
September 2026 vs August 2026
September 2026 vs September 2025
```

Do not label a comparison simply as "growth" without defining the baseline.

---

# 9. Canonical KPI: GMV

## Definition

GMV means Gross Merchandise Value according to the currently approved Bezzo commercial metric definition.

The exact inclusion/exclusion rules must be centrally governed.

Recommended source:

```text
fact_order_items
```

with supporting order/payment/refund facts where required.

## Required documentation

Every GMV implementation must specify:

- order states included
- cancellations
- refunds
- discounts
- taxes
- delivery fees
- payment fees
- timing basis
- currency
- timezone

No dashboard may redefine GMV independently.

---

# 10. Canonical KPI: Orders

## Definition

An order is counted according to the approved Bezzo order lifecycle definition.

The dashboard must specify whether it is reporting:

```text
orders_created
orders_confirmed
orders_fulfilled
orders_delivered
orders_completed
```

Do not use "orders" as an ambiguous metric.

---

# 11. Canonical KPI: Active Buyer

The metric must specify the activity definition.

Example:

```text
Active Buyer:
A buyer organization/user that performs the defined qualifying marketplace activity during the selected period.
```

Possible qualifying actions include:

```text
order_created
```

or another explicitly governed activity.

The chosen definition must be versioned.

---

# 12. Canonical KPI: Active Supplier

The metric should distinguish:

```text
registered supplier
verified supplier
active supplier
selling supplier
```

A dashboard must state which definition it uses.

Recommended operational definitions should be maintained in the metric catalog.

---

# 13. Canonical KPI: Average Order Value

Illustrative definition:

```text
AOV = defined order-value measure / qualifying order count
```

The denominator must match the numerator's order population.

Do not divide GMV by a different order population.

---

# 14. Canonical KPI: Supplier Fill Rate

Supplier fill rate should measure the supplier's ability to fulfill requested quantities according to the approved business definition.

A possible formulation is:

```text
fulfilled requested quantity
--------------------------------
requested quantity
```

The final production formula must be governed centrally.

Supplier fill rate must be calculated at appropriate fulfillment/item grain because a customer order can contain multiple suppliers.

---

# 15. Canonical KPI: Cancellation Rate

The metric must distinguish:

```text
buyer cancellation
supplier cancellation
system cancellation
payment cancellation
logistics cancellation
```

A single cancellation rate may be useful for executive reporting, but drill-down must expose the reason categories.

---

# 16. Canonical KPI: Payment Success Rate

Recommended reporting dimensions:

```text
payment_method
gateway
platform
app_version
time
buyer_segment
```

Payment success should be calculated from payment attempts rather than order count unless explicitly defined otherwise.

---

# 17. Canonical KPI: On-Time Delivery Rate

The metric must use:

```text
promised delivery time/slot
actual delivery completion time
```

For scheduled delivery:

```text
promised slot
actual delivery timestamp
```

For instant delivery:

```text
configured SLA / promised ETA
actual completion
```

The definition must distinguish:

```text
provider delay
supplier readiness delay
buyer availability
system delay
```

where reliable attribution exists.

---

# 18. Canonical KPI: Refund Rate

The dashboard should distinguish:

```text
refund_count
refund_amount
refund_rate
```

Refund rate must specify whether it is:

```text
orders refunded / qualifying orders
```

or another approved denominator.

Amount-based refund rate and order-based refund rate should never share the same label.

---

# 19. Net Sales / Revenue

Finance dashboards must distinguish operational marketplace metrics from accounting revenue.

Potential metrics include:

```text
gross merchandise value
discounted merchandise value
net merchandise value
commission revenue
delivery revenue
payment fees
supplier payable
refunds
net marketplace revenue
```

Accounting definitions must be validated by finance/accounting ownership.

BI must not independently invent accounting treatment.

---

# 20. Metric Catalog

Every governed metric should have a catalog record.

Recommended fields:

```text
metric_id
metric_name
display_name
description
owner
business_owner
source_dataset
grain
formula
filters
exclusions
time_basis
timezone
refresh_frequency
version
status
```

Example:

```text
metric_id:
marketplace.gmv

owner:
Data Platform

business_owner:
Finance / Marketplace

source:
fact_order_items

status:
ACTIVE
```

---

# 21. Metric Status

Supported statuses:

```text
DRAFT
REVIEW
ACTIVE
DEPRECATED
RETIRED
```

A deprecated metric should identify its replacement where one exists.

---

# 22. Metric Versioning

Metric changes can affect historical reporting.

When a definition changes materially:

```text
metric_version 1
metric_version 2
```

Historical dashboards should document which version they use.

If historical data is recomputed, the change must be explicitly recorded.

---

# 23. Dashboard Ownership

Every dashboard requires:

```text
technical_owner
business_owner
support_owner
```

Example:

```text
Marketplace Executive Dashboard
Technical Owner: Data Platform
Business Owner: Marketplace Leadership
Support Owner: BI/Data Operations
```

---

# 24. Dashboard Access Roles

Recommended roles:

```text
EXECUTIVE_VIEWER
OPERATIONS_ANALYST
FINANCE_ANALYST
SUPPLIER_ANALYST
PRODUCT_ANALYST
COMPLIANCE_ANALYST
DATA_ANALYST
DATA_ENGINEER
BI_ADMIN
```

Permissions must follow least privilege.

---

# 25. Supplier Dashboard Isolation

Supplier dashboards must enforce tenant scope.

A supplier may view:

```text
own orders
own products
own inventory
own fulfillment
own settlements
own performance
```

It must not view:

```text
other supplier transaction data
other supplier confidential pricing
other supplier private operational data
```

Marketplace benchmarks, if offered, must be intentionally designed and appropriately aggregated.

---

# 26. Buyer Analytics Access

Buyer-facing analytics should generally expose only the buyer's own information.

Examples:

```text
order history
spending history
reorder history
delivery history
```

Global marketplace metrics should not be exposed to buyers unless explicitly designed.

---

# 27. Operations Dashboard

The operations dashboard should focus on current exceptions.

Recommended sections:

```text
Active Orders
Pending Fulfillments
Supplier Exceptions
Inventory Exceptions
Payment Exceptions
Delivery Exceptions
Support Backlog
Compliance Exceptions
```

Operational dashboards should prioritize actionable queues over historical charts.

---

# 28. Order Operations Dashboard

Metrics:

```text
orders_created
orders_pending
orders_confirmed
orders_cancelled
orders_fulfilled
orders_delayed
orders_completed
```

Filters:

```text
city
supplier
buyer
delivery_mode
delivery_slot
order_status
payment_status
```

---

# 29. Fulfillment Dashboard

Track:

```text
fulfillment_count
supplier_acceptance_time
dispatch_time
fulfillment_completion
supplier_rejection
supplier_timeout
partial_fulfillment
```

Because orders may be split across suppliers, this dashboard must operate at fulfillment grain.

---

# 30. Inventory Dashboard

Key views:

```text
stock available
stock reserved
stock-out
near-expiry
expired
quarantined
recalled
inventory aging
```

Filters:

```text
supplier
product
category
warehouse
city
expiry window
```

Inventory analytics must remain batch-aware.

---

# 31. Stock-Out Dashboard

Recommended metrics:

```text
products_out_of_stock
supplier_listings_out_of_stock
stock_out_events
estimated lost demand
alternative_supplier_available
alternative_supplier_unavailable
```

"Lost demand" must be clearly labeled as an analytical estimate if it is not directly observed.

---

# 32. Catalog Dashboard

Metrics:

```text
canonical_products
active_supplier_listings
products_without_supplier
products_without_stock
catalog_completeness
image_completeness
duplicate_candidates
import_success_rate
import_rejection_rate
```

Pharmaceutical catalog restrictions must be represented as governed statuses, not informal dashboard labels.

---

# 33. Search Dashboard

Key metrics:

```text
searches
unique_searching_buyers
zero_result_rate
search_to_product_view
search_to_cart
search_to_order
query_reformulation
top_queries
```

Breakdowns:

```text
platform
buyer segment
category
query
time
```

Sensitive search data must follow approved retention and access controls.

---

# 34. Checkout Dashboard

Funnel:

```text
checkout_started
address_selected
delivery_selected
payment_method_selected
payment_initiated
payment_succeeded
order_created
```

Key diagnostic metric:

```text
step-to-step conversion
```

Failures should be grouped by:

```text
platform
app_version
payment method
gateway
delivery mode
```

---

# 35. Payment Dashboard

Sections:

### Payment volume

```text
attempts
successes
failures
```

### Payment quality

```text
success rate
failure rate
gateway error rate
```

### Money movement

```text
authorized amount
captured amount
refund amount
settlement amount
```

### Reconciliation

```text
gateway mismatch
unreconciled transactions
```

---

# 36. Logistics Dashboard

Track:

```text
delivery requests
accepted deliveries
dispatches
in-transit deliveries
completed deliveries
failed deliveries
late deliveries
```

Break down by:

```text
Porter
delivery mode
city
zone
slot
supplier
```

The logistics architecture must remain provider-agnostic even if Porter is the initial provider.

---

# 37. Scheduled Delivery Dashboard

Key metrics:

```text
orders by slot
slot capacity
slot utilization
ready-before-cutoff
route assignment
dispatch punctuality
delivery punctuality
late delivery
```

This dashboard should support future route and van-batching optimization.

---

# 38. Instant Delivery Dashboard

Key metrics:

```text
instant requests
acceptance
dispatch time
pickup time
delivery duration
late deliveries
failed deliveries
```

The dashboard should compare performance against the configured instant-delivery SLA.

---

# 39. Supplier Network Dashboard

Executive supplier metrics:

```text
verified suppliers
active suppliers
selling suppliers
orders per supplier
supplier GMV
fill rate
cancellation rate
dispatch performance
delivery performance
```

Supplier counts must use explicit status definitions.

---

# 40. Supplier Performance Dashboard

For each supplier:

```text
orders
units
GMV
fill rate
cancellation
dispatch latency
delivery latency
returns/refunds
support cases
stock-out rate
settlements
```

Historical trends should be available.

---

# 41. Finance Dashboard

Core sections:

```text
GMV
Net Merchandise Value
Commission
Supplier Payable
Refunds
Payment Fees
Delivery Revenue
Net Marketplace Revenue
```

Additional reconciliation:

```text
Gateway
COD
Supplier settlements
Refunds
```

Finance reporting must clearly separate operational metrics from accounting metrics.

---

# 42. Supplier Settlement Dashboard

Track:

```text
gross supplier sales
commission
adjustments
refunds
net payable
settled
pending
failed payout
```

Drill-down should reach:

```text
settlement
order
fulfillment
order item
```

---

# 43. Compliance Dashboard

Recommended metrics:

```text
suppliers pending verification
suppliers under review
verified suppliers
rejected suppliers
licences expiring
expired licences
restricted product events
blocked batches
recalls
compliance escalations
```

Sensitive documents must not be displayed directly in broad BI dashboards.

---

# 44. Recall Reporting

Recall dashboards should support:

```text
recall event
affected product
affected batch
affected supplier
affected order count
affected fulfillment count
quarantine status
notification status
resolution status
```

The recall operational workflow remains owned by the compliance/admin domain.

---

# 45. Support Dashboard

Metrics:

```text
new cases
open cases
closed cases
first response time
resolution time
reopened cases
escalations
refund-linked cases
delivery-linked cases
supplier-linked cases
compliance-linked cases
```

---

# 46. Customer Experience Dashboard

Combine:

```text
cancellation
refund
delivery failure
support
repeat purchase
```

The dashboard should allow investigation rather than implying causal relationships without evidence.

---

# 47. Product Analytics Dashboard

Core metrics:

```text
DAU/WAU/MAU where relevant
searches
product views
cart additions
checkout starts
orders
conversion
repeat purchase
reorder
```

For B2B procurement, business-appropriate activity definitions should be preferred over consumer-app assumptions.

---

# 48. App and Platform Health Dashboard

Break down product performance by:

```text
web
android
ios
app_version
browser
device class
```

Useful metrics:

```text
API errors
analytics event failures
checkout errors
payment errors
crash indicators where available
latency
```

Operational observability remains the source for infrastructure-level SRE metrics.

---

# 49. Version Release Dashboard

Track:

```text
active app versions
new version adoption
checkout conversion by version
payment success by version
error rate by version
```

This is especially important for mobile clients where older versions remain installed.

---

# 50. Geography Dashboard

Dimensions:

```text
state
city
postal zone
delivery zone
supplier geography
buyer geography
```

Metrics:

```text
buyers
suppliers
orders
GMV
AOV
fill rate
delivery performance
```

Exact addresses should not be displayed in general BI.

---

# 51. Category Dashboard

Track:

```text
orders
GMV
units
product views
cart additions
conversion
stock-out
supplier coverage
```

Categories should use the governed Bezzo catalog taxonomy.

---

# 52. Manufacturer Dashboard

Where permitted and useful:

```text
products
supplier listings
orders
units
GMV
availability
```

Manufacturer-level reporting must not imply endorsement or product-quality conclusions merely from sales metrics.

---

# 53. Promotion Dashboard

Track:

```text
promotion impressions
promotion clicks
promotion usage
discount amount
orders influenced
GMV associated
```

Promotional reporting must respect applicable pharmaceutical rules and the governed promotions system.

---

# 54. Reorder Dashboard

Metrics:

```text
eligible buyers
reorder attempts
successful reorders
reorder rate
reorder interval
top reordered products
```

Segment by:

```text
buyer
category
product
supplier
geography
```

---

# 55. Retention Dashboard

Recommended cohort views:

```text
30-day
60-day
90-day
```

Use the approved retention definition.

For B2B buyers, monthly procurement behavior may be more meaningful than daily app-open behavior.

---

# 56. KPI Drill-Down

Every major KPI should support:

```text
KPI
  ↓
time trend
  ↓
geography
  ↓
category
  ↓
supplier
  ↓
product
  ↓
transaction/fact record
```

Access permissions must be enforced at every layer.

---

# 57. Dashboard Filters

Common global filters:

```text
date
time
state
city
buyer segment
supplier
category
product
platform
delivery mode
payment method
```

Filters must not silently change the metric definition.

---

# 58. Filter State

Dashboard URLs or saved views may encode filter state.

Do not encode sensitive data into URLs.

Saved views must be permission-aware.

---

# 59. Dashboard Refresh

Each dashboard must display:

```text
Data as of:
Last successful refresh:
Expected next refresh:
```

For near-real-time dashboards, show freshness age where useful.

Never imply live data if the dataset is delayed.

---

# 60. Dashboard Performance Targets

Recommended engineering objectives:

### Executive dashboard

Target interactive load:

```text
<= 3 seconds
```

under normal production conditions.

### Operational dashboards

Target:

```text
<= 3 seconds
```

for common filtered views.

### Heavy analytical reports

May run asynchronously.

Performance targets must be validated using actual production query profiles.

---

# 61. Caching

Use caching for expensive, frequently requested dashboard queries.

Candidate cache keys:

```text
dashboard_id
metric_version
filter_hash
time_range
data_version
```

Cache invalidation must prevent materially stale financial or compliance reporting.

---

# 62. Asynchronous Exports

Large exports must use asynchronous jobs.

Flow:

```text
User requests export
        |
        v
Permission check
        |
        v
Export job created
        |
        v
Warehouse query
        |
        v
File generated
        |
        v
Secure temporary access
```

Every export should be audited.

---

# 63. Scheduled Reports

Supported report schedules:

```text
daily
weekly
monthly
```

Recipients must be permission-checked.

Examples:

```text
Daily operations report
Daily payment reconciliation
Weekly supplier performance
Monthly finance report
Weekly compliance report
```

---

# 64. Alerting

BI alerts should be based on governed metrics.

Examples:

```text
payment success rate below configured threshold
stock-out rate above threshold
delivery delay above threshold
supplier fill rate below threshold
licences nearing expiry
pipeline freshness exceeded
```

Thresholds should be configuration, not hard-coded dashboard logic.

---

# 65. Alert Fatigue Prevention

Alerts should have:

```text
severity
threshold
evaluation window
cooldown
owner
acknowledgement
resolution
```

Avoid alerting on every individual low-value event.

---

# 66. Executive Reporting Cadence

Recommended:

### Daily

Marketplace operations snapshot.

### Weekly

Marketplace performance and operational trends.

### Monthly

Finance, supplier network, product, and compliance review.

### Quarterly

Strategic marketplace and data review.

Actual cadence can be configured by business leadership.

---

# 67. Executive Report Structure

A standard report should contain:

1. reporting period
2. KPI summary
3. trends
4. geographic/category breakdown
5. supplier network summary
6. operations summary
7. finance summary
8. customer/buyer summary
9. compliance summary
10. notable exceptions
11. data quality/freshness note

---

# 68. Data Quality Disclosure

Every important report should show:

```text
Data freshness
Data completeness
Known exclusions
Metric version
```

If data is incomplete, the report must not present it as complete.

---

# 69. Financial Reconciliation Reporting

Finance reports must reconcile:

```text
Orders
Payment records
Gateway records
Refund records
Supplier settlement records
Payout records
```

Differences should be surfaced explicitly.

---

# 70. BI Security

Controls:

- SSO/authentication
- RBAC
- tenant isolation
- row-level security where supported
- restricted exports
- audit logs
- session timeout
- encrypted connections
- secure sharing

Public dashboard links must not expose private data.

---

# 71. Row-Level Security

Where a shared dashboard supports supplier-specific views:

```text
current_user
    ↓
authenticated supplier_id
    ↓
row-level filter
    ↓
supplier facts
```

Never trust:

```text
?supplier_id=...
```

as the only authorization mechanism.

---

# 72. Metric Calculation Location

Prefer:

```text
warehouse / semantic layer
```

over:

```text
dashboard-specific formulas
```

Dashboard-specific calculations should be limited to presentation logic.

---

# 73. SQL Standards

Analytical SQL should:

- use explicit columns
- avoid `SELECT *`
- use documented joins
- preserve grain
- avoid accidental fan-out
- use partition filters where applicable
- document complex calculations

A common failure to prevent:

```text
orders
JOIN order_items
JOIN payments
```

without controlling grain, causing financial values to multiply.

---

# 74. Grain Documentation

Every fact table and metric must state its grain.

Examples:

```text
fact_orders:
one row per customer order

fact_order_items:
one row per order item

fact_fulfillments:
one row per supplier fulfillment

fact_payments:
one row per payment transaction

fact_deliveries:
one row per delivery
```

Metric queries must respect the underlying grain.

---

# 75. Data Reconciliation Rules

Critical metrics should have reconciliation checks.

Examples:

```text
warehouse order count
=
operational order count within defined scope
```

```text
warehouse payment total
=
reconciled source payment total
```

```text
settlement payable
=
approved settlement ledger
```

Tolerance rules must be documented.

---

# 76. Dashboard Change Management

Changes require:

- ticket/change request
- owner
- impact assessment
- metric review
- QA
- release note
- rollback strategy where necessary

Changes to KPI definitions require stronger governance than cosmetic dashboard changes.

---

# 77. BI Testing

Testing must include:

### Data correctness

Compare dashboard values with known source totals.

### Filter correctness

Ensure each filter changes the intended dimensions.

### Grain correctness

Check for duplicate multiplication.

### Permission testing

Verify supplier isolation.

### Freshness testing

Verify displayed refresh metadata.

### Performance testing

Test common queries under realistic volume.

### Regression testing

Protect governed KPI definitions from accidental changes.

---

# 78. Dashboard Acceptance Test Example

For an order dashboard:

```text
Given:
10 qualifying orders exist.

When:
Dashboard period includes those orders.

Then:
Orders = 10.

When:
Supplier filter is applied.

Then:
Only orders/fulfillments within authorized supplier scope are shown.

When:
Date filter changes.

Then:
Only records inside the defined business-time range are included.
```

---

# 79. BI Environment Strategy

Maintain:

```text
development
staging
production
```

Dashboard definitions should be version-controlled where supported.

Metric changes should be promoted through controlled environments.

---

# 80. BI Repository Structure

Recommended:

```text
analytics/
├── metrics/
│   ├── marketplace/
│   ├── finance/
│   ├── supplier/
│   ├── logistics/
│   └── compliance/
├── models/
├── dashboards/
├── reports/
├── tests/
└── documentation/
```

The exact structure may vary by BI technology.

---

# 81. Documentation Requirements

Each dashboard must document:

```text
purpose
audience
owner
refresh
data sources
metrics
filters
permissions
known limitations
```

Each KPI must link to its metric definition.

---

# 82. Data Dictionary

The BI data dictionary should include:

```text
field
description
data type
source
business meaning
PII classification
allowed values
owner
```

This prevents semantic drift.

---

# 83. Business Calendar

Reporting should support:

```text
calendar date
business date
financial period
month
quarter
year
```

India-focused operations should use the appropriate business timezone for operational dates.

---

# 84. Currency

Initial reporting may operate in INR where applicable.

Financial metrics must carry explicit currency semantics.

Do not combine currencies without an approved conversion policy.

---

# 85. Scheduled Delivery BI

Scheduled delivery reporting should provide:

```text
orders by delivery date
orders by slot
capacity
utilization
route assignment
dispatch
delivery
exceptions
```

This is intended to support the batching/van-routing architecture.

---

# 86. Supplier Commission Reporting

Commission reporting must support:

```text
gross supplier sales
commission rate
commission amount
adjustments
refunds
net payable
settled amount
pending amount
```

Commission rules should be sourced from the governed commercial/settlement system.

---

# 87. Promotions Reporting

Track:

```text
promotion
eligible orders
redemptions
discount
net impact
```

Do not assume that an order containing a promotion was caused entirely by that promotion.

Attribution methodology must be explicit.

---

# 88. Advanced Analytics Integration

BI should expose trusted historical datasets to advanced analytics.

Examples:

```text
demand forecasts
stock-out risk
supplier performance predictions
delivery predictions
```

Model outputs must include:

```text
model_version
generated_at
prediction_horizon
feature_version
```

---

# 89. Model Output Dashboard

Where ML is introduced, dashboards should show:

```text
prediction
confidence/uncertainty where appropriate
model version
generated time
data freshness
```

Do not display a prediction as a factual observation.

---

# 90. BI and Compliance Separation

Compliance decisions must remain governed by the compliance subsystem.

BI may report:

```text
licence_expiry_count
blocked_batch_count
recall_status
```

BI must not independently authorize:

```text
supplier verification
restricted-product sale
batch release
compliance override
```

---

# 91. BI and Audit Separation

Dashboards can summarize audit activity.

The audit system remains authoritative.

Example:

```text
Dashboard:
"Number of supplier verification actions"

Audit log:
exact actor, timestamp, action, object, previous state, new state
```

---

# 92. BI Incident Handling

When a dashboard is wrong:

1. identify affected metric
2. identify source dataset
3. determine affected reporting period
4. freeze or annotate affected report if necessary
5. correct pipeline/metric
6. reconcile
7. document impact
8. notify affected consumers
9. prevent recurrence

Do not silently overwrite materially incorrect published reports.

---

# 93. Report Versioning

Important scheduled reports should retain:

```text
report_version
metric_version
generated_at
data_as_of
```

This allows historical investigation.

---

# 94. Executive Report Distribution

Distribution should be permission-controlled.

Potential channels:

```text
BI portal
secure email
internal collaboration system
scheduled file export
```

Sensitive financial/compliance reports must not be distributed to unauthorized recipients.

---

# 95. BI Launch Checklist

Before production:

- [ ] KPI definitions approved
- [ ] Metric catalog populated
- [ ] Dashboard owner assigned
- [ ] Business owner assigned
- [ ] Data sources validated
- [ ] Grain documented
- [ ] Reconciliation completed
- [ ] Filters tested
- [ ] Tenant isolation tested
- [ ] Performance tested
- [ ] Refresh SLA configured
- [ ] Alerts configured
- [ ] Export permissions configured
- [ ] Documentation published
- [ ] Dashboard freshness displayed

---

# 96. Definition of Done

A BI dashboard is complete when:

1. Its purpose is documented.
2. Audience and owner are documented.
3. Every KPI has a governed definition.
4. Source datasets are identified.
5. Fact grain is documented.
6. Filters are defined.
7. Access control is implemented.
8. Supplier/buyer isolation is tested where relevant.
9. Data freshness is visible.
10. Reconciliation is complete for critical metrics.
11. Performance meets the defined target.
12. Exports are controlled.
13. Monitoring and alerting are configured.
14. Dashboard documentation is published.
15. Changes can be versioned and audited.

---

# 97. Initial Implementation Sequence

## Phase 1 — Metric Governance

1. Create metric catalog.
2. Define marketplace KPIs.
3. Define finance KPIs.
4. Define supplier KPIs.
5. Define logistics KPIs.
6. Define compliance KPIs.
7. Implement semantic metric layer.

## Phase 2 — Executive BI

8. Marketplace overview.
9. Finance overview.
10. Supplier network overview.
11. Operations overview.

## Phase 3 — Operational BI

12. Orders.
13. Fulfillment.
14. Inventory.
15. Payments.
16. Logistics.
17. Support.
18. Compliance.

## Phase 4 — Product BI

19. Search.
20. Checkout.
21. Retention.
22. Reorder.
23. Product/category analytics.

## Phase 5 — Advanced Reporting

24. Scheduled reports.
25. Alerting.
26. Reconciliation dashboards.
27. Forecast/model output dashboards.

---

# 98. Final BI Standard

Bezzo BI must operate as a governed decision-support system:

```text
Reliable source data
       ↓
Correct grain
       ↓
Governed metrics
       ↓
Reusable semantic layer
       ↓
Role-specific dashboards
       ↓
Auditable reports
       ↓
Operational decisions
```

The most important BI requirement is not the number of charts. It is consistency.

If two Bezzo dashboards display the same KPI for the same population and period, they should produce the same result unless their definitions explicitly differ.

---

**Document End**

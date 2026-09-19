# Bezzo Analytics & Reporting Specification v1.0

**Product:** Bezzo  
**Document:** Analytics & Reporting Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Marketplace analytics, operational reporting, finance reporting, supplier/buyer analytics, logistics metrics, compliance reporting, dashboards, data models, exports, and analytics architecture.

---

# 1. Purpose

The Bezzo Analytics & Reporting platform provides a reliable measurement layer for the marketplace.

It should allow authorized users to understand:

- Marketplace growth
- Buyer activity
- Supplier activity
- Product/catalog performance
- Orders and fulfillment
- Delivery performance
- Payments and refunds
- Supplier settlements
- Support operations
- Compliance operations
- Customer behavior
- Platform performance
- Business trends

Analytics must be based on well-defined metrics and authoritative source data.

The system must distinguish between:

1. **Operational data** — current transactional state.
2. **Analytical data** — historical, aggregated, and trend-oriented data.

---

# 2. Analytics Principles

## 2.1 Single definition per metric

Metrics such as GMV, completed orders, active buyers, and fulfillment rate must have documented definitions.

Different dashboards must not independently calculate the same metric in incompatible ways.

## 2.2 Source-of-truth hierarchy

Recommended hierarchy:

```text
Transactional systems
        |
        v
Events / CDC / scheduled extraction
        |
        v
Analytics storage
        |
        v
Metric models
        |
        v
Dashboards / Reports / Exports
```

## 2.3 Historical accuracy

Historical reports should remain reproducible.

Changes to:

- Product price
- Supplier status
- Commission rules
- Delivery fees
- Buyer status
- Product metadata

must not unexpectedly rewrite historical business facts.

## 2.4 Privacy by design

Analytics must expose only the minimum personal information required.

Sensitive customer, supplier, payment, license, and document information should not be included in general-purpose dashboards.

---

# 3. Analytics Users

| User | Analytics Access |
|---|---|
| Super Admin | Full analytics |
| Operations Admin | Operations and marketplace |
| Supplier Operations | Supplier analytics |
| Buyer Operations | Buyer/account analytics |
| Catalog Admin | Catalog/product analytics |
| Finance Admin | Finance and settlement analytics |
| Logistics Admin | Delivery analytics |
| Compliance Admin | Compliance analytics |
| Support Agent | Assigned support metrics |
| Analyst | Broad read-only analytics |
| Supplier | Own supplier analytics only |
| Buyer | Own account/order analytics only |

All access must be server-side authorized.

---

# 4. Analytics Architecture

Recommended architecture:

```text
Bezzo Core Database
        |
        +----------------------+
        |                      |
        v                      v
Domain Events              CDC / ETL
        |                      |
        +----------+-----------+
                   |
                   v
             Analytics Layer
                   |
          +--------+--------+
          |                 |
          v                 v
     Fact Tables       Dimension Tables
          |
          v
      Metric Models
          |
    +-----+------+---------+
    |            |         |
    v            v         v
Admin BI     Operational   Exports
Dashboards   Dashboards
```

Initial implementation may use PostgreSQL read replicas or an analytical PostgreSQL schema.

As data volume grows, the analytics layer can move to a dedicated warehouse or columnar analytical database.

---

# 5. Data Domains

Analytics should be organized into major domains:

```text
Marketplace
Customers / Buyers
Suppliers
Catalog
Orders
Fulfillment
Logistics
Payments
Refunds
Settlements
Support
Compliance
Notifications
Platform
```

---

# 6. Marketplace Executive Dashboard

The executive dashboard should provide a high-level overview.

## 6.1 Core KPIs

Recommended KPIs:

- Gross Merchandise Value
- Net Merchandise Value
- Total orders
- Completed orders
- Cancelled orders
- Average order value
- Active buyers
- Active suppliers
- Active products
- Repeat buyer rate
- Payment success rate
- Fulfillment success rate
- Delivery success rate

## 6.2 Time comparison

Support:

- Today
- Yesterday
- Last 7 days
- Last 30 days
- Month to date
- Previous month
- Quarter to date
- Custom date range

Comparison should clearly state the comparison period.

---

# 7. GMV Definition

GMV must have a documented calculation.

Recommended initial definition:

```text
GMV =
sum of eligible order item selling values
for orders meeting the defined GMV inclusion criteria
```

The final business definition must explicitly define treatment of:

- Cancelled orders
- Returned orders
- Refunded orders
- Discounts
- Taxes
- Delivery charges
- Partial cancellations
- Partial refunds

The metric definition must be centralized.

---

# 8. Revenue Metrics

Possible metrics:

```text
Gross order value
Platform fees
Supplier commissions
Delivery revenue
Other marketplace revenue
Refunds
Adjustments
Net revenue
```

The exact accounting treatment must be approved by finance/accounting policy.

Analytics must not be treated as the accounting ledger.

---

# 9. Order Analytics

Core order metrics:

- Orders created
- Orders paid
- Orders accepted
- Orders fulfilled
- Orders delivered
- Orders cancelled
- Orders failed
- Orders refunded
- Partial refunds
- Average order value
- Items per order

## 9.1 Order funnel

```text
Viewed marketplace
      |
Product viewed
      |
Added to cart
      |
Checkout started
      |
Payment initiated
      |
Payment successful
      |
Order created
      |
Fulfillment accepted
      |
Dispatched
      |
Delivered
```

Each stage should expose:

- Count
- Conversion rate
- Drop-off count
- Drop-off rate
- Time between stages

---

# 10. Buyer Analytics

Buyer analytics should include:

- Registered buyers
- Verified buyers
- Active buyers
- First-time buyers
- Repeat buyers
- Orders per buyer
- Average buyer order value
- Buyer retention
- Buyer reactivation
- Buyer geography
- Buyer acquisition source where available

## 10.1 Active buyer definition

The active buyer metric must specify the time window.

Example:

```text
30-day active buyer =
unique verified buyer with at least one qualifying marketplace activity
during the previous 30 days.
```

The final qualifying activity definition must be documented.

---

# 11. Buyer Cohorts

Cohort analysis should group buyers by a meaningful starting event.

Examples:

- Registration month
- First order month
- First delivered order month

Track:

```text
Cohort
Month 0
Month 1
Month 2
Month 3
...
```

Possible metrics:

- Retention
- Orders
- Revenue
- Average order value
- Repeat purchase rate

---

# 12. Supplier Analytics

Supplier dashboard metrics:

- Registered suppliers
- Verified suppliers
- Active suppliers
- Orders received
- Orders accepted
- Orders rejected
- Fulfillment success
- Cancellation rate
- Stock availability
- Product count
- Revenue/value processed
- Average response time
- Average fulfillment time
- Delivery readiness

Supplier-facing analytics must be restricted to that supplier's own data.

---

# 13. Supplier Performance

Recommended dimensions:

```text
Supplier
Region
Product category
Order type
Delivery mode
Time period
```

Metrics:

- Acceptance rate
- Stock confirmation rate
- Fulfillment completion rate
- Cancellation rate
- Preparation time
- Pickup readiness
- Exception rate
- Customer issue rate

Avoid exposing another supplier's confidential metrics to suppliers.

---

# 14. Catalog Analytics

Catalog metrics:

- Total products
- Active products
- Pending moderation
- Rejected products
- Blocked products
- Products with low activity
- Products with missing data
- Duplicate candidates
- Product views
- Product search impressions
- Product detail views
- Add-to-cart rate
- Order conversion rate

---

# 15. Product Performance

For each product:

```text
Impressions
    |
Product views
    |
Add to cart
    |
Checkout inclusion
    |
Purchased
```

Metrics:

- View-to-cart rate
- Cart-to-order rate
- Overall conversion
- Units sold
- Order count
- Gross sales value
- Refund rate
- Cancellation rate

Product-level analytics should distinguish marketplace-wide data from supplier-specific sales data.

---

# 16. Search Analytics

Search analytics should capture:

- Search query
- Search count
- Result count
- Click-through
- Add-to-cart after search
- Purchase after search
- Zero-result searches
- Search latency

Important reports:

### Zero-result queries

Identify commonly searched products that return no usable result.

### Search conversion

```text
Search -> product click
Search -> add to cart
Search -> order
```

Search analytics can guide catalog expansion and search relevance improvements.

---

# 17. Inventory Analytics

Inventory reporting should include:

- In-stock SKU count
- Out-of-stock SKU count
- Low-stock SKU count
- Inventory availability rate
- Reservation rate
- Allocation failure rate
- Inventory sync freshness
- Supplier inventory update frequency

## 17.1 Stockout rate

A documented definition is required.

Possible model:

```text
Stockout rate =
stockout opportunities / eligible inventory opportunities
```

The exact denominator must be agreed before implementation.

---

# 18. Multi-Supplier Analytics

Because one customer order can contain multiple supplier fulfillments, analytics must support both:

```text
Customer Order
```

and:

```text
Supplier Fulfillment
```

Example:

```text
Order BZ-1001
  |
  +-- Fulfillment A
  |     Supplier A
  |
  +-- Fulfillment B
        Supplier B
```

Metrics should distinguish:

- Order-level success
- Fulfillment-level success
- Supplier-level success

Do not count supplier fulfillments as customer orders.

---

# 19. Instant vs Scheduled Delivery Analytics

Track delivery mode separately.

Dimensions:

```text
INSTANT
SCHEDULED
```

Metrics:

- Orders
- GMV
- Delivery fee
- Average delivery time
- On-time rate
- Cancellation rate
- Failure rate
- Customer support contacts

For scheduled delivery:

- Slot utilization
- Route density
- Orders per route
- Orders per run
- Pickup readiness
- Route completion rate

---

# 20. Logistics Analytics

Core logistics metrics:

- Delivery requests
- Accepted deliveries
- Pickup success
- Pickup delay
- Delivery success
- Delivery failure
- Average delivery time
- ETA accuracy where available
- On-time delivery rate
- Provider rejection rate
- Reschedule rate
- Cost per delivery

Analyze by:

- Provider
- Region
- Delivery mode
- Time slot
- Supplier
- Distance band

The system should support Porter initially while keeping provider-independent metric definitions.

---

# 21. Scheduled Delivery Analytics

Recommended dashboard:

```text
Today's scheduled orders
Orders by slot
Orders awaiting batching
Orders batched
Orders dispatched
Orders delivered
Orders delayed
Orders failed
```

Operational metrics:

- Batch creation time
- Route assignment time
- Dispatch time
- Delivery completion time
- Slot adherence

---

# 22. Payment Analytics

Metrics:

- Payment attempts
- Successful payments
- Failed payments
- Payment success rate
- Payment failure rate
- Payment value
- Average transaction value
- Payment method distribution
- Gateway distribution

Breakdowns:

```text
UPI
Card
Net Banking
Wallet / supported method
COD
```

The actual supported payment methods should be configuration-driven.

---

# 23. Payment Failure Analytics

Track failure reasons where safely available.

Examples:

- Gateway timeout
- Bank decline
- Customer cancellation
- Authentication failure
- Provider error
- Duplicate request
- Technical failure

Useful metric:

```text
Payment recovery rate =
successful recovered payments /
eligible failed payment attempts
```

---

# 24. Refund Analytics

Metrics:

- Refund requests
- Refund approval rate
- Refund rejection rate
- Refund value
- Average refund processing time
- Partial refund rate
- Refund failure rate
- Refund reason distribution

Breakdowns:

- Product issue
- Delivery issue
- Payment issue
- Cancellation
- Supplier issue
- Other approved reason categories

---

# 25. Reconciliation Analytics

Monitor:

- Unmatched transactions
- Matching rate
- Reconciliation exceptions
- Exception age
- Resolved exceptions
- Outstanding financial mismatches

Dashboard should highlight aging:

```text
0-1 day
2-3 days
4-7 days
8-30 days
30+ days
```

Thresholds should be configurable.

---

# 26. Supplier Settlement Analytics

Metrics:

- Gross supplier payable
- Fees
- Adjustments
- Refund deductions
- Net payable
- Settlement count
- Settlement value
- Failed settlements
- Outstanding settlements
- Settlement aging

Financial reporting must remain consistent with the settlement ledger.

---

# 27. Support Analytics

Metrics:

- New cases
- Open cases
- Resolved cases
- Closed cases
- Average first response time
- Average resolution time
- SLA breach rate
- Escalation rate
- Cases per order
- Cases by category

Useful breakdown:

```text
Order issue
Delivery issue
Payment issue
Product issue
Account issue
Supplier issue
Compliance issue
```

---

# 28. Notification Analytics

Track:

- Notifications created
- Sent
- Delivered
- Failed
- Retried
- Opened where supported
- Clicked where supported
- Provider failure rate

By channel:

```text
Push
SMS
Email
WhatsApp where enabled
In-app
```

Avoid treating delivery as equivalent to customer reading.

---

# 29. Compliance Analytics

Compliance dashboards may include:

- Suppliers pending verification
- Buyers pending verification
- Verification aging
- Rejected applications
- Suspended accounts
- Product blocks
- Batch quarantine
- Recalls
- Recall-affected inventory
- Recall-affected orders

Compliance dashboards should avoid exposing unnecessary personal information.

---

# 30. Operational SLA Analytics

For each SLA:

```text
Total cases
Within SLA
Approaching SLA
Breached
Resolved
```

Metrics:

- SLA compliance %
- Average time to resolution
- Median time to resolution
- P95 resolution time
- Breach count

Median and percentile metrics are useful because averages can hide severe outliers.

---

# 31. Platform Performance Analytics

Track:

- API request volume
- API latency
- Error rate
- Timeout rate
- Database latency
- Cache hit rate
- Search latency
- Queue depth
- Job failure rate

Important latency metrics:

```text
p50
p95
p99
```

The platform performance dashboard should be separate from business KPIs.

---

# 32. Mobile and Web Analytics

Track platform:

```text
WEB
ANDROID
IOS
```

Useful metrics:

- Active users
- Session starts
- Crash-free sessions
- API error rate
- Checkout conversion
- App version distribution
- Login success rate

The analytics system must avoid collecting unnecessary device identifiers or personal data.

---

# 33. Event Tracking Model

Recommended event format:

```json
{
  "event_id": "uuid",
  "event_name": "order_created",
  "event_version": 1,
  "occurred_at": "timestamp",
  "actor_type": "buyer",
  "actor_id": "id",
  "anonymous_id": "optional",
  "session_id": "optional",
  "platform": "web",
  "region": "optional",
  "properties": {},
  "context": {}
}
```

Event schemas must be versioned.

---

# 34. Core Events

Examples:

```text
user_registered
user_verified
supplier_registered
supplier_verified
product_viewed
search_performed
product_added_to_cart
checkout_started
payment_initiated
payment_succeeded
payment_failed
order_created
order_cancelled
fulfillment_created
fulfillment_accepted
fulfillment_failed
pickup_requested
delivery_started
order_delivered
refund_requested
refund_completed
support_case_created
notification_sent
notification_failed
```

---

# 35. Event Governance

Every analytics event should have:

- Owner
- Name
- Version
- Description
- Required properties
- Optional properties
- Source
- Privacy classification
- Retention policy

Events must not be created casually without documentation.

---

# 36. Fact and Dimension Model

Recommended analytical model:

### Fact tables

```text
fact_orders
fact_order_items
fact_fulfillments
fact_deliveries
fact_payments
fact_refunds
fact_settlements
fact_support_cases
fact_notifications
fact_product_events
fact_search_events
fact_inventory_snapshots
```

### Dimension tables

```text
dim_date
dim_time
dim_buyer
dim_supplier
dim_product
dim_category
dim_region
dim_delivery_provider
dim_payment_method
dim_platform
```

---

# 37. Slowly Changing Dimensions

Where historical reporting requires preserving previous attributes, use an appropriate historical dimension strategy.

Examples:

- Supplier region changes
- Product category changes
- Supplier status changes

Historical reports should not unexpectedly reinterpret old transactions using current metadata.

---

# 38. Inventory Snapshots

Inventory analytics should support periodic snapshots.

Example:

```text
supplier_id
product_id
snapshot_at
available_quantity
reserved_quantity
blocked_quantity
```

Snapshot frequency should be selected based on operational requirements and storage cost.

---

# 39. Data Freshness

Analytics should publish freshness expectations.

Example:

| Dataset | Target Freshness |
|---|---|
| Operational orders | Near real-time |
| Payment status | Near real-time |
| Delivery status | Near real-time |
| Executive KPIs | Minutes to hours |
| Finance reconciliation | Scheduled |
| Historical reports | Daily / scheduled |

Exact SLAs should be finalized during implementation.

---

# 40. Metric Layer

A centralized metric layer should define:

```text
metric_name
description
formula
filters
dimensions
time grain
owner
source
version
```

Example:

```text
Metric: Completed Orders

Definition:
Count of orders whose authoritative order state is COMPLETED
within the selected reporting period.
```

This prevents dashboard-to-dashboard metric drift.

---

# 41. Dashboard Design

Dashboards should follow:

```text
Summary
  |
Trends
  |
Breakdowns
  |
Exceptions
  |
Drill-down
```

Example:

```text
Orders
  |
  +-- Trend by day
  |
  +-- Region
  |
  +-- Supplier
  |
  +-- Product category
  |
  +-- Delivery mode
  |
  +-- Individual order
```

Every aggregate should support a path to underlying records where permissions allow.

---

# 42. Filters

Standard analytics filters:

- Date range
- Buyer
- Supplier
- Product
- Category
- Region
- Delivery mode
- Payment method
- Platform
- Order status
- Fulfillment status

Filters should be composable and reflected in exported reports.

---

# 43. Exports

Supported export formats may include:

- CSV
- XLSX
- PDF for selected presentation-style reports

Large exports must be asynchronous.

Example:

```text
Request export
      |
Create job
      |
Generate file
      |
Store securely
      |
Notify requester
      |
Temporary download access
```

Export permissions must match dashboard permissions.

---

# 44. Scheduled Reports

Authorized users may schedule reports.

Example:

```text
Every Monday 09:00
Supplier performance report

Every day 08:00
Previous-day operations report

Every month
Finance reconciliation report
```

Scheduled reports should include:

- Owner
- Recipients
- Filters
- Frequency
- Format
- Status
- Last successful run
- Next run

---

# 45. Data Retention

Retention policies should be defined separately for:

- Raw events
- Aggregated analytics
- Operational reports
- Exports
- Audit records

Retention must follow Bezzo's legal, contractual, security, and operational requirements.

Do not automatically delete regulated records merely because an analytics retention period has expired.

---

# 46. Privacy Controls

Analytics must support:

- Data minimization
- Role-based access
- Masking
- Aggregation
- Controlled exports
- Access logging
- Retention rules

Examples of fields that should generally be restricted:

- Full customer address
- Phone number
- Email
- Identity documents
- License documents
- Payment-sensitive information

---

# 47. Data Quality

Analytics must include data-quality checks.

Examples:

```text
Missing order IDs
Duplicate events
Invalid timestamps
Negative quantities
Unknown supplier IDs
Unknown product IDs
Payment/order mismatch
Fulfillment/order mismatch
```

Quality checks should produce alerts rather than silently dropping records.

---

# 48. Reconciliation Between Analytics and Core Systems

Periodic reconciliation should compare analytical totals with authoritative systems.

Examples:

```text
Orders in transactional DB
vs
Orders in analytics

Payments in payment ledger
vs
Payment facts

Fulfillments in order system
vs
Fulfillment facts
```

Differences should be measurable and investigated.

---

# 49. Alerting

Analytics alerts can monitor business anomalies.

Examples:

- Payment success rate drops
- Order cancellation rate spikes
- Supplier stockouts increase
- Delivery SLA breaches increase
- Refund volume increases
- Search zero-result rate increases
- Notification failure rate increases

Alerts should be threshold-based initially.

More advanced anomaly detection can be added later.

---

# 50. Data Access API

Recommended reporting endpoints:

```text
GET /analytics/v1/overview
GET /analytics/v1/orders
GET /analytics/v1/suppliers
GET /analytics/v1/buyers
GET /analytics/v1/catalog
GET /analytics/v1/inventory
GET /analytics/v1/logistics
GET /analytics/v1/payments
GET /analytics/v1/refunds
GET /analytics/v1/settlements
GET /analytics/v1/support
GET /analytics/v1/compliance
GET /analytics/v1/platform

POST /analytics/v1/exports
GET  /analytics/v1/exports/{id}

GET /analytics/v1/metrics/{metric}
```

Analytics APIs must enforce the same access boundaries as dashboards.

---

# 51. Supplier Analytics API

Supplier-facing analytics should be scoped automatically.

Example:

```text
GET /supplier/v1/analytics/overview
GET /supplier/v1/analytics/orders
GET /supplier/v1/analytics/products
GET /supplier/v1/analytics/fulfillment
GET /supplier/v1/analytics/inventory
```

The supplier identity must come from the authenticated account/session, not a client-supplied arbitrary supplier ID.

---

# 52. Buyer Analytics API

Buyer-facing analytics may provide:

- Order history
- Spending summaries
- Frequently purchased products
- Reorder behavior
- Delivery history

Only that buyer's data may be returned.

---

# 53. Data Security

Analytics infrastructure should use:

- Encryption in transit
- Encryption at rest
- Private networking
- Strong IAM
- Secret management
- Audit logging
- Restricted service accounts
- Database access controls
- Export access controls

Production analytical datasets should not be publicly accessible.

---

# 54. Performance

Analytics workloads must not degrade marketplace transactions.

Preferred strategy:

```text
Marketplace transaction DB
        |
        +--> Operational reads
        |
        +--> Analytics pipeline
                  |
                  v
            Analytics store
```

Heavy reports should run against analytical storage rather than the primary transactional database.

---

# 55. Implementation Phases

## Phase 1 — Measurement Foundation

1. Event taxonomy
2. Core event schema
3. Analytics permissions
4. Basic operational metrics
5. Dashboard framework
6. Data quality checks

## Phase 2 — Marketplace Analytics

7. Orders
8. Buyers
9. Suppliers
10. Catalog
11. Inventory
12. Search

## Phase 3 — Operations

13. Fulfillment
14. Logistics
15. Scheduled delivery
16. Support
17. Notifications

## Phase 4 — Finance and Compliance

18. Payments
19. Refunds
20. Reconciliation
21. Settlements
22. Compliance reporting

## Phase 5 — Advanced Analytics

23. Cohorts
24. Retention
25. Anomaly alerts
26. Advanced supplier analytics
27. Advanced route analytics
28. BI/warehouse migration if required

---

# 56. Acceptance Criteria

The analytics platform is production-ready when:

- Core metrics have written definitions.
- Analytics access is role-controlled.
- Supplier analytics are isolated by supplier.
- Buyer analytics are isolated by buyer.
- Marketplace dashboards support date and dimension filtering.
- Order and fulfillment metrics are separated correctly.
- Payment and financial metrics reconcile against authoritative records.
- Logistics metrics distinguish delivery modes.
- Event schemas are versioned.
- Data-quality checks exist.
- Analytics workloads do not overload the transactional database.
- Large exports run asynchronously.
- Export access is audited.
- Dashboard metrics can be traced to underlying data.
- Data freshness is measurable.
- Historical reporting is reproducible.
- Sensitive data is minimized and protected.
- Critical analytics pipelines have monitoring and alerting.

---

# 57. Recommended Initial KPI Set

For the first production release, avoid building hundreds of metrics.

Start with:

### Marketplace
- Orders
- Completed orders
- GMV
- Average order value
- Active buyers
- Active suppliers

### Conversion
- Product view
- Add-to-cart
- Checkout
- Payment success
- Order conversion

### Operations
- Fulfillment success
- Cancellation rate
- Delivery success
- On-time delivery

### Finance
- Payment success
- Refund value
- Settlement value
- Reconciliation exceptions

### Supplier
- Acceptance rate
- Fulfillment success
- Stock availability

### Support
- Open cases
- Resolution time
- SLA breach rate

This creates a manageable first analytics release while preserving the architecture for future expansion.

---

# 58. Final Architecture Recommendation

Bezzo should begin with a **well-defined analytics layer rather than immediately introducing a large data platform**.

Recommended initial path:

```text
PostgreSQL
   |
Domain events / CDC
   |
Analytics schema
   |
Metric layer
   |
Admin dashboards
   |
Scheduled exports
```

As marketplace traffic, event volume, and reporting complexity increase:

```text
Transactional DB
       |
Event / CDC pipeline
       |
Data warehouse / analytical store
       |
Transformation + metric layer
       |
BI / Admin / Reporting APIs
```

This approach keeps the initial system practical while preserving a migration path toward enterprise-scale analytics.

---

# 59. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Analytics and reporting platform

This specification should be implemented alongside the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, and admin/backoffice specifications.

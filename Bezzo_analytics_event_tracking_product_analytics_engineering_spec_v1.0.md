# Bezzo Analytics Event Tracking & Product Analytics Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Status:** Draft for Implementation  
**Version:** 1.0  
**Primary Scope:** Product analytics instrumentation, event taxonomy, tracking SDKs, funnels, cohorts, experiments, data quality, privacy, and analytics operations

---

# 1. Purpose

This specification defines how Bezzo measures user behavior across web, Android, iOS, supplier operations, buyer procurement, checkout, fulfillment, logistics, payments, support, and administrative workflows.

The goal is to create a consistent, versioned analytics system rather than allowing individual teams to emit ad-hoc events.

The implementation must preserve the existing Bezzo analytics direction:

- versioned event schemas
- measurable data freshness
- traceable metrics
- role-controlled analytics
- supplier isolation
- buyer isolation
- minimized sensitive data
- analytics workloads separated from transactional workloads
- monitoring and alerting for critical analytics pipelines

The existing analytics specification identifies a core event model containing `event_id`, `event_name`, `event_version`, `occurred_at`, actor information, anonymous/session identifiers, platform, region, properties, and context. This document turns that direction into an implementation-level instrumentation standard.

---

# 2. Goals

The event-tracking platform must answer questions such as:

- How do buyers discover products?
- Which searches produce no results?
- Which products are viewed most often?
- Where do buyers abandon checkout?
- Which payment methods fail most often?
- How frequently do buyers reorder?
- How do scheduled and instant delivery flows perform?
- Which supplier workflows create operational friction?
- Which app/web versions have elevated errors?
- Which product categories have strong or weak conversion?
- Which marketplace changes improve defined product metrics?
- Which operational events correlate with cancellation, refund, or support cases?

---

# 3. Non-Goals

This system is not the source of truth for:

- order state
- payment state
- inventory quantity
- supplier verification
- compliance status
- settlement state

Those remain owned by their respective operational domains.

Analytics events describe behavior and observations. They must not be used as a substitute for authoritative transactional records.

---

# 4. Architecture

```text
Web / Android / iOS
        |
        v
Analytics SDK / Tracking Library
        |
        v
Event Validation
        |
        v
Analytics Ingestion API / Event Gateway
        |
        +--> Immediate validation
        |
        +--> Durable queue/event stream
                    |
                    v
              Raw Event Store
                    |
          +---------+---------+
          |                   |
          v                   v
      Product Analytics   Data Warehouse
          |                   |
          +---------+---------+
                    |
                    v
              BI / Reporting
                    |
                    v
          Product / Operations
              Decision Making
```

Server-side business events should also enter the same governed event ecosystem.

Example:

```text
Order Service
     |
     v
order_created
     |
     v
Event Infrastructure
```

Client-side events must never be trusted as authoritative transaction records.

---

# 5. Event Sources

Events may originate from:

## 5.1 Client-side

- Web
- Android
- iOS

Examples:

```text
screen_viewed
search_submitted
product_viewed
filter_applied
cart_viewed
checkout_started
```

## 5.2 Server-side

- Backend domain services
- Payment integrations
- Logistics integrations
- Notification service
- Support service
- Compliance service

Examples:

```text
order_created
payment_succeeded
fulfillment_created
delivery_started
refund_completed
```

## 5.3 System-generated

Examples:

```text
analytics_ingestion_failed
event_schema_rejected
export_created
experiment_assignment_created
```

System events should normally remain internal unless there is a documented product-analytics reason to expose them.

---

# 6. Event Classification

Every event must have one classification.

Recommended classifications:

```text
PRODUCT
TRANSACTIONAL
OPERATIONAL
SYSTEM
SECURITY
EXPERIMENT
SUPPORT
COMPLIANCE
```

Examples:

| Event | Classification |
|---|---|
| product_viewed | PRODUCT |
| search_submitted | PRODUCT |
| order_created | TRANSACTIONAL |
| payment_succeeded | TRANSACTIONAL |
| delivery_started | OPERATIONAL |
| support_case_created | SUPPORT |
| supplier_verified | COMPLIANCE |
| experiment_exposed | EXPERIMENT |

---

# 7. Canonical Event Envelope

All events should use a common envelope.

Example:

```json
{
  "event_id": "uuid",
  "event_name": "product_viewed",
  "event_version": 1,
  "occurred_at": "2026-09-19T10:30:00Z",
  "ingested_at": "2026-09-19T10:30:01Z",
  "source": "web",
  "platform": "web",
  "app_version": "1.0.0",
  "actor_type": "buyer",
  "actor_id": "buyer_uuid",
  "anonymous_id": "anonymous_uuid",
  "session_id": "session_uuid",
  "request_id": "request_uuid",
  "properties": {},
  "context": {}
}
```

Required fields:

```text
event_id
event_name
event_version
occurred_at
source
platform
properties
```

Actor/session fields may be nullable depending on event type.

---

# 8. Event ID

`event_id` must be globally unique.

Purpose:

- deduplication
- replay protection
- lineage
- debugging
- event reconciliation

Client-generated IDs are acceptable for client events if generated using a robust UUID strategy.

Server-generated domain events should use the platform's standard event-ID mechanism.

---

# 9. Event Naming Standard

Use stable, descriptive, lowercase snake_case names.

Preferred:

```text
product_viewed
search_submitted
cart_item_added
checkout_started
payment_failed
order_created
delivery_completed
```

Avoid:

```text
ProductView
productView
viewProduct
CLICK_PRODUCT
event123
```

Names should describe the event that occurred, not implementation details.

---

# 10. Event Versioning

Every event has an integer version.

Example:

```text
product_viewed v1
product_viewed v2
```

A breaking schema change requires a new version.

Backward-compatible additions may be permitted according to the event contract.

Historical events must remain interpretable.

Do not silently reinterpret old event payloads.

---

# 11. Property Naming

Properties use `snake_case`.

Example:

```json
{
  "product_id": "prod_123",
  "supplier_id": "sup_456",
  "quantity": 2,
  "source_position": 4
}
```

Avoid ambiguous fields such as:

```text
id
value
type
data
```

unless their meaning is unambiguous within the event.

---

# 12. Common Context

Where available, events may include:

```json
{
  "context": {
    "session_id": "session_uuid",
    "screen_name": "product_detail",
    "route": "/products/123",
    "referrer": "search",
    "experiment_ids": [],
    "locale": "en-IN",
    "timezone": "Asia/Kolkata"
  }
}
```

Do not collect unnecessary personal or device information.

---

# 13. Platform Values

Use controlled values:

```text
web
android
ios
admin_web
supplier_web
```

If a desktop application is introduced later, add a documented value rather than inventing one ad hoc.

---

# 14. Actor Model

Supported actor types:

```text
anonymous
buyer
supplier
admin
support_agent
system
```

The actor identity must be derived from authenticated context where the event is server-generated.

Client applications must not be allowed to claim an arbitrary authenticated `actor_id`.

---

# 15. Anonymous Identity

Anonymous users may receive an `anonymous_id`.

The anonymous identifier must not contain:

- phone number
- email
- name
- address
- government identifier

When an anonymous user signs in, a controlled identity-linking mechanism may connect pre-login behavior to the authenticated account where legally and technically appropriate.

---

# 16. Session Tracking

A session identifier should represent a defined period of product interaction.

The session model must document:

- creation rule
- inactivity timeout
- app background behavior
- web tab behavior
- login transition behavior

Do not create a new session on every screen.

---

# 17. Core Product Events

The first production taxonomy should include:

```text
app_opened
session_started
screen_viewed

search_submitted
search_results_viewed
search_result_clicked
search_no_results
filter_applied
sort_changed

product_viewed
product_image_viewed
product_details_expanded

cart_viewed
cart_item_added
cart_item_quantity_changed
cart_item_removed

checkout_started
address_selected
delivery_mode_selected
delivery_slot_selected
payment_method_selected

payment_initiated
payment_succeeded
payment_failed

order_created
order_cancelled

fulfillment_viewed
delivery_tracking_viewed

order_delivered

refund_requested
refund_completed

support_case_created
```

The taxonomy should remain intentionally small at launch.

---

# 18. Authentication Events

Recommended:

```text
registration_started
registration_completed
login_started
login_succeeded
login_failed
otp_requested
otp_verified
otp_failed
logout_completed
password_reset_started
password_reset_completed
```

Do not put OTP values, passwords, tokens, or authentication secrets into event properties.

---

# 19. Buyer Onboarding Events

Recommended:

```text
buyer_onboarding_started
buyer_business_details_submitted
buyer_license_details_submitted
buyer_document_uploaded
buyer_onboarding_completed
buyer_verification_started
buyer_verification_completed
```

Do not place uploaded document contents in analytics events.

Track metadata only where required.

---

# 20. Supplier Onboarding Events

Recommended:

```text
supplier_onboarding_started
supplier_business_details_submitted
supplier_license_details_submitted
supplier_document_uploaded
supplier_bank_details_submitted
supplier_onboarding_submitted
supplier_verification_started
supplier_verified
supplier_rejected
```

Sensitive supplier documents must remain in controlled document storage.

---

# 21. Search Events

Search instrumentation must distinguish:

```text
search_submitted
search_results_viewed
search_result_clicked
search_no_results
```

Recommended properties:

```json
{
  "query_length": 18,
  "result_count": 24,
  "search_source": "global_search",
  "sort": "relevance",
  "filter_count": 2
}
```

Do not collect search text if it creates an unnecessary privacy/compliance risk. Where the business requires query analytics, define retention and access controls.

---

# 22. Search Result Click

Recommended properties:

```json
{
  "product_id": "prod_123",
  "supplier_listing_id": "listing_123",
  "position": 4,
  "result_count": 24,
  "search_id": "search_uuid"
}
```

This enables ranking and search-quality analysis.

---

# 23. Product View Event

Recommended:

```json
{
  "product_id": "prod_123",
  "supplier_listing_id": "listing_123",
  "source": "search",
  "position": 4
}
```

If the buyer entered through category browsing:

```text
source = category
```

If through reorder:

```text
source = reorder
```

Use a controlled source taxonomy.

---

# 24. Cart Events

### `cart_item_added`

Properties:

```text
product_id
supplier_listing_id
quantity
source
```

### `cart_item_quantity_changed`

Properties:

```text
product_id
old_quantity
new_quantity
```

### `cart_item_removed`

Properties:

```text
product_id
quantity
reason
```

The client event is behavioral analytics only. Actual cart state remains server-authoritative.

---

# 25. Checkout Events

Recommended sequence:

```text
checkout_started
address_selected
delivery_mode_selected
delivery_slot_selected
payment_method_selected
payment_initiated
payment_succeeded
order_created
```

A buyer may revisit earlier steps. Events should therefore include:

```text
checkout_session_id
```

where needed.

---

# 26. Checkout Abandonment

Do not create a special client event called `checkout_abandoned` merely because a session ends.

Prefer deriving abandonment from:

- checkout started
- no order creation
- defined inactivity window

If explicit exit behavior is required, track:

```text
checkout_exited
```

and document its semantics.

---

# 27. Payment Events

Payment events must distinguish attempted, successful, and failed behavior.

Recommended:

```text
payment_initiated
payment_succeeded
payment_failed
payment_cancelled
refund_requested
refund_completed
```

Do not collect:

- full card number
- CVV
- OTP
- bank credentials
- payment secrets

Use provider transaction references only when safe and required.

---

# 28. Order Events

Authoritative order events should originate server-side.

Examples:

```text
order_created
order_confirmed
order_cancelled
order_completed
```

Client applications may emit:

```text
order_confirmation_viewed
order_details_viewed
```

Do not treat a client-side `order_created` event as proof that an order exists.

---

# 29. Multi-Supplier Analytics

Because one buyer order may contain multiple supplier fulfillments, analytics must support:

```text
order_id
fulfillment_id
supplier_id
```

Supplier metrics must operate at fulfillment/supplier grain where appropriate.

Do not calculate supplier performance by simply counting customer orders.

---

# 30. Inventory Interaction Events

Recommended product-facing events:

```text
stock_status_viewed
out_of_stock_viewed
alternative_supplier_viewed
```

Supplier-facing events:

```text
inventory_update_started
inventory_update_completed
inventory_sync_failed
```

Actual stock remains authoritative in the inventory domain.

---

# 31. Delivery Events

Customer behavioral events:

```text
delivery_tracking_viewed
delivery_contact_attempted
delivery_help_opened
```

Server-side operational events:

```text
delivery_booked
driver_assigned
out_for_delivery
delivery_delayed
delivery_failed
delivery_completed
```

---

# 32. Scheduled Delivery Events

Recommended:

```text
scheduled_delivery_viewed
delivery_slot_selected
scheduled_delivery_reminder_viewed
scheduled_order_dispatched
scheduled_order_delivered
```

Useful properties:

```text
delivery_date
slot_id
delivery_mode
```

---

# 33. Supplier Portal Analytics

Supplier-specific product analytics should measure:

```text
supplier_dashboard_viewed
supplier_order_list_viewed
supplier_order_opened
supplier_fulfillment_accepted
supplier_fulfillment_rejected
supplier_inventory_opened
supplier_inventory_updated
supplier_product_created
supplier_product_updated
supplier_product_submitted
```

Supplier events must carry supplier scope server-side.

---

# 34. Admin Analytics

Admin analytics should measure operational usage without collecting unnecessary sensitive information.

Examples:

```text
admin_dashboard_viewed
supplier_review_opened
supplier_verified
supplier_rejected
product_review_opened
product_approved
product_rejected
order_exception_opened
support_case_opened
recall_case_opened
```

Administrative actions should also produce audit records through the audit subsystem. Product analytics is not a replacement for audit logging.

---

# 35. Support Analytics

Recommended behavioral events:

```text
support_opened
support_case_started
support_case_created
support_article_viewed
support_case_message_sent
support_case_closed
```

Do not put confidential support conversations into general analytics properties.

---

# 36. Event Property Governance

Every event must define:

### Required properties

Fields needed to interpret the event.

### Optional properties

Fields that improve analysis but may not always exist.

### Controlled values

Enumerations that must not drift.

### Sensitive properties

Fields requiring restricted access.

Example contract:

```text
Event:
product_viewed

Version:
1

Required:
product_id
occurred_at

Optional:
supplier_listing_id
source
position

Sensitive:
none

Owner:
Product Analytics
```

---

# 37. Analytics SDK

Create a shared analytics package.

Suggested monorepo location:

```text
packages/analytics/
├── core/
├── schema/
├── web/
├── mobile/
├── server/
└── testing/
```

Responsibilities:

- event construction
- validation
- identity management
- session management
- batching
- retry
- local buffering where appropriate
- transport
- environment configuration
- debug mode

Business components should call a stable SDK API rather than directly constructing network requests.

---

# 38. Client SDK API

Illustrative interface:

```ts
analytics.track("product_viewed", {
  product_id,
  supplier_listing_id,
  source,
});
```

The SDK adds the canonical envelope automatically.

Avoid:

```ts
fetch("/analytics", {
  body: JSON.stringify(...)
});
```

inside individual screens.

---

# 39. Server Analytics API

Server modules should use a common event publisher.

Illustrative:

```ts
await analytics.publish({
  name: "order_created",
  version: 1,
  actor: {
    type: "system",
  },
  properties: {
    order_id,
    buyer_id,
  },
});
```

Domain events and analytics events may share infrastructure but must retain clear semantics.

---

# 40. Batching

Client events may be batched to reduce network overhead.

Example:

```text
events[]
```

Batching must not delay critical transactional operations.

A failed analytics request must not cause:

- checkout failure
- payment failure
- order creation failure
- fulfillment failure

Analytics is non-blocking unless explicitly required for a controlled experiment or security workflow.

---

# 41. Retry Strategy

Analytics delivery should support:

```text
retry with backoff
dead-letter handling
deduplication
replay
```

Client-side retry should be bounded to prevent infinite battery/network usage.

Server-side retry must be idempotent.

---

# 42. Offline Mobile Tracking

Mobile applications may temporarily buffer non-sensitive analytics events when offline.

Requirements:

- bounded local storage
- expiration policy
- replay after connectivity returns
- duplicate protection
- no sensitive secrets
- no unbounded event accumulation

Transactional operations must not depend on offline analytics delivery.

---

# 43. Event Validation

Validate events before durable ingestion.

Validation should check:

- event name
- version
- required fields
- field types
- controlled values
- maximum string lengths
- timestamp validity
- payload size
- prohibited sensitive fields

Invalid events should be rejected or quarantined without affecting the user-facing transaction.

---

# 44. Event Size Limits

Set an explicit maximum payload size.

Large objects must not be embedded in events.

Do not send:

```text
images
documents
full API responses
full product objects
full order objects
```

Send stable identifiers and small analytical properties instead.

---

# 45. Duplicate Detection

Deduplicate using:

```text
event_id
```

For events requiring stronger guarantees, use a composite business key where appropriate.

Example:

```text
order_id + event_type + event_version
```

Do not assume network retries mean the event happened twice.

---

# 46. Event Ordering

Events may arrive out of order.

Store:

```text
occurred_at
ingested_at
```

Use `occurred_at` for behavioral sequencing when valid.

Do not assume ingestion order equals user-action order.

Server domain events may include sequence/version information where required.

---

# 47. Late Events

The warehouse must support late-arriving events.

Examples:

- mobile device was offline
- network was interrupted
- queue processing was delayed

The pipeline should update affected aggregates when late events are accepted.

---

# 48. Event Reprocessing

Raw events should support controlled replay.

Replay must include:

```text
source range
event type
event version
target dataset
replay reason
operator
start time
end time
```

Replay jobs must be idempotent.

---

# 49. Funnel Definitions

Initial buyer funnel:

```text
session_started
    ↓
search_submitted / category_viewed
    ↓
product_viewed
    ↓
cart_item_added
    ↓
checkout_started
    ↓
payment_succeeded
    ↓
order_created
```

Do not mix behavioral and authoritative events without documenting the distinction.

---

# 50. Funnel Segmentation

Every important funnel should support segmentation by:

```text
platform
app_version
buyer cohort
geography
product category
delivery mode
payment method
acquisition source
supplier
```

Supplier-specific reporting must remain isolated.

---

# 51. Conversion Definitions

Each conversion metric requires a written definition.

Example:

```text
Product-to-cart conversion

Numerator:
Sessions with cart_item_added after product_viewed.

Denominator:
Sessions with product_viewed.

Attribution window:
Same session unless explicitly changed.

Owner:
Product Analytics.
```

Do not change attribution windows without versioning the metric definition.

---

# 52. Cohort Analytics

Buyer cohorts may be defined by:

```text
first registration date
first order date
first successful payment date
acquisition source
geography
buyer segment
```

Core measures:

```text
retention
repeat purchase
orders per buyer
GMV
average order value
category expansion
```

Cohort definitions must be stable and documented.

---

# 53. Retention

Define retention explicitly.

Example:

```text
30-day buyer retention:
Percentage of buyers who perform the defined retained action within 30 days of cohort start.
```

The retained action may be:

```text
order_created
```

rather than merely:

```text
app_opened
```

depending on the business question.

---

# 54. Reorder Analytics

Bezzo is a repeat-procurement marketplace, so reorder behavior is important.

Track:

```text
reorder_started
reorder_item_added
reorder_completed
```

Recommended properties:

```text
source_order_id
product_count
```

Do not copy the entire source order into the event.

---

# 55. Recommendation Analytics

When recommendations are displayed, log:

```text
recommendation_impression
recommendation_clicked
recommendation_added_to_cart
recommendation_ordered
```

Required attribution fields:

```text
recommendation_id
model_version
placement
position
product_id
```

This enables recommendation performance analysis.

---

# 56. Experimentation

Experiments must have:

```text
experiment_id
experiment_version
variant_id
subject_id
assignment_timestamp
exposure_event
```

Recommended event:

```text
experiment_exposed
```

An assignment alone does not mean the user actually saw the experiment.

---

# 57. Experiment Guardrails

Every experiment should define:

- primary metric
- secondary metrics
- guardrail metrics
- eligible population
- exclusion criteria
- start/end dates
- owner
- experiment version

Guardrails may include:

```text
payment failure
checkout failure
API errors
cancellation
support contacts
delivery failures
```

Experiments must not bypass pharmaceutical, payment, security, or compliance controls.

---

# 58. Experiment Assignment

Prefer deterministic assignment.

Example conceptual key:

```text
hash(subject_id + experiment_id)
```

The implementation must prevent users from repeatedly switching variants.

Assignment must be auditable.

---

# 59. Product Analytics Dashboard

Initial dashboard sections:

### Acquisition / activation

- registrations
- onboarding completion
- verified buyers
- verified suppliers

### Discovery

- searches
- zero-result rate
- product views
- search-to-view rate

### Commerce

- add-to-cart
- checkout starts
- payment success
- orders

### Retention

- repeat buyers
- reorder rate
- cohort retention

### Experience

- cancellations
- delivery issues
- support cases

---

# 60. Supplier Product Analytics Dashboard

Supplier portal may show:

```text
Product views
Orders
Units sold
Fill rate
Stock-outs
Conversion
Cancellation rate
```

Only the supplier's own records should be included.

---

# 61. Data Privacy Rules

Never track:

- passwords
- OTP values
- access tokens
- card numbers
- CVV
- bank credentials
- government identity document contents
- uploaded compliance-document contents

Avoid collecting full addresses, phone numbers, or email addresses when an identifier is sufficient.

Search queries, support interactions, and other potentially sensitive behavioral data require explicit retention/access classification.

---

# 62. Consent and Preference Handling

Where applicable, distinguish:

```text
necessary operational telemetry
product analytics
marketing/promotional tracking
```

Do not assume marketing consent from account creation.

The event pipeline must support configured consent/privacy behavior without breaking required operational records.

---

# 63. Data Retention

Retention should follow the Bezzo data lifecycle specification.

Define separate retention policies for:

```text
raw events
aggregated events
experimentation data
product analytics
security events
financial events
audit records
```

Required legal, financial, audit, and compliance records must follow their own retention requirements.

---

# 64. Event Access Controls

Recommended roles:

```text
PRODUCT_ANALYST
DATA_ANALYST
DATA_ENGINEER
DATA_SCIENTIST
MARKETING_ANALYST
OPERATIONS_ANALYST
COMPLIANCE_ANALYST
```

Sensitive event datasets require restricted access.

Supplier users should never receive global raw event data.

---

# 65. Analytics Debug Mode

Development builds should support an analytics debug mode.

Example:

```text
Analytics Debug Panel
- event name
- version
- properties
- timestamp
- delivery status
```

Debug mode must be disabled or tightly restricted in production.

---

# 66. Automated Event Tests

Each critical screen/workflow should have tests that verify expected events.

Example:

```text
Open product page
    -> product_viewed emitted once

Add item to cart
    -> cart_item_added emitted once

Start checkout
    -> checkout_started emitted once
```

Tests must also verify:

- required properties
- correct identifiers
- correct event version
- no sensitive fields
- no duplicate emission from component rerenders

---

# 67. Contract Testing

Event contracts should be tested in CI.

For each event:

```text
schema validation
required field validation
type validation
enum validation
payload size validation
privacy validation
```

Breaking changes should fail CI unless explicitly versioned.

---

# 68. Analytics QA Matrix

Test across:

```text
Web
Android
iOS
```

and:

```text
anonymous user
buyer
supplier
admin
```

Test:

```text
online
offline/reconnected
slow network
API failure
session expiry
login transition
app background/foreground
duplicate taps
retry
```

---

# 69. Observability

Track:

```text
events_received
events_accepted
events_rejected
events_duplicated
events_failed
events_replayed
ingestion_latency
processing_latency
warehouse_freshness
```

Break down errors by:

```text
platform
app_version
event_name
event_version
source
```

---

# 70. Analytics Health Alerts

Examples:

```text
event rejection rate > threshold
event ingestion lag > SLA
critical event volume suddenly drops
duplicate rate increases
schema validation failures spike
warehouse freshness exceeds target
```

Critical transactional analytics gaps should alert the responsible engineering/data owner.

---

# 71. Event Volume Monitoring

Monitor high-volume events such as:

```text
screen_viewed
product_viewed
search_submitted
```

against lower-volume events such as:

```text
order_created
payment_succeeded
refund_completed
```

A sudden drop in a critical business event may indicate an application or ingestion failure.

---

# 72. Metric Lineage

Every important product metric should be traceable:

```text
Dashboard Metric
    ↓
Metric Definition
    ↓
Event / Fact Dataset
    ↓
Raw Events
    ↓
Source Application
```

For metrics based on authoritative transactional records, lineage must identify the operational domain.

---

# 73. Event-to-Transaction Reconciliation

Critical events should be reconciled against authoritative records.

Examples:

```text
order_created events
vs
orders in operational DB

payment_succeeded events
vs
successful payment records

delivery_completed events
vs
completed deliveries
```

A mismatch should be observable and investigated.

---

# 74. Failure Isolation

Analytics failures must not break core marketplace operations.

For example:

```text
Analytics ingestion unavailable
        |
        v
Order service continues
        |
        v
Order remains successful
        |
        v
Event is retried/replayed later
```

This is a hard architectural requirement for non-critical product analytics.

---

# 75. Implementation Structure

Suggested monorepo:

```text
packages/
  analytics/
    src/
      client/
      server/
      schemas/
      identity/
      session/
      transport/
      batching/
      validation/
      testing/

apps/
  web/
  mobile/
  api/
```

Event schemas should be shared where practical.

---

# 76. Configuration

Analytics configuration should include:

```text
analytics_enabled
environment
ingestion_endpoint
batch_size
flush_interval
retry_limit
session_timeout
sampling_rules
consent_mode
debug_mode
```

Production configuration must come from controlled environment/configuration management.

---

# 77. Sampling

Sampling may be used for very high-volume non-critical events.

Potential candidates:

```text
screen_viewed
low-value interaction events
```

Do not sample:

```text
order_created
payment_succeeded
refund_completed
supplier_verified
compliance-critical events
```

Sampling rules must be documented.

---

# 78. Backward Compatibility

Mobile applications remain in the field after release.

The backend must therefore support multiple event versions simultaneously where necessary.

Example:

```text
Android 1.0 -> event_version 1
Android 1.1 -> event_version 2
```

Old app versions must not corrupt the event pipeline.

---

# 79. Analytics Release Checklist

Before releasing a feature:

- [ ] Events identified
- [ ] Event names approved
- [ ] Event schemas versioned
- [ ] Required properties documented
- [ ] Privacy classification completed
- [ ] SDK instrumentation implemented
- [ ] Server events implemented where authoritative
- [ ] Duplicate behavior tested
- [ ] Offline behavior tested
- [ ] Event contracts tested
- [ ] Funnel definition documented
- [ ] Dashboard/metric dependencies identified
- [ ] Monitoring configured
- [ ] No sensitive secrets are collected

---

# 80. Definition of Done

Analytics instrumentation is complete when:

1. Every required user journey has defined events.
2. Event names follow the taxonomy.
3. Every event has a version.
4. Required properties are validated.
5. Client and server instrumentation use the shared analytics infrastructure.
6. Critical business events originate from authoritative server-side sources.
7. Duplicate events are safely handled.
8. Offline/retry behavior is defined where applicable.
9. Privacy classification is complete.
10. Retention is defined.
11. Event contracts are tested.
12. Monitoring and freshness checks exist.
13. Product funnels and metrics have documented definitions.
14. Supplier/buyer access boundaries are enforced.
15. Analytics failures cannot break core transactional workflows.

---

# 81. Initial Implementation Sequence

## Phase 1 — Foundation

1. Shared analytics package
2. Event envelope
3. Event schemas
4. Validation
5. Ingestion endpoint
6. Raw event storage
7. Basic monitoring

## Phase 2 — Buyer Journey

8. Registration
9. Login
10. Search
11. Product views
12. Cart
13. Checkout
14. Payment
15. Order

## Phase 3 — Marketplace Operations

16. Supplier events
17. Inventory interactions
18. Fulfillment
19. Logistics
20. Delivery
21. Support

## Phase 4 — Analytics Productization

22. Funnels
23. Cohorts
24. Retention
25. Reorder analytics
26. Supplier analytics
27. Recommendation analytics

## Phase 5 — Experimentation

28. Experiment assignment
29. Exposure tracking
30. Experiment dashboards
31. Guardrail monitoring

---

# 82. Acceptance Criteria

The product analytics system is production-ready when:

- Web, Android, and iOS emit consistent event schemas.
- Server-side transactional events are authoritative.
- Event versions are supported.
- Duplicate events are safely handled.
- Failed ingestion does not break checkout or ordering.
- Search and checkout funnels can be measured.
- Reorder behavior can be measured.
- Supplier analytics are tenant-isolated.
- Sensitive information is excluded or controlled.
- Analytics data has documented retention.
- Event contracts are automatically tested.
- Pipeline freshness is measurable.
- Critical event gaps generate alerts.
- Experiments can be assigned and measured reproducibly.
- Product metrics can be traced back to event/data sources.

---

# 83. Final Standard

Bezzo analytics should follow this principle:

```text
Instrument once
      ↓
Validate centrally
      ↓
Store reliably
      ↓
Define metrics once
      ↓
Reuse everywhere
      ↓
Measure behavior consistently
      ↓
Protect user and business data
```

The system should remain intentionally disciplined: a smaller, well-governed event taxonomy is preferable to thousands of inconsistent events.

Analytics should help Bezzo understand and improve the marketplace without becoming a dependency that can block core commerce, payment, fulfillment, logistics, or compliance workflows.

---

**Document End**

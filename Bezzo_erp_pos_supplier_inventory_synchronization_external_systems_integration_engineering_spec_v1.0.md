# Bezzo ERP/POS, Supplier Inventory Synchronization & External Systems Integration Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Status:** Draft for Implementation  
**Version:** 1.0  
**Primary Scope:** ERP/POS integration, supplier inventory synchronization, catalog synchronization, batch/expiry synchronization, external system adapters, imports, webhooks, reconciliation, idempotency, failure recovery, security, and operational monitoring

---

# 1. Purpose

This specification defines how Bezzo integrates with external supplier systems and other third-party platforms without compromising transactional correctness.

The primary integration use case is supplier inventory synchronization from systems such as:

- ERP
- pharmacy/wholesale POS
- inventory management software
- accounting/commerce systems
- supplier APIs
- CSV/Excel exports
- SFTP/file feeds
- manually uploaded files

The architecture must support the current manual supplier inventory workflow while providing a controlled migration path toward automated synchronization.

The design also establishes common standards for:

- external APIs
- webhooks
- polling
- file imports
- outbound APIs
- credentials
- mapping
- reconciliation
- retries
- idempotency
- error handling
- monitoring
- tenant isolation
- data quality
- integration lifecycle management

---

# 2. Architectural Principle

External systems are not trusted as authoritative Bezzo state.

The integration flow is:

```text
External System
      |
      v
Integration Adapter
      |
      v
Validation / Mapping
      |
      v
Integration Staging
      |
      v
Domain Validation
      |
      v
Bezzo Domain Service
      |
      v
Operational Source of Truth
```

For inventory:

```text
Supplier ERP/POS
      |
      v
Inventory Adapter
      |
      v
Mapping + Validation
      |
      v
Inventory Sync Service
      |
      v
Bezzo Inventory
      |
      v
Search / Marketplace / Analytics
```

The adapter must never directly modify arbitrary database tables.

---

# 3. Existing Bezzo Architecture Alignment

The Bezzo implementation direction already requires:

- idempotency for external and transactional operations
- background workers for integrations
- Porter behind a logistics abstraction
- payment providers behind a payment abstraction
- PostgreSQL as the operational database
- Redis/queues for asynchronous work
- OpenSearch-compatible search
- object storage for files
- monitoring and audit logging

The integration architecture must follow those same boundaries.

---

# 4. Integration Types

Bezzo should support the following integration patterns.

## 4.1 REST API

```text
Bezzo → Supplier API
Supplier API → Bezzo
```

Used for:

- inventory
- product data
- order status
- supplier acknowledgements
- fulfillment updates

## 4.2 Webhooks

```text
External System
      |
      v
Bezzo Webhook Endpoint
```

Used when the external system can push changes.

## 4.3 Polling

```text
Scheduled Worker
      |
      v
External API
      |
      v
Incremental Changes
```

Used when webhooks are unavailable.

## 4.4 File-Based Integration

Supported formats may include:

```text
CSV
XLSX
JSON
XML
SFTP files
```

File imports are useful for suppliers whose systems cannot provide APIs.

## 4.5 Manual Import

Supplier/admin may upload a structured file.

Manual imports must use the same validation and mapping pipeline as automated imports.

---

# 5. Integration Abstraction

Create a common interface.

Illustrative:

```ts
interface ExternalIntegrationAdapter {
  testConnection(): Promise<ConnectionTestResult>;
  pullChanges(input: PullChangesInput): Promise<ExternalRecord[]>;
  pushChanges?(input: PushChangesInput): Promise<PushResult>;
  handleWebhook?(input: WebhookInput): Promise<WebhookResult>;
}
```

Domain-specific adapters should extend this pattern.

Example:

```text
InventoryIntegrationAdapter
ProductCatalogIntegrationAdapter
OrderIntegrationAdapter
FulfillmentIntegrationAdapter
```

---

# 6. Supplier Integration Model

Each supplier may have:

```text
integration_status
integration_type
provider
credentials
mapping
sync_frequency
last_successful_sync
last_attempted_sync
last_error
```

Example statuses:

```text
NOT_CONFIGURED
CONFIGURED
CONNECTION_TESTING
ACTIVE
DEGRADED
PAUSED
DISABLED
```

Supplier integration configuration must be tenant-scoped.

---

# 7. Integration Configuration

Recommended fields:

```text
integration_id
supplier_id
integration_type
provider_name
environment
status
sync_mode
sync_frequency
base_url
credential_reference
last_sync_started_at
last_sync_completed_at
last_successful_sync_at
created_at
updated_at
```

Secrets must never be stored directly in ordinary business tables as plaintext.

---

# 8. Credential Management

Credentials should be stored in a secrets-management system.

Examples:

```text
API key
OAuth client credentials
OAuth refresh token
username/password
SFTP private key
certificate
```

The application database should store only:

```text
secret_reference
credential_type
rotation metadata
```

Do not expose credentials through supplier dashboards.

---

# 9. Integration Environments

Support:

```text
SANDBOX
PRODUCTION
```

where the external provider supports separate environments.

Never accidentally point a staging/test application at a supplier's production account without explicit configuration.

---

# 10. Connection Testing

Before enabling synchronization:

```text
Configure credentials
      ↓
Test connection
      ↓
Authenticate
      ↓
Check permissions
      ↓
Retrieve sample data
      ↓
Validate mapping
      ↓
Enable sync
```

Connection testing should not modify supplier production data.

---

# 11. Inventory Synchronization Modes

Support:

```text
MANUAL
FILE_IMPORT
POLLING
WEBHOOK
API_PUSH
HYBRID
```

A supplier can initially use manual inventory management and later enable automated synchronization.

---

# 12. Inventory Source of Truth

For a synchronized supplier, the supplier's external system may be the source for incoming inventory information.

However, Bezzo remains authoritative for marketplace state such as:

- reservations
- allocated quantity
- order deductions
- quarantines
- recall blocks
- marketplace availability
- safety buffers

Therefore:

```text
External Stock
      ↓
Bezzo Available Stock Calculation
```

must not simply overwrite operational reservations.

---

# 13. Inventory Quantity Model

At minimum distinguish:

```text
external_quantity
available_quantity
reserved_quantity
quarantined_quantity
blocked_quantity
```

A conceptual calculation may be:

```text
available =
validated_external_quantity
- active_reservations
- blocked_quantity
- quarantined_quantity
```

The exact operational formula must remain owned by the inventory domain.

---

# 14. Batch Synchronization

Pharmaceutical inventory must support batch-level synchronization where the supplier provides it.

Recommended fields:

```text
external_batch_id
product_id
batch_number
manufacturing_date
expiry_date
quantity
mrp
purchase_price
selling_price
storage_condition
```

Do not collapse distinct batches into one anonymous stock quantity when batch traceability is required.

---

# 15. Batch Identity

Use a stable internal batch identifier.

Recommended mapping:

```text
supplier_id
external_product_id
external_batch_id
```

may form the external identity mapping.

The internal `batch_id` remains the Bezzo identifier.

---

# 16. Expiry Synchronization

If expiry dates are supplied:

```text
external expiry
      ↓
validate
      ↓
store
      ↓
apply expiry policy
```

Invalid or missing expiry information must be handled according to the product/batch governance policy.

The integration must not bypass Bezzo expiry controls.

---

# 17. FEFO Compatibility

Where FEFO is enabled, synchronized batch information must preserve:

```text
expiry_date
batch_id
available_quantity
```

This allows the inventory/fulfillment domain to apply the configured FEFO logic.

The external integration must not directly choose which batch gets shipped unless explicitly supported by the fulfillment contract.

---

# 18. Product Mapping

External product identifiers may differ from Bezzo canonical product IDs.

Maintain a mapping table:

```text
supplier_id
integration_id
external_product_id
bezzo_product_id
external_sku
mapping_status
mapping_confidence
created_at
updated_at
```

Possible statuses:

```text
UNMAPPED
SUGGESTED
PENDING_REVIEW
MAPPED
REJECTED
DISABLED
```

---

# 19. Supplier Listing Mapping

A supplier's external SKU should normally map to the supplier's Bezzo listing rather than directly changing the canonical product.

Conceptually:

```text
Canonical Product
       |
       +--- Supplier Listing
                 |
                 +--- External SKU
```

This preserves multi-supplier catalog architecture.

---

# 20. Mapping Rules

Mapping should consider:

```text
external SKU
manufacturer
brand
generic name
composition
strength
dosage form
pack size
barcode/GTIN where available
```

Automatic mapping must not silently merge uncertain products.

Low-confidence matches should enter review.

---

# 21. Catalog Synchronization

Supplier systems may provide:

```text
product
price
MRP
inventory
batch
expiry
manufacturer
pack size
status
```

The catalog integration must distinguish:

```text
canonical product attributes
supplier-specific listing attributes
inventory attributes
```

Supplier data must not overwrite centrally governed canonical catalog fields without authorization.

---

# 22. Price Synchronization

External price updates should pass through the Bezzo pricing/commercial rules.

Flow:

```text
External Price
      ↓
Validate
      ↓
Normalize
      ↓
Commercial Rules
      ↓
Supplier Listing Price
      ↓
Marketplace
```

Do not allow an external feed to bypass:

- configured pricing rules
- minimum/maximum validation
- promotion rules
- tax treatment
- approval requirements

where applicable.

---

# 23. MRP Handling

If MRP is synchronized, store it separately from supplier selling price.

Example:

```text
mrp
supplier_price
discount
tax
```

Do not infer one from another.

Historical orders must retain their actual transaction-time pricing.

---

# 24. Inventory Sync Pipeline

Recommended:

```text
Fetch/Pull
   ↓
Raw Payload
   ↓
Schema Validation
   ↓
Normalization
   ↓
Product/SKU Mapping
   ↓
Batch Validation
   ↓
Business Validation
   ↓
Change Detection
   ↓
Inventory Update
   ↓
Reconciliation
   ↓
Search/Cache Invalidation
```

Each stage should be observable.

---

# 25. Staging Records

Do not directly process untrusted external records into production inventory.

Store staged records with:

```text
integration_record_id
supplier_id
external_record_id
received_at
payload_hash
payload
processing_status
validation_errors
processed_at
```

This supports replay and debugging.

---

# 26. Payload Hashing

Compute a deterministic payload hash where useful.

Purpose:

```text
same payload received twice
        ↓
detect unchanged record
        ↓
avoid unnecessary downstream processing
```

Do not use hashing as a replacement for business-level idempotency.

---

# 27. Incremental Synchronization

Prefer incremental synchronization when the external system supports:

```text
updated_since
cursor
change_token
sequence_id
webhook event
```

Avoid downloading the entire supplier catalog on every short interval when a change feed is available.

---

# 28. Full Synchronization

A full sync should still be supported for:

- initial onboarding
- recovery
- reconciliation
- mapping changes
- provider limitations

Full syncs should run asynchronously and be rate-controlled.

---

# 29. Sync Cursor

Maintain:

```text
integration_id
cursor
cursor_type
last_successful_value
updated_at
```

Never advance a cursor before the corresponding data has been safely processed.

---

# 30. Sync Failure Semantics

If processing fails after receiving a batch:

```text
do not silently advance cursor
```

Instead:

```text
retry
or
quarantine failed records
or
resume from durable checkpoint
```

This prevents silent data loss.

---

# 31. Webhook Security

Webhook endpoints must support:

- signature verification
- timestamp validation where supported
- replay protection
- payload validation
- rate limiting
- source verification where available
- idempotency

Never trust an unsigned external webhook merely because it came to the expected URL.

---

# 32. Webhook Idempotency

Store:

```text
provider
external_event_id
event_type
received_at
processed_at
status
```

If the same external event is delivered again:

```text
return successful/idempotent response
do not repeat business mutation
```

---

# 33. Webhook Processing

Recommended flow:

```text
Receive
  ↓
Authenticate
  ↓
Persist raw event
  ↓
Check duplicate
  ↓
Validate schema
  ↓
Queue processing
  ↓
Process domain change
  ↓
Record result
```

Do not perform long-running processing inside the public webhook request when avoidable.

---

# 34. Polling Strategy

Polling workers should support:

```text
initial delay
backoff
jitter
rate limits
cursor
timeout
retry
```

Do not synchronize every supplier at exactly the same second.

Use jitter to prevent traffic spikes.

---

# 35. Rate Limiting External APIs

Each provider integration must have configurable:

```text
requests_per_second
requests_per_minute
concurrency
page_size
retry_after handling
```

Respect provider limits.

Do not allow one supplier's integration to consume all worker capacity.

---

# 36. Integration Queue Isolation

High-volume integrations should not block critical marketplace jobs.

Use queues or concurrency pools for:

```text
inventory sync
catalog sync
order sync
webhook processing
reconciliation
```

Critical order/payment workflows must have priority over non-critical bulk imports.

---

# 37. Retry Policy

Retry transient failures:

```text
network timeout
5xx
rate limit
temporary provider outage
```

Do not blindly retry permanent failures:

```text
invalid credentials
invalid product mapping
invalid payload
permission denied
```

Use exponential backoff with jitter.

---

# 38. Dead-Letter Queue

Failed records that exceed retry limits should enter a dead-letter queue.

Record:

```text
integration_id
supplier_id
record_id
failure_code
failure_message
attempt_count
first_failed_at
last_failed_at
payload_reference
```

Operations must be able to inspect and replay eligible records.

---

# 39. Error Classification

Use stable error classes:

```text
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
RATE_LIMITED
NETWORK_ERROR
TIMEOUT
PROVIDER_ERROR
SCHEMA_ERROR
MAPPING_ERROR
VALIDATION_ERROR
DUPLICATE
CONFLICT
UNKNOWN
```

Map provider-specific errors into these internal categories.

---

# 40. Reconciliation

Every important external integration needs reconciliation.

Inventory reconciliation compares:

```text
external reported quantity
vs
Bezzo synchronized external quantity
vs
Bezzo operational available quantity
```

Differences should be explainable.

---

# 41. Inventory Drift

Track:

```text
external_quantity
bezzo_external_snapshot
difference
difference_timestamp
```

Large unexplained differences should create operational alerts.

---

# 42. Reconciliation Schedule

Possible schedules:

```text
real-time/continuous
hourly
daily
manual
```

Critical high-volume inventory integrations may require more frequent checks.

The exact frequency is configurable per supplier/provider.

---

# 43. Order Synchronization

If supplier ERP/POS supports order integration:

```text
Bezzo Order
      ↓
Supplier Integration
      ↓
External Order
```

The integration must preserve:

```text
bezzo_order_id
bezzo_fulfillment_id
external_order_id
```

Never use external IDs as the only internal order identity.

---

# 44. Order Acknowledgement

Supplier systems may return:

```text
accepted
rejected
partially accepted
backordered
```

These responses must map into the Bezzo fulfillment state machine.

The mapping must be explicit and validated.

---

# 45. Fulfillment Synchronization

External fulfillment updates may include:

```text
accepted
packed
ready
dispatched
cancelled
```

Map them through a controlled state-transition layer.

Do not allow arbitrary external status strings to mutate the order directly.

---

# 46. Inventory Reservation Boundary

A supplier ERP/POS synchronization must not independently release or consume Bezzo reservations.

Reservation remains controlled by the Bezzo inventory/order system.

External inventory feeds update the external-stock input.

---

# 47. Stock Conflict Handling

Example:

```text
ERP reports 10 units
Bezzo has 8 units available
2 units reserved
```

Do not blindly set available stock to 10.

The inventory domain recalculates availability according to its reservation/blocking model.

---

# 48. Negative Stock

External systems may report negative or inconsistent inventory.

Default behavior:

```text
reject/quarantine invalid quantity
```

Do not publish negative marketplace inventory.

The supplier should receive an actionable integration error.

---

# 49. Zero Stock

A valid external quantity of zero should normally synchronize as zero.

Zero is different from:

```text
missing
invalid
unknown
sync_failed
```

Do not treat sync failure as zero inventory.

---

# 50. Missing Records

If an external full feed omits a previously synchronized SKU, do not immediately assume it is deleted.

Use an explicit policy:

```text
missing_from_feed
```

followed by configured grace/reconciliation handling.

This prevents temporary provider/export errors from zeroing the catalog.

---

# 51. Product Deactivation

External product deactivation should map to supplier-listing state.

It must not automatically delete the canonical product.

Historical orders and analytics must remain intact.

---

# 52. Integration Mapping UI

Supplier/admin UI should provide:

```text
external SKU
external product name
candidate Bezzo product
mapping status
confidence
validation errors
```

Actions:

```text
map
change mapping
reject
disable
review
```

---

# 53. Bulk Mapping

Support controlled bulk mapping through CSV/XLSX.

Example:

```text
external_sku,bezzo_product_id
ABC123,prod_001
ABC124,prod_002
```

Validate all rows before applying where practical.

Provide:

```text
success count
failure count
error file/report
```

---

# 54. Import File Validation

For CSV/XLSX imports validate:

- file size
- extension
- MIME type
- required columns
- column types
- row limits
- duplicate external IDs
- invalid dates
- invalid quantities
- invalid product mappings

Do not partially mutate production state without recording exactly which rows succeeded/failed.

---

# 55. Import Preview

Manual imports should support:

```text
Upload
  ↓
Parse
  ↓
Preview
  ↓
Validation
  ↓
Error report
  ↓
Confirm
  ↓
Process
```

For high-risk catalog/batch changes, explicit confirmation should be required.

---

# 56. Import Versioning

Each import job should have:

```text
import_id
supplier_id
file_reference
schema_version
mapping_version
created_by
created_at
status
```

This provides traceability.

---

# 57. Integration Audit Log

Record:

```text
integration created
credentials changed
sync started
sync completed
sync failed
mapping changed
manual replay
integration paused
integration resumed
```

Sensitive credentials themselves must never be logged.

---

# 58. Integration Monitoring

Dashboard should show:

```text
integration status
last successful sync
last attempted sync
records received
records processed
records failed
records quarantined
latency
API errors
rate-limit events
```

---

# 59. Supplier Integration Dashboard

Each supplier should see only its own integration state.

Example:

```text
Integration:
ACTIVE

Last sync:
10:32 AM

Records:
12,480 received
12,470 processed
10 rejected

Inventory freshness:
4 minutes

Errors:
2 mapping errors
```

Avoid exposing provider secrets or internal infrastructure details.

---

# 60. Admin Integration Dashboard

Admins may see:

```text
all suppliers
provider
integration health
sync failures
drift
queue backlog
rate-limit events
credential expiry
```

Administrative access must be audited.

---

# 61. Inventory Freshness

Every synchronized inventory source should expose:

```text
last_successful_sync_at
```

Marketplace logic should be able to distinguish:

```text
fresh
stale
unknown
```

A stale feed must not be represented as current inventory.

---

# 62. Stale Inventory Policy

A configurable policy may define:

```text
fresh < X minutes
stale X-Y minutes
critical > Y minutes
```

If a feed becomes critically stale, the supplier listing may require:

```text
availability restriction
manual verification
temporary pause
```

The exact business action belongs to the inventory/commercial policy configuration.

---

# 63. ERP/POS Provider Registry

Maintain a provider registry:

```text
provider_id
provider_name
integration_type
supported_capabilities
api_version
status
```

Capabilities may include:

```text
INVENTORY_READ
BATCH_READ
PRODUCT_READ
PRICE_READ
ORDER_WRITE
ORDER_STATUS_READ
WEBHOOKS
```

---

# 64. Capability Negotiation

Do not assume every provider supports every feature.

The adapter should declare capabilities.

Example:

```text
Provider A:
inventory
batch
webhooks

Provider B:
inventory
polling only

Provider C:
inventory
orders
fulfillment
```

Application behavior should adapt to supported capabilities.

---

# 65. API Versioning

External providers may change APIs.

Store:

```text
provider_api_version
adapter_version
```

Adapters should isolate provider-specific version differences.

---

# 66. Provider Adapter Structure

Recommended:

```text
integrations/
├── core/
│   ├── contracts/
│   ├── errors/
│   ├── retry/
│   └── credentials/
├── inventory/
│   ├── adapter.ts
│   └── providers/
├── catalog/
│   └── providers/
├── orders/
│   └── providers/
└── files/
    └── csv/
```

Provider-specific logic must remain inside its adapter.

---

# 67. Integration Contract Tests

Each adapter must test:

```text
authentication
connection
pagination
mapping
inventory quantity
batch data
expiry data
error mapping
rate limits
webhooks
idempotency
```

Use provider sandbox/test environments where available.

---

# 68. External API Contract Testing

Do not rely exclusively on mocks.

Where feasible:

```text
unit tests
+
contract tests
+
sandbox integration tests
```

Provider API changes should be detected before production impact.

---

# 69. Integration Security

Controls include:

- encrypted transport
- secret storage
- credential rotation
- least-privilege provider credentials
- webhook signature verification
- IP/network restrictions where appropriate
- audit logging
- request validation
- rate limiting
- sensitive log filtering

---

# 70. Supplier Authorization Boundary

An authenticated supplier may configure only integrations belonging to that supplier.

The API must derive:

```text
supplier_id
```

from authenticated context.

Never rely only on a client-provided supplier ID.

---

# 71. Admin Override

Admins may need to:

```text
pause integration
resume integration
retry sync
force full sync
reprocess dead-letter records
change mapping
```

Every privileged action must be audited.

---

# 72. Integration Pause

When paused:

```text
new sync jobs stop
existing in-flight jobs may complete safely
webhooks may be acknowledged and queued according to policy
```

The supplier should see that data may become stale.

---

# 73. Credential Rotation

Support:

```text
create new credential
test new credential
switch active credential
revoke old credential
```

Do not require application redeployment for normal supplier credential rotation.

---

# 74. External API Outage

If provider becomes unavailable:

```text
retry transient failures
preserve last known good state
mark freshness appropriately
alert when threshold exceeded
```

Do not set inventory to zero solely because the provider is unavailable.

---

# 75. Data Correction

If a supplier corrects data externally:

```text
external correction
      ↓
new event/change
      ↓
validation
      ↓
Bezzo update
```

Historical transactional records must not be rewritten merely because current supplier data changed.

---

# 76. Historical Snapshotting

For important inventory integrations, retain snapshots or change history sufficient to answer:

```text
What stock did the supplier report?
When?
What did Bezzo receive?
What did Bezzo publish?
```

This is important for debugging disputes and operational reconciliation.

---

# 77. Inventory Change History

Recommended record:

```text
inventory_change_id
supplier_id
product_id
batch_id
source
external_reference
old_quantity
new_quantity
occurred_at
received_at
processed_at
reason
```

---

# 78. External Integration Events

Emit internal domain events such as:

```text
supplier_integration_activated
inventory_sync_started
inventory_sync_completed
inventory_sync_failed
inventory_sync_stale
external_inventory_changed
product_mapping_created
product_mapping_rejected
external_order_created
external_fulfillment_updated
```

These events feed:

- analytics
- notifications
- monitoring
- audit
- operational workflows

---

# 79. Integration Idempotency

Every external mutation must have an idempotency strategy.

Examples:

```text
provider + external_event_id
provider + external_order_id
integration + external_record_id + version
```

Do not create duplicate:

- orders
- fulfillment records
- inventory adjustments
- payments
- refunds

because of retries.

---

# 80. Concurrency

Inventory synchronization can race with buyer orders.

Example:

```text
ERP sync says 5
Buyer reserves 4
ERP sync says 2
```

Updates must use transactional locking/versioning appropriate to the inventory implementation.

External sync must not overwrite reservations.

---

# 81. Optimistic Versioning

Where the provider supplies a version/change sequence:

```text
external_version
```

store it and reject older updates.

This prevents:

```text
new update
   ↓
old delayed update
   ↓
new data overwritten by old data
```

---

# 82. Ordering Guarantees

If external events are ordered by sequence:

```text
sequence 101
sequence 102
sequence 103
```

store the last processed sequence and detect gaps.

If ordering cannot be guaranteed, use timestamps plus conflict/version rules.

---

# 83. Integration Backfill

A backfill should support:

```text
provider
supplier
date/time range
record type
dry run
```

Backfill must be idempotent.

---

# 84. Integration Data Quality Score

For operational monitoring, a supplier integration can expose:

```text
mapping completeness
inventory completeness
batch completeness
expiry completeness
freshness
error rate
```

A score is optional; raw metrics must remain available for diagnosis.

---

# 85. Launch Readiness for a Supplier Integration

Before activation:

- [ ] credentials tested
- [ ] provider capability verified
- [ ] mapping configured
- [ ] sample data validated
- [ ] inventory sync tested
- [ ] batch/expiry tested
- [ ] zero stock tested
- [ ] stale feed tested
- [ ] retry tested
- [ ] webhook tested where applicable
- [ ] reconciliation tested
- [ ] permissions tested
- [ ] audit logging tested
- [ ] monitoring enabled
- [ ] rollback/pause tested

---

# 86. Supplier Integration Onboarding Flow

```text
Supplier chooses integration
        ↓
Provider selection
        ↓
Credential/configuration
        ↓
Connection test
        ↓
Initial data pull
        ↓
Product mapping
        ↓
Validation
        ↓
Inventory preview
        ↓
Supplier confirmation
        ↓
Activation
        ↓
Continuous synchronization
```

---

# 87. Initial MVP Integration Strategy

Do not attempt to integrate every ERP/POS provider before launch.

Start with:

```text
Manual inventory
+
CSV/XLSX import
+
One controlled API integration
```

Then add providers based on actual supplier demand.

This keeps the architecture extensible without delaying the marketplace.

---

# 88. Recommended First API Integration

The first automated supplier integration should demonstrate:

```text
authentication
inventory read
product/SKU mapping
batch/expiry
incremental sync
error handling
reconciliation
```

Order write-back can be introduced after inventory synchronization is stable.

---

# 89. Operational Runbook

For a failed integration:

```text
1. Check provider status
2. Check credentials
3. Check last successful sync
4. Check queue backlog
5. Check error class
6. Inspect failed records
7. Retry transient failures
8. Correct mapping/configuration
9. Reprocess eligible records
10. Reconcile final state
```

---

# 90. Definition of Done

An external integration is complete when:

1. Adapter boundaries are defined.
2. Credentials are securely managed.
3. Connection testing works.
4. External IDs map to stable Bezzo IDs.
5. Incoming data is staged and validated.
6. Inventory synchronization is idempotent.
7. Batch/expiry information is preserved where supplied.
8. Reservations are not overwritten.
9. Webhooks are authenticated and deduplicated.
10. Polling uses durable cursors where applicable.
11. Retries and dead-letter handling exist.
12. Reconciliation exists.
13. Freshness is monitored.
14. Supplier/admin controls are tenant-safe.
15. Audit logging is enabled.
16. Provider failures preserve last known good state.
17. Replay/backfill is supported.
18. Integration tests pass.
19. Production monitoring is active.
20. Pause/rollback procedures are documented.

---

# 91. Final Architecture

Bezzo external integrations should follow:

```text
External Provider
       |
       v
Provider Adapter
       |
       v
Authenticated Input
       |
       v
Raw/Staging Record
       |
       v
Schema + Mapping Validation
       |
       v
Domain Validation
       |
       v
Idempotent Domain Mutation
       |
       v
Operational Source of Truth
       |
       +--> Search
       +--> Analytics
       +--> Notifications
       +--> Audit
       +--> Reconciliation
```

The central rule is:

**External systems provide data and integration events; Bezzo decides how that data is validated, reconciled, and incorporated into its own authoritative marketplace state.**

This architecture allows Bezzo to begin with manual supplier inventory and progressively support ERP/POS synchronization without rewriting the inventory, catalog, order, or fulfillment domains.

---

**Document End**

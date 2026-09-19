# Bezzo Inventory, Warehouse & Stock Management Specification v1.0

## 1. Purpose
Defines the authoritative inventory model for Bezzo across suppliers, warehouses, locations, SKUs, batches, expiry, reservations, allocations, adjustments, returns, recalls, reconciliation, and external inventory synchronization.

## 2. Core Principles
- Supplier inventory is tenant-isolated.
- PostgreSQL is the transactional source of truth.
- Search and Redis availability are optimization layers only.
- Final reservation checks must use authoritative inventory.
- Stock mutations are atomic and idempotent.
- Every material movement creates an immutable ledger entry.
- Expired, recalled, blocked, damaged, or quarantined stock cannot be sold.
- Batch and expiry data are preserved where applicable.
- Reservations have configurable expiry.
- External ERP/POS synchronization must not blindly overwrite newer transactions.

## 3. Domain Model
Core entities:
- Supplier
- Warehouse
- Storage Location
- Product
- SKU
- Supplier Offer
- Inventory Batch
- Inventory Balance
- Inventory Reservation
- Inventory Allocation
- Inventory Ledger Entry
- Stock Adjustment
- Stock Transfer
- Inventory Sync Job
- Inventory Sync Record
- Inventory Threshold
- Inventory Block
- Recall
- Inventory Reconciliation

A Product is the normalized marketplace identity. A SKU represents a commercial pack. A Supplier Offer represents a supplier-specific sellable offer. Inventory represents stock physically or operationally controlled by that supplier.

## 4. Warehouse and Location
A supplier may have multiple warehouses. A warehouse contains logical locations such as standard, cold-storage, quarantine, returns, damaged, expired, recall, picking, and packing areas.

Warehouse fields include supplier, name/code, address, operating hours, timezone, and status.

Location fields include warehouse, code, name, location type, temperature zone, and status.

## 5. Batch and Expiry
Where applicable, inventory is tracked by batch/lot.

Batch attributes include:
- batch number
- SKU
- supplier
- warehouse
- manufacturing date
- expiry date
- quantities
- MRP
- pricing
- manufacturer
- storage requirements
- status

Batch states:
`ACTIVE`, `BLOCKED`, `QUARANTINED`, `RECALLED`, `EXPIRED`, `DEPLETED`.

Expired, recalled, blocked, or quarantined batches must not be allocated to new customer orders.

## 6. Quantity Model
Recommended quantities:
- `on_hand_qty`
- `reserved_qty`
- `allocated_qty`
- `available_qty`
- `quarantined_qty`
- `damaged_qty`
- `blocked_qty`
- `expired_qty`

Conceptually:

`available_qty = on_hand_qty - reserved_qty - allocated_qty - quarantined_qty - damaged_qty - blocked_qty - expired_qty`

Stored derived values must remain consistent with the ledger.

## 7. Reservation
Reservation protects inventory during checkout.

Lifecycle:

`AVAILABLE → RESERVED → ALLOCATED → PICKED → PACKED → DISPATCHED → FULFILLED`

Failure/release paths include:
`RESERVED → RELEASED`
`RESERVED → EXPIRED`
`ALLOCATED → CANCELLED`
`ALLOCATED → RETURNED`

Reservation contains order, order item, supplier, warehouse, SKU, batch where applicable, quantity, timestamps, expiry, status, and release reason.

## 8. Concurrency and Overselling
Reservation must be atomic.

```text
BEGIN
→ lock inventory balance
→ calculate sellable quantity
→ verify requested quantity
→ increase reserved quantity
→ create reservation
→ write ledger entry
→ COMMIT
```

If stock is insufficient, rollback and return an inventory-unavailable result.

PostgreSQL row locking or equivalent transaction control is required. Redis may accelerate reads but cannot be the final authority.

## 9. Allocation
After order confirmation, reservation becomes fulfillment allocation.

Allocation identifies supplier, warehouse, SKU, batch, quantity, and fulfillment.

States:
`PENDING`, `ALLOCATED`, `PICKING`, `PICKED`, `PACKED`, `DISPATCHED`, `CANCELLED`, `FAILED`.

## 10. FEFO / FIFO
FEFO (First Expiry, First Out) is the default where batch/expiry information exists.

FIFO may be used where expiry is unavailable or supplier policy requires it.

Expired inventory must never be allocated.

## 11. Safety Stock
Suppliers may configure safety stock.

Example:
```text
Physical sellable stock = 50
Safety stock = 10
Marketplace-sellable quantity = 40
```

Configurable fields:
- `safety_stock_qty`
- `reorder_threshold_qty`
- `low_stock_threshold_qty`

## 12. Stock States
Operational states include:
- AVAILABLE
- LOW_STOCK
- OUT_OF_STOCK
- RESERVED
- PARTIALLY_RESERVED
- QUARANTINED
- BLOCKED
- DAMAGED
- EXPIRED
- RECALLED
- DEPLETED

Status should generally be derived from quantity and blocking conditions rather than freely edited.

## 13. Manual Stock Management
Supplier inventory users can:
- add stock
- reduce stock
- correct stock
- transfer stock
- block/unblock stock
- quarantine stock
- mark damaged/expired
- update batch
- configure thresholds

Every adjustment requires quantity, reason, user, timestamp, warehouse/location, and batch where applicable.

## 14. Bulk Import
Initial supported formats:
- CSV
- XLSX

Typical fields:
supplier SKU, product identifier, batch, expiry, warehouse code, quantity, MRP, selling price, safety stock, status.

Pipeline:

`Upload → Validate → Parse → Preview → Confirm → Apply → Result Report`

Invalid rows must not silently mutate inventory.

## 15. ERP / POS Synchronization
Future synchronization supports:
- REST APIs
- webhooks
- scheduled polling
- CSV/XLSX
- SFTP/import feeds where required

Sync records contain external system ID, supplier, SKU mapping, quantity, timestamps, idempotency key, status, and error information.

Absolute external quantities must be applied through auditable adjustments, not silent overwrites.

## 16. Inventory Ledger
The ledger is append-only and records:
- STOCK_RECEIVED
- STOCK_ADJUSTED
- STOCK_RESERVED
- STOCK_RELEASED
- STOCK_ALLOCATED
- STOCK_DEALLOCATED
- STOCK_PICKED
- STOCK_PACKED
- STOCK_DISPATCHED
- STOCK_RETURNED
- STOCK_QUARANTINED
- STOCK_UNQUARANTINED
- STOCK_BLOCKED
- STOCK_UNBLOCKED
- STOCK_DAMAGED
- STOCK_EXPIRED
- STOCK_RECALLED
- STOCK_TRANSFERRED
- STOCK_RECONCILED

Each entry records supplier, warehouse, location, SKU, batch, event type, quantity delta, before/after quantity, reference, reason, actor/source, and timestamp.

Historical ledger rows are never edited; corrections use compensating entries.

## 17. Receiving and Transfers
Receiving can capture inbound reference, warehouse, SKU, batch, manufacturing date, expiry, quantity, MRP, storage requirements, inspection result, user, and timestamp.

Transfers follow:

`REQUESTED → APPROVED → PICKED → IN_TRANSIT → RECEIVED → COMPLETED`

Batch identity must be preserved.

## 18. Reconciliation
Reconciliation compares system quantity against physical count or external systems.

`Create → Count → Compare → Review → Approve → Adjust → Close`

Capture expected quantity, counted quantity, variance, reason, approver, and adjustment reference.

## 19. Multi-Supplier Routing
When a supplier lacks stock, the order system may locate another eligible supplier.

Eligibility can consider:
- stock
- verification status
- delivery coverage
- product eligibility
- warehouse status
- delivery mode
- cutoff time
- supplier service configuration
- batch/expiry constraints

Stock must be reserved atomically; a search result showing stock is not authorization.

## 20. Search and Cart Integration
Search may maintain denormalized fields such as `in_stock`, `low_stock`, and supplier counts.

Final reservation must use authoritative inventory.

Cart quantity is not guaranteed inventory. Availability is revalidated at checkout.

## 21. Scheduled Delivery
Inventory decisions may consider requested delivery date/slot, warehouse hours, supplier processing capacity, and cutoff time. Logistics capacity remains a separate concern.

## 22. Returns and Disposition
Returned stock does not automatically become sellable.

`Returned → Inspection → Disposition`

Possible dispositions:
- RESTOCK
- QUARANTINE
- DAMAGED
- EXPIRED
- RECALL
- SUPPLIER_RETURN
- DESTROY_OR_DISPOSE

Only approved RESTOCK inventory returns to available stock.

## 23. Recall and Blocking
Blocks may target product, SKU, supplier, batch, warehouse, or location.

`Block/Recall → identify inventory → block → update availability → prevent allocation → flag affected orders → operational workflow`

Requires elevated authorization and audit logging.

## 24. Expiry Management
Scheduled jobs identify approaching expiry using configurable windows such as 30/60/90/180 days.

They should notify authorized users, prevent expired sale, update state, and create audit records.

## 25. Permissions
Recommended roles:
- Supplier Admin
- Inventory Manager
- Warehouse Staff
- Read Only
- Platform Admin

All authorization is enforced server-side. Supplier A cannot access Supplier B inventory.

## 26. Database Tables
Recommended tables:
```text
warehouses
warehouse_locations
inventory_balances
inventory_batches
inventory_reservations
inventory_allocations
inventory_ledger_entries
inventory_adjustments
inventory_transfers
inventory_transfer_items
inventory_sync_jobs
inventory_sync_records
inventory_thresholds
inventory_blocks
inventory_reconciliations
inventory_reconciliation_items
inventory_events
```

Important indexes include supplier/SKU, warehouse/SKU, warehouse/batch, SKU/expiry, reservation status/expiry, references, and timestamps.

## 27. API Surface
```http
GET    /v1/suppliers/{supplierId}/inventory
GET    /v1/suppliers/{supplierId}/inventory/{skuId}
POST   /v1/suppliers/{supplierId}/inventory/adjustments
POST   /v1/suppliers/{supplierId}/inventory/reservations
POST   /v1/suppliers/{supplierId}/inventory/reservations/{id}/release
POST   /v1/suppliers/{supplierId}/inventory/transfers
GET    /v1/suppliers/{supplierId}/inventory/ledger
POST   /v1/suppliers/{supplierId}/inventory/imports
POST   /v1/suppliers/{supplierId}/inventory/reconciliation
```

Internal APIs:
```http
POST /internal/inventory/check
POST /internal/inventory/reserve
POST /internal/inventory/release
POST /internal/inventory/allocate
POST /internal/inventory/deallocate
POST /internal/inventory/commit
POST /internal/inventory/block
POST /internal/inventory/unblock
```

All mutation endpoints require idempotency.

## 28. Events
Domain events include:
`InventoryStockReceived`, `InventoryAdjusted`, `InventoryReserved`, `InventoryReservationReleased`, `InventoryReservationExpired`, `InventoryAllocated`, `InventoryDeallocated`, `InventoryPicked`, `InventoryPacked`, `InventoryDispatched`, `InventoryReturned`, `InventoryBlocked`, `InventoryUnblocked`, `InventoryQuarantined`, `InventoryExpired`, `InventoryRecalled`, `InventoryTransferred`, `InventoryReconciled`.

Events include event ID, type, aggregate ID, supplier ID, timestamp, correlation ID, actor/source, and payload version.

## 29. Transactional Outbox
For critical events:

```text
BEGIN
→ update inventory
→ write ledger
→ write outbox event
COMMIT
→ worker publishes event
→ mark processed
```

This prevents committed inventory changes from losing their downstream event.

## 30. Performance
Inventory is part of the checkout critical path.

Requirements:
- low-latency availability reads
- predictable transactional reservations
- no unnecessary synchronous external calls during checkout
- asynchronous bulk imports
- indexed database queries
- controlled lock contention
- asynchronous event processing
- reconciliation jobs isolated from marketplace traffic

The product goal is a fast, responsive experience; literal zero latency is not assumed.

## 31. Security and Observability
Use tenant isolation, RBAC, least privilege, audit logs, encrypted transport/storage, secure uploads, rate limits, authenticated APIs, secret management, and server-authoritative quantity changes.

Monitor:
- reservation failures
- inventory check/reservation latency
- DB lock waits
- negative-balance attempts
- ERP sync failures
- outbox backlog
- reconciliation variance
- blocked/expired stock
- stockout rate
- supplier stock accuracy

## 32. Testing
Unit tests cover quantity calculations, reservations, expiry, FEFO, safety stock, status transitions, adjustments, and idempotency.

Integration tests cover PostgreSQL transactions, concurrent reservations, ledger/outbox behavior, synchronization, search updates, and returns.

Concurrency test example:
```text
Stock = 10
Buyer A requests 7
Buyer B requests 7

Expected:
Committed reservations never exceed 10.
```

End-to-end tests cover supplier stock creation, buyer checkout, reservation, confirmation, allocation, fulfillment, cancellation, and return.

## 33. Acceptance Criteria
Production acceptance requires:
1. Supplier inventory isolation.
2. Consistent available quantity.
3. No sale of expired/blocked/quarantined stock.
4. Atomic reservations.
5. Overselling prevention under concurrency.
6. Reservation release/expiry.
7. Allocation after confirmation.
8. Immutable audit trail.
9. Reasoned manual adjustments.
10. Validated bulk imports.
11. Idempotent external synchronization.
12. Search cannot authorize final reservation.
13. FEFO where applicable.
14. Returns require disposition.
15. Recall/block prevents allocation.
16. Reliable inventory events.
17. Server-side permissions.
18. Defined performance SLOs.
19. Monitoring and alerting.
20. Automated concurrency and failure tests.

## 34. Implementation Sequence
### Phase 1
Balances, supplier isolation, warehouses, manual adjustments, ledger, reservations.

### Phase 2
Checkout reservation, allocation, release, cancellation, fulfillment, multi-supplier routing.

### Phase 3
Batches, expiry, FEFO, quarantine, recalls, returns disposition.

### Phase 4
Bulk import, reconciliation, transfers, thresholds, notifications.

### Phase 5
ERP/POS mappings, APIs, webhooks, scheduled synchronization, conflict handling.

### Phase 6
Barcode scanning, mobile warehouse workflows, receiving, pick/pack, advanced analytics.

## 35. Definition of Done
- Schema and migrations exist.
- Inventory module is implemented.
- Supplier RBAC is enforced.
- Reservations are concurrency-safe.
- Ledger/audit records are immutable.
- Checkout/order integration is complete.
- Multi-supplier allocation works.
- Batch/expiry controls work.
- Returns and recalls integrate with inventory.
- Supplier inventory UI exists.
- Import/reconciliation workflows exist.
- Events publish reliably.
- Monitoring and alerts are configured.
- Unit, integration, concurrency, and E2E tests pass.
- Security review is complete.
- Production runbooks and recovery procedures exist.

## 36. Architecture Position
Bezzo inventory is a transactional business capability, not a numeric field on a product.

```text
Product
  ↓
SKU
  ↓
Supplier Offer
  ↓
Warehouse
  ↓
Location
  ↓
Batch
  ↓
Inventory Balance
  ↓
Reservation
  ↓
Allocation
  ↓
Fulfillment
```

PostgreSQL provides transactional authority, Redis provides performance support, search provides discovery optimization, and events connect inventory changes to the wider Bezzo platform. The model supports supplier-managed inventory today and ERP/POS synchronization, larger warehouse operations, multi-supplier fulfillment, and pharmaceutical batch controls as Bezzo scales.

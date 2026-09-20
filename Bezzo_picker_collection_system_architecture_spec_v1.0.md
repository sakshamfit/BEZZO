# Bezzo Picker Collection System Architecture Specification v1.0

**Product:** Bezzo B2B Pharmaceutical Marketplace  
**Module:** Picker / Collection Operations  
**Document Type:** System Architecture & Engineering Specification  
**Version:** 1.0  
**Status:** Implementation Ready

---

## 1. Purpose

This document defines the dedicated **Bezzo Picker Collection System**.

The picker is an operational worker who collects prepared pharmaceutical orders from wholesalers/suppliers and transports those packages to a designated Bezzo collection hub/main office. The picker system is therefore a **pickup and collection layer** between supplier fulfillment and the downstream delivery operation.

The system is conceptually similar to high-volume quick-commerce picker/task systems in that available work is continuously surfaced to eligible workers, but it is designed specifically for Bezzo's B2B pharmaceutical marketplace and its supplier-to-hub collection workflow.

Core flow:

```text
Retailer places scheduled order
        ↓
Bezzo Order
        ↓
Supplier Fulfillment
        ↓
Supplier prepares + packs order
        ↓
READY_FOR_PICKUP
        ↓
Pickup Assignment Engine
        ↓
Eligible Picker receives task
        ↓
Picker accepts
        ↓
Navigate to wholesaler
        ↓
Arrive + verify pickup
        ↓
Collect prepared packages
        ↓
Transport to Bezzo Collection Hub
        ↓
Hub scans + receives packages
        ↓
READY_FOR_DELIVERY
        ↓
Downstream delivery operation
```

---

# 2. Goals

## 2.1 Primary goals

The system must:

1. Automatically identify pickup work that is ready.
2. Match pickup work to eligible pickers using geography, availability, workload, capacity and operational rules.
3. Surface available tasks prominently on the picker mobile app.
4. Allow a picker to accept a task or pickup run.
5. Provide navigation to the wholesaler.
6. Verify the pickup using controlled identity/order/package mechanisms.
7. Record exactly which packages were collected.
8. Support multiple orders from the same wholesaler in one pickup task.
9. Support multiple wholesaler stops in a pickup run where operationally appropriate.
10. Route collected packages to the assigned Bezzo collection hub.
11. Allow the hub to scan and reconcile expected versus received packages.
12. Maintain a complete event/audit trail.
13. Handle partial pickup, failed pickup, missing package, damaged package and timeout scenarios.
14. Prevent unauthorized access to supplier, retailer and financial data.
15. Remain reliable under high concurrent order and worker activity.

## 2.2 Non-goals

The picker system does not replace:

- Order management
- Supplier inventory management
- Supplier portal
- Payment processing
- Core delivery provider integration
- Retailer account management
- Marketplace search/catalog
- Supplier financial settlement

The picker layer consumes the state produced by those systems and moves physical packages from supplier locations to Bezzo collection hubs.

---

# 3. Operational Model

## 3.1 Four operational dashboards

Bezzo has four primary operational interfaces:

1. Admin / Company Dashboard
2. Wholesaler / Supplier Dashboard
3. Retailer / Medical Store Dashboard
4. Picker / Worker App

The picker application is a specialized mobile workflow and must not expose the full supplier or admin dashboard.

## 3.2 Picker responsibility

A picker is responsible for:

- Accepting assigned pickup work.
- Reaching supplier locations.
- Confirming arrival.
- Verifying the correct orders/packages.
- Collecting packages.
- Recording exceptions.
- Transporting packages to the assigned collection hub.
- Completing hub handover.

The picker is not responsible for:

- Changing order prices.
- Editing supplier inventory.
- Approving suppliers.
- Approving retailer accounts.
- Processing payments.
- Editing customer addresses.
- Changing pharmaceutical product information.

---

# 4. Core Domain Relationship

```text
Retailer
   │
   ▼
Order
   │
   ▼
Fulfillment
   │
   │ READY_FOR_PICKUP
   ▼
PickupTask
   │
   ├───────────────┐
   ▼               ▼
PickupStop      PickupPackage
   │
   ▼
Wholesaler
   │
   ▼
Picker
   │
   ▼
Collection Hub
   │
   ▼
Hub Receiving
   │
   ▼
READY_FOR_DELIVERY
```

Important distinction:

- **Order** = what the retailer bought.
- **Fulfillment** = which supplier fulfills it.
- **PickupTask** = physical collection work generated from a ready fulfillment.
- **PickupRun** = an operational grouping of multiple pickup stops/tasks.
- **PickupPackage** = physical package/unit expected to move.
- **HubReceiving** = confirmation that packages physically arrived at the Bezzo hub.

---

# 5. Pickup Task Generation

A pickup task should be generated when a fulfillment reaches:

```text
READY_FOR_PICKUP
```

The system must not create a picker task merely because an order exists.

Supplier readiness is the primary trigger.

## 5.1 Preconditions

A fulfillment is eligible when:

- Supplier fulfillment is confirmed.
- Required inventory has been allocated/reserved.
- Supplier has prepared the order.
- Required packages exist.
- Package information is available.
- Pickup location is valid.
- Pickup window is active or approaching according to configuration.
- The fulfillment is not cancelled.
- The fulfillment has not already been successfully collected.

## 5.2 Example

```text
Fulfillment FUL-10231
Supplier: ABC Pharma Wholesaler
Area: Sigra
Orders: 4
Packages: 17
Pickup window: 10:30–11:00

Status:
READY_FOR_PICKUP
```

This creates an eligible pickup task.

---

# 6. Picker Task Discovery and Assignment

The picker app should not require workers to manually search the entire system for orders.

The backend continuously evaluates available work.

```text
Ready Fulfillment
      ↓
Eligibility Engine
      ↓
Geographic Matching
      ↓
Picker Availability
      ↓
Capacity Check
      ↓
Operational Priority
      ↓
Assignment
      ↓
Picker App
```

## 6.1 Assignment inputs

The assignment engine may consider:

- Picker current location.
- Supplier location.
- Distance.
- Estimated travel time.
- Pickup window.
- Supplier locality.
- Picker availability.
- Current active task count.
- Current package capacity.
- Vehicle type/capacity where applicable.
- Picker skill/authorization where applicable.
- Hub assignment.
- Existing pickup run.
- Supplier operating hours.
- Task priority.
- Task age.
- SLA risk.

## 6.2 Geographic matching

Location matching should be locality-aware rather than simply city-wide.

Example:

```text
Picker:
Sigra

Supplier:
Sigra

Distance:
1.8 km

Task:
4 orders / 17 packages
```

This should be considered before assigning a distant picker when a qualified nearby picker is available.

Geographic matching should use actual coordinates and configurable operational zones rather than hard-coded locality names.

---

# 7. Task Popup / Offer Experience

A picker should receive a prominent task offer.

Example:

```text
┌────────────────────────────────────┐
│         PICKUP AVAILABLE           │
│                                    │
│ 📍 1.8 km away                     │
│                                    │
│ ABC Pharma Wholesaler              │
│ Sigra, Varanasi                    │
│                                    │
│ 4 orders                           │
│ 17 packages                        │
│                                    │
│ Pickup window                      │
│ 10:30 – 11:00                      │
│                                    │
│ Estimated pickup time: 15 min      │
│                                    │
│        [ ACCEPT PICKUP ]            │
└────────────────────────────────────┘
```

The exact UI should follow the Bezzo design system.

## 7.1 Offer timeout

An assignment offer should have a configurable acceptance window.

Example configuration:

```text
offer_timeout_seconds = 20
```

The actual value must be configurable.

If the picker does not respond:

```text
OFFERED
   ↓ timeout
EXPIRED
   ↓
Return to assignment pool
```

## 7.2 Rejection

If a picker rejects:

```text
OFFERED
   ↓
REJECTED
   ↓
Assignment Engine
```

The rejection reason may be recorded for operational analytics.

---

# 8. Picker Availability

Picker availability is explicit.

Suggested states:

```text
OFFLINE
AVAILABLE
OFFERED
BUSY
ON_BREAK
SUSPENDED
```

Only eligible `AVAILABLE` workers should receive normal new pickup offers.

## 8.1 Availability heartbeat

The mobile app periodically reports:

- Worker status.
- Approximate/current location subject to configured privacy policy.
- Device connectivity.
- App version.
- Last active timestamp.

The server remains authoritative.

A stale heartbeat must not result in assignment.

---

# 9. Pickup Task State Machine

Recommended task lifecycle:

```text
CREATED
   ↓
OFFERED
   ↓
ACCEPTED
   ↓
EN_ROUTE
   ↓
ARRIVED
   ↓
COLLECTING
   ↓
PICKED_UP
   ↓
AT_HUB
   ↓
HANDED_OVER
   ↓
COMPLETED
```

Exception branches:

```text
OFFERED → EXPIRED
OFFERED → REJECTED
ACCEPTED → CANCELLED
EN_ROUTE → FAILED_PICKUP
ARRIVED → PARTIALLY_PICKED
COLLECTING → FAILED_PICKUP
AT_HUB → HANDOVER_EXCEPTION
```

State transitions must be validated server-side.

---

# 10. Pickup Task Detail Screen

After acceptance, the picker sees:

```text
PICKUP #PT-1021

ABC Pharma Wholesaler
Sigra, Varanasi

4 Orders
17 Packages

Pickup Window
10:30 – 11:00

[ NAVIGATE ]

Status:
EN ROUTE
```

The picker should see only operationally necessary information.

---

# 11. Navigation

The application should provide navigation using an external/embedded mapping provider according to the final mobile implementation.

The backend stores:

- Pickup latitude.
- Pickup longitude.
- Address.
- Geofence configuration where required.

The application should not rely only on free-text addresses.

---

# 12. Arrival Detection

Arrival can be confirmed using:

1. Picker manually taps `ARRIVED`.
2. Optional geofence proximity check.
3. Optional supplier confirmation.
4. Optional QR/location verification.

Recommended design:

```text
Picker approaches location
        ↓
Geofence proximity detected
        ↓
ARRIVED prompt
        ↓
Picker confirms
```

Geofence should assist the workflow, not become the sole source of truth.

---

# 13. Wholesaler Pickup Verification

Pickup verification is critical because pharmaceutical packages must be associated with the correct fulfillment.

Possible mechanisms:

- Pickup ID.
- Order reference.
- QR code.
- Package barcode.
- OTP.
- Supplier-side confirmation.

A recommended workflow:

```text
Picker arrives
      ↓
Open pickup
      ↓
Supplier presents package(s)
      ↓
Scan package QR/barcode
      ↓
System validates package
      ↓
Expected package → ACCEPT
Unexpected package → EXCEPTION
      ↓
All required packages scanned
      ↓
Complete pickup
```

---

# 14. Package Scanning

Every physical package should have a unique package identifier where operationally feasible.

Example:

```text
PKG-BZ-000019283
```

Package metadata:

- package_id
- fulfillment_id
- order_id
- supplier_id
- pickup_task_id
- expected_hub_id
- package_status
- barcode/QR value
- created_at
- collected_at
- received_at

## 14.1 Expected versus scanned

Example:

```text
Expected:
17 packages

Scanned:
17 packages

Missing:
0

Unexpected:
0
```

Only after reconciliation should the pickup be completed.

---

# 15. Partial Pickup

A supplier may not have every package ready.

Example:

```text
Expected: 17
Available: 15
Missing: 2
```

The picker must not silently mark all 17 as collected.

Instead:

```text
PARTIALLY_PICKED
```

The system records:

- Collected packages.
- Missing packages.
- Supplier explanation.
- Picker evidence where required.
- Timestamp.
- Follow-up task.

The remaining packages may generate a new pickup task or supplier exception depending on business rules.

---

# 16. Pickup Run

Multiple tasks can be grouped into a pickup run.

Example:

```text
PICKUP RUN #PR1021

Stop 1
ABC Pharma
3 orders

Stop 2
XYZ Distributors
5 orders

Stop 3
Medico Wholesale
4 orders

             ↓

BEZZO MAIN HUB

12 orders
```

## 16.1 Run creation criteria

A run may group stops using:

- Geographic proximity.
- Same hub.
- Compatible pickup windows.
- Picker capacity.
- Estimated route duration.
- Package count.
- Vehicle capacity.
- SLA constraints.

The routing engine must not group incompatible pickups simply because they are geographically close.

---

# 17. Run State Machine

```text
DRAFT
  ↓
PLANNED
  ↓
OFFERED
  ↓
ACCEPTED
  ↓
IN_PROGRESS
  ↓
ALL_STOPS_COLLECTED
  ↓
EN_ROUTE_TO_HUB
  ↓
AT_HUB
  ↓
HANDED_OVER
  ↓
COMPLETED
```

Exception states:

```text
PARTIAL
FAILED
CANCELLED
```

---

# 18. Collection Hub

The collection hub is the physical Bezzo location where picked-up packages are received before downstream delivery.

Hub data should include:

- hub_id
- name
- address
- latitude
- longitude
- operating hours
- capacity
- active status
- receiving configuration
- supported delivery zones

---

# 19. Hub Handover

The picker arrives at the assigned hub.

```text
Picker
  ↓
AT_HUB
  ↓
Open Handover
  ↓
Scan packages
  ↓
System compares expected vs received
  ↓
Reconcile
  ↓
Hub accepts
  ↓
Picker COMPLETED
```

## 19.1 Handover screen

```text
HUB HANDOVER

Run: PR1021

Expected packages: 42
Scanned packages: 42
Missing: 0
Unexpected: 0

[ COMPLETE HANDOVER ]
```

---

# 20. Hub Receiving State Machine

```text
EXPECTED
   ↓
RECEIVING
   ↓
SCANNING
   ↓
RECONCILIATION
   ↓
ACCEPTED
```

Exception branches:

```text
MISSING
DAMAGED
UNEXPECTED
UNREADABLE
DISPUTED
```

---

# 21. Physical Package Chain of Custody

Bezzo should maintain a traceable chain:

```text
SUPPLIER
   ↓
READY_FOR_PICKUP
   ↓
PICKER_ACCEPTED
   ↓
PICKER_COLLECTED
   ↓
PICKER_IN_TRANSIT
   ↓
HUB_RECEIVED
   ↓
READY_FOR_DELIVERY
```

Each transition should produce a timestamped event.

---

# 22. Core Database Entities

Recommended entities:

### Picker

```text
picker
- id
- user_id
- employee_code
- status
- phone
- vehicle_type
- capacity
- home_hub_id
- created_at
- updated_at
```

### Picker Availability

```text
picker_availability
- id
- picker_id
- status
- latitude
- longitude
- accuracy
- last_heartbeat_at
- started_at
- ended_at
```

### Pickup Task

```text
pickup_task
- id
- task_code
- supplier_id
- hub_id
- status
- priority
- pickup_window_start
- pickup_window_end
- assigned_picker_id
- accepted_at
- arrived_at
- completed_at
- created_at
- updated_at
```

### Pickup Task Order

```text
pickup_task_order
- id
- pickup_task_id
- order_id
- fulfillment_id
- package_count
- status
```

### Pickup Package

```text
pickup_package
- id
- package_code
- order_id
- fulfillment_id
- pickup_task_id
- expected_hub_id
- status
- collected_at
- received_at
```

### Pickup Run

```text
pickup_run
- id
- run_code
- picker_id
- hub_id
- status
- planned_start_at
- started_at
- completed_at
```

### Pickup Stop

```text
pickup_stop
- id
- pickup_run_id
- pickup_task_id
- sequence_no
- status
- arrived_at
- completed_at
```

### Pickup Event

```text
pickup_event
- id
- pickup_task_id
- pickup_run_id
- package_id
- event_type
- actor_id
- metadata
- occurred_at
```

### Collection Hub

```text
collection_hub
- id
- code
- name
- address
- latitude
- longitude
- status
- operating_hours
```

### Hub Receiving

```text
hub_receiving
- id
- hub_id
- pickup_task_id
- pickup_run_id
- picker_id
- status
- expected_package_count
- received_package_count
- discrepancy_count
- received_at
```

### Hub Package Scan

```text
hub_package_scan
- id
- hub_receiving_id
- package_id
- scan_code
- result
- scanned_by
- scanned_at
```

### Pickup Exception

```text
pickup_exception
- id
- pickup_task_id
- package_id
- type
- reason
- reported_by
- evidence_url
- status
- created_at
- resolved_at
```

---

# 23. Database Constraints

Important constraints:

- A pickup task can have at most one active picker assignment.
- A package can belong to only one active pickup task.
- A successfully handed-over package cannot be collected again.
- Hub receiving cannot accept a package already received at another hub.
- A cancelled fulfillment cannot generate a new active pickup task.
- Assignment must be transactionally protected against double assignment.
- Package scans must be idempotent.

---

# 24. APIs

Suggested endpoints:

## Picker

```http
GET /v1/picker/me
GET /v1/picker/availability
POST /v1/picker/availability
POST /v1/picker/location
```

## Task discovery

```http
GET /v1/picker/tasks
GET /v1/picker/tasks/available
GET /v1/picker/tasks/{taskId}
```

## Assignment

```http
POST /v1/picker/tasks/{taskId}/accept
POST /v1/picker/tasks/{taskId}/reject
POST /v1/picker/tasks/{taskId}/arrive
POST /v1/picker/tasks/{taskId}/start-collection
POST /v1/picker/tasks/{taskId}/complete
```

## Packages

```http
POST /v1/picker/tasks/{taskId}/packages/scan
GET /v1/picker/tasks/{taskId}/packages
POST /v1/picker/tasks/{taskId}/packages/exception
```

## Runs

```http
GET /v1/picker/runs
GET /v1/picker/runs/{runId}
POST /v1/picker/runs/{runId}/accept
POST /v1/picker/runs/{runId}/start
POST /v1/picker/runs/{runId}/complete
```

## Hub

```http
GET /v1/picker/hubs/{hubId}
POST /v1/picker/handover
POST /v1/picker/handover/{handoverId}/scan
POST /v1/picker/handover/{handoverId}/complete
```

---

# 25. Real-Time Task Delivery

Task offers should support push delivery.

Preferred flow:

```text
Pickup Task Created
      ↓
Assignment Engine
      ↓
Eligible Picker
      ↓
Push Notification
      ↓
Picker App
      ↓
Task Offer
```

The backend remains authoritative.

Push notifications must not themselves constitute an assignment.

If the mobile app misses a push:

```text
GET /picker/tasks/available
```

must recover the task.

---

# 26. Assignment Concurrency

The most important concurrency problem is preventing two pickers from accepting the same task.

Example:

```text
Picker A → Accept
Picker B → Accept
```

Only one may succeed.

Use a transactional/atomic claim:

```text
UPDATE pickup_task
SET assigned_picker_id = :picker,
    status = 'ACCEPTED'
WHERE id = :task
  AND status = 'OFFERED'
  AND assigned_picker_id IS NULL
```

If affected rows = 1:

```text
SUCCESS
```

If affected rows = 0:

```text
TASK_ALREADY_ASSIGNED
```

The operation must be idempotent.

---

# 27. Geographic Assignment Engine

The assignment engine can use:

- PostGIS geographic queries.
- Redis geospatial indexing where appropriate.
- Cached worker availability.
- Supplier geocoding.
- Configurable operational zones.

Example conceptual query:

```text
Find:
AVAILABLE pickers
within configured radius
for supplier location
with sufficient capacity
assigned to same hub/zone
```

Then rank candidates by operational rules such as:

1. Eligibility.
2. Distance/travel time.
3. Pickup-window compatibility.
4. Existing workload.
5. Capacity.
6. Zone/hub compatibility.

The ranking must remain configurable rather than hard-coded into the mobile app.

---

# 28. Task Offer Strategy

For operational resilience, the assignment engine should support:

### Single offer

One picker receives the task.

### Sequential fallback

If the picker does not accept within the configured timeout:

```text
Picker A
  ↓ timeout
Picker B
  ↓ timeout
Picker C
```

### Controlled parallel offer

For urgent/high-priority work, a configurable number of eligible workers may see the offer simultaneously.

The first successful atomic claim wins.

The system must immediately invalidate the offer for other workers.

---

# 29. Picker Capacity

Capacity should be explicit.

Example:

```text
Picker capacity:
20 packages

Current load:
12 packages

Available:
8 packages
```

The assignment engine must avoid assigning work that exceeds configured capacity unless an authorized override exists.

Capacity can later incorporate:

- Vehicle volume.
- Weight.
- Number of packages.
- Fragile/cold-chain requirements.
- Special handling.

---

# 30. Notifications

Picker notifications include:

- New pickup task.
- Task expiring.
- Assignment accepted.
- Pickup window approaching.
- Supplier reports ready.
- Task changed.
- Task cancelled.
- Hub handover reminder.
- Exception created.
- Operational announcement.

Notifications should be localized and configurable.

---

# 31. Supplier-Side Integration

The supplier dashboard must expose the operational state needed for pickup.

Example:

```text
Order/Fulfillment
      ↓
PREPARING
      ↓
PACKED
      ↓
READY_FOR_PICKUP
```

When the supplier marks the fulfillment ready:

```text
READY_FOR_PICKUP
```

the pickup system is notified through an internal domain event.

Example event:

```text
FulfillmentReadyForPickup
```

Payload:

```json
{
  "fulfillmentId": "FUL-10231",
  "supplierId": "SUP-1002",
  "hubId": "HUB-01",
  "packageCount": 17,
  "pickupWindowStart": "2026-09-20T10:30:00+05:30",
  "pickupWindowEnd": "2026-09-20T11:00:00+05:30"
}
```

---

# 32. Event-Driven Integration

Recommended events:

```text
FulfillmentReadyForPickup
PickupTaskCreated
PickupTaskOffered
PickupTaskAccepted
PickerArrivedAtSupplier
PackageCollected
PickupCompleted
PickupFailed
PickupRunStarted
PickupRunCompleted
PickerArrivedAtHub
HubReceivingStarted
PackageReceivedAtHub
HubReceivingCompleted
PickupExceptionCreated
```

Events should be durable and traceable.

---

# 33. Exception Handling

Required exception types include:

```text
SUPPLIER_CLOSED
SUPPLIER_NOT_READY
PACKAGE_MISSING
PACKAGE_DAMAGED
PACKAGE_UNEXPECTED
PACKAGE_BARCODE_UNREADABLE
WRONG_PACKAGE
PICKUP_WINDOW_MISSED
PICKER_DELAYED
VEHICLE_FAILURE
NAVIGATION_FAILURE
HUB_CLOSED
HUB_CAPACITY_FULL
HUB_RECEIVING_DISCREPANCY
TASK_CANCELLED
```

Each exception should include:

- Type.
- Actor.
- Timestamp.
- Task.
- Package if relevant.
- Description.
- Evidence where required.
- Resolution status.

---

# 34. Evidence

Depending on the business rule, evidence may include:

- Photo.
- QR scan.
- Barcode scan.
- OTP verification.
- Supplier confirmation.
- Hub confirmation.

Evidence files should use secure object storage and signed access.

Do not expose unrestricted object-storage URLs.

---

# 35. Security and RBAC

Picker permissions should be narrowly scoped.

Picker may access:

- Assigned pickup tasks.
- Eligible available tasks.
- Supplier pickup location.
- Necessary package/order reference.
- Assigned hub.
- Operational task state.

Picker must not access:

- Supplier bank details.
- Supplier financial statements.
- Supplier private documents.
- Retailer licence documents.
- Payment credentials.
- Marketplace-wide customer database.
- Other workers' private data.
- Unassigned supplier operations.

Every sensitive operation must be authorized server-side.

---

# 36. Privacy

Location tracking should follow Bezzo's privacy requirements.

The system should distinguish:

- Active-task location.
- Availability location.
- Background location, if legally and operationally required.

Only collect what is needed.

Location retention should be configurable and governed by the data-retention policy.

---

# 37. Performance Requirements

The picker system must remain responsive during large operational peaks.

Targets should be validated through load testing.

Important measurements:

- Task creation latency.
- Assignment latency.
- Push delivery latency.
- Accept latency.
- Package scan latency.
- Hub handover latency.
- API p50/p95/p99.
- Assignment queue delay.
- Database lock contention.
- Redis latency.
- Notification failure rate.

The mobile UI should optimistically update where safe, while server confirmation remains authoritative.

---

# 38. High-Concurrency Assignment Architecture

Recommended architecture:

```text
                    ┌───────────────┐
                    │ Supplier App  │
                    └───────┬───────┘
                            │
                  READY_FOR_PICKUP
                            │
                            ▼
                 ┌────────────────────┐
                 │ Pickup Task Service│
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ Assignment Engine  │
                 └───────┬──────┬─────┘
                         │      │
                    Redis Geo  PostgreSQL
                         │      │
                         └──┬───┘
                            │
                            ▼
                    Picker App / Push
                            │
                            ▼
                      Picker accepts
                            │
                            ▼
                       Supplier
                            │
                            ▼
                         Hub
```

Use asynchronous queues for non-critical work such as:

- Notifications.
- Analytics.
- Assignment telemetry.
- Event projections.

Do not make task acceptance depend on slow external services.

---

# 39. Redis Usage

Redis may support:

- Picker availability cache.
- Geospatial lookup.
- Short-lived task offers.
- Rate limiting.
- Distributed coordination where required.
- Hot operational counters.

PostgreSQL remains the authoritative system of record.

Redis loss must not silently corrupt assignment state.

---

# 40. Background Workers

Workers should handle:

- Task generation.
- Assignment retries.
- Offer expiration.
- Stale picker detection.
- Pickup-window monitoring.
- Escalations.
- Notifications.
- Event processing.
- Analytics.
- Hub reconciliation jobs.

Queues should support retries and dead-letter handling.

---

# 41. Stale Picker Protection

If a picker becomes disconnected:

```text
AVAILABLE
   ↓
heartbeat expires
   ↓
STALE
```

The system should stop assigning new tasks.

For an active task, the system should monitor the situation and escalate according to operational rules.

---

# 42. Offline Mobile Behavior

The app should tolerate temporary connectivity loss.

Safe offline operations may include:

- Viewing already-loaded task details.
- Viewing cached navigation destination.
- Capturing scan data locally for later synchronization where appropriate.

Critical state transitions must be server-confirmed.

Offline scans should include:

- Local event ID.
- Device timestamp.
- Package ID.
- Task ID.

On reconnection:

```text
Local event
    ↓
Sync
    ↓
Idempotency validation
    ↓
Server acceptance
```

---

# 43. Idempotency

All physical state-changing operations should be idempotent.

Examples:

```http
POST /picker/tasks/{taskId}/accept
Idempotency-Key: ...
```

```http
POST /picker/tasks/{taskId}/packages/scan
Idempotency-Key: ...
```

```http
POST /picker/handover/{handoverId}/complete
Idempotency-Key: ...
```

Repeated requests must not:

- Double-collect packages.
- Double-receive packages.
- Create duplicate tasks.
- Complete a task twice.

---

# 44. Admin Operations

Admin/company dashboard should provide:

- Live pickup map.
- Active pickers.
- Available workers.
- Unassigned tasks.
- At-risk pickup windows.
- Failed pickups.
- Partial pickups.
- Hub receiving status.
- Package discrepancies.
- Picker performance metrics.
- Supplier pickup readiness.
- Operational configuration.

Example:

```text
PICKUP OPERATIONS

Available tasks       42
Unassigned            7
Active pickups        28
At-risk               3
At supplier           19
At hub                 8
Exceptions             5
```

---

# 45. Operational Metrics

Recommended metrics:

### Picker

- Acceptance rate.
- Average acceptance time.
- Arrival time.
- Pickup duration.
- Packages collected.
- Tasks completed.
- Failed pickup rate.
- Partial pickup rate.
- Hub handover duration.

### Supplier

- Preparation time.
- Ready-on-time percentage.
- Missing-package rate.
- Pickup delay.
- Discrepancy rate.

### Hub

- Receiving time.
- Scan throughput.
- Discrepancy rate.
- Queue size.

### System

- Assignment latency.
- Task creation latency.
- Push delivery success.
- API p95/p99.
- Queue depth.
- Database contention.

Metrics should be used for operations and capacity planning, not as the sole basis for employment decisions.

---

# 46. Audit Logging

Every important state transition must be auditable.

Example:

```text
2026-09-20 10:21:31
Picker P-102 accepted task PT-1021

2026-09-20 10:39:11
Picker P-102 arrived at supplier

2026-09-20 10:42:05
Package PKG-001 scanned

2026-09-20 10:44:18
Pickup completed

2026-09-20 11:02:47
Hub HUB-01 received package PKG-001
```

Audit records must be append-oriented and protected from unauthorized modification.

---

# 47. Recommended Mobile Navigation

```text
Picker App
│
├── Home
│   ├── Available Pickups
│   ├── Active Task
│   └── Alerts
│
├── Pickup Tasks
│   ├── Available
│   ├── Assigned
│   ├── Upcoming
│   └── Completed
│
├── Pickup Run
│
├── Hub Handover
│
├── Notifications
│
└── Profile
```

The home screen should prioritize the next operational action.

---

# 48. Home Screen Concept

```text
GOOD MORNING

STATUS
🟢 AVAILABLE

--------------------------------
PICKUP AVAILABLE
ABC Pharma Wholesaler
1.8 km
4 orders • 17 packages
10:30–11:00

[ ACCEPT ]
--------------------------------

ACTIVE
No active pickup

UPCOMING
2 scheduled pickups
```

The UI should remain minimal and action-oriented.

---

# 49. End-to-End Example

## Step 1 — Retailer

Retailer places a scheduled order.

```text
Order:
ORD-50021
```

## Step 2 — Fulfillment

Supplier receives fulfillment.

```text
FUL-10231
Supplier: ABC Pharma
```

## Step 3 — Supplier preparation

Supplier prepares:

```text
17 packages
```

and marks:

```text
READY_FOR_PICKUP
```

## Step 4 — Task generation

Bezzo creates:

```text
PT-1021
```

## Step 5 — Assignment

Assignment engine finds eligible workers.

Picker P-102 is 1.8 km away.

Task is offered.

## Step 6 — Acceptance

Picker accepts.

```text
ACCEPTED
```

## Step 7 — Travel

Picker navigates to supplier.

```text
EN_ROUTE
```

## Step 8 — Arrival

Picker reaches supplier.

```text
ARRIVED
```

## Step 9 — Collection

Picker scans 17 packages.

```text
17 expected
17 scanned
0 missing
0 unexpected
```

Task becomes:

```text
PICKED_UP
```

## Step 10 — Hub

Picker travels to:

```text
Bezzo Main Collection Hub
```

## Step 11 — Handover

Hub scans packages.

```text
17 expected
17 received
```

## Step 12 — Completion

```text
HUB_RECEIVED
```

Packages become eligible for downstream delivery.

---

# 50. Multi-Supplier Example

A single retailer order may require:

```text
Order ORD-9001

Fulfillment A
Supplier A
5 products
8 packages

Fulfillment B
Supplier B
3 products
4 packages
```

The picker system can create:

```text
Pickup Stop 1
Supplier A
8 packages

Pickup Stop 2
Supplier B
4 packages

Destination
Bezzo Hub
```

The parent retailer order remains one order.

The operational system maintains separate supplier fulfillments and physical pickup records.

---

# 51. Recommended Implementation Modules

Backend modules:

```text
PickerModule
PickerAvailabilityModule
PickupTaskModule
PickupAssignmentModule
PickupRunModule
PickupPackageModule
CollectionHubModule
HubReceivingModule
PickupExceptionModule
PickupNotificationModule
PickupAuditModule
```

Shared modules:

```text
OrderModule
FulfillmentModule
SupplierModule
UserModule
NotificationModule
StorageModule
EventBusModule
AuthModule
```

---

# 52. Implementation Sequence

## Phase 1

Build:

- Picker authentication.
- Picker profile.
- Availability.
- Pickup task creation.
- Basic assignment.
- Task popup.
- Accept/reject.
- Supplier navigation.
- Arrival.
- Package scanning.
- Pickup completion.
- Hub handover.

## Phase 2

Add:

- Geographic assignment.
- Pickup runs.
- Capacity.
- Geofencing.
- Advanced exceptions.
- Live operations map.
- Push notifications.
- Assignment retries.

## Phase 3

Add:

- Route optimization.
- Multi-stop optimization.
- Advanced hub operations.
- Predictive workload.
- Automated SLA risk detection.
- Advanced operational analytics.

---

# 53. Testing Strategy

## Unit tests

Test:

- State transitions.
- Assignment eligibility.
- Capacity.
- Geographic matching.
- Package validation.
- Idempotency.
- Exception handling.

## Integration tests

Test:

```text
Fulfillment
→ Pickup Task
→ Assignment
→ Picker
→ Package Scan
→ Hub Receiving
```

## Concurrency tests

Simulate:

```text
1 task
100 pickers
```

and verify only one picker claims it.

Also test:

```text
10,000 ready tasks
10,000+ workers
```

at realistic scale using load-test infrastructure.

## Failure tests

Test:

- Redis unavailable.
- Queue delayed.
- Push notification failed.
- Picker offline.
- Supplier unavailable.
- Hub unavailable.
- Duplicate scan.
- Duplicate accept.
- Network timeout.

---

# 54. Observability

Use:

- Structured logs.
- Metrics.
- Distributed tracing.
- Assignment latency dashboards.
- Queue dashboards.
- Mobile crash reporting.
- API error monitoring.
- Database monitoring.

Critical traces should correlate:

```text
order_id
fulfillment_id
pickup_task_id
pickup_run_id
package_id
hub_receiving_id
```

This allows one physical package journey to be reconstructed end-to-end.

---

# 55. Operational Safety

Because Bezzo operates in the pharmaceutical domain, package handling must support applicable business and regulatory controls.

The picker system should not independently determine whether a medicine may legally be sold or transported. Such eligibility must be established by the appropriate product, compliance and fulfillment rules.

The picker system's responsibility is controlled physical movement and traceability.

Special handling requirements may later include:

- Temperature-sensitive packages.
- Fragile packages.
- Restricted handling.
- Recall-related holds.
- Expiry-related holds.

These should be represented as fulfillment/package attributes rather than hidden picker-side rules.

---

# 56. Final Architecture

The recommended architecture is:

```text
                     BEZZO MARKETPLACE
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
       Retailer                           Supplier
          │                                   │
          ▼                                   ▼
       Order                            Fulfillment
                                              │
                                    READY_FOR_PICKUP
                                              │
                                              ▼
                                  ┌────────────────────┐
                                  │ Pickup Task Engine  │
                                  └─────────┬──────────┘
                                            │
                                  Geographic/Capacity
                                     Assignment
                                            │
                                            ▼
                                  ┌────────────────────┐
                                  │   Picker Mobile App │
                                  └─────────┬──────────┘
                                            │
                                        Accept
                                            │
                                            ▼
                                      Wholesaler
                                            │
                                         Scan
                                            │
                                            ▼
                                      Picked Up
                                            │
                                            ▼
                                  ┌────────────────────┐
                                  │ Bezzo Collection Hub│
                                  └─────────┬──────────┘
                                            │
                                         Receive
                                            │
                                            ▼
                                  READY_FOR_DELIVERY
                                            │
                                            ▼
                                   Delivery Operation
                                            │
                                            ▼
                                         Retailer
```

---

# 57. Engineering Principle

The key architectural principle is:

> **The picker system manages physical collection work, not the business order itself.**

This separation keeps Bezzo's domain model clean:

```text
Order
  = commercial customer transaction

Fulfillment
  = supplier responsibility

Pickup
  = supplier-to-Bezzo physical collection

Hub Receiving
  = Bezzo physical custody confirmation

Delivery
  = hub-to-retailer logistics
```

This model allows Bezzo to scale from:

```text
1 hub + 10 pickers
```

to:

```text
multiple hubs
hundreds/thousands of pickers
large supplier networks
high order volumes
```

without redesigning the core order model.

---

# 58. Acceptance Criteria

The picker collection system is considered functionally complete when:

- A supplier can mark a fulfillment `READY_FOR_PICKUP`.
- Bezzo automatically creates an eligible pickup task.
- Eligible nearby pickers receive the task.
- A picker can accept it.
- Two pickers cannot claim the same task.
- Picker can navigate to the supplier.
- Arrival can be recorded.
- Expected packages can be scanned.
- Missing/unexpected packages generate exceptions.
- Pickup completion is recorded.
- Picker can travel to assigned hub.
- Hub can scan expected packages.
- Hub can reconcile discrepancies.
- Successfully received packages transition to the next logistics stage.
- Every important transition is auditable.
- Picker cannot access unauthorized business data.
- System remains safe under concurrent assignment and duplicate requests.
- Operational dashboards can monitor active, delayed and failed pickups.

---

## Document End

**Bezzo Picker Collection System Architecture Specification v1.0**

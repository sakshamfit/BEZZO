# Bezzo Logistics & Porter Integration Specification
## Version 1.0

**Product:** Bezzo — B2B Pharmaceutical Marketplace  
**Primary market:** India  
**Initial logistics provider:** Porter  
**Status:** Draft for implementation

---

## 1. Purpose

This document defines the logistics architecture for Bezzo, including instant delivery, scheduled delivery, supplier pickup, customer drop-off, tracking, delivery status, route batching, provider abstraction, and the initial Porter integration.

Core principle:

```text
Order
  ↓
Fulfillment
  ↓
Delivery Task
  ↓
Logistics Provider
  ↓
Pickup
  ↓
Transit
  ↓
Customer Delivery
  ↓
Proof of Delivery
```

Porter is the initial provider, but the architecture must not make Porter a permanent dependency of the core order domain.

---

# 2. Logistics Architecture

Recommended separation:

```text
Order Domain
     ↓
Fulfillment Domain
     ↓
Logistics Service
     ↓
Provider Router
     ↓
Porter Adapter
```

Future:

```text
Provider Router
 ├── Porter
 ├── Provider B
 ├── Provider C
 └── Bezzo Fleet
```

The order system should call a generic logistics interface rather than provider-specific APIs.

---

# 3. Core Logistics Entities

Recommended entities:

```text
delivery
delivery_task
delivery_package
pickup_location
drop_location
delivery_assignment
delivery_event
delivery_tracking
delivery_slot
route
route_stop
logistics_provider
provider_transaction
proof_of_delivery
delivery_exception
```

---

# 4. Delivery Modes

Bezzo initially supports:

### Instant Delivery

Used for priority orders requiring delivery as soon as operationally possible.

Flow:

```text
Order confirmed
→ fulfillment ready
→ request delivery
→ assign driver
→ pickup
→ transit
→ customer delivery
```

### Scheduled Delivery

Used when the buyer selects a future date and delivery slot.

Flow:

```text
Order confirmed
→ save date/slot
→ queue fulfillment
→ prepare near dispatch window
→ batch deliveries
→ create route/run
→ pickup
→ delivery
```

---

# 5. Delivery Slot Model

Slots should be configuration-driven.

Example:

```text
Morning     08:00–12:00
Afternoon   12:00–16:00
Evening     16:00–20:00
```

The production system should allow different slots by:

```text
region
operating day
supplier/warehouse
delivery mode
holiday calendar
capacity
```

A slot should contain:

```text
slot_id
region_id
name
start_time
end_time
capacity
cutoff_time
active
```

---

# 6. Slot Capacity

Scheduled delivery capacity must be controlled.

Example:

```text
Morning capacity = 100 deliveries
Current booked   = 97
Remaining        = 3
```

At checkout:

```text
available capacity?
    ↓ yes
reserve slot capacity
    ↓
confirm order
```

Capacity reservation must be concurrency-safe.

Two buyers must not both consume the final slot capacity due to a race condition.

---

# 7. Delivery Task

A delivery task represents one operational movement.

Recommended fields:

```text
delivery_task_id
fulfillment_id
provider
provider_task_id
mode
status
pickup_location_id
drop_location_id
scheduled_date
delivery_slot_id
package_count
special_handling
created_at
updated_at
```

---

# 8. Pickup Location

Pickup location can represent:

- Supplier premises
- Supplier warehouse
- Bezzo warehouse
- Future fulfillment center

Fields:

```text
pickup_location_id
owner_type
owner_id
contact_name
contact_phone
address
latitude
longitude
operating_hours
instructions
```

Supplier pickup information must be access-controlled.

---

# 9. Drop Location

Customer delivery location:

```text
drop_location_id
buyer_id
recipient_name
recipient_phone
address_line_1
address_line_2
landmark
city
state
postal_code
latitude
longitude
delivery_instructions
```

Exact location information should only be exposed to authorized logistics workflows.

---

# 10. Delivery Status

Recommended internal state machine:

```text
CREATED
QUOTING
BOOKING
BOOKED
DRIVER_ASSIGNED
ARRIVED_AT_PICKUP
PICKED_UP
IN_TRANSIT
ARRIVED_AT_DROP
DELIVERED
FAILED
CANCELLED
RETURNING
RETURNED
```

Provider-specific statuses must be normalized into these internal states.

---

# 11. Provider Status Mapping

Porter may expose provider-specific terminology.

Bezzo should map:

```text
Provider status
      ↓
PorterAdapter
      ↓
Bezzo DeliveryStatus
```

Never spread provider-specific status strings across the entire codebase.

---

# 12. Logistics Provider Interface

Recommended interface:

```typescript
interface LogisticsProvider {
  getQuote(input: DeliveryQuoteInput): Promise<DeliveryQuote>;
  createDelivery(input: CreateDeliveryInput): Promise<DeliveryResult>;
  cancelDelivery(input: CancelDeliveryInput): Promise<CancelResult>;
  getDeliveryStatus(input: GetDeliveryStatusInput): Promise<DeliveryStatusResult>;
  trackDelivery(input: TrackDeliveryInput): Promise<TrackingResult>;
}
```

Optional capabilities:

```typescript
interface LogisticsProviderCapabilities {
  supportsScheduledDelivery: boolean;
  supportsInstantDelivery: boolean;
  supportsCancellation: boolean;
  supportsLiveTracking: boolean;
  supportsProofOfDelivery: boolean;
}
```

---

# 13. Porter Adapter

Porter integration should live inside:

```text
src/modules/logistics/providers/porter/
```

Conceptually:

```text
PorterAdapter
 ├── authentication
 ├── quote
 ├── create delivery
 ├── status
 ├── tracking
 ├── cancellation
 ├── webhook handling
 └── error mapping
```

Provider credentials must be stored in the secret-management system.

Never commit provider credentials to source control.

---

# 14. Provider Configuration

Recommended configuration:

```text
provider_id
provider_name
enabled
supported_regions
supported_modes
priority
credentials_reference
timeout_ms
retry_policy
```

The router can select providers based on:

```text
region
delivery mode
capacity
availability
provider status
business configuration
```

---

# 15. Provider Routing

Example:

```text
Delivery Request
      ↓
Region supported?
      ↓
Mode supported?
      ↓
Provider available?
      ↓
Provider capacity?
      ↓
Select provider
```

Initial production configuration may simply select Porter.

The abstraction exists so future providers can be added without rewriting order/fulfillment logic.

---

# 16. Instant Delivery Flow

Detailed flow:

```text
Buyer checkout
      ↓
Order confirmed
      ↓
Supplier fulfillment confirmed
      ↓
Package ready
      ↓
Delivery quote
      ↓
Provider booking
      ↓
Driver assignment
      ↓
Pickup
      ↓
Transit
      ↓
Customer drop
      ↓
Proof of delivery
      ↓
Delivery completed
```

If provider booking fails:

```text
retry according to policy
→ alternate provider if configured
→ operations exception if unresolved
```

---

# 17. Scheduled Delivery Flow

```text
Buyer selects:
Date + Slot
      ↓
Slot capacity reserved
      ↓
Order confirmed
      ↓
Supplier prepares package
      ↓
Pre-dispatch job
      ↓
Group compatible delivery tasks
      ↓
Route planning
      ↓
Provider booking
      ↓
Pickup
      ↓
Delivery
```

Scheduled orders should not be sent to logistics prematurely unless required.

---

# 18. Scheduled Dispatch Window

A scheduler should identify deliveries approaching dispatch time.

Example:

```text
Delivery slot:
08:00–12:00

Preparation:
06:00–07:00

Dispatch:
07:00 onward
```

Actual operating windows must be configurable.

Scheduler responsibilities:

- Find eligible fulfillments
- Verify package readiness
- Verify inventory allocation
- Verify address
- Verify logistics availability
- Create delivery tasks
- Batch compatible tasks
- Send provider requests

---

# 19. Route Batching

Scheduled orders should be grouped by operational compatibility.

Possible grouping keys:

```text
delivery date
delivery slot
region
pickup location
temperature/special handling
vehicle capability
provider
```

Example:

```text
Date: 20 Sep
Slot: Morning
Region: Area A
Pickup: Supplier Hub 1

→ 42 delivery tasks
```

These can be assigned to one or more routes/runs.

---

# 20. Route Entity

Recommended:

```text
route_id
provider
route_date
slot_id
region_id
pickup_location
status
driver_reference
vehicle_reference
estimated_distance
estimated_duration
created_at
```

Route status:

```text
PLANNED
READY
DISPATCHED
IN_PROGRESS
COMPLETED
CANCELLED
```

---

# 21. Route Stop

A route can contain multiple stops.

```text
Route
 ├── Stop 1 → Customer A
 ├── Stop 2 → Customer B
 ├── Stop 3 → Customer C
 └── Stop 4 → Customer D
```

Each stop should reference:

```text
delivery_task_id
sequence
planned_arrival
actual_arrival
status
```

---

# 22. Multiple Suppliers in One Customer Order

Example:

```text
Customer Order
 ├── Supplier A fulfillment
 │     └── Pickup A
 │
 └── Supplier B fulfillment
       └── Pickup B
```

The logistics engine can create:

```text
Delivery A
Delivery B
```

or, where operationally supported:

```text
Pickup A
Pickup B
   ↓
Consolidation / shared route
   ↓
Customer
```

The system must not assume that one customer order always equals one logistics task.

---

# 23. Delivery Consolidation

Consolidation is optional and should be introduced only when operationally supported.

Potential requirements:

```text
same customer
same delivery address
compatible delivery slot
compatible handling requirements
provider supports multi-pickup
```

If consolidation is not available:

```text
one order
→ multiple deliveries
```

The buyer-facing experience can still group them under one order.

---

# 24. Package Model

Each fulfillment should produce one or more packages.

Fields:

```text
package_id
fulfillment_id
package_number
weight
length
width
height
item_count
special_handling
sealed_at
handover_at
```

The package model should support future logistics providers requiring dimensional data.

---

# 25. Pharmaceutical Handling Metadata

Delivery tasks may carry handling requirements:

```text
normal
protect_from_light
temperature_controlled
refrigerated
frozen
fragile
special_handling
```

The logistics provider selected must support required handling.

If a required capability is unavailable:

```text
do not silently book an incompatible delivery
```

Send the task to an operational exception workflow.

---

# 26. Cold Chain

Cold-chain products require stronger controls.

At minimum:

```text
product requires cold chain
→ supplier confirms appropriate packaging/storage
→ logistics capability verified
→ delivery path selected
→ handover recorded
```

Temperature-sensitive delivery requirements should be treated as compliance/operational constraints, not ordinary delivery notes.

---

# 27. Delivery Quote

Before booking, provider quote may include:

```text
base_fee
distance_fee
time_fee
special_handling_fee
tax
total
currency
estimated_duration
```

Bezzo should store the quote snapshot used for the order/delivery decision.

---

# 28. Delivery Fee

The customer delivery charge may differ from provider cost.

Model separately:

```text
provider_delivery_cost
customer_delivery_fee
Bezzo_delivery_subsidy
delivery_margin
```

Example:

```text
Porter cost        ₹70
Customer charged   ₹30
Bezzo subsidy      ₹40
```

Values are examples only.

---

# 29. Instant Delivery Surcharge

Instant delivery can have a configurable surcharge.

Example:

```text
instant_delivery_fee = ₹30
```

The value should be configured by:

```text
region
order value
distance
time
provider cost
business rules
```

Do not hard-code ₹30 into application logic.

---

# 30. Tracking

Tracking should support:

```text
delivery status
driver assignment
estimated arrival
pickup time
delivery time
tracking URL/reference
```

Buyer-facing tracking should expose only necessary information.

If live provider tracking is available, Bezzo can proxy or deep-link to an approved tracking experience.

---

# 31. Tracking Architecture

```text
Porter
  ↓
Provider webhook / polling
  ↓
PorterAdapter
  ↓
Delivery service
  ↓
Delivery event
  ↓
Order timeline
  ↓
Buyer UI
```

Provider-specific payloads should be normalized before entering the domain model.

---

# 32. Logistics Webhooks

Provider webhook endpoint:

```text
POST /v1/logistics/webhooks/:provider
```

Processing:

```text
receive
→ authenticate/verify
→ persist
→ deduplicate
→ normalize
→ update delivery
→ emit event
→ notify
```

Webhook processing must be idempotent.

---

# 33. Delivery Events

Recommended events:

```text
DeliveryCreated
DriverAssigned
DriverArrivedAtPickup
PackagePickedUp
DeliveryStarted
DriverArrivedAtDrop
DeliveryCompleted
DeliveryFailed
DeliveryCancelled
DeliveryReturned
```

Store provider event references where available.

---

# 34. Proof of Delivery

POD may include:

```text
delivered_at
recipient_name
delivery confirmation
OTP confirmation where supported
photo/evidence where legally and operationally appropriate
provider_reference
```

Sensitive POD data must be protected.

The exact POD mechanism depends on provider capabilities and business policy.

---

# 35. Delivery Failure

Possible reasons:

```text
CUSTOMER_UNAVAILABLE
WRONG_ADDRESS
PHONE_UNREACHABLE
PROVIDER_UNAVAILABLE
VEHICLE_ISSUE
PACKAGE_NOT_READY
COMPLIANCE_BLOCK
WEATHER/EXTERNAL_EVENT
OTHER
```

Failure should create an operational event.

Possible next actions:

```text
retry
reschedule
reassign provider
return to supplier
cancel
refund
```

---

# 36. Customer Unavailable

Workflow:

```text
Delivery attempt failed
→ provider records failure
→ notify buyer
→ apply retry policy
→ reschedule if allowed
```

The system should avoid creating duplicate deliveries for the same fulfillment.

---

# 37. Cancellation

Delivery cancellation may occur:

```text
before booking
after booking
before pickup
after pickup
```

Rules differ by stage.

Example:

```text
CREATED → cancel
BOOKED → provider cancellation attempt
PICKED_UP → usually requires return workflow
```

Do not assume provider cancellation is always possible.

---

# 38. Return-to-Supplier

If a delivery cannot be completed after pickup:

```text
delivery failed
→ return requested
→ return movement
→ supplier receipt
→ fulfillment update
→ order/refund decision
```

Return logistics should have its own tracking and financial treatment.

---

# 39. Logistics Exceptions

Create an exception entity:

```text
delivery_exception_id
delivery_id
type
severity
description
status
assigned_to
resolution
created_at
resolved_at
```

Statuses:

```text
OPEN
INVESTIGATING
ACTION_REQUIRED
RESOLVED
CLOSED
```

Critical exceptions should alert operations.

---

# 40. Logistics SLA Metrics

Track:

```text
quote_response_time
booking_success_rate
time_to_driver_assignment
pickup_on_time_rate
delivery_on_time_rate
average_delivery_duration
failed_delivery_rate
provider_error_rate
```

For scheduled delivery:

```text
slot_adherence_rate
```

These metrics help evaluate providers without coupling the order system to one provider.

---

# 41. Security

Logistics APIs require:

- Authentication
- Provider credential protection
- Webhook verification
- RBAC
- Tenant isolation
- Minimal customer-data exposure
- Audit logs
- Rate limiting
- Input validation
- Secure secrets management

Provider credentials must never appear in frontend bundles or logs.

---

# 42. Privacy

Suppliers should receive only delivery information necessary to prepare and hand over packages.

Drivers/providers should receive only the information necessary to execute delivery.

Avoid exposing:

- Other suppliers
- Other customer orders
- Internal pricing
- Internal supplier ranking
- Unnecessary buyer information

---

# 43. Database Tables

Recommended logistics tables:

```text
logistics_providers
delivery_slots
delivery_tasks
deliveries
delivery_packages
delivery_assignments
delivery_events
delivery_tracking
routes
route_stops
proof_of_delivery
delivery_exceptions
provider_transactions
```

---

# 44. API Surface

Representative APIs:

```text
GET    /v1/delivery/slots
GET    /v1/orders/:orderId/delivery
GET    /v1/deliveries/:deliveryId
GET    /v1/deliveries/:deliveryId/tracking

POST   /v1/admin/deliveries/:deliveryId/retry
POST   /v1/admin/deliveries/:deliveryId/reschedule

POST   /v1/logistics/webhooks/:provider

GET    /v1/admin/logistics/providers
PATCH  /v1/admin/logistics/providers/:providerId
GET    /v1/admin/logistics/exceptions
```

Supplier APIs may expose only the delivery information needed for handover.

---

# 45. Scheduler Architecture

Recommended scheduled workers:

```text
slot-capacity worker
scheduled-dispatch worker
delivery-status reconciliation worker
failed-delivery worker
provider reconciliation worker
route preparation worker
```

Workers must be:

- Idempotent
- Retryable
- Observable
- Safe under horizontal scaling

Use distributed locking/claiming where duplicate processing is possible.

---

# 46. Provider Failure Strategy

If Porter is unavailable:

```text
Provider unavailable
       ↓
retry according to policy
       ↓
check alternate configured provider
       ↓
create operational exception
       ↓
notify customer if SLA affected
```

The core order should not crash simply because one logistics provider is unavailable.

---

# 47. Testing

### Unit tests

- Provider status mapping
- Quote normalization
- Slot calculation
- Capacity reservation
- Delivery state transitions
- Retry policies

### Integration tests

- Porter quote
- Delivery creation
- Cancellation
- Status synchronization
- Webhook processing
- Tracking

### Concurrency tests

- Final slot capacity
- Duplicate delivery creation
- Duplicate webhook
- Multiple scheduler workers

### Failure tests

- Provider timeout
- Invalid provider response
- Driver unavailable
- Pickup failure
- Customer unavailable
- Return flow

### Security tests

- Webhook forgery
- Unauthorized delivery access
- Cross-supplier data exposure
- Provider credential leakage

---

# 48. Acceptance Criteria

The logistics system is production-readiness eligible when:

- Logistics is abstracted from the order domain.
- Porter is implemented through an adapter.
- Instant delivery works.
- Scheduled delivery works.
- Delivery slots have capacity controls.
- Slot booking is concurrency-safe.
- Supplier pickup locations are supported.
- Customer drop locations are supported.
- Delivery states are normalized.
- Provider webhooks are verified and idempotent.
- Tracking is available.
- Delivery failures have operational workflows.
- Return-to-supplier is modeled.
- Proof of delivery is recorded where supported.
- Special handling requirements are respected.
- Route batching is supported for scheduled operations.
- Provider outages do not corrupt orders.
- Logistics metrics and alerts exist.
- Sensitive customer/provider information is protected.

---

# 49. Recommended Implementation Sequence

```text
1. Logistics domain model
2. Delivery slots
3. Provider interface
4. Porter adapter
5. Delivery quote
6. Instant delivery booking
7. Delivery status
8. Webhooks
9. Tracking
10. Scheduled delivery
11. Slot capacity
12. Route batching
13. Proof of delivery
14. Delivery exceptions
15. Return logistics
16. Provider routing/failover
17. Logistics analytics
```

---

# 50. Final Principle

Bezzo should treat logistics as an interchangeable execution layer.

```text
                    ┌── Porter
Order → Fulfillment ├── Provider B
                    ├── Provider C
                    └── Bezzo Fleet
```

The customer experience should remain consistent regardless of which logistics provider executes the delivery.

The core Bezzo order system owns the **commercial transaction**.

The fulfillment system owns **supplier execution**.

The logistics system owns **physical movement**.

The provider adapter owns **external logistics API details**.

This separation gives Bezzo a path from a Porter-based launch to a multi-provider and eventually Bezzo-operated delivery network without rewriting the core marketplace.

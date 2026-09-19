# Bezzo Order, Fulfillment & Multi-Supplier Specification
## Version 1.0

**Product:** Bezzo — B2B Pharmaceutical Marketplace  
**Primary market:** India  
**Status:** Draft for implementation

---

## 1. Purpose

This specification defines how Bezzo converts a buyer cart into a validated order, reserves inventory, selects eligible suppliers, creates supplier-specific fulfillments, handles split fulfillment, coordinates delivery, and maintains a single customer-facing order experience.

Core principle:

```text
Customer Order
      ↓
Fulfillment Planning
      ↓
Supplier Allocation
      ↓
Supplier Fulfillment(s)
      ↓
Logistics
      ↓
Delivery
      ↓
Settlement / Completion
```

A buyer should ideally see **one order**, even when Bezzo internally uses multiple supplier fulfillments.

---

# 2. Core Domain Objects

The order domain should separate:

```text
Cart
Order
Order Item
Fulfillment
Fulfillment Item
Inventory Reservation
Shipment / Delivery
Payment
Refund
Return / Dispute
```

### Cart

Temporary buyer intent before checkout.

### Order

The commercial transaction created after checkout.

### Fulfillment

The internal supplier-specific execution unit.

### Shipment / Delivery

The logistics execution associated with one or more fulfillments.

---

# 3. Customer Order vs Supplier Fulfillment

Example:

```text
Customer Order #BZ10045

Item A → Supplier A
Item B → Supplier A
Item C → Supplier B
```

Customer sees:

```text
Order #BZ10045
3 products
₹2,450
Delivery: Scheduled
```

Backend maintains:

```text
Order #BZ10045
 ├── Fulfillment F1 → Supplier A
 │    ├── Item A
 │    └── Item B
 │
 └── Fulfillment F2 → Supplier B
      └── Item C
```

This allows supplier independence without exposing unnecessary marketplace complexity to the buyer.

---

# 4. Order Lifecycle

Recommended order states:

```text
DRAFT
PENDING_PAYMENT
PAYMENT_AUTHORIZED
CONFIRMED
ALLOCATING
PARTIALLY_ALLOCATED
ALLOCATED
PROCESSING
READY_FOR_PICKUP
OUT_FOR_DELIVERY
PARTIALLY_DELIVERED
DELIVERED
COMPLETED
CANCELLED
PARTIALLY_CANCELLED
FAILED
REFUND_PENDING
REFUNDED
```

Not every order must pass through every state.

State transitions must be explicit and validated server-side.

---

# 5. Fulfillment Lifecycle

Each supplier fulfillment should have its own state:

```text
CREATED
PENDING_CONFIRMATION
CONFIRMED
PICKING
PACKED
READY_FOR_HANDOVER
HANDED_TO_LOGISTICS
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
FAILED
RETURN_REQUESTED
RETURNED
```

The parent order state is derived from the state of its fulfillments plus payment state.

---

# 6. Cart

Cart should contain:

```text
cart_id
buyer_id
items[]
delivery_address_id
delivery_mode
delivery_slot
created_at
updated_at
expires_at
```

Cart item:

```text
product_id
supplier_listing_id
quantity
selected_batch_policy
```

The cart is not a guarantee of inventory.

Inventory must be revalidated at checkout.

---

# 7. Cart Validation

Before checkout:

```text
validate buyer account
→ validate buyer eligibility
→ validate products
→ validate supplier listings
→ validate prices
→ validate stock
→ validate MOQ
→ validate shelf life
→ validate restrictions
→ validate delivery address
→ validate delivery mode
→ calculate totals
```

Any material mismatch should return a structured checkout error.

Example:

```json
{
  "code": "PRICE_CHANGED",
  "product_id": "uuid",
  "old_price": 84,
  "new_price": 86
}
```

The UI should show the buyer exactly what changed.

---

# 8. Inventory Reservation

Inventory reservation is mandatory for safe checkout.

Flow:

```text
Checkout request
      ↓
Begin transaction
      ↓
Lock / atomically reserve eligible stock
      ↓
Create reservation
      ↓
Create pending order
      ↓
Start payment
      ↓
Commit
```

Reservation record:

```text
reservation_id
order_id
fulfillment_id
product_id
batch_id
quantity
status
expires_at
created_at
released_at
```

Statuses:

```text
ACTIVE
CONFIRMED
RELEASED
EXPIRED
CANCELLED
```

---

# 9. Reservation Timeout

Reservations should have a configurable TTL.

Example:

```text
reservation_ttl = 10 minutes
```

This is configuration, not a hard-coded business rule.

Expired reservations:

```text
ACTIVE
  ↓ timeout
EXPIRED
  ↓
release inventory
```

The release operation must be idempotent.

---

# 10. Supplier Selection

Supplier selection should happen in the backend.

Inputs may include:

```text
available stock
supplier verification status
buyer eligibility
delivery coverage
delivery mode
distance / delivery capability
required shelf life
storage requirements
supplier price
MOQ
lead time
supplier reliability
supplier operational status
```

The system must not select an unverified or suspended supplier.

---

# 11. Multi-Supplier Allocation

If one supplier cannot fulfill the complete requested quantity:

```text
Requested: 100

Supplier A → 40 available
Supplier B → 60 available
```

The sourcing engine may create:

```text
Fulfillment A → 40
Fulfillment B → 60
```

The customer still sees:

```text
Quantity: 100
```

unless business rules require exposing the split.

Allocation must never exceed available eligible inventory.

---

# 12. Allocation Strategies

Support configurable strategies.

### Strategy A — Single Supplier

Prefer one supplier capable of fulfilling the entire order.

### Strategy B — Lowest Eligible Cost

Select eligible supplier inventory according to commercial pricing rules.

### Strategy C — Operational Optimization

Consider:

- delivery capability
- stock
- distance
- lead time
- price
- supplier reliability

### Strategy D — Hybrid

Use configurable weighted rules.

The initial implementation should keep the strategy behind a domain service interface so it can evolve without changing checkout.

---

# 13. FEFO Batch Allocation

For batch-tracked medicines:

```text
eligible batches
→ remove expired
→ remove recalled
→ remove blocked
→ apply shelf-life requirement
→ sort by expiry ascending
→ allocate quantity
```

Example:

```text
Batch A → expiry Jan → 20
Batch B → expiry Mar → 50
Batch C → expiry Jun → 100

Requested = 60

Allocate:
Batch A = 20
Batch B = 40
```

All allocations must be persisted.

---

# 14. Order Pricing Snapshot

The order must store a pricing snapshot.

Do not calculate historical order totals from the current catalog.

Order item snapshot should include:

```text
product_id
product_name
brand_name
generic_name
strength
dosage_form
pack_size
supplier_id
supplier_listing_id
unit_price
mrp
discount
tax
quantity
line_total
```

This preserves what the buyer actually purchased.

---

# 15. Order Totals

Recommended:

```text
subtotal
item_discount
shipping_fee
delivery_fee
instant_delivery_fee
tax
rounding_adjustment
grand_total
amount_paid
amount_refunded
amount_due
```

Example:

```text
Subtotal             ₹2,000
Discount              -₹150
Delivery               ₹30
Tax                    ₹90
----------------------------
Grand Total          ₹1,970
```

Actual calculation rules must come from the pricing/tax engine.

---

# 16. Delivery Modes

Bezzo should support:

### Instant

Priority delivery using an available logistics provider.

Example configurable surcharge:

```text
instant_delivery_fee = ₹30
```

This value must remain configurable.

### Scheduled

Buyer selects a delivery date and predefined slot.

Example:

```text
Morning     08:00–12:00
Afternoon   12:00–16:00
Evening     16:00–20:00
```

Slots are configurable by operating region.

---

# 17. Scheduled Delivery Architecture

Scheduled order flow:

```text
Checkout
→ store delivery date + slot
→ order confirmed
→ fulfillment queue
→ pre-dispatch processing
→ batch compatible orders
→ create route/run
→ handover to logistics
→ delivery
```

This enables route batching and operational efficiency.

---

# 18. Instant Delivery Architecture

Instant flow:

```text
Order confirmed
→ fulfillment ready
→ logistics quote/request
→ assign delivery
→ supplier handover
→ driver pickup
→ out for delivery
→ delivered
```

Instant delivery should fail gracefully if no eligible logistics provider is available.

---

# 19. Logistics Abstraction

Bezzo must not tightly couple the order domain to Porter.

Recommended interface:

```text
LogisticsProvider
 ├── createDelivery()
 ├── cancelDelivery()
 ├── getDeliveryStatus()
 ├── getQuote()
 └── trackDelivery()
```

Initial adapter:

```text
PorterAdapter
```

Future adapters:

```text
ProviderBAdapter
ProviderCAdapter
BezzoFleetAdapter
```

---

# 20. Delivery Entity

Recommended fields:

```text
delivery_id
fulfillment_id
provider
provider_order_id
delivery_mode
pickup_address
drop_address
scheduled_date
scheduled_slot
status
tracking_reference
driver_reference
estimated_pickup_at
estimated_delivery_at
actual_pickup_at
actual_delivery_at
created_at
updated_at
```

Do not expose sensitive driver information beyond what is required for delivery.

---

# 21. Fulfillment Packing

Supplier workflow:

```text
CONFIRMED
→ PICKING
→ PACKED
→ READY_FOR_HANDOVER
→ HANDED_TO_LOGISTICS
```

Picking should reference the exact allocated batches.

Packing confirmation should validate:

- Product
- Quantity
- Batch
- Expiry
- Packaging requirements
- Order/fulfillment identity

---

# 22. Partial Fulfillment

Partial fulfillment can occur because:

- Supplier stock changes
- Inventory is damaged/quarantined
- Logistics limitation
- Compliance restriction
- Buyer-approved substitution policy
- Supplier failure

System should distinguish:

```text
ORDER_PARTIALLY_FULFILLED
ORDER_PARTIALLY_CANCELLED
ORDER_PARTIALLY_REFUNDED
```

The buyer must receive clear status and financial information.

---

# 23. Supplier Failure

If Supplier A cannot fulfill:

```text
Supplier failure
→ verify remaining demand
→ attempt eligible reallocation
→ create replacement fulfillment
→ update buyer ETA
```

If reallocation fails:

```text
cancel affected quantity
→ refund affected amount
→ notify buyer
```

Never silently substitute products.

---

# 24. Product Substitution

Substitution should be explicitly controlled.

Default:

```text
NO AUTOMATIC SUBSTITUTION
```

If substitution is ever enabled, it must require a clearly defined buyer authorization policy and compliance validation.

Potential substitution fields:

```text
substitution_allowed
approved_alternatives[]
buyer_confirmation_required
```

---

# 25. Cancellation

Cancellation should be state-aware.

Example:

```text
PENDING_PAYMENT → cancel
CONFIRMED → cancel if policy allows
PICKING → restricted
PACKED → restricted
OUT_FOR_DELIVERY → usually restricted
DELIVERED → return/refund workflow
```

Cancellation rules must be configurable by order state, product class, and operational policy.

---

# 26. Payment Interaction

Order and payment must be separate domains.

Recommended:

```text
Order
Payment
PaymentTransaction
Refund
RefundTransaction
```

Payment states:

```text
PENDING
AUTHORIZED
PAID
FAILED
CANCELLED
REFUND_PENDING
PARTIALLY_REFUNDED
REFUNDED
```

Payment success must be confirmed server-side through the payment provider's verified callback/webhook.

---

# 27. COD

If COD is enabled:

```text
order
→ COD eligibility
→ fulfillment
→ delivery
→ collection
→ settlement
→ reconciliation
```

COD should be configurable by:

- Buyer
- Order value
- Product category
- Delivery region
- Supplier
- Risk controls

---

# 28. Order Status Calculation

Parent order status should be derived from child fulfillment states.

Example:

```text
F1 = DELIVERED
F2 = OUT_FOR_DELIVERY

Parent = PARTIALLY_DELIVERED / IN_PROGRESS
```

When:

```text
all fulfillments delivered
```

then:

```text
DELIVERED
```

When:

```text
all fulfillments completed
+ financial reconciliation complete
```

then:

```text
COMPLETED
```

---

# 29. Customer Order Timeline

Buyer should see a simple timeline:

```text
Order placed
     ↓
Payment confirmed
     ↓
Supplier preparing
     ↓
Packed
     ↓
Picked up
     ↓
Out for delivery
     ↓
Delivered
```

For split fulfillment:

```text
Order placed
 ├── Supplier A → Packed → Delivered
 └── Supplier B → Preparing → Out for delivery
```

The UI should remain understandable without exposing internal allocation complexity unnecessarily.

---

# 30. Notifications

Important events:

```text
ORDER_PLACED
PAYMENT_SUCCESS
PAYMENT_FAILED
ORDER_CONFIRMED
FULFILLMENT_CREATED
FULFILLMENT_DELAYED
PACKED
OUT_FOR_DELIVERY
DELIVERED
PARTIAL_FULFILLMENT
ITEM_CANCELLED
REFUND_INITIATED
REFUND_COMPLETED
```

Channels:

- Push
- SMS
- Email
- In-app
- Other approved messaging channels

Notifications must be idempotent.

---

# 31. Idempotency

Critical APIs must support idempotency.

Especially:

```text
create order
create payment
payment webhook
reserve inventory
release reservation
create fulfillment
create delivery
cancel order
refund payment
```

Example:

```http
Idempotency-Key: <unique-client-generated-key>
```

Repeated requests must not create duplicate orders, reservations, payments, or deliveries.

---

# 32. Failure Handling

Every external dependency can fail.

Examples:

```text
Payment gateway unavailable
Inventory service timeout
Supplier API unavailable
Porter API timeout
Search unavailable
Notification provider unavailable
```

Use:

```text
timeouts
retries
exponential backoff
circuit breakers where justified
idempotency
dead-letter handling
reconciliation jobs
```

Do not blindly retry non-idempotent operations.

---

# 33. Order Event Model

Recommended domain events:

```text
OrderCreated
PaymentAuthorized
PaymentCaptured
InventoryReserved
OrderAllocated
FulfillmentCreated
FulfillmentConfirmed
FulfillmentPacked
DeliveryCreated
DeliveryPickedUp
DeliveryDelivered
FulfillmentCancelled
OrderCancelled
RefundInitiated
RefundCompleted
```

Events should be recorded through an outbox/event mechanism where appropriate.

---

# 34. Database Entities

Recommended order-domain tables:

```text
carts
cart_items

orders
order_items
order_status_history

fulfillments
fulfillment_items
fulfillment_status_history

inventory_reservations
inventory_reservation_items

deliveries
delivery_events

payments
payment_transactions
refunds
refund_transactions

order_events
outbox_events
```

All important state changes should be auditable.

---

# 35. Supplier Tenant Isolation

Every supplier-owned record must carry or be resolvable to:

```text
supplier_id
```

Authorization pattern:

```text
authenticated_user
→ supplier_id from session/identity
→ query filtered by supplier_id
→ authorization check
→ response
```

Never trust a supplier-provided `supplier_id` as authorization.

Supplier A must not be able to manipulate Supplier B's:

- Orders
- Fulfillments
- Inventory
- Batches
- Pricing
- Customer information

---

# 36. Buyer Privacy

Suppliers should receive only the information required to fulfill their assigned items.

Avoid exposing:

- Unnecessary customer identity data
- Payment credentials
- Other suppliers
- Internal sourcing scores
- Internal risk scores
- Unrelated order items

Use minimum necessary disclosure.

---

# 37. Returns and Disputes

Pharmaceutical return policies require domain-specific compliance review.

The platform should nevertheless model:

```text
return_request
dispute
reason
evidence
status
resolution
refund_amount
```

Possible statuses:

```text
REQUESTED
UNDER_REVIEW
APPROVED
REJECTED
PICKUP_PENDING
RECEIVED
RESOLVED
```

Not every medicine/product category should automatically be returnable.

---

# 38. Refund Calculation

Refunds should be based on actual affected order lines and financial snapshots.

Example:

```text
Cancelled quantity = 10
Unit price = ₹80

Item refund = ₹800
```

Additional components may include:

- Tax reversal
- Delivery fee treatment
- Discount allocation
- Payment gateway charges according to policy
- COD handling
- Partial refund

Refund calculations must be deterministic and auditable.

---

# 39. Scheduled Order Batching

Scheduled orders should be queryable by:

```text
delivery_date
delivery_slot
delivery_region
supplier
warehouse/pickup location
special handling
```

Example:

```text
2026-09-20
Morning
Region A

→ 126 orders
→ 184 fulfillments
→ route planning
```

The batching engine should prepare operational groups without merging customer financial records.

---

# 40. Route Planning Integration

Route planning should operate on delivery tasks:

```text
Delivery Task
 ├── pickup location
 ├── drop location
 ├── delivery slot
 ├── package count
 ├── special handling
 └── order/fulfillment reference
```

The logistics layer decides how tasks are routed.

The order domain remains responsible for commercial/order state.

---

# 41. Observability

Track:

### Order metrics

```text
orders_created
orders_confirmed
orders_cancelled
orders_failed
average_order_value
```

### Fulfillment metrics

```text
fulfillments_created
supplier_confirmation_time
pick_time
pack_time
handover_time
```

### Inventory metrics

```text
reservation_success_rate
reservation_conflicts
oversell_attempts
allocation_failures
```

### Delivery metrics

```text
delivery_success_rate
pickup_delay
delivery_delay
provider_failures
```

---

# 42. Security Requirements

Order APIs must implement:

- Authentication
- RBAC
- Tenant isolation
- Object-level authorization
- Input validation
- Rate limiting
- Idempotency
- Audit logging
- Encryption in transit
- Secure payment handling
- Secure webhook verification

Never expose payment credentials or sensitive provider secrets to clients.

---

# 43. API Surface

Representative APIs:

```text
GET    /v1/cart
POST   /v1/cart/items
PATCH  /v1/cart/items/:itemId
DELETE /v1/cart/items/:itemId

POST   /v1/checkout/validate
POST   /v1/orders
GET    /v1/orders
GET    /v1/orders/:orderId
POST   /v1/orders/:orderId/cancel

GET    /v1/orders/:orderId/fulfillments

GET    /v1/supplier/fulfillments
GET    /v1/supplier/fulfillments/:fulfillmentId
POST   /v1/supplier/fulfillments/:fulfillmentId/confirm
POST   /v1/supplier/fulfillments/:fulfillmentId/pack
POST   /v1/supplier/fulfillments/:fulfillmentId/handover

GET    /v1/deliveries/:deliveryId
GET    /v1/orders/:orderId/tracking
```

Payment and logistics endpoints should be isolated behind dedicated modules.

---

# 44. Checkout Transaction Boundary

A robust checkout should approximately follow:

```text
1. Authenticate buyer
2. Load cart
3. Validate buyer eligibility
4. Revalidate product/listing
5. Revalidate price
6. Revalidate stock
7. Select eligible supplier(s)
8. Allocate batches
9. Reserve inventory
10. Calculate final price
11. Create order
12. Create fulfillments
13. Initiate payment
14. Persist state
15. Emit events
```

The exact transaction boundaries depend on payment-provider behavior.

Do not hold a long database transaction while waiting on external network calls.

---

# 45. Reconciliation

Scheduled jobs should reconcile:

```text
orders vs payments
orders vs reservations
orders vs fulfillments
fulfillments vs deliveries
payments vs gateway records
refunds vs gateway records
```

Reconciliation is required because external systems can acknowledge operations asynchronously.

---

# 46. Disaster Recovery

Order data is business-critical.

Required:

- Automated database backups
- Point-in-time recovery where supported
- Replication/HA appropriate to production tier
- Tested restore process
- Durable event/outbox storage
- Reconciliation after recovery

Recovery procedures must be tested, not merely documented.

---

# 47. Acceptance Criteria

The order/fulfillment system is ready for production-readiness review when:

- Cart and order are separate entities.
- Checkout revalidates stock and price.
- Inventory reservations prevent overselling.
- Reservations expire safely.
- Canonical orders can contain multiple supplier fulfillments.
- Supplier isolation is enforced.
- FEFO batch allocation works.
- Expired/recalled inventory cannot be allocated.
- Instant and scheduled delivery are supported.
- Logistics is provider-agnostic.
- Porter integration is implemented behind an adapter.
- Payment confirmation is server-verified.
- Critical operations are idempotent.
- Partial fulfillment/cancellation/refund is supported.
- Order timelines are customer-readable.
- Notifications are event-driven and idempotent.
- Reconciliation jobs exist.
- Audit history exists for critical state changes.
- Load/concurrency tests pass defined thresholds.

---

# 48. Recommended Implementation Sequence

```text
1. Cart
2. Checkout validation
3. Pricing snapshot
4. Inventory reservation
5. Order creation
6. Supplier allocation
7. Fulfillment creation
8. FEFO batch allocation
9. Payment integration
10. Supplier fulfillment workflow
11. Logistics abstraction
12. Porter adapter
13. Instant delivery
14. Scheduled delivery
15. Notifications
16. Cancellation/refunds
17. Returns/disputes
18. Reconciliation
19. Analytics
20. Operational route batching
```

---

# 49. Final Principle

Bezzo should keep the customer experience simple while the backend handles the complexity.

```text
ONE CUSTOMER ORDER
        ↓
MANY INTERNAL FULFILLMENTS
        ↓
MANY SUPPLIERS
        ↓
MANY BATCHES
        ↓
LOGISTICS EXECUTION
```

The buyer should experience a single trustworthy marketplace transaction.

Internally, Bezzo must maintain precise supplier ownership, inventory reservations, batch traceability, financial accounting, delivery state, and audit history.

This separation is essential for scaling Bezzo from an initial marketplace into a larger pharmaceutical B2B fulfillment platform.

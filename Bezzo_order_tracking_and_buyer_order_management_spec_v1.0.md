# Bezzo Order Tracking & Buyer Order Management Specification v1.0

**Product:** Bezzo  
**Document:** Order Tracking & Buyer Order Management Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Buyer order history, order details, status tracking, fulfillment visibility, delivery tracking, cancellation, reorder, invoices, support entry points, notifications, and order lifecycle presentation.

---

# 1. Purpose

The Bezzo Order Tracking & Buyer Order Management system gives medical-store buyers a reliable view of every order after checkout.

It covers:

- Order history
- Order detail
- Order status
- Supplier fulfillment visibility
- Delivery tracking
- Scheduled delivery tracking
- Instant delivery tracking
- Cancellation
- Reorder
- Invoice access
- Payment status
- Support access
- Notifications
- Failed/partial fulfillment visibility

The system must distinguish customer-facing status from internal operational events.

---

# 2. Core Principles

## 2.1 One customer order

A buyer should normally see one customer-facing order even when the backend uses multiple supplier fulfillments.

```text
Buyer Order
    |
    +-- Fulfillment A -> Supplier A
    |
    +-- Fulfillment B -> Supplier B
```

## 2.2 Authoritative order state

Order status must come from the order/fulfillment system rather than being inferred from the mobile or web client.

## 2.3 Clear status

The buyer should understand:

- What happened
- What is happening now
- What happens next
- When delivery is expected

## 2.4 No misleading certainty

Estimated delivery times must be represented as estimates unless a guaranteed delivery commitment is explicitly supported by the operational system.

---

# 3. Buyer Order List

The order history page should provide:

```text
Order ID
Order date
Item count
Order total
Current status
Delivery date/slot
Primary action
```

Example:

```text
BZ-100001
6 products
₹4,250
Out for delivery
Today · 4–8 PM

[Track Order]
```

---

# 4. Order History Filters

Recommended filters:

- All
- Active
- Delivered
- Cancelled
- Failed
- Partially fulfilled

Additional filters may include:

- Date range
- Delivery mode
- Payment method
- Supplier where appropriate

---

# 5. Order Search

Buyer may search their own order history by:

- Order ID
- Product name
- Date
- Invoice reference

Search must be scoped to the authenticated buyer organization.

---

# 6. Order Detail

Order detail should contain:

```text
Order header
Payment summary
Products
Fulfillment status
Delivery information
Address
Invoice
Support
Timeline
```

---

# 7. Order Header

Recommended:

```text
Order BZ-100001
Placed on 19 Sep 2026
Status: Out for delivery
```

Actions may include:

```text
Track delivery
Cancel
Reorder
Download invoice
Get help
```

Only valid actions should be displayed.

---

# 8. Customer-Facing Order States

Recommended primary states:

```text
PAYMENT_PENDING
CONFIRMED
PROCESSING
PARTIALLY_FULFILLED
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
FAILED
```

Internal states may be more granular.

---

# 9. Order Timeline

The buyer should see a simplified timeline.

Example:

```text
Order placed
     |
Order confirmed
     |
Preparing your order
     |
Picked up
     |
Out for delivery
     |
Delivered
```

The system may expose timestamps for meaningful events.

---

# 10. Internal vs Customer Events

Internal events may include:

```text
supplier_assignment_created
inventory_reserved
supplier_pick_started
porter_job_created
route_assigned
```

These do not all need to be shown to the buyer.

Customer-facing events should be curated from the internal event stream.

---

# 11. Multi-Supplier Orders

For a multi-supplier order:

```text
Order BZ-100001
 |
 +-- Fulfillment 1
 |      Supplier A
 |      4 products
 |
 +-- Fulfillment 2
        Supplier B
        2 products
```

The buyer should understand if different parts of the order have different statuses or delivery times.

---

# 12. Partial Fulfillment

If some products are ready and others are not:

```text
Order
 |
 +-- Fulfillment A -> Ready
 |
 +-- Fulfillment B -> Processing
```

Customer-facing status:

```text
PARTIALLY_FULFILLED
```

The UI should clearly identify affected items without exposing unnecessary internal complexity.

---

# 13. Delivery Tracking

For orders requiring delivery tracking:

```text
Order
 |
Fulfillment
 |
Delivery Job
 |
Logistics Provider
 |
Tracking Events
```

The buyer may see:

- Delivery mode
- Estimated delivery window
- Current delivery status
- Driver/rider information where supported and appropriate
- Tracking information where supported
- Delivery proof after completion

---

# 14. Porter Integration

For the initial logistics implementation, delivery tracking should consume the normalized logistics status rather than directly coupling the buyer UI to Porter-specific fields.

```text
Buyer App
    |
Order Tracking API
    |
Logistics Abstraction
    |
Porter Adapter
```

This allows future logistics providers or a Bezzo-owned fleet without redesigning the buyer experience.

---

# 15. Instant Delivery Tracking

For instant delivery:

```text
Order confirmed
     |
Preparing
     |
Picked up
     |
Out for delivery
     |
Delivered
```

Where live location is supported by the logistics provider and appropriate for the product, the buyer may receive a live tracking view.

---

# 16. Scheduled Delivery Tracking

Scheduled orders should show:

```text
Delivery date
Delivery slot
Preparation status
Dispatch status
Current delivery status
```

Example:

```text
Tomorrow
Afternoon slot
12:00–16:00
```

The exact slot is configurable.

---

# 17. Scheduled Delivery Reminders

Notifications may be sent:

```text
Before scheduled date
Before delivery slot
When preparation begins
When dispatched
When out for delivery
When delivered
```

Notification timing should be configurable.

---

# 18. Delivery ETA

ETA may be derived from:

- Logistics provider
- Route
- Delivery slot
- Operational estimate

If ETA changes materially, the buyer should receive an updated estimate.

---

# 19. Address Display

Order detail should display the delivery address associated with the order.

The address stored on the order should be an immutable order snapshot.

Changes to the buyer's saved address after ordering must not modify historical order address data.

---

# 20. Payment Status

Order detail should show relevant payment status:

```text
Paid
Payment pending
Cash on delivery
Refund initiated
Refund completed
Partially refunded
```

Payment information must come from the payment system.

---

# 21. Order Amount

Display:

```text
Items subtotal
Discount
Tax where applicable
Delivery fee
Other charges
Grand total
```

Historical order amounts should not change when catalog prices later change.

---

# 22. Invoice

Where an invoice is available, buyer should be able to:

```text
View invoice
Download invoice
```

Invoice access must be authorized to the buyer organization.

The invoice record should be generated from authoritative financial/order data.

---

# 23. Reorder

A buyer can reorder eligible previously purchased products.

Flow:

```text
Previous order
     |
Reorder
     |
Current product validation
     |
Current price validation
     |
Current inventory validation
     |
Cart
```

Never blindly recreate the historical order.

---

# 24. Reorder Exceptions

A historical item may no longer be eligible because:

- Product blocked
- Product archived
- Supplier unavailable
- Buyer eligibility changed
- Product unavailable
- Current catalog data changed

The buyer should be told which items could not be added.

---

# 25. Cancellation

Cancellation must be based on current order state and policy.

Possible states:

```text
CANCELLABLE
NOT_CANCELLABLE
```

The UI should show cancellation only when the order is eligible.

---

# 26. Cancellation Flow

```text
Buyer selects Cancel
        |
Validate order state
        |
Check fulfillment state
        |
Check cancellation policy
        |
Calculate applicable refund
        |
Confirm cancellation
        |
Cancel order
        |
Release applicable inventory
        |
Cancel delivery where possible
        |
Initiate refund where applicable
```

---

# 27. Cancellation Reasons

Recommended options:

```text
Ordered by mistake
No longer required
Delivery timing issue
Found another source
Duplicate order
Other
```

Reason collection should be configurable.

---

# 28. Cancellation and Multi-Supplier Orders

For partially processed multi-supplier orders, cancellation may be:

```text
Full order cancellation
```

or:

```text
Partial cancellation
```

depending on fulfillment state and policy.

The order service must determine the authoritative result.

---

# 29. Refund After Cancellation

Cancellation should not directly assume refund completion.

```text
Order cancelled
     |
Refund requested
     |
Gateway processing
     |
Refund confirmed
```

The buyer should see separate cancellation and refund states when appropriate.

---

# 30. Failed Orders

If order placement fails:

```text
FAILED
```

Buyer should see:

- Clear explanation
- Payment status
- Whether retry is possible
- Support option where needed

If payment succeeded but order creation failed, the recovery workflow must resolve the payment/order mismatch before presenting a misleading final state.

---

# 31. Delivery Failure

Examples:

```text
Delivery attempt failed
Recipient unavailable
Address issue
Provider failure
Operational delay
```

The buyer-facing response should explain the next expected action.

Possible actions:

- Retry delivery
- Reschedule
- Contact support
- Update address where policy permits

---

# 32. Order Support

Every order should have a direct support entry point.

```text
Order detail
   |
Get help
   |
Create/select support case
```

The support case should automatically reference:

```text
order_id
buyer_id
relevant fulfillment_id
delivery_id where applicable
payment_id where applicable
```

---

# 33. Product-Level Support

The buyer should be able to report an issue against a specific order item.

Examples:

- Missing item
- Wrong item
- Damaged item
- Product quality concern
- Expiry/batch concern

The support case should reference the specific order item where possible.

---

# 34. Order Notifications

Order-related notifications should cover:

```text
Order confirmed
Payment confirmed
Order processing
Partial fulfillment
Dispatched
Out for delivery
Delivery delayed
Delivered
Cancelled
Refund initiated
Refund completed
```

Notification delivery follows the Bezzo Notification & Communication specification.

---

# 35. Notification Deduplication

A single business event should not generate duplicate buyer notifications because of retry or repeated webhook processing.

Use event IDs/idempotency keys.

---

# 36. Order Event Timeline

Recommended internal events:

```text
order_created
payment_confirmed
inventory_reserved
fulfillment_created
fulfillment_processing
fulfillment_ready
delivery_created
delivery_picked_up
delivery_out_for_delivery
delivery_delivered
order_cancelled
refund_requested
refund_completed
```

Events should be immutable and auditable.

---

# 37. Tracking API

Recommended endpoints:

```text
GET /orders/v1
GET /orders/v1/{order_id}
GET /orders/v1/{order_id}/timeline
GET /orders/v1/{order_id}/fulfillments
GET /orders/v1/{order_id}/delivery
GET /orders/v1/{order_id}/invoice
POST /orders/v1/{order_id}/cancel
POST /orders/v1/{order_id}/reorder
POST /orders/v1/{order_id}/support
```

The final API contract must align with the canonical Bezzo API specification.

---

# 38. Order Detail Response

Conceptual response:

```json
{
  "order_id": "BZ-100001",
  "status": "OUT_FOR_DELIVERY",
  "placed_at": "2026-09-19T10:30:00Z",
  "total": 425000,
  "currency": "INR",
  "delivery": {
    "mode": "SCHEDULED",
    "slot": "AFTERNOON",
    "status": "OUT_FOR_DELIVERY"
  },
  "items": [],
  "fulfillments": []
}
```

Actual fields must follow the canonical API model.

---

# 39. Authorization

Every order request must verify:

```text
Authenticated user
      |
Buyer organization membership
      |
Order belongs to organization
      |
Requested action permitted
```

Never authorize an order solely because the caller knows its ID.

---

# 40. Historical Data Integrity

Historical order records should preserve:

- Product information at purchase time
- Quantity
- Price
- Discount
- Tax components
- Delivery address snapshot
- Payment references
- Fulfillment records
- Relevant status history

Current catalog changes must not rewrite historical order facts.

---

# 41. Search and Order History

Order history search should use a buyer-scoped read model or indexed query path when necessary.

It must never expose another buyer's order data.

---

# 42. Performance

The order history screen should remain fast even for buyers with many historical orders.

Use:

- Pagination
- Cursor-based retrieval where appropriate
- Indexed order queries
- Compact list responses
- Lazy-loaded detailed timelines
- Cached non-sensitive metadata where appropriate

---

# 43. Offline / Poor Network Handling

Mobile clients should gracefully handle intermittent connectivity.

For read operations:

```text
Cached order summary
       |
Refresh when network returns
```

For mutations such as cancellation, never show a completed action until the server confirms it.

---

# 44. Real-Time Updates

Order tracking can use:

- Push notifications
- Polling
- Server-sent events where appropriate
- WebSockets where justified

The first release can use push plus controlled polling if real-time infrastructure is not yet required.

---

# 45. Logistics Webhook Processing

Provider events should flow through:

```text
Provider Webhook
      |
Webhook Verification
      |
Logistics Adapter
      |
Normalized Delivery Event
      |
Order/Fulfillment Service
      |
Buyer Tracking Read Model
      |
Notification
```

Provider-specific event names must not leak into the buyer application.

---

# 46. Out-of-Order Events

Logistics and payment systems may deliver events out of order.

The backend should use:

- Event timestamps
- Provider event IDs
- State transition validation
- Idempotency
- Ordering rules where available

An older event must not incorrectly move an order backward to an invalid state.

---

# 47. Duplicate Events

Webhook/event processing must be idempotent.

Example:

```text
delivery_delivered event
     |
Received twice
     |
One state transition
     |
One notification
```

---

# 48. Security

Order tracking must implement:

- Authentication
- Authorization
- Tenant isolation
- Secure invoice access
- Rate limiting
- Audit logging
- Secure tracking URLs
- No sensitive payment data exposure

Driver/rider information should only be displayed when explicitly supported and appropriate.

---

# 49. Testing

## Unit tests

Test:

- Order state transitions
- Cancellation eligibility
- Reorder eligibility
- Timeline generation
- Fulfillment aggregation
- Refund-state presentation

## Integration tests

Test:

- Order service
- Fulfillment service
- Logistics adapter
- Payment service
- Notification service
- Invoice service
- Support service

## Webhook tests

Test:

- Duplicate events
- Out-of-order events
- Invalid signatures
- Unknown events
- Provider retry behavior

## End-to-end

```text
Place order
 ->
Order confirmed
 ->
Supplier fulfillment
 ->
Delivery created
 ->
Delivery picked up
 ->
Out for delivery
 ->
Delivered
 ->
Buyer sees completed order
 ->
Invoice available
 ->
Reorder available
```

---

# 50. Acceptance Criteria

The system is production-ready when:

- Buyers can view their order history.
- Buyers can open order details.
- Order status is authoritative.
- Multi-supplier orders are represented clearly.
- Fulfillment status is visible where relevant.
- Delivery tracking is available.
- Instant and scheduled delivery are supported.
- Cancellation eligibility is enforced server-side.
- Refund state is shown separately from cancellation.
- Buyers can reorder eligible historical products.
- Historical order information remains immutable.
- Invoices are securely accessible.
- Buyers can create support cases from an order.
- Notifications are generated from authoritative events.
- Duplicate logistics events do not duplicate state transitions or notifications.
- Unauthorized buyers cannot access another organization's orders.
- Order tracking remains performant for large histories.

---

# 51. Implementation Sequence

## Phase 1 — Order History

1. Order list API
2. Order detail API
3. Buyer-scoped authorization
4. Order timeline
5. Basic status presentation

## Phase 2 — Fulfillment Tracking

6. Fulfillment aggregation
7. Supplier fulfillment status
8. Logistics delivery status
9. Scheduled delivery status
10. Delivery timeline

## Phase 3 — Buyer Actions

11. Cancellation
12. Refund status
13. Reorder
14. Invoice
15. Order support

## Phase 4 — Real-Time Experience

16. Logistics webhooks
17. Push updates
18. Live tracking where supported
19. Delivery ETA updates

## Phase 5 — Optimization

20. Order-history search
21. Advanced filtering
22. Performance optimization
23. Advanced tracking analytics

---

# 52. Recommended Buyer Order Experience

The buyer-facing flow should remain simple:

```text
My Orders
    |
    +-- Active Orders
    |
    +-- Past Orders

Active Order
    |
    +-- Status
    +-- Delivery
    +-- Items
    +-- Total
    +-- Invoice
    +-- Help
```

For an active delivery:

```text
Order confirmed
      |
Preparing
      |
Picked up
      |
Out for delivery
      |
Delivered
```

The complexity of supplier routing, internal fulfillment, inventory reservation, and logistics-provider orchestration should remain behind the customer-facing experience.

---

# 53. Final Architecture

```text
                    Buyer Web / Android / iOS
                              |
                              v
                       Order Tracking API
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
        Order Service    Fulfillment       Delivery
             |                |                |
             |                |          Logistics Adapter
             |                |                |
             +----------------+----------------+
                              |
                              v
                     Tracking Read Model
                              |
               +--------------+--------------+
               |                             |
               v                             v
        Buyer Timeline                Notifications
```

The tracking system should provide a stable customer-facing abstraction over the underlying order, supplier, payment, and logistics systems.

---

# 54. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Buyer order history, order tracking, fulfillment visibility, delivery tracking, cancellation, reorder, invoices, and support

This specification should be implemented together with the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, admin/backoffice, analytics/reporting, identity, search/discovery, cart/checkout, and customer-support specifications.

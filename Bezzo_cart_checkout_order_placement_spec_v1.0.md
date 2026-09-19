# Bezzo Cart, Checkout & Order Placement Specification v1.0

**Product:** Bezzo  
**Document:** Cart, Checkout & Order Placement Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Cart management, inventory validation, supplier assignment, pricing validation, address selection, delivery selection, payment initiation, order creation, idempotency, failure recovery, and order confirmation.

---

# 1. Purpose

The Bezzo Cart and Checkout system converts product discovery into a validated B2B pharmaceutical marketplace order.

```text
Product Discovery
      |
Add to Cart
      |
Cart Validation
      |
Checkout
      |
Address
      |
Delivery
      |
Pricing
      |
Inventory
      |
Payment
      |
Order Creation
      |
Confirmation
```

The checkout system must never rely on stale client-side price, inventory, eligibility, or supplier information.

---

# 2. Core Principles

## 2.1 Server is authoritative

The backend is authoritative for:

- Product eligibility
- Product status
- Price
- Inventory
- Supplier availability
- Delivery availability
- Fees
- Taxes where applicable
- Discounts
- Payment state
- Order state

## 2.2 Revalidate before order creation

```text
Cart
  |
Checkout validation
  |
Inventory reservation
  |
Order creation
```

## 2.3 Never charge against an unvalidated order

Payment initiation must happen against a server-created checkout/order context with a known amount.

## 2.4 Idempotency

Retries must not create duplicate orders, payments, reservations, or supplier fulfillments.

---

# 3. Cart Ownership

A cart belongs to a buyer organization/account and must be isolated from other buyers.

---

# 4. Cart Model

Recommended entities:

```text
carts
cart_items
cart_events
cart_validation_results
```

Cart fields:

```text
id
buyer_organization_id
status
currency
created_at
updated_at
expires_at
```

States:

```text
ACTIVE
CHECKOUT_IN_PROGRESS
CONVERTED
ABANDONED
EXPIRED
```

---

# 5. Cart Item

Recommended:

```text
cart_item_id
cart_id
product_id
quantity
selected_supplier_id
added_price_snapshot
created_at
updated_at
```

The price snapshot is informational. Final price must be recalculated server-side.

---

# 6. Add to Cart

```text
Buyer
  |
Select product
  |
Select quantity
  |
Add to cart API
  |
Validate basic eligibility
  |
Create/update cart item
```

Validate product existence, purchasability, buyer eligibility, quantity, block status, and basic availability.

---

# 7. Quantity Rules

Quantity validation may include:

- Minimum order quantity
- Maximum order quantity
- Pack-size constraints
- Supplier-specific constraints
- Buyer-specific limits
- Product-specific restrictions

Rules must be server-side.

---

# 8. Cart Operations

Support:

```text
Add item
Remove item
Increase quantity
Decrease quantity
Set quantity
Clear cart
```

Every mutation returns the updated authoritative cart state.

---

# 9. Cart Validation

Checkout validation verifies:

```text
Product status
Buyer eligibility
Supplier eligibility
Current price
Inventory
Quantity limits
Delivery serviceability
Promotions
Fees
Tax configuration where applicable
```

Return `VALID` or structured validation errors.

---

# 10. Cart Errors

Examples:

```text
PRODUCT_UNAVAILABLE
PRODUCT_BLOCKED
INSUFFICIENT_STOCK
QUANTITY_LIMIT_EXCEEDED
PRICE_CHANGED
SUPPLIER_UNAVAILABLE
DELIVERY_UNAVAILABLE
BUYER_NOT_ELIGIBLE
```

The UI should provide actionable explanations.

---

# 11. Price Changes

If price changes after an item was added:

```text
Old cart price
      |
Checkout validation
      |
Current price differs
      |
Inform buyer
      |
Buyer confirms updated cart
```

Do not silently charge a different price from what the buyer reviewed.

---

# 12. Inventory Changes

If stock becomes unavailable:

```text
Cart
 |
Checkout validation
 |
Insufficient stock
 |
Show affected item
 |
Adjust quantity / remove / choose available supplier
```

Never create an order with unreserved unavailable inventory.

---

# 13. Supplier Selection

Supplier assignment may occur at cart time for display or during checkout/order orchestration. The authoritative assignment is server-side.

Example:

```text
Product X

Supplier A -> Stock 0
Supplier B -> Stock 20
Supplier C -> Stock 5
```

The order service selects an eligible supplier according to routing rules.

---

# 14. Supplier Selection Rules

Potential factors:

- Stock availability
- Supplier active/verified status
- Serviceability
- Delivery capability
- Supplier fulfillment constraints
- Product eligibility
- Operational capacity
- Buyer eligibility
- Configured routing rules

The detailed routing strategy belongs to the fulfillment/order-routing subsystem.

---

# 15. Multi-Supplier Cart

A customer cart can contain products fulfilled by multiple suppliers.

```text
Cart
 |
 +-- Product A -> Supplier 1
 |
 +-- Product B -> Supplier 2
 |
 +-- Product C -> Supplier 1
```

Customer experience should ideally remain one checkout and one order.

Internally:

```text
Order
 |
 +-- Fulfillment 1 -> Supplier 1
 |
 +-- Fulfillment 2 -> Supplier 2
```

---

# 16. Checkout Session

Recommended entity:

```text
checkout_sessions
```

Fields:

```text
id
cart_id
buyer_organization_id
status
currency
subtotal
discount_total
delivery_fee
tax_total
grand_total
address_id
delivery_mode
delivery_slot
payment_method
expires_at
created_at
updated_at
```

States:

```text
CREATED
VALIDATING
READY_FOR_PAYMENT
PAYMENT_PENDING
ORDER_CREATED
FAILED
EXPIRED
CANCELLED
```

---

# 17. Checkout Creation

```text
Cart
 |
Create checkout session
 |
Load current cart
 |
Validate buyer
 |
Validate products
 |
Validate pricing
 |
Validate delivery
 |
Calculate totals
 |
READY_FOR_PAYMENT
```

Checkout sessions should expire after a configurable period.

---

# 18. Address Selection

Validate:

- Address completeness
- Buyer ownership
- Serviceability
- Delivery provider coverage
- Delivery mode
- Delivery slot availability

A buyer must not submit another organization's address.

---

# 19. Delivery Modes

Initial modes:

```text
INSTANT
SCHEDULED
```

Instant delivery is priority/immediate delivery where available.

Scheduled delivery uses configurable date/slot windows such as Morning, Afternoon, and Evening.

---

# 20. Delivery Fee

Conceptually:

```text
Base delivery fee
+
Instant surcharge where applicable
+
Other configured delivery charges
=
Delivery fee
```

Fees are server-calculated and configuration-driven.

---

# 21. Scheduled Delivery Validation

```text
Address serviceable?
        |
Slot available?
        |
Supplier operationally eligible?
        |
Delivery capacity available?
        |
Yes -> continue
```

Capacity can be controlled by region, date, slot, route, provider, and operational capacity.

---

# 22. Pricing Calculation

Recommended:

```text
Item subtotal
- Discounts
+ Taxes where applicable
+ Delivery fee
+ Other applicable charges
= Grand total
```

Each component should be separately represented.

---

# 23. Money Representation

Do not use floating-point arithmetic for monetary values.

Use integer minor units or a fixed-precision decimal strategy consistently across services.

Example:

```text
₹100.50 -> 10050 paise
```

---

# 24. Currency

Initial marketplace currency:

```text
INR
```

Store currency explicitly on financial records.

---

# 25. Discounts

Possible types:

```text
PRODUCT_DISCOUNT
ORDER_DISCOUNT
SUPPLIER_DISCOUNT
PROMOTIONAL_DISCOUNT
```

Discount rules must be configurable and auditable.

---

# 26. Coupon / Promotion Support

If introduced:

```text
Enter code
   |
Validate
   |
Check eligibility
   |
Calculate discount
   |
Apply to checkout
```

Validate buyer, date, product, minimum order, usage, supplier, and geographic constraints.

---

# 27. Tax Handling

Tax calculations must follow Bezzo's applicable tax/accounting policy.

Checkout should retain tax components separately rather than storing only one unexplained total.

---

# 28. Checkout Summary

Before payment display:

```text
Products
Quantities
Supplier/fulfillment information where appropriate
Subtotal
Discount
Tax
Delivery fee
Total
Delivery address
Delivery mode
Delivery slot
Payment method
```

The buyer must explicitly confirm the reviewed order details.

---

# 29. Payment Methods

Potential methods:

```text
UPI
Cards
Net Banking
Wallet / supported digital methods
COD where permitted
```

Availability is configuration-driven.

---

# 30. Payment Initiation

```text
Checkout validated
      |
Create payment/order context
      |
Initiate gateway payment
      |
Buyer completes payment
      |
Gateway response/webhook
      |
Server verifies payment
      |
Create/confirm order
```

Client-side success is never final payment confirmation.

---

# 31. COD

COD may be available only when eligibility rules permit it.

Eligibility may consider buyer, address, order value, product type, delivery mode, region, supplier, and risk controls.

COD orders require collection and settlement tracking.

---

# 32. Payment State

Recommended:

```text
PENDING
AUTHORIZED
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
CANCELLED
```

Payment and order state machines remain separate.

---

# 33. Order Creation Strategy

Recommended:

```text
Checkout
 |
Reserve inventory
 |
Create order
 |
Create fulfillment records
 |
Create payment association
 |
Commit
```

If a critical step fails, roll back safely or enter a recoverable intermediate state.

---

# 34. Inventory Reservation

```text
Available stock
      |
Reserve quantity
      |
Reserved stock
      |
Order confirmed
      |
Committed stock
```

If payment/order creation fails, release reservations according to policy.

---

# 35. Reservation Expiration

States:

```text
ACTIVE
COMMITTED
RELEASED
EXPIRED
```

Expiration processing must be idempotent.

---

# 36. Order Number

Each successful order receives a unique customer-facing identifier.

Example:

```text
BZ-1000001
```

Internal database IDs remain separate from customer-facing identifiers.

---

# 37. Order States

Recommended:

```text
CREATED
PAYMENT_PENDING
CONFIRMED
PROCESSING
PARTIALLY_FULFILLED
FULFILLED
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
FAILED
```

Final transitions must align with the order/fulfillment specification.

---

# 38. Fulfillment Creation

```text
Order
 |
Routing
 |
Supplier assignment
 |
Fulfillment records
```

Example:

```text
Order BZ-1001

Fulfillment F1 -> Supplier A
Fulfillment F2 -> Supplier B
```

---

# 39. Checkout / Fulfillment Separation

Recommended boundaries:

```text
Cart
  |
Checkout
  |
Order Service
  |
Fulfillment / Supplier Routing
  |
Logistics
```

Checkout should not contain the entire fulfillment implementation.

---

# 40. Idempotency

Critical APIs should support idempotency keys:

```text
POST /cart/items
POST /checkout
POST /payment/initiate
POST /orders
POST /refunds
```

For order creation, a buyer plus idempotency key must map to at most one successful order.

---

# 41. Duplicate Submit Protection

The UI may disable repeated submission, but the backend must also prevent duplicates.

```text
Buyer taps Place Order
      |
Request A
Request B due to retry
      |
Same idempotency key
      |
Same order result
```

---

# 42. Checkout Timeout

If a checkout session expires:

```text
Checkout
   |
EXPIRED
   |
No order creation
   |
Release applicable reservations
```

The buyer can create a new checkout session.

---

# 43. Payment Failure

```text
Payment FAILED
      |
Order not confirmed
      |
Reservation handling
      |
Buyer can retry
```

Retry must not create duplicate orders.

---

# 44. Payment Success but Order Failure

Critical recovery scenario:

```text
Payment succeeds
      |
Order creation fails
      |
Create recovery record
      |
Reconcile payment
      |
Recover order OR initiate controlled refund
```

This workflow must be monitored and operationally recoverable.

---

# 45. Order Confirmation

After authoritative order creation show:

- Order ID
- Payment status
- Items
- Delivery mode
- Delivery slot
- Estimated delivery information

Send configured push, in-app, email, SMS, or WhatsApp notifications.

---

# 46. Confirmation Screen

Recommended:

```text
Order Confirmed

Order ID: BZ-1000001

Items: 6
Total: ₹X

Delivery:
Scheduled
Morning

[Track Order]
[View Order]
[Continue Shopping]
```

Avoid exposing unnecessary internal supplier-routing details.

---

# 47. Cart Persistence

Cart should survive app restart and browser refresh where policy permits.

Restored carts must be revalidated.

Stale items should be clearly identified.

---

# 48. Guest Cart

If guest browsing is allowed, anonymous carts may be supported.

```text
Guest cart
    |
Login / account creation
    |
Merge with buyer cart
    |
Validate
```

The initial release may require authentication before checkout.

---

# 49. Cart Merge

If anonymous and buyer carts both exist, resolve:

- Duplicate products
- Quantity limits
- Current prices
- Inventory
- Product availability

No stale pricing should survive the merge.

---

# 50. Quantity Concurrency

Multiple devices may modify the same buyer cart.

Use a consistent strategy such as:

- Optimistic locking
- Version numbers
- Atomic updates

---

# 51. Checkout Concurrency

Multiple checkout attempts must not oversell the same inventory.

Inventory reservation is authoritative.

---

# 52. Address Changes

Changing address during checkout triggers revalidation of:

- Serviceability
- Delivery fee
- Delivery slot
- Supplier routing
- Estimated delivery

---

# 53. Delivery Mode Changes

Switching between Instant and Scheduled must recalculate:

- Availability
- Fee
- Slot
- ETA
- Provider eligibility

---

# 54. Checkout Events

Recommended:

```text
cart_created
cart_item_added
cart_item_removed
cart_updated
checkout_started
checkout_validated
checkout_failed
inventory_reservation_created
inventory_reservation_released
payment_initiated
payment_succeeded
payment_failed
order_created
order_creation_failed
order_confirmed
```

Events must be versioned and idempotently processed.

---

# 55. APIs

Cart:

```text
GET    /cart/v1
POST   /cart/v1/items
PATCH  /cart/v1/items/{id}
DELETE /cart/v1/items/{id}
DELETE /cart/v1
```

Checkout:

```text
POST  /checkout/v1
GET   /checkout/v1/{id}
POST  /checkout/v1/{id}/validate
PATCH /checkout/v1/{id}/address
PATCH /checkout/v1/{id}/delivery
PATCH /checkout/v1/{id}/payment-method
POST  /checkout/v1/{id}/confirm
```

Orders may be owned by the order service:

```text
POST /orders/v1
GET  /orders/v1/{id}
```

Final public API naming must follow the canonical Bezzo API specification.

---

# 56. Data Model

Recommended:

```text
carts
cart_items
cart_events

checkout_sessions
checkout_items
checkout_price_snapshots
checkout_validation_errors

inventory_reservations
inventory_reservation_items

orders
order_items
order_price_components
order_addresses
order_events

payments
payment_attempts
```

Existing order and payment specifications remain authoritative for domain-specific fields.

---

# 57. Auditability

Record important actions:

```text
cart_created
checkout_started
price_changed
inventory_unavailable
delivery_changed
payment_attempted
order_created
order_cancelled
```

Financial and order records should be immutable where appropriate.

---

# 58. Security

Checkout must implement:

- Authentication
- Authorization
- Organization isolation
- CSRF protection where applicable
- Input validation
- Rate limiting
- Idempotency
- Secure payment integration
- Server-side price calculation
- Server-side inventory validation

Never trust client-supplied price, total, supplier ID, payment success flag, or stock count.

---

# 59. Performance

Checkout is latency-sensitive.

Optimize:

- Cart retrieval
- Price calculation
- Inventory validation
- Address serviceability
- Delivery-slot lookup
- Payment initiation

Use parallel reads where safe and avoid long synchronous chains when background processing is sufficient.

---

# 60. Reliability

Critical checkout components must support:

- Retry
- Idempotency
- Transaction boundaries
- Dead-letter handling where asynchronous
- Monitoring
- Reconciliation
- Manual operational recovery

---

# 61. Testing

## Unit

Test cart quantity rules, pricing, discounts, delivery fees, eligibility, state transitions, and idempotency.

## Integration

Test cart/database, pricing, inventory, delivery, payment, order creation, and reservation release.

## Failure tests

Test:

```text
Price changes during checkout
Stock disappears during checkout
Supplier becomes unavailable
Delivery slot becomes unavailable
Payment fails
Payment succeeds but order creation fails
Network retry occurs
Duplicate checkout request occurs
```

## End-to-end

```text
Login
 ->
Search
 ->
Add product
 ->
Open cart
 ->
Checkout
 ->
Select address
 ->
Select delivery
 ->
Validate
 ->
Pay
 ->
Order confirmed
 ->
Order visible in account
```

---

# 62. Acceptance Criteria

The system is production-ready when:

- Buyers can add/remove products.
- Quantities are validated server-side.
- Cart data is buyer-scoped.
- Checkout revalidates prices.
- Checkout revalidates inventory.
- Supplier routing supports multi-supplier orders.
- Address serviceability is validated.
- Instant and scheduled delivery are supported.
- Delivery fees are server-calculated.
- Payment initiation is secure.
- Payment success is server-verified.
- Duplicate order creation is prevented.
- Inventory reservations are safe.
- Failed payments can be retried.
- Payment/order mismatches are recoverable.
- Orders receive unique IDs.
- Confirmation occurs only after authoritative order creation.
- Critical actions are observable and auditable.
- Critical failure scenarios have automated tests.

---

# 63. Implementation Sequence

## Phase 1 — Cart

1. Cart model
2. Cart APIs
3. Add/remove/update
4. Persistence
5. Quantity validation

## Phase 2 — Checkout

6. Checkout session
7. Price validation
8. Inventory validation
9. Address selection
10. Delivery mode
11. Delivery fee

## Phase 3 — Payment and Order

12. Payment method selection
13. Payment gateway integration
14. Inventory reservation
15. Order creation
16. Multi-supplier fulfillment creation
17. Confirmation

## Phase 4 — Reliability

18. Idempotency
19. Payment/order recovery
20. Reservation recovery
21. Reconciliation
22. Monitoring

## Phase 5 — Optimization

23. Cart merge
24. Advanced promotions
25. Advanced delivery capacity
26. Checkout performance optimization

---

# 64. Recommended Checkout State Machine

```text
CART_ACTIVE
     |
CHECKOUT_CREATED
     |
VALIDATING
     |
READY_FOR_PAYMENT
     |
PAYMENT_PENDING
     |
+----+----------------+
|                     |
PAYMENT_FAILED      PAYMENT_SUCCESS
|                     |
RETRY                 |
|                     v
+---------------> ORDER_CREATING
                       |
              +--------+--------+
              |                 |
          ORDER_CREATED      FAILED
              |                 |
              v                 v
          CONFIRMED       RECOVERY_REQUIRED
```

Recovery workflows must be explicit rather than leaving payments or inventory ambiguous.

---

# 65. Final Checkout Architecture

```text
                 Buyer Web / Android / iOS
                           |
                           v
                     Cart API
                           |
                           v
                    Checkout API
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
       Pricing         Inventory         Delivery
          |                |                |
          +----------------+----------------+
                           |
                           v
                     Payment Service
                           |
                           v
                      Order Service
                           |
              +------------+------------+
              |                         |
              v                         v
        Fulfillment                 Notifications
              |
              v
          Logistics
```

Checkout validates and commits the customer's purchase while inventory, payment, fulfillment, and logistics remain independently scalable.

---

# 66. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Cart, checkout, pricing validation, inventory reservation, payment initiation, and order placement

This specification should be implemented together with the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, admin/backoffice, analytics/reporting, identity, search/discovery, and customer-support specifications.

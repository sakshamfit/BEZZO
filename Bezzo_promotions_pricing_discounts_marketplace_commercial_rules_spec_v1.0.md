# Bezzo Promotions, Pricing, Discounts & Marketplace Commercial Rules Specification v1.0

## 1. Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Promotions, Pricing, Discounts & Marketplace Commercial Rules Specification |
| Version | 1.0 |
| Status | Draft for implementation |
| Platforms | Web, Android, iOS |
| Primary Actors | Buyers, suppliers, admins |
| Related Domains | Catalog, Inventory, Cart, Checkout, Orders, Payments, Supplier Portal, Admin, Analytics |

---

## 2. Purpose

This specification defines how Bezzo manages supplier pricing, marketplace pricing, discounts, coupons, promotions, minimum-order rules, commercial eligibility, and price calculation.

The pricing system must produce a deterministic final payable amount while preserving an auditable breakdown of every price component.

Pricing must be separated from inventory availability, payment processing, and logistics execution while integrating with each through explicit contracts.

---

## 3. Core Principles

1. The server is authoritative for all prices and discounts.
2. Client-provided prices are never trusted.
3. Every monetary calculation uses decimal-safe arithmetic.
4. Currency is represented explicitly; the initial marketplace currency is INR.
5. Supplier-specific prices remain supplier-scoped.
6. Promotional rules must be deterministic and versioned.
7. A price shown before checkout is informational until checkout revalidation.
8. Checkout must revalidate price, promotion eligibility, inventory, and applicable fees.
9. Every applied discount must be traceable to a rule or promotion.
10. Expired or disabled promotions cannot be applied.
11. Pricing changes must not silently mutate already completed orders.
12. Historical orders preserve the exact commercial values used at order time.
13. Promotions must not bypass pharmaceutical, tax, marketplace, or other applicable compliance controls.
14. Commercial rules should be configurable rather than hard-coded.

---

# 4. Pricing Model

Bezzo should distinguish the following concepts:

### 4.1 Catalog Product

The normalized marketplace product identity.

### 4.2 SKU

The sellable commercial unit/pack.

### 4.3 Supplier Offer

A supplier's offer for a SKU.

Supplier offer may contain:

- supplier ID
- SKU ID
- MRP
- base selling price
- minimum order quantity
- maximum order quantity
- active state
- applicable buyer regions
- applicable commercial rules

### 4.4 Price List

A collection of prices maintained for a supplier or commercial segment.

Possible price-list types:

- STANDARD
- WHOLESALE
- CONTRACT
- TIERED
- SPECIAL

### 4.5 Promotion

A rule that modifies the commercial result when eligibility conditions are satisfied.

---

# 5. Monetary Representation

All monetary values must be stored using a fixed-precision decimal representation.

Recommended:

- PostgreSQL `NUMERIC`
- currency code such as `INR`
- explicit rounding policy

Avoid binary floating-point for financial calculations.

Recommended internal representation:

```text
amount
currency
precision
rounding_mode
```

For INR, the system should consistently apply the configured rupee/paise rounding rules.

---

# 6. Price Components

A checkout line may contain:

```text
Base Supplier Price
- Product/Line Discount
- Promotion Discount
- Coupon Discount
+ Applicable Fees
+ Applicable Taxes
= Final Payable Amount
```

The exact tax and fee treatment must follow the configured commercial/tax model and applicable legal/accounting requirements.

The system must not assume that every product or fee has identical tax treatment.

---

# 7. MRP and Selling Price

Where applicable, supplier catalog data should retain:

- MRP
- selling price
- discount amount
- discount percentage

MRP must not be treated as a freely editable marketplace marketing number if regulated product rules impose restrictions.

The system must support validation of supplier-provided pricing against configured business and compliance rules.

---

# 8. Price Calculation Pipeline

Recommended sequence:

```text
Load cart
  ↓
Load authoritative supplier offers
  ↓
Validate active prices
  ↓
Validate quantity rules
  ↓
Evaluate eligible promotions
  ↓
Evaluate coupon
  ↓
Calculate fees/taxes
  ↓
Apply rounding
  ↓
Generate price breakdown
  ↓
Return checkout quote
  ↓
Revalidate at order placement
  ↓
Persist final commercial snapshot
```

The checkout quote must have an expiration time.

---

# 9. Price Quote

A quote represents a calculated commercial result before order placement.

Quote should contain:

- quote ID
- buyer ID
- cart ID
- item prices
- discounts
- promotions
- coupon
- fees
- taxes where applicable
- delivery charge
- payable total
- currency
- created timestamp
- expiry timestamp
- pricing version

Quotes must not be treated as completed orders.

---

# 10. Price Change Handling

If a supplier changes a price after a buyer added the item to cart:

```text
Cart contains old price
→ Checkout requests quote
→ Current supplier price is loaded
→ Difference detected
→ Buyer sees updated price
→ Buyer confirms
→ Order uses confirmed current price
```

The system must not silently charge a buyer using a stale client-side price.

---

# 11. Supplier Pricing

Supplier users may manage prices for their own offers.

Capabilities:

- create price
- update price
- deactivate price
- bulk price import
- schedule price changes where supported
- view price history
- configure quantity tiers where supported

Supplier pricing permissions must be role-based.

---

# 12. Bulk Price Import

Supported initial formats:

- CSV
- XLSX

Typical fields:

```text
supplier_sku
sku_id
mrp
selling_price
minimum_order_quantity
maximum_order_quantity
effective_from
effective_until
```

Import workflow:

```text
Upload
→ Parse
→ Validate
→ Preview
→ Confirm
→ Apply
→ Report
```

Invalid rows must be rejected with clear row-level errors.

---

# 13. Scheduled Price Changes

Bezzo may support future-dated price changes.

Example:

```text
Current price: ₹100
New price: ₹105
Effective: 2026-10-01 00:00 IST
```

The scheduler must activate the new price at the configured effective time.

Future price changes must not modify already completed orders.

---

# 14. Quantity-Based Pricing

Suppliers may optionally define quantity tiers.

Example:

```text
1–9 units    → ₹100
10–49 units  → ₹95
50+ units    → ₹90
```

The pricing engine must:

- identify the applicable tier
- validate minimum order quantities
- apply the tier consistently
- record the selected tier in the order snapshot

Tier rules must not create negative prices or invalid commercial outcomes.

---

# 15. Buyer-Specific / Segment Pricing

Future-ready support may include:

- buyer-specific pricing
- buyer-group pricing
- geographic pricing
- contract pricing
- supplier relationship pricing

Example segments:

- STANDARD_BUYER
- VERIFIED_PHARMACY
- CONTRACT_BUYER
- SPECIAL_ACCOUNT

Eligibility must be server-side and auditable.

---

# 16. Promotions

A promotion is a configured commercial rule.

Promotion fields may include:

- promotion ID
- name
- description
- type
- status
- start time
- end time
- priority
- usage limits
- buyer eligibility
- supplier eligibility
- SKU/category eligibility
- minimum order value
- maximum discount
- discount method
- stacking policy

Promotion states:

- DRAFT
- SCHEDULED
- ACTIVE
- PAUSED
- EXPIRED
- CANCELLED

---

# 17. Promotion Types

Initial promotion engine should support:

### Percentage Discount

```text
10% off
```

### Fixed Amount Discount

```text
₹100 off
```

### Quantity Promotion

Example:

```text
Buy 10 eligible units and receive a configured discount.
```

### Order-Level Promotion

Example:

```text
₹500 off orders above configured threshold.
```

### Category Promotion

Applies to eligible catalog categories.

### SKU Promotion

Applies to selected SKUs.

### Supplier Promotion

Applies to products supplied by a selected supplier.

Promotions must be configurable and subject to applicable pharmaceutical and commercial restrictions.

---

# 18. Coupon Codes

Coupons are buyer-entered promotion identifiers.

Coupon fields:

- code
- promotion ID
- status
- usage limit
- per-buyer limit
- start time
- end time
- minimum order value
- maximum discount
- eligibility conditions

Coupon codes must be normalized consistently, for example uppercase with whitespace removed according to configured rules.

Coupon validation occurs server-side.

---

# 19. Promotion Eligibility

Eligibility can depend on:

- buyer account status
- buyer segment
- supplier
- SKU
- category
- quantity
- order value
- delivery region
- payment method
- first-order status
- usage history
- time window
- campaign participation

The eligibility engine must return machine-readable reasons when a promotion fails.

Example:

```json
{
  "eligible": false,
  "reasonCode": "MIN_ORDER_VALUE_NOT_MET"
}
```

---

# 20. Promotion Priority

When multiple promotions are eligible, Bezzo needs deterministic resolution.

Each promotion should have:

- priority
- stackable flag
- exclusion group
- maximum discount constraint

Example policy:

```text
1. Apply mandatory product-level rules
2. Select eligible supplier/SKU promotion
3. Apply order-level promotion
4. Evaluate coupon
5. Enforce stacking/exclusion rules
6. Apply caps
7. Calculate final total
```

The exact business ordering must be configurable and versioned.

---

# 21. Promotion Stacking

Promotions may be:

- STACKABLE
- NON_STACKABLE
- EXCLUSIVE

An exclusive promotion prevents incompatible promotions from applying.

The engine must never apply discounts simply because multiple rules are present.

It must explicitly evaluate compatibility.

---

# 22. Discount Caps

A promotion may specify:

- maximum discount per line
- maximum discount per order
- maximum discount per buyer
- maximum campaign budget

Example:

```text
20% off
Maximum discount = ₹300
```

For a ₹2,000 eligible amount:

```text
Calculated discount = ₹400
Applied discount = ₹300
```

---

# 23. Minimum Order Value

Rules may require a minimum eligible value.

Example:

```text
₹200 off above ₹2,000
```

The system must clearly define whether the threshold is based on:

- item subtotal
- eligible item subtotal
- subtotal after line discounts
- subtotal before/after tax
- delivery-inclusive amount

This must be configured per promotion rather than assumed globally.

---

# 24. Minimum and Maximum Quantity

Commercial rules may define:

- minimum order quantity
- maximum quantity per order
- maximum promotional quantity
- maximum quantity per buyer during campaign

These constraints must be checked during cart and checkout.

Inventory availability remains a separate constraint.

---

# 25. Supplier-funded vs Marketplace-funded Discounts

Bezzo should distinguish discount funding.

Possible types:

- SUPPLIER_FUNDED
- MARKETPLACE_FUNDED
- SHARED

This is required for settlement and reporting.

Each applied discount should record:

```text
funding_type
funding_supplier_id
funding_amount
```

where applicable.

---

# 26. Settlement Impact

Order settlement must preserve:

```text
gross merchandise value
supplier-funded discount
marketplace-funded discount
buyer payable amount
fees
taxes where applicable
refund adjustments
supplier payable amount
```

The payment amount and supplier settlement amount are not necessarily identical.

Commercial calculations must integrate with the Payment & Billing and Supplier Settlement models.

---

# 27. Price Snapshot on Order

Once an order is placed, the system must persist the commercial snapshot.

Snapshot should include:

- SKU
- supplier
- quantity
- MRP where applicable
- unit price
- gross line amount
- line discount
- promotion discount
- coupon discount
- tax values where applicable
- fees
- final line total
- currency
- pricing rule IDs
- promotion IDs
- coupon code
- pricing version

Future price changes must not rewrite this historical snapshot.

---

# 28. Cart Pricing

Cart can display estimated pricing.

However:

```text
Cart price ≠ final guaranteed order price
```

Checkout must recalculate using current authoritative data.

The UI should clearly communicate price changes when they occur.

---

# 29. Checkout Pricing

Checkout performs:

1. product/offer validation
2. supplier validation
3. inventory validation
4. price validation
5. promotion validation
6. coupon validation
7. fee calculation
8. tax calculation where applicable
9. rounding
10. final total generation
11. inventory reservation
12. order creation

The exact transaction boundary must ensure that the order cannot persist a price that was not validated.

---

# 30. Payment Amount Integrity

The payment request must be generated from the server-calculated final order amount.

Client-side totals must never determine the payment amount.

Payment gateway requests must reference the server-side order/payment record.

Webhook reconciliation must compare gateway amount with the expected server amount.

---

# 31. Refunds and Discounts

Refund calculation must use the original order commercial snapshot.

If an order line received a discount, a refund must not accidentally refund the undiscounted value.

For partial refunds, the system must allocate discount impact deterministically.

Examples of refund causes:

- cancellation
- missing item
- damaged item
- wrong product
- approved return
- supplier failure

---

# 32. Promotion Usage Accounting

Promotion usage should be recorded transactionally.

Track:

- total uses
- buyer uses
- successful applications
- reversed applications
- refunded applications

A failed payment should not necessarily consume a permanent promotion quota unless the configured policy requires reservation of campaign usage.

---

# 33. Promotion Budget

Campaigns may have a maximum financial budget.

Example:

```text
Campaign budget = ₹100,000
Used = ₹98,500
Remaining = ₹1,500
```

The system must define whether budget is reserved at checkout or consumed after successful order/payment.

This policy must be explicit to avoid overspending.

---

# 34. Promotion Cancellation

If an active promotion is cancelled:

- it must stop applying to new eligible checkouts
- already completed orders retain their original discount
- pending quotes should be revalidated
- reserved campaign budget must be reconciled according to policy

---

# 35. Time and Timezone

Promotion schedules must use explicit timestamps.

Bezzo's initial operating context is India, so operational schedules should support `Asia/Kolkata`.

Database timestamps should use a consistent UTC representation, with timezone conversion at the application boundary.

Avoid ambiguous local-time calculations.

---

# 36. Commercial Rule Engine

The pricing engine should be implemented as a deterministic domain module.

Conceptual interface:

```text
calculatePrice(context) → PriceResult
```

Context may include:

```text
buyer
supplier
items
quantities
deliveryRegion
paymentMethod
currentTime
cart
coupon
inventoryState
```

Result includes:

```text
linePrices
discounts
promotions
fees
taxes
subtotal
payableTotal
currency
pricingVersion
```

The engine should be side-effect-free for calculation, with transactional persistence handled by application services.

---

# 37. Pricing Explainability

The API should expose a safe breakdown suitable for the buyer UI.

Example:

```text
Item subtotal          ₹5,000
Supplier discount      -₹300
Promotion              -₹200
Delivery fee           +₹30
Taxes/other charges    +₹X
----------------------------
Payable total          ₹X
```

Internal funding and settlement details may remain hidden from buyers.

---

# 38. Commercial Rule Validation

Before activation, an admin/supplier promotion should be validated for:

- date range
- eligibility completeness
- discount bounds
- quantity bounds
- budget
- stacking configuration
- referenced SKU/category existence
- supplier authorization
- conflicting rules

Rules that can produce ambiguous or invalid calculations should not activate.

---

# 39. Admin Operations

Admin users should be able to:

- create/edit/pause promotions
- schedule campaigns
- manage coupon codes
- view usage
- inspect pricing calculations
- view discount funding
- configure stacking
- set limits
- audit changes
- disable abusive or invalid campaigns
- reconcile promotion budgets

All administrative changes must be audited.

---

# 40. Supplier Operations

Supplier users should be able to:

- manage own prices
- bulk update prices
- configure supplier-funded promotions if permitted
- view promotion performance
- view discount funding
- view affected SKUs
- see pricing history

Supplier users must not modify marketplace-funded rules unless explicitly authorized.

---

# 41. Buyer Experience

Buyer UI should provide:

- current price
- MRP where applicable
- visible discount information where allowed
- promotion badges
- coupon entry
- eligibility feedback
- minimum-order information
- price-change notifications at checkout
- complete payable total before payment

The interface should remain minimal and marketplace-oriented while preserving commercial transparency.

---

# 42. Search and Listing Pricing

Search/listing results may show denormalized price information.

These values must be refreshed when price rules change.

The source of truth remains the pricing service/database.

A listing may display:

```text
MRP
Selling Price
Discount
Promotion Indicator
```

without exposing private supplier commercial terms.

---

# 43. Caching

Cache may be used for:

- public price snapshots
- active promotion metadata
- coupon metadata
- listing pricing
- buyer segment information where safe

Never cache authorization as a permanent decision.

Checkout must revalidate all critical commercial rules.

Cache invalidation should occur on relevant pricing/promotion changes.

---

# 44. Data Model

Recommended tables:

```text
supplier_prices
price_lists
price_list_items
price_versions
promotions
promotion_rules
promotion_targets
promotion_usage
promotion_budgets
coupons
coupon_redemptions
pricing_quotes
pricing_quote_items
order_price_snapshots
discount_allocations
commercial_rule_versions
```

Important indexes:

```text
supplier_id + sku_id
promotion status + start/end
coupon code
buyer_id + promotion_id
order_id
quote_id
effective_from/effective_until
```

---

# 45. APIs

### Supplier Pricing

```http
GET    /v1/suppliers/{supplierId}/prices
POST   /v1/suppliers/{supplierId}/prices
PATCH  /v1/suppliers/{supplierId}/prices/{id}
POST   /v1/suppliers/{supplierId}/prices/imports
GET    /v1/suppliers/{supplierId}/prices/history
```

### Promotions

```http
GET    /v1/promotions
GET    /v1/promotions/{id}
POST   /v1/admin/promotions
PATCH  /v1/admin/promotions/{id}
POST   /v1/admin/promotions/{id}/activate
POST   /v1/admin/promotions/{id}/pause
```

### Coupons

```http
POST /v1/checkout/coupons/validate
POST /v1/admin/coupons
PATCH /v1/admin/coupons/{id}
```

### Pricing

```http
POST /v1/cart/quote
POST /v1/checkout/quote
POST /internal/pricing/calculate
```

---

# 46. Idempotency

Idempotency is required for:

- price imports
- promotion creation where retried
- coupon redemption
- quote generation where business semantics require stable retries
- promotion budget reservation
- discount allocation

Duplicate requests must not create duplicate financial effects.

---

# 47. Security

Requirements:

- server-side price authority
- role-based pricing permissions
- supplier tenant isolation
- admin audit logs
- protected promotion APIs
- coupon abuse prevention
- rate limiting
- input validation
- signed/internal service authentication
- secure handling of commercial data
- no trust in client-side totals

Suspicious coupon/promotion usage should be observable for fraud/risk workflows.

---

# 48. Analytics

Track:

- gross merchandise value
- average order value
- discount amount
- discount rate
- supplier-funded discount
- marketplace-funded discount
- coupon redemption
- promotion conversion
- promotion usage
- promotion budget utilization
- price changes
- price-change checkout failures
- promotion failure reasons
- margin/settlement impact where available

Analytics must preserve buyer privacy and access controls.

---

# 49. Testing

## Unit Tests

- percentage discounts
- fixed discounts
- quantity tiers
- minimum order rules
- maximum caps
- stacking
- exclusivity
- coupon validation
- date windows
- buyer eligibility
- funding allocation
- rounding

## Integration Tests

- pricing + cart
- pricing + inventory
- pricing + checkout
- pricing + payments
- promotion usage
- supplier pricing
- settlement
- refunds

## Concurrency Tests

Test simultaneous coupon redemption and campaign budget consumption.

Example:

```text
Remaining campaign budget = ₹100
Two checkouts attempt ₹100 discount simultaneously.

Expected:
Committed campaign funding must not exceed ₹100.
```

## End-to-End

```text
Supplier price
→ Buyer cart
→ Promotion
→ Coupon
→ Checkout quote
→ Inventory reservation
→ Order
→ Payment
→ Settlement
→ Refund
```

---

# 50. Acceptance Criteria

The module is production-ready when:

1. Server-side price authority is enforced.
2. Monetary calculations use safe decimal arithmetic.
3. Supplier prices are tenant-isolated.
4. Checkout revalidates current pricing.
5. Promotion eligibility is deterministic.
6. Coupon usage is concurrency-safe.
7. Promotion stacking is deterministic.
8. Discount caps work.
9. Supplier- and marketplace-funded discounts are distinguishable.
10. Historical order pricing cannot be changed by future rules.
11. Payment amounts come from server-calculated totals.
12. Refunds use the original commercial snapshot.
13. Price imports are validated and auditable.
14. Promotion budgets cannot be overspent.
15. Admin and supplier permissions are enforced.
16. Commercial changes are audited.
17. Cache cannot bypass checkout validation.
18. Pricing and promotion events are observable.
19. Unit, integration, concurrency, and E2E tests pass.
20. Pricing behavior is documented with versioned rules.

---

# 51. Implementation Sequence

## Phase 1 — Pricing Foundation
- supplier prices
- SKU pricing
- decimal money model
- price history
- checkout quote

## Phase 2 — Promotions
- percentage discounts
- fixed discounts
- SKU/category/supplier targeting
- minimum order rules
- caps

## Phase 3 — Coupons
- coupon codes
- buyer usage limits
- redemption records
- concurrency controls

## Phase 4 — Commercial Integration
- cart
- checkout
- payments
- settlement
- refunds

## Phase 5 — Advanced Pricing
- quantity tiers
- buyer segments
- contract pricing
- scheduled pricing
- promotion budgets

## Phase 6 — Optimization
- caching
- analytics
- campaign tooling
- advanced rule configuration
- experimentation where permitted

---

# 52. Definition of Done

- Pricing schema and migrations exist.
- Pricing calculation engine is implemented.
- Supplier price management is available.
- Promotions and coupons work end-to-end.
- Checkout revalidation is implemented.
- Payment amount integrity is enforced.
- Historical price snapshots are persisted.
- Supplier/marketplace funding is tracked.
- Refund calculations use original snapshots.
- Admin and supplier permissions are enforced.
- Audit logs exist.
- Concurrency tests pass.
- Monitoring and analytics are available.
- Production runbooks exist.

---

# 53. Final Architecture Position

Bezzo pricing should be treated as a deterministic commercial calculation capability:

```text
Catalog/SKU
   ↓
Supplier Offer
   ↓
Base Price
   ↓
Price Rules
   ↓
Eligible Promotions
   ↓
Coupon
   ↓
Fees / Taxes
   ↓
Rounding
   ↓
Checkout Quote
   ↓
Revalidation
   ↓
Order Price Snapshot
   ↓
Payment / Settlement / Refund
```

Inventory determines whether the requested quantity can be fulfilled. Pricing determines the commercial amount. Payments collect the server-calculated amount. Orders preserve the final snapshot. This separation keeps the Bezzo marketplace auditable, scalable, and ready for more sophisticated supplier commercial models.

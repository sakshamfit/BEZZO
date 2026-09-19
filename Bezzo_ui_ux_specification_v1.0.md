# Bezo UI/UX Specification v1.0

## 1. Purpose

This document defines the initial UI/UX system for Bezo across:

- Web
- Android
- iOS
- Supplier dashboard
- Buyer marketplace
- Admin/operations portal

The buyer marketplace should have the speed, clarity, visual simplicity, product discovery, and marketplace feel associated with large consumer marketplaces such as Myntra, while remaining specifically designed for B2B pharmaceutical purchasing.

The interface must never compromise pharmaceutical safety, regulatory requirements, or order accuracy for visual simplicity.

---

# 2. Product Experience Principles

Bezo should feel:

- Fast
- Clean
- Professional
- Trustworthy
- Minimal
- Easy to scan
- Information-rich without feeling crowded
- Optimized for repeat purchasing
- Mobile-first for pharmacy owners
- Operationally efficient for suppliers

Primary UX principle:

> Show the information required to make the next correct business decision, and hide unnecessary complexity until it is needed.

---

# 3. User Types

## Buyer

Medical store owner/pharmacy buyer.

Primary goals:

- Find medicines quickly
- Compare available suppliers
- Check price and availability
- Reorder frequently purchased medicines
- Select delivery mode
- Complete payment
- Track delivery

## Supplier

Wholesaler/distributor.

Primary goals:

- Complete verification
- Upload/manage products
- Maintain inventory
- Receive orders
- Prepare fulfillment
- Track delivery
- Monitor sales and operations

## Admin

Primary goals:

- Verify users
- Moderate products
- Monitor orders
- Handle exceptions
- Review payments
- Manage logistics
- Maintain platform configuration

---

# 4. Navigation Model

## Buyer mobile navigation

Recommended:

```text
Home
Search
Orders
Cart
Account
```

Use a persistent bottom navigation bar.

---

## Buyer web navigation

Header:

```text
Bezo logo
Search
Categories
Orders
Cart
Account
```

Optional secondary navigation:

```text
Medicines
Categories
Offers
Quick Reorder
```

Do not overload the navigation.

---

# 5. Application Entry

The initial entry screen should clearly distinguish the two primary business roles.

```text
             BEZO

    B2B Pharmaceutical Marketplace

    [ I'm a Medical Store Owner ]

    [ I'm a Wholesaler / Supplier ]

             Login
```

The user should not be forced through irrelevant onboarding.

---

# 6. Buyer Onboarding

Suggested flow:

```text
Role selection
↓
Phone/email verification
↓
Business information
↓
Store address
↓
Applicable business/licence information
↓
Account active
```

The exact legal/business fields must be validated for the target operating jurisdiction.

---

# 7. Supplier Onboarding

Suggested flow:

```text
Role selection
↓
Account creation
↓
Business details
↓
GST/business information
↓
Applicable wholesale drug licence
↓
Identity/premises information
↓
Required supporting documents
↓
Bank details
↓
Review
↓
Verification
↓
Supplier dashboard
```

Show a progress indicator.

Example:

```text
1 Account
2 Business
3 Documents
4 Review
5 Approved
```

---

# 8. Verification UX

Supplier verification status should be obvious.

Use states:

```text
Documents pending
Under review
Verified
Rejected
Suspended
```

For rejection, show:

- Reason
- Required correction
- Documents needing replacement
- Resubmission action

Do not expose internal moderation notes.

---

# 9. Buyer Home Screen

The buyer home screen should prioritize repeat purchasing.

Suggested structure:

```text
------------------------------------------------
Header
------------------------------------------------
Search medicines, brands, composition...
------------------------------------------------
Quick Reorder
[Previous orders / frequently purchased]
------------------------------------------------
Categories
[Antibiotics] [Pain] [Diabetes] [Cardio] ...
------------------------------------------------
Featured / frequently bought
Product cards
------------------------------------------------
Recently viewed
------------------------------------------------
Offers / business promotions if permitted
------------------------------------------------
```

The exact promotional treatment must comply with applicable pharmaceutical rules.

---

# 10. Buyer Search

Search is one of the most important screens.

Search should support:

- Brand name
- Generic name
- Composition
- Strength
- Dosage form
- Manufacturer
- Relevant product identifiers

Search UX:

```text
[ Search medicines...                 ]

Recent searches
Suggestions
Categories
Products
```

Use instant suggestions where practical.

---

# 11. Search Results

Example:

```text
Search: Paracetamol

Filters   Sort

------------------------------------------------
Product
Brand / Generic
Strength
Pack size
Supplier availability
Price
------------------------------------------------
```

Product cards should prioritize:

1. Product identity
2. Strength/form
3. Pack size
4. Availability
5. Commercial price information
6. Relevant compliance indicators
7. Add-to-cart action

Do not hide critical safety/compliance information behind unnecessary interactions.

---

# 12. Product Card

Recommended structure:

```text
[Product Image]

Product Name
Generic / Composition
Strength • Form
Pack Size

MRP ₹XXX
Bezo price ₹XXX

Available
Supplier / fulfillment information

[-] 1 [+]     [Add]
```

Avoid visual clutter.

The card should be reusable across:

- Search
- Category
- Home
- Reorder
- Recommendations where legally appropriate

---

# 13. Product Detail

Structure:

```text
Product images
↓
Product name
↓
Composition
↓
Strength / dosage form
↓
Manufacturer
↓
Pack size
↓
MRP / price
↓
Availability
↓
Supplier information where appropriate
↓
Storage information
↓
Prescription/compliance indicator where applicable
↓
Quantity
↓
Add to cart
```

Product information must be sourced from verified catalog data.

---

# 14. Supplier Selection UX

If multiple eligible suppliers can fulfill the same product, the buyer may see an appropriate selection.

Example:

```text
Available from multiple suppliers

Supplier A
₹110
In stock
Delivery: Today

Supplier B
₹115
In stock
Delivery: Today

Supplier C
₹108
Limited stock
Delivery: Tomorrow
```

The exact ranking logic should be controlled by backend business rules.

Do not imply that the frontend chooses the final supplier.

---

# 15. Cart

Cart should immediately communicate:

- Product
- Quantity
- Supplier/fulfillment where relevant
- Price
- Availability
- Estimated delivery
- Fees
- Total

Example:

```text
Your Cart

Product A
Supplier A
₹100 × 5
[-] 5 [+]

Product B
Supplier B
₹200 × 2

Subtotal             ₹900
Delivery              ₹40
Total                 ₹940

[Proceed to Checkout]
```

---

# 16. Multi-Supplier Cart

If a cart contains products from different suppliers:

```text
Your order

Fulfillment 1
Supplier A
Products...

Fulfillment 2
Supplier B
Products...
```

Keep this understandable without exposing unnecessary backend complexity.

---

# 17. Checkout

Checkout should be short.

Recommended sections:

```text
1 Delivery address
2 Delivery mode
3 Delivery slot
4 Payment
5 Order summary
6 Place order
```

Do not require users to navigate through unnecessary screens.

---

# 18. Delivery Mode

Present two clear options:

```text
Instant
Fast delivery
Additional fee may apply

Scheduled
Choose a delivery slot
Potentially lower/optimized delivery cost
```

The actual fee and availability are calculated by the backend.

---

# 19. Scheduled Delivery Selection

Example:

```text
Choose delivery

Tomorrow

○ Morning
  08:00 – 12:00

○ Afternoon
  12:00 – 16:00

○ Evening
  16:00 – 20:00
```

Times are configurable.

Unavailable slots should be visibly disabled with a short explanation.

---

# 20. Payment Screen

Show:

```text
UPI
Cards
Net Banking
Wallets where supported
COD where permitted
```

Do not present unavailable payment methods.

The payment UI must clearly show:

```text
Total payable: ₹XXXX
```

The server remains authoritative for the amount.

---

# 21. Order Confirmation

After successful order creation:

```text
✓ Order placed

Order #BZ123456

Total ₹XXXX

Delivery
Today / Scheduled slot

[Track Order]
[View Order]
[Continue Shopping]
```

Avoid ambiguous “payment successful” messaging unless the backend has confirmed the payment state.

---

# 22. Order Tracking

Recommended timeline:

```text
Order placed
     ↓
Payment confirmed
     ↓
Supplier preparing
     ↓
Ready for pickup
     ↓
Picked up
     ↓
Out for delivery
     ↓
Delivered
```

Use timestamps where available.

---

# 23. Live Delivery Tracking

If provider data supports it:

```text
Map
Driver/vehicle status
Estimated arrival
Contact/support action where permitted
```

Do not expose sensitive driver information unnecessarily.

---

# 24. Orders Screen

Buyer tabs may include:

```text
All
Active
Delivered
Cancelled
```

Order cards:

```text
Order #BZ123456
3 items
₹1,250
Delivery: Today
Status: Out for delivery

[View]
```

---

# 25. Quick Reorder

This should be a major B2B convenience feature.

Possible entry points:

```text
Home → Quick Reorder
Orders → Reorder
Product → Buy Again
```

Reorder must revalidate:

- Product status
- Current price
- Current inventory
- Supplier eligibility
- Delivery availability

Never blindly recreate an old order.

---

# 26. Buyer Account

Sections:

```text
Business Profile
Addresses
Orders
Payments
Notifications
Support
Privacy & Security
Logout
```

The account area should remain simple.

---

# 27. Supplier Dashboard

The supplier experience is different from the buyer marketplace.

Dashboard should prioritize operations.

Suggested top-level metrics:

```text
Today's Orders
Pending Orders
Low Stock
Out of Stock
Revenue
Pending Fulfillments
```

Then:

```text
Recent Orders
Inventory Alerts
Verification Status
Operational Notifications
```

---

# 28. Supplier Navigation

Suggested:

```text
Dashboard
Orders
Products
Inventory
Analytics
Documents
Settings
```

Mobile supplier navigation can use:

```text
Home
Orders
Inventory
Products
More
```

---

# 29. Supplier Orders

Supplier order list:

```text
Order
Items
Quantity
Buyer/store reference
Delivery mode
Required time
Status
Action
```

Supplier must only see information authorized for fulfillment.

---

# 30. Supplier Order Detail

Show:

```text
Order ID
Items
Quantities
Packing requirements
Delivery requirement
Fulfillment status
Pickup details
Operational notes
```

Actions:

```text
Accept
Mark Packing
Mark Ready
```

Only show actions valid for the current state.

---

# 31. Inventory Dashboard

Use clear states:

```text
Healthy
Low stock
Out of stock
```

Example:

```text
Product        Stock       Status

Medicine A     120         Healthy
Medicine B     12          Low
Medicine C     0           Out
```

Bulk inventory update should be supported.

---

# 32. Product Management

Supplier product workflow:

```text
Create
↓
Upload images
↓
Enter catalog details
↓
Set price
↓
Set inventory
↓
Review
↓
Publish
```

Draft and published states should be clearly separated.

---

# 33. Supplier Product Editor

Use sections:

```text
Basic Information
Composition
Strength
Dosage Form
Manufacturer
Pack Size
Pricing
Inventory
Storage
Compliance
Images
```

Do not force suppliers to enter the same information repeatedly if canonical catalog data already exists.

---

# 34. Supplier Analytics

Initial analytics:

```text
Orders
Units sold
Revenue
Top products
Low-stock products
Order fulfillment rate
Cancellation rate
```

Avoid building a complicated BI product in MVP.

---

# 35. Admin Dashboard

Admin home:

```text
Pending Supplier Reviews
Pending Product Reviews
Active Orders
Payment Exceptions
Delivery Exceptions
System Alerts
```

Admin is an operational tool, not a consumer marketplace.

---

# 36. Admin Supplier Review

Screen:

```text
Supplier identity
Business information
Documents
Verification history
Risk/exception indicators
```

Actions:

```text
Approve
Reject
Request correction
Suspend
```

Every administrative decision should create an audit record.

---

# 37. Admin Product Review

Show:

```text
Product
Images
Composition
Manufacturer
Supplier
Pricing
Relevant compliance fields
Moderation history
```

Actions should depend on role and workflow.

---

# 38. Design System

Create a shared design system.

Core primitives:

```text
Button
Input
Select
Checkbox
Radio
Switch
Badge
Card
Modal
Bottom Sheet
Toast
Alert
Tabs
Table
Pagination
Skeleton
Empty State
Error State
```

---

# 39. Visual Style

Direction:

- Minimal
- Clean
- High readability
- Strong spacing
- Consistent cards
- Clear hierarchy
- Subtle borders
- Controlled use of color
- High-quality product imagery

Do not copy another company's branding or proprietary visual assets.

The desired experience is a fast marketplace, not a literal visual clone.

---

# 40. Typography

Use a modern, highly legible sans-serif.

Create tokens:

```text
font-size-xs
font-size-sm
font-size-md
font-size-lg
font-size-xl
font-size-2xl
font-size-3xl
```

Use a consistent scale across platforms.

---

# 41. Spacing

Create spacing tokens rather than arbitrary margins.

Example:

```text
4
8
12
16
20
24
32
40
48
64
```

---

# 42. Color System

Create semantic tokens:

```text
background
surface
text-primary
text-secondary
border
brand
success
warning
error
info
disabled
```

Avoid using color as the only indication of status.

For example:

```text
✓ Verified
⚠ Low stock
× Out of stock
```

with accessible labels.

---

# 43. Buttons

Primary actions:

```text
Add to Cart
Proceed to Checkout
Place Order
Accept Order
Mark Ready
```

Secondary actions:

```text
View
Edit
Cancel
Back
```

Destructive actions:

```text
Delete
Reject
Suspend
Cancel Order
```

Destructive actions should require confirmation when appropriate.

---

# 44. Loading States

Never leave the interface visually frozen.

Use:

- Skeletons
- Progress indicators
- Button loading states
- Upload progress
- Background status

Example:

```text
Placing order...
```

The user should understand that an action is being processed.

---

# 45. Error States

Errors must explain what the user can do next.

Bad:

```text
Something went wrong.
```

Better:

```text
This medicine is no longer available from this supplier.

[View alternatives]
```

Do not expose internal error details.

---

# 46. Empty States

Example:

```text
Your cart is empty

Find medicines and add them to your order.

[Browse Medicines]
```

Supplier example:

```text
No products yet

Upload your first product to start selling.

[Add Product]
```

---

# 47. Accessibility

Target WCAG-aligned accessibility.

Implement:

- Keyboard navigation
- Screen-reader labels
- Focus states
- Sufficient contrast
- Touch targets
- Accessible forms
- Error announcements
- Semantic HTML

Mobile controls should have appropriately sized touch targets.

---

# 48. Responsive Breakpoints

Support:

```text
Mobile
Tablet
Desktop
Large Desktop
```

Do not simply stretch the mobile layout to desktop.

Desktop supplier/admin tables may use more horizontal information density.

---

# 49. Mobile UX

Mobile should optimize for:

- One-handed use
- Fast search
- Fast reorder
- Minimal typing
- Clear CTAs
- Stable navigation
- Slow-network resilience

Avoid unnecessary modal chains.

---

# 50. Web Performance UX

The interface should:

- Render useful content quickly
- Avoid blocking the entire screen for noncritical data
- Load images progressively
- Use skeletons where loading is expected
- Keep interactions responsive
- Avoid unnecessary page transitions

Performance should be measured with real devices and realistic networks.

---

# 51. Offline/Weak Network Behavior

Where practical:

- Preserve unsent form data
- Cache safe read-only data
- Retry transient requests
- Show network state
- Prevent duplicate checkout submissions

Never silently retry a payment/order operation without idempotency protection.

---

# 52. Notifications UX

Notification categories:

```text
Order
Payment
Delivery
Inventory
Verification
Account
Operations
```

Allow appropriate notification preferences.

Critical transactional notifications should not be silently disabled when business/legal rules require them.

---

# 53. Confirmation UX

Require confirmation for high-impact actions:

```text
Cancel order
Delete product
Suspend supplier
Reject verification
Refund payment
```

Confirmation should explain consequences.

---

# 54. Form UX

Forms should:

- Validate close to the relevant field
- Preserve entered values after errors
- Clearly identify required fields
- Show format examples where useful
- Avoid asking for information more than once
- Support keyboard/autofill on mobile

---

# 55. Pharmaceutical Information UX

Important product information should be easy to scan.

Potential display:

```text
Composition
Strength
Dosage form
Pack size
Manufacturer
Storage
Prescription status where applicable
```

The UI must not make unsupported medical claims.

The marketplace is for procurement, not medical diagnosis or treatment advice.

---

# 56. Compliance UX

If a product requires special handling or eligibility checks, the interface should communicate the restriction before checkout.

Examples of UX patterns:

```text
Restricted item
Verification required

Prescription-related restriction
Additional verification may be required

Cold-chain item
Special delivery handling required
```

Exact rules must come from validated legal/compliance requirements.

---

# 57. Price Display

Show:

```text
MRP
Selling price
Applicable discount
Delivery fee
Additional instant fee
Total
```

Do not create misleading crossed-out prices or promotional claims.

The final payable amount must be confirmed by the backend.

---

# 58. Cart/Checkout Error Recovery

If inventory changes during checkout:

```text
Some quantities changed

Medicine A
Requested: 10
Available: 6

[Update Cart]
```

Do not silently change the user's order without communicating the change.

---

# 59. Order Failure Recovery

If payment succeeds but order finalization encounters a temporary failure:

```text
Payment received
We're confirming your order.

Order status: Processing
```

The system should reconcile the backend state asynchronously.

Do not tell the user that payment failed unless that is actually confirmed.

---

# 60. Supplier Operational Alerts

Supplier dashboard should surface:

```text
12 orders waiting
5 low-stock products
2 out-of-stock products
3 deliveries requiring attention
Verification expires/needs attention
```

Alerts should be actionable.

---

# 61. Admin Operational Alerts

Examples:

```text
Supplier verification backlog
Payment webhook failures
Porter delivery failures
High cancellation rate
Inventory synchronization failures
Queue backlog
System health alerts
```

---

# 62. UX Analytics Events

Track product behavior without collecting unnecessary personal data.

Examples:

```text
SEARCH_PERFORMED
PRODUCT_VIEWED
ADD_TO_CART
CART_UPDATED
CHECKOUT_STARTED
PAYMENT_STARTED
PAYMENT_COMPLETED
ORDER_CREATED
ORDER_CANCELLED
REORDER_STARTED
DELIVERY_VIEWED
```

Analytics must follow applicable privacy requirements.

---

# 63. Screen Inventory

## Buyer

```text
Splash
Role Selection
Login
Registration
Verification
Business Profile
Home
Search
Search Results
Category
Product Detail
Supplier Options
Cart
Address Selection
Delivery Selection
Payment
Order Confirmation
Orders
Order Detail
Tracking
Quick Reorder
Account
Notifications
Support
```

## Supplier

```text
Supplier Login
Onboarding
Document Upload
Verification Status
Dashboard
Orders
Order Detail
Products
Product Editor
Inventory
Bulk Inventory
Analytics
Documents
Settings
Notifications
```

## Admin

```text
Login
Dashboard
Supplier Queue
Supplier Review
Buyer Management
Product Moderation
Orders
Payments
Logistics
Audit Logs
Configuration
System Health
```

---

# 64. Navigation Rules

Do not allow users to become trapped in a workflow.

Every major screen should have:

- Clear page title
- Back/navigation path
- Primary action
- Error recovery path

Checkout should have minimal distractions.

---

# 65. Component Architecture

Shared UI package:

```text
packages/ui/
├── Button
├── Input
├── Card
├── Modal
├── Badge
├── ProductCard
├── OrderCard
├── PriceDisplay
├── StatusBadge
├── SearchBar
├── QuantitySelector
├── AddressCard
├── DeliverySlotCard
└── EmptyState
```

Platform-specific wrappers may be required for web/mobile differences.

---

# 66. State Management

Separate state by type.

## Server state

Use a query/cache layer for:

- Products
- Orders
- Supplier data
- Inventory data
- Notifications

## Local UI state

Use local component state for:

- Modal visibility
- Input state
- Temporary filters

## Persistent client state

Use carefully for:

- Session metadata
- Safe preferences
- Cart UX cache

Do not store sensitive server secrets in client state.

---

# 67. Frontend Authorization

The frontend may hide unavailable actions for UX, but this is not security.

Example:

```text
Supplier sees "Verify" button only if admin
```

But backend must independently reject:

```text
POST /admin/suppliers/:id/verify
```

from a non-admin.

---

# 68. Design-to-Development Workflow

Recommended process:

```text
Requirement
↓
User flow
↓
Wireframe
↓
UI design
↓
Component mapping
↓
API contract
↓
Implementation
↓
Automated tests
↓
Browser/device testing
↓
Performance testing
```

Do not start coding complex screens before the core user flow is agreed.

---

# 69. UI Acceptance Criteria

A screen is complete when:

- Correct data is displayed
- Loading state exists
- Empty state exists
- Error state exists
- Authorization is respected
- Mobile layout works
- Desktop layout works where applicable
- Accessibility is addressed
- API failures are handled
- Duplicate actions are prevented
- Analytics events are implemented where required
- Performance is acceptable

---

# 70. Final UX Direction

Bezo should combine:

```text
Marketplace simplicity
+
B2B procurement efficiency
+
Pharmaceutical information clarity
+
Supplier operational control
+
Fast checkout
+
Reliable delivery tracking
```

The buyer experience should feel familiar and effortless, while the supplier/admin interfaces should optimize operational speed and accuracy.

The final product should look like a modern, high-performance B2B marketplace—not a generic hospital/pharmacy management system and not a literal copy of another marketplace.

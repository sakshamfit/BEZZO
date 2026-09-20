# BEZZO Dashboard Architecture & Role Specification

**Version:** 1.0  
**Status:** Draft for Implementation  
**Product:** Bezzo — B2B Pharmaceutical Marketplace  
**Primary Market:** India

## 1. Purpose

Bezzo will have four primary role-specific dashboards:

1. **Admin Dashboard** — Bezzo company operations
2. **Wholesaler Dashboard** — supplier/wholesaler operations
3. **Retailer Dashboard** — medical-store buyer operations
4. **Picker Dashboard** — physical order pickup and hub/collection operations

All dashboards use the same Bezzo backend and transactional data layer, with role-based authorization and isolated data access.

## 2. Architecture

```text
                         BEZZO PLATFORM
                              |
                       Authentication
                              |
                         RBAC / Access
                              |
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ↓                   ↓                   ↓
     ADMIN DASHBOARD     WHOLESALER          RETAILER
                          DASHBOARD           DASHBOARD
                              |
                              ↓
                        PICKER DASHBOARD
                              |
                         BEZZO BACKEND
                    /          |          \
             PostgreSQL      Redis      OpenSearch
```

Dashboards are interfaces over shared domain services, not separate business systems.

## 3. Admin Dashboard

### Purpose

Internal control center for authorized Bezzo employees.

### Main areas

```text
Dashboard
Users
Retailers
Wholesalers
Pickers
Products
Catalog
Inventory
Orders
Fulfillment
Logistics
Pickups
Hubs / Collection Locations
Payments
Refunds
Settlements
Support
Disputes
Compliance
Notifications
Analytics
Reports
Configuration
Feature Flags
Audit Logs
Security
```

### Overview

The dashboard should surface:

- Orders and pending orders
- Operational exceptions
- Supplier and retailer verification
- Active wholesalers, retailers and pickers
- Pending pickups
- Scheduled orders
- Orders at collection hubs
- Payment exceptions
- Support cases
- Compliance exceptions

## 4. Wholesaler Dashboard

### Purpose

Allow each wholesaler to manage only its own business.

### Navigation

```text
Dashboard
Products
Inventory
Orders
Fulfillments
Pickups
Warehouse
Pricing
Batches & Expiry
Documents
Notifications
Reports
Account
Support
```

### Main functions

- Manage supplier listings
- Update pricing and MOQ
- Manage inventory
- Manage batches and expiry
- Receive orders
- Prepare fulfillment
- Mark orders ready for pickup
- View assigned picker and pickup window
- View settlements
- Receive operational alerts

### Inventory view

```text
Product
SKU
Batch
Expiry
Quantity
Reserved
Available
MRP
Selling Price
Storage Requirement
Status
```

A wholesaler must never access another wholesaler's private data.

## 5. Retailer Dashboard

### Purpose

Medical-store purchasing and order-management interface.

### Navigation

```text
Home
Search
Categories
Orders
Cart
Account
```

Web may additionally expose:

```text
Medicines
Quick Reorder
Support
```

### Main functions

- Search medicines
- Browse categories
- Compare available supplier offers
- Reorder previous products
- Add to cart
- Checkout
- Select quick or scheduled delivery
- Track orders
- View invoices
- Manage addresses
- Request support, returns and refunds

## 6. Scheduled Order Customer Flow

```text
Retailer
   ↓
Select products
   ↓
Checkout
   ↓
Select scheduled date
   ↓
Select delivery slot
   ↓
Confirm order
   ↓
Wholesaler prepares
   ↓
Picker assigned
   ↓
Picker collects
   ↓
Collection hub
   ↓
Final delivery
   ↓
Retailer receives order
```

The retailer sees customer-facing order progress without unnecessary internal logistics complexity.

## 7. Picker Dashboard

### Purpose

Dedicated operational interface for Bezzo workers who physically collect scheduled orders from wholesaler locations and move them to a collection hub.

This is a distinct role from wholesaler, retailer and final delivery operations.

### Home

```text
Today's Pickups
Nearby Pickups
Assigned Pickups
Upcoming Pickups
Completed Pickups
Pending Handover
Collection Hub
Notifications
Profile
```

### Picker workflow

```text
Scheduled Orders
       ↓
Pickup Planning
       ↓
Picker Assignment
       ↓
Travel to Wholesaler
       ↓
Order Collection
       ↓
Pickup Verification
       ↓
Orders Secured
       ↓
Collection Hub
       ↓
Hub Handover
       ↓
Ready for Final Delivery
```

## 8. Location-Based Pickup Assignment

The system should group pickup work geographically.

Example:

```text
Delhi
 ├── Locality A
 │    ├── Wholesaler 1
 │    ├── Wholesaler 2
 │    └── Wholesaler 3
 │
 └── Locality B
      ├── Wholesaler 4
      └── Wholesaler 5
```

Assignment may consider:

- Wholesaler pickup address
- Scheduled pickup window
- Picker availability
- Picker location where permitted
- Pickup workload
- Geographic proximity
- Operational capacity

Rules must be configurable.

## 9. Picker Assignment

```text
Scheduled Orders
       ↓
Group by pickup location
       ↓
Group by locality/zone
       ↓
Calculate workload
       ↓
Select eligible picker
       ↓
Create pickup assignment
       ↓
Notify picker
```

Example task:

```text
PICKUP #PK10245

Location:
Wholesaler ABC

Area:
Delhi — XYZ Locality

Orders:
12

Pickup Window:
14:00–15:00

Items:
87

Estimated workload:
Medium

[START PICKUP]
```

## 10. Multiple Pickup Stops

A picker may receive a sequence:

```text
Picker
   ↓
Wholesaler A
   ↓
Wholesaler B
   ↓
Wholesaler C
   ↓
Collection Hub
```

Initial route planning may use straightforward geographic sequencing. More advanced route optimization can be introduced later.

## 11. Pickup Verification

When the picker reaches a wholesaler:

```text
ARRIVED_AT_PICKUP
```

Verification can use configurable mechanisms:

- Pickup code
- OTP
- QR code
- Order reference
- Package scan
- Wholesaler confirmation

## 12. Order Collection

The picker should see only the information required to perform the pickup.

Example:

```text
Pickup Location:
ABC Wholesaler

Orders:
BZ10001
BZ10005
BZ10012
BZ10018

Total:
4 orders
```

For each order:

```text
Order ID
Package count
Expected quantity
Special handling
Collection status
```

## 13. Collection Confirmation

```text
Picker
   ↓
Verify package/order
   ↓
Scan/enter pickup reference
   ↓
Confirm collection
   ↓
Capture evidence if required
   ↓
Update fulfillment/logistics state
```

Example state progression:

```text
READY_FOR_PICKUP
        ↓
PICKER_ARRIVED
        ↓
PICKED_UP
        ↓
AT_COLLECTION_HUB
```

## 14. Collection Hub

Bezzo must support designated collection locations.

Example:

```text
Delhi Collection Hub

Incoming:
PK101
PK102
PK103

Orders:
BZ10001
BZ10002
BZ10003
...
```

Collected orders are received and verified at the hub before downstream delivery.

## 15. Hub Receiving

```text
Picker
  ↓
Handover
  ↓
Hub scans packages
  ↓
System verifies expected packages
  ↓
Packages accepted
  ↓
Orders marked AT_COLLECTION_HUB
```

Discrepancies must create an operational exception.

Example:

```text
Expected: 12 packages
Received: 11 packages
```

The discrepancy must not be silently ignored.

## 16. Picker Statuses

```text
ASSIGNED
ACCEPTED
EN_ROUTE
ARRIVED
COLLECTING
PICKED_UP
PARTIALLY_PICKED
FAILED_PICKUP
AT_HUB
HANDED_OVER
COMPLETED
CANCELLED
```

These statuses must map into the existing fulfillment and logistics state machines.

## 17. Data Relationship

```text
                 ADMIN
                   |
        ┌──────────┼──────────┐
        ↓          ↓          ↓
   WHOLESALER   RETAILER    PICKER
        |          |          |
        └────── BEZZO BACKEND ┘
                    |
              PostgreSQL
                    |
       ┌────────────┼─────────────┐
       ↓            ↓             ↓
    Orders      Fulfillment    Logistics
                    |
                  Pickup
                    |
                Collection
                   Hub
```

## 18. Security Boundaries

### Admin

Platform-wide access according to granular admin permissions.

### Wholesaler

Only:

```text
Own business
Own products
Own inventory
Own orders/fulfillments
Own warehouse
Own settlements
```

### Retailer

Only:

```text
Own account
Own business
Own carts
Own orders
Own payments
Own addresses
Own support cases
```

### Picker

Only:

```text
Own assignments
Assigned pickup locations
Required order/package information
Assigned routes
Hub handover tasks
Operational notifications
```

A picker must not automatically access supplier financial information, supplier private documents, retailer licence documents, payment credentials, unassigned orders, or unrelated customer information.

## 19. Shared Backend Modules

```text
Authentication
Users
RBAC
Retailers
Wholesalers
Products
Catalog
Inventory
Orders
Fulfillment
Payments
Logistics
Pickup
Hub / Collection
Notifications
Support
Analytics
Audit
```

Pickup and Hub/Collection should integrate with existing Fulfillment and Logistics domains rather than creating a separate order system.

## 20. API Boundary

Suggested role-oriented API namespaces:

```text
/api/v1/admin/*
/api/v1/wholesaler/*
/api/v1/retailer/*
/api/v1/picker/*
```

These routes must use shared domain services and authorization policies.

Business logic must not be duplicated across dashboards.

## 21. Implementation Priority

```text
Phase 1  Authentication + RBAC
Phase 2  Admin foundation
Phase 3  Wholesaler dashboard
Phase 4  Retailer marketplace
Phase 5  Picker dashboard
Phase 6  Pickup assignment
Phase 7  Collection hub
Phase 8  Scheduled-order orchestration
Phase 9  Analytics and operational reporting
Phase 10 Performance and scale testing
```

## 22. Final Model

| Dashboard | Primary User | Main Responsibility |
|---|---|---|
| Admin Dashboard | Bezzo employees | Control and operate the marketplace |
| Wholesaler Dashboard | Wholesalers | Products, inventory, orders and fulfillment |
| Retailer Dashboard | Medical stores | Purchasing, orders and deliveries |
| Picker Dashboard | Bezzo pickup workers | Collect orders and transfer them to the collection hub |

The Picker Dashboard is a distinct operational workflow for:

**Scheduled-order collection from wholesaler locations → consolidation/collection hub → downstream delivery.**

It must be integrated with Bezzo's existing Order, Fulfillment and Logistics architecture.

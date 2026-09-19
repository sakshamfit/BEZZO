# Bezo — Database Design Document v1.0

**Status:** Planning / Pre-development  
**Primary database:** PostgreSQL  
**Supporting systems:** Redis, OpenSearch/Elasticsearch-compatible search, S3-compatible object storage

## 1. Purpose
This document defines the initial logical database design for Bezo: medical-store buyers, wholesalers/suppliers, admins, verification, products, supplier listings, inventory, carts, orders, multi-supplier fulfillment, payments, delivery slots, logistics, notifications and audit logs.

## 2. Core Principle
PostgreSQL is the transactional source of truth. Redis, search and object storage are supporting systems and must not become authoritative for orders, payments, inventory or ownership.

## 3. Core Entities
```text
User
 ├─ Medical Store
 ├─ Supplier
 └─ Admin/Staff

Supplier
 ├─ Documents
 ├─ Products/Listings
 ├─ Inventory
 └─ Fulfillments

Product
 ├─ Category
 ├─ Images
 └─ Supplier Listings
      └─ Inventory

Medical Store
 ├─ Addresses
 ├─ Cart
 └─ Orders
      ├─ Order Items
      ├─ Fulfillments
      ├─ Payment
      └─ Delivery
```

## 4. Users and Roles

### `users`
```text
id UUID PK
phone VARCHAR
email VARCHAR
password_hash VARCHAR NULL
status VARCHAR
phone_verified_at TIMESTAMP NULL
email_verified_at TIMESTAMP NULL
last_login_at TIMESTAMP NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `roles`
```text
id UUID PK
code VARCHAR UNIQUE
name VARCHAR
created_at TIMESTAMP
```

Initial roles:
`MEDICAL_STORE`, `WHOLESALER`, `ADMIN`

### `user_roles`
```text
user_id UUID FK
role_id UUID FK
created_at TIMESTAMP
UNIQUE(user_id, role_id)
```

## 5. Medical Stores

### `medical_stores`
```text
id UUID PK
user_id UUID FK
legal_name VARCHAR
trade_name VARCHAR
gst_number VARCHAR NULL
drug_license_number VARCHAR NULL
status VARCHAR
verification_status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `medical_store_documents`
```text
id UUID PK
medical_store_id UUID FK
document_type VARCHAR
document_number VARCHAR NULL
file_object_key VARCHAR
status VARCHAR
issued_at TIMESTAMP NULL
expires_at TIMESTAMP NULL
reviewed_by UUID NULL
reviewed_at TIMESTAMP NULL
rejection_reason TEXT NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

## 6. Suppliers

### `suppliers`
```text
id UUID PK
owner_user_id UUID FK
legal_name VARCHAR
trade_name VARCHAR
business_type VARCHAR
gst_number VARCHAR NULL
pan_number VARCHAR NULL
status VARCHAR
verification_status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `supplier_documents`
```text
id UUID PK
supplier_id UUID FK
document_type VARCHAR
document_number VARCHAR NULL
file_object_key VARCHAR
status VARCHAR
issued_at TIMESTAMP NULL
expires_at TIMESTAMP NULL
reviewed_by UUID NULL
reviewed_at TIMESTAMP NULL
rejection_reason TEXT NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

Potential document types:
`WHOLESALE_DRUG_LICENSE`, `GST_CERTIFICATE`, `PAN`, `BUSINESS_REGISTRATION`, `PREMISES_PROOF`, `AUTHORIZED_PERSON_PROOF`, `QUALIFIED_PERSON_DOCUMENT`, `BANK_DOCUMENT`, `OTHER`.

Exact regulatory requirements must be finalized in the compliance document.

## 7. Verification

### `verification_reviews`
```text
id UUID PK
entity_type VARCHAR
entity_id UUID
reviewer_user_id UUID
decision VARCHAR
reason TEXT NULL
created_at TIMESTAMP
```

Possible decisions:
`APPROVED`, `REJECTED`, `REQUEST_CHANGES`, `SUSPENDED`

## 8. Addresses

### `addresses`
```text
id UUID PK
line1 VARCHAR
line2 VARCHAR NULL
landmark VARCHAR NULL
city VARCHAR
state VARCHAR
postal_code VARCHAR
country VARCHAR
latitude DECIMAL NULL
longitude DECIMAL NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

Use linking tables:
- `medical_store_addresses`
- `supplier_addresses`

This permits multiple store, warehouse, pickup and billing addresses.

## 9. Categories

### `categories`
```text
id UUID PK
parent_id UUID NULL FK categories.id
name VARCHAR
slug VARCHAR UNIQUE
description TEXT NULL
image_object_key VARCHAR NULL
sort_order INTEGER
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

Supports hierarchical medicine categories.

## 10. Products

### `products`
```text
id UUID PK
category_id UUID FK
name VARCHAR
slug VARCHAR UNIQUE
generic_name VARCHAR NULL
brand_name VARCHAR NULL
manufacturer_name VARCHAR NULL
composition TEXT NULL
strength VARCHAR NULL
dosage_form VARCHAR NULL
pack_size VARCHAR NULL
storage_conditions TEXT NULL
prescription_required BOOLEAN
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `product_images`
```text
id UUID PK
product_id UUID FK
object_key VARCHAR
image_type VARCHAR
sort_order INTEGER
alt_text VARCHAR NULL
created_at TIMESTAMP
```

Images live in object storage; PostgreSQL stores metadata/object keys.

## 11. Supplier Listings

### `supplier_products`
```text
id UUID PK
supplier_id UUID FK
product_id UUID FK
supplier_sku VARCHAR NULL
selling_price NUMERIC(12,2)
mrp NUMERIC(12,2) NULL
tax_rate NUMERIC(6,3) NULL
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
UNIQUE(supplier_id, product_id)
```

This separates the pharmaceutical product master from each supplier's price and availability.

## 12. Inventory

### `inventory`
```text
id UUID PK
supplier_product_id UUID FK UNIQUE
available_quantity INTEGER
reserved_quantity INTEGER
low_stock_threshold INTEGER NULL
last_synced_at TIMESTAMP NULL
source VARCHAR
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

Sellable quantity:
`available_quantity - reserved_quantity`

### `inventory_transactions`
```text
id UUID PK
inventory_id UUID FK
transaction_type VARCHAR
quantity INTEGER
reference_type VARCHAR NULL
reference_id UUID NULL
quantity_before INTEGER
quantity_after INTEGER
created_at TIMESTAMP
created_by UUID NULL
```

Possible transaction types:
`STOCK_IN`, `MANUAL_ADJUSTMENT`, `RESERVATION`, `RESERVATION_RELEASE`, `SALE`, `RETURN`, `EXPIRED`, `DAMAGE`

### `inventory_reservations`
```text
id UUID PK
inventory_id UUID FK
order_item_id UUID FK
quantity INTEGER
status VARCHAR
expires_at TIMESTAMP
created_at TIMESTAMP
released_at TIMESTAMP NULL
```

Reservations must be concurrency-safe and expire/release when appropriate.

## 13. Pricing

Initially supplier pricing can live on `supplier_products`.

Optional history table:

### `price_history`
```text
id UUID PK
supplier_product_id UUID FK
price NUMERIC(12,2)
mrp NUMERIC(12,2) NULL
effective_from TIMESTAMP
effective_to TIMESTAMP NULL
created_at TIMESTAMP
```

## 14. Cart

### `carts`
```text
id UUID PK
medical_store_id UUID FK
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `cart_items`
```text
id UUID PK
cart_id UUID FK
supplier_product_id UUID FK
quantity INTEGER
created_at TIMESTAMP
updated_at TIMESTAMP
```

Price and inventory must be revalidated at checkout.

## 15. Orders

### `orders`
```text
id UUID PK
order_number VARCHAR UNIQUE
medical_store_id UUID FK
status VARCHAR
subtotal NUMERIC(12,2)
delivery_fee NUMERIC(12,2)
instant_delivery_fee NUMERIC(12,2)
tax_amount NUMERIC(12,2)
discount_amount NUMERIC(12,2)
total_amount NUMERIC(12,2)
currency VARCHAR
delivery_type VARCHAR
delivery_slot_id UUID NULL
delivery_address_id UUID FK
created_at TIMESTAMP
updated_at TIMESTAMP
```

Public order number example:
`BZ-2026-000001`

### `order_items`
```text
id UUID PK
order_id UUID FK
product_id UUID FK
supplier_product_id UUID FK
product_name_snapshot VARCHAR
supplier_name_snapshot VARCHAR
quantity INTEGER
unit_price NUMERIC(12,2)
mrp_snapshot NUMERIC(12,2) NULL
tax_amount NUMERIC(12,2)
discount_amount NUMERIC(12,2)
total_amount NUMERIC(12,2)
created_at TIMESTAMP
```

Snapshots preserve historical accuracy if products/prices later change.

## 16. Multi-Supplier Fulfillment

### `fulfillments`
```text
id UUID PK
order_id UUID FK
supplier_id UUID FK
status VARCHAR
subtotal NUMERIC(12,2)
delivery_fee NUMERIC(12,2)
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `fulfillment_items`
```text
id UUID PK
fulfillment_id UUID FK
order_item_id UUID FK
quantity INTEGER
created_at TIMESTAMP
```

One customer order can therefore contain multiple supplier fulfillments.

## 17. Order Status History

### `order_status_history`
```text
id UUID PK
order_id UUID FK
old_status VARCHAR NULL
new_status VARCHAR
changed_by UUID NULL
reason TEXT NULL
created_at TIMESTAMP
```

## 18. Scheduled Delivery

### `delivery_slots`
```text
id UUID PK
name VARCHAR
start_time TIME
end_time TIME
active BOOLEAN
max_capacity INTEGER NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

Examples:
`MORNING`, `AFTERNOON`, `EVENING`

### `delivery_slot_capacity`
```text
id UUID PK
slot_id UUID FK
delivery_date DATE
capacity INTEGER
reserved_capacity INTEGER
created_at TIMESTAMP
updated_at TIMESTAMP
```

This prevents unlimited scheduled orders from being assigned to one slot.

## 19. Payments

### `payments`
```text
id UUID PK
order_id UUID FK
payment_method VARCHAR
provider VARCHAR
provider_payment_id VARCHAR NULL
provider_order_id VARCHAR NULL
amount NUMERIC(12,2)
currency VARCHAR
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

Potential methods:
`UPI`, `CARD`, `NET_BANKING`, `WALLET`, `COD`

### `payment_transactions`
```text
id UUID PK
payment_id UUID FK
transaction_type VARCHAR
provider_transaction_id VARCHAR NULL
amount NUMERIC(12,2)
status VARCHAR
created_at TIMESTAMP
```

### `payment_webhook_events`
```text
id UUID PK
provider VARCHAR
event_id VARCHAR UNIQUE
event_type VARCHAR
payload_reference VARCHAR NULL
processing_status VARCHAR
received_at TIMESTAMP
processed_at TIMESTAMP NULL
```

Do not store raw card numbers or CVV.

## 20. Logistics

### `deliveries`
```text
id UUID PK
order_id UUID FK
fulfillment_id UUID NULL FK
provider VARCHAR
provider_delivery_id VARCHAR NULL
delivery_type VARCHAR
status VARCHAR
pickup_address_id UUID FK
drop_address_id UUID FK
estimated_pickup_at TIMESTAMP NULL
estimated_delivery_at TIMESTAMP NULL
picked_up_at TIMESTAMP NULL
delivered_at TIMESTAMP NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `delivery_events`
```text
id UUID PK
delivery_id UUID FK
status VARCHAR
latitude DECIMAL NULL
longitude DECIMAL NULL
provider_event_id VARCHAR NULL
event_time TIMESTAMP
created_at TIMESTAMP
```

## 21. Supplier Payouts

### `supplier_payouts`
```text
id UUID PK
supplier_id UUID FK
amount NUMERIC(12,2)
currency VARCHAR
status VARCHAR
period_start DATE
period_end DATE
provider_reference VARCHAR NULL
paid_at TIMESTAMP NULL
created_at TIMESTAMP
```

Exact settlement rules belong in the payment/finance document.

## 22. Notifications

### `notifications`
```text
id UUID PK
user_id UUID FK
type VARCHAR
title VARCHAR
body TEXT
channel VARCHAR
status VARCHAR
reference_type VARCHAR NULL
reference_id UUID NULL
created_at TIMESTAMP
sent_at TIMESTAMP NULL
read_at TIMESTAMP NULL
```

Channels may include `PUSH`, `SMS`, `EMAIL`, `IN_APP`, `WHATSAPP`.

## 23. Audit Logs

### `audit_logs`
```text
id UUID PK
actor_user_id UUID NULL
action VARCHAR
entity_type VARCHAR
entity_id UUID NULL
before_data JSONB NULL
after_data JSONB NULL
ip_address INET NULL
user_agent TEXT NULL
created_at TIMESTAMP
```

Use for sensitive admin/business operations.

## 24. Idempotency

### `idempotency_keys`
```text
id UUID PK
key VARCHAR UNIQUE
user_id UUID NULL
operation VARCHAR
request_hash VARCHAR
response_reference VARCHAR NULL
created_at TIMESTAMP
expires_at TIMESTAMP
```

Use for order/payment operations where duplicate requests could create duplicate effects.

## 25. Indexing

Important indexes:

```text
users: phone, email, status
supplier_products: supplier_id, product_id, (supplier_id, product_id), status
inventory: supplier_product_id, status
orders: order_number, medical_store_id, status, created_at
fulfillments: order_id, supplier_id, status
payments: order_id, provider_payment_id, status
deliveries: order_id, provider_delivery_id, status
```

Exact indexes should be validated with real query plans.

## 26. Constraints

Use:
- Foreign keys
- Unique constraints
- NOT NULL where appropriate
- Positive quantity constraints
- Non-negative inventory constraints
- Exact numeric money types
- Unique order numbers
- Unique payment/webhook provider identifiers where appropriate

## 27. Money

Use PostgreSQL `NUMERIC`, never floating point.

Initial currency:
`INR`

## 28. Time

Store timestamps in UTC. Convert for display and scheduling.

Business scheduling timezone:
`Asia/Kolkata`

## 29. Transactions

Critical operations require database transactions.

Order creation concept:

```text
BEGIN
  validate cart
  validate inventory
  reserve inventory
  create order
  create order items
  create fulfillment
COMMIT
```

Payment confirmation similarly requires an atomic update of payment/order/reservation state.

## 30. Concurrency

Inventory must prevent overselling.

Conceptually:

```sql
UPDATE inventory
SET reserved_quantity = reserved_quantity + :qty
WHERE id = :id
  AND available_quantity - reserved_quantity >= :qty;
```

If no row is updated, the requested quantity cannot be reserved.

Use row locks/transactions where appropriate.

## 31. Search

PostgreSQL remains authoritative.

Flow:

```text
PostgreSQL
  ↓
Product-change event
  ↓
Search index worker
  ↓
OpenSearch
```

Search contains denormalized data optimized for discovery.

## 32. Object Storage

Store product images, supplier documents, medical-store documents, invoices and permitted attachments outside PostgreSQL.

PostgreSQL stores object metadata/keys.

Sensitive documents must remain private and be accessed using authorization/signed URLs.

## 33. Data Isolation

Supplier-owned tables must contain supplier ownership context.

Examples:
- `supplier_products.supplier_id`
- `supplier_documents.supplier_id`
- `fulfillments.supplier_id`

Every supplier query must enforce ownership. PostgreSQL Row Level Security can be evaluated as defense-in-depth.

## 34. Migration Strategy

All schema changes must be version-controlled.

Example:
```text
001_create_users
002_create_roles
003_create_suppliers
004_create_products
005_create_inventory
006_create_orders
...
```

No untracked production schema changes.

## 35. Environments

Separate:
```text
Development DB
Staging DB
Production DB
```

Production data must not be casually copied to development. Any production-like test data must be appropriately anonymized.

## 36. Backup and Recovery

Production PostgreSQL should have:
- Automated backups
- Point-in-time recovery where supported
- Retention policy
- Periodic restore tests

RPO/RTO will be finalized in the infrastructure/DR documentation.

## 37. Scaling Path

Stage 1:
```text
PostgreSQL primary + Redis + Search
```

Stage 2:
```text
PostgreSQL primary + read replicas
+ managed Redis
+ search cluster
```

Stage 3:
- Partitioning
- Archiving
- Analytics warehouse
- Dedicated read models
- Service-specific databases where justified

Database sharding should only be introduced when measured scale requires it.

## 38. Acceptance Criteria

The database design is ready when:
1. Buyer/supplier ownership is enforceable.
2. Products support multiple supplier listings.
3. Supplier-specific pricing and inventory are supported.
4. Inventory reservation is concurrency-safe.
5. Orders can split into supplier fulfillments.
6. Payments are auditable.
7. Scheduled delivery slots can enforce capacity.
8. Logistics events can be stored.
9. Historical order snapshots remain accurate.
10. Critical operations are auditable.
11. Money uses exact numeric types.
12. Timestamps are consistent.
13. Migrations are version-controlled.
14. Backups and restoration are tested.
15. Search remains derived rather than transactional.

## Status

**Database Version:** 1.0  
**Primary Database:** PostgreSQL  
**Cache:** Redis  
**Search:** OpenSearch/Elasticsearch-compatible  
**Object Storage:** S3-compatible  
**Architecture:** Transactional relational core with supporting specialized systems

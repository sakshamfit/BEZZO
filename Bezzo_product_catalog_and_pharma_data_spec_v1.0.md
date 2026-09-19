# Bezzo Product Catalog & Pharma Data Specification
## Version 1.0

**Product:** Bezzo — B2B Pharmaceutical Marketplace  
**Primary market:** India  
**Audience:** Product, Engineering, Data, Catalog Operations, Compliance, QA, Admin  
**Status:** Draft for implementation

---

## 1. Purpose

This document defines the canonical medicine catalog, supplier-specific listings, inventory metadata, pharmaceutical attributes, catalog governance, search fields, and data-quality rules for Bezzo.

The catalog must support:

- Medicine discovery by medical-store buyers
- Supplier product onboarding
- Supplier-specific pricing and stock
- Batch and expiry tracking
- FEFO (First Expiry, First Out) fulfillment
- Product images and packaging verification
- Prescription/restriction metadata
- Multi-supplier sourcing
- Search and filtering
- Product moderation
- Recall and expiry workflows
- ERP/POS/API/CSV imports
- Auditability and versioned product data

**Important:** Pharmaceutical classifications, legal restrictions, licence requirements, tax treatment, prescription status, controlled-category rules, and state/jurisdiction-specific requirements must be validated by qualified Indian pharmaceutical/legal/compliance professionals before production use.

---

## 2. Core Catalog Model

Bezzo should separate the **canonical product identity** from the **supplier listing**.

### 2.1 Canonical Product

Represents what the medicine/product fundamentally is.

Example:

> Paracetamol 500 mg Tablet — Brand X

Canonical product data should not contain supplier-specific stock or selling price.

### 2.2 Supplier Listing

Represents a supplier's commercial offer for a canonical product.

Example:

> Supplier A → Paracetamol 500 mg Tablet → ₹82 → 120 packs → MOQ 5

Supplier listings contain:

- Supplier
- Sale price
- Available quantity
- MOQ
- Supplier SKU
- Lead time
- Availability
- Supplier-specific images/documents where required
- Commercial terms
- Fulfillment eligibility

### 2.3 Batch / Inventory Lot

Represents physical stock belonging to a supplier.

A batch may contain:

- Batch number
- Manufacturing date
- Expiry date
- Quantity
- Purchase/cost information
- MRP
- Storage condition
- Recall status

This separation prevents the product catalog from becoming polluted with rapidly changing supplier data.

---

## 3. Catalog Hierarchy

Recommended hierarchy:

```text
Department
 └── Therapeutic Category
      └── Subcategory
           └── Product Family
                └── Canonical Product
                     └── Supplier Listing
                          └── Inventory Batch
```

Example:

```text
Medicines
 └── Pain & Fever
      └── Analgesics / Antipyretics
           └── Paracetamol
                └── Paracetamol 500 mg Tablet
                     ├── Supplier A
                     │    ├── Batch A1
                     │    └── Batch A2
                     └── Supplier B
                          └── Batch B1
```

The taxonomy should remain configurable rather than hard-coded in application logic.

---

## 4. Therapeutic Categories

Initial category coverage should support, subject to pharmaceutical-domain validation:

1. Analgesics / Antipyretics
2. Anti-inflammatory medicines
3. Anti-infectives
   - Antibiotics
   - Antivirals
   - Antifungals
   - Antiparasitics
4. Cardiovascular
5. Diabetes / Endocrine
6. Gastrointestinal
7. Respiratory
8. CNS / Neurological
9. Psychiatry / Mental Health
10. Dermatology
11. Ophthalmic
12. ENT
13. Urology
14. Gynecology / Women's Health
15. Pediatrics
16. Oncology
17. Vaccines / Biologics
18. Vitamins / Minerals / Nutritional products
19. Allergy
20. Emergency / Critical-care products
21. Surgical / Hospital consumables
22. Medical devices and allied healthcare products

The final production taxonomy should be governed through an admin-managed taxonomy table.

---

## 5. Product Identity

Each canonical product should have a stable internal identifier.

Recommended:

```text
product_id
catalog_code
canonical_name
slug
status
created_at
updated_at
version
```

Use an immutable UUID or equivalent unique identifier. Do not use the product name as the primary key.

A human-readable internal catalog reference can be generated, for example:

```text
BZ-MED-00001234
```

Canonical names should be generated from normalized pharmaceutical attributes rather than arbitrary supplier text.

---

## 6. Brand, Generic & Composition

A product should support:

- Brand name
- Generic name
- Active ingredient(s)
- Composition
- Manufacturer
- Marketer
- Product family
- Combination-product indicator

For combination medicines, store every active ingredient separately. Do not rely on one free-text composition field for search or regulatory workflows.

Example:

```json
{
  "brand_name": "Example Brand",
  "generic_name": "Paracetamol",
  "ingredients": [
    {
      "name": "Paracetamol",
      "strength": "500 mg"
    }
  ]
}
```

---

## 7. Strength

Strength must be structured.

Examples:

```text
500 mg
5 mg / 5 mL
100 mg + 500 mg
0.5 mg/mL
```

Recommended fields:

```text
strength_value
strength_unit
strength_text
ingredient_strengths[]
```

For multi-ingredient products, store strength per ingredient.

---

## 8. Dosage Form

Dosage form should use a controlled vocabulary rather than arbitrary text.

Examples:

- Tablet
- Capsule
- Softgel
- Syrup
- Suspension
- Solution
- Drops
- Cream
- Ointment
- Gel
- Lotion
- Powder
- Injection
- Infusion
- Inhaler
- Spray
- Suppository
- Patch
- Granules
- Oral liquid
- Mouthwash

Additional forms can be added through catalog administration.

---

## 9. Route of Administration

Where relevant, support:

- Oral
- Topical
- Ophthalmic
- Otic
- Nasal
- Inhalation
- Injectable
- Rectal
- Vaginal
- Transdermal
- Other validated route

Route must be structured to support filtering and safety workflows.

---

## 10. Pack Size and Unit of Measure

Pack information must be structured.

Example:

```text
10 tablets
100 mL bottle
5 mL vial
1 inhaler
```

Recommended fields:

```text
pack_quantity
pack_unit
pack_description
uom
```

Do not store pack size only as display text.

Example:

```json
{
  "pack_quantity": 10,
  "pack_unit": "TABLET",
  "pack_description": "Strip of 10 tablets"
}
```

---

## 11. Manufacturer and Marketer

Store separately:

```text
manufacturer_id
manufacturer_name
marketer_id
marketer_name
```

Manufacturer and marketer entities should be normalized so multiple products from the same company do not duplicate company records.

---

## 12. MRP and Commercial Pricing

MRP and supplier sale price are different concepts.

### Batch/Product Data

- MRP
- MRP currency
- Effective date where needed

### Supplier Listing

- Supplier sale price
- Wholesale price
- Discount
- Tax handling metadata
- Minimum order quantity
- Price validity

Example:

```json
{
  "mrp": 120.00,
  "selling_price": 84.00,
  "currency": "INR",
  "discount_type": "PERCENTAGE",
  "discount_value": 30
}
```

Pricing calculations must be performed server-side. Never trust price values sent by the client during checkout.

---

## 13. Tax Metadata

Support tax metadata without hard-coding tax assumptions into product code.

Recommended:

```text
tax_category
tax_rate
tax_code
tax_effective_from
tax_effective_to
```

Tax configuration should be versioned.

Final GST/tax classification must be verified by qualified tax/compliance professionals.

---

## 14. Prescription and Restriction Metadata

Support explicit regulatory metadata:

```text
prescription_required
restriction_class
controlled_category_flag
special_handling_flag
sale_restriction_notes
regulatory_reference
```

Possible internal states:

```text
GENERAL
PRESCRIPTION
RESTRICTED
CONTROLLED
SPECIAL_HANDLING
UNKNOWN
```

These are platform metadata, not a substitute for legal classification.

If classification is uncertain, use `UNKNOWN` and route the product to review rather than silently allowing unrestricted sale.

---

## 15. Storage Conditions

Storage requirements should be structured.

Examples:

- Room temperature
- Protect from light
- Refrigerated
- Frozen
- Temperature-controlled
- Other validated condition

Recommended:

```text
storage_condition
min_storage_temperature
max_storage_temperature
light_protection_required
cold_chain_required
special_storage_notes
```

Cold-chain products should be linked to logistics capabilities.

---

## 16. Batch and Expiry

Inventory must support batch-level tracking.

Recommended fields:

```text
batch_id
supplier_id
product_id
batch_number
manufacturing_date
expiry_date
quantity_available
quantity_reserved
quantity_damaged
quantity_expired
mrp
status
```

Batch states:

```text
AVAILABLE
RESERVED
BLOCKED
EXPIRED
RECALLED
DAMAGED
DEPLETED
```

---

## 17. FEFO Fulfillment

Medicine inventory should support **First Expiry, First Out**.

When multiple eligible batches exist, the fulfillment engine should prefer the eligible batch with the earliest expiry, subject to business rules and order constraints.

The system must prevent fulfillment of:

- Expired batches
- Recalled batches
- Blocked batches
- Compliance-ineligible stock

---

## 18. Minimum Remaining Shelf Life

Support product/supplier/order-level minimum remaining shelf-life rules.

Example:

```text
minimum_remaining_shelf_life_days = 180
```

At allocation:

```text
expiry_date - current_date >= required_shelf_life
```

If stock fails the requirement, it should not be automatically allocated unless the buyer/order policy explicitly permits it.

Production thresholds must be configurable and validated.

---

## 19. Supplier Listing

Supplier listing fields:

```text
listing_id
supplier_id
product_id
supplier_sku
status
selling_price
minimum_order_quantity
available_to_order
lead_time
delivery_eligibility
supplier_notes
created_at
updated_at
```

Possible states:

```text
DRAFT
PENDING_REVIEW
ACTIVE
PAUSED
OUT_OF_STOCK
SUSPENDED
REJECTED
```

Supplier-specific catalog data must only be editable by authorized supplier users or administrators.

---

## 20. Inventory Model

Inventory should distinguish:

```text
on_hand
reserved
available
damaged
quarantined
expired
```

Conceptually:

```text
available =
on_hand
- reserved
- damaged
- quarantined
- expired
```

Inventory updates must be transactional.

Checkout flow:

```text
validate stock
→ reserve stock
→ create order
→ confirm payment/fulfillment
→ commit allocation
```

If a reservation expires:

```text
reservation timeout
→ release stock
→ update availability
```

Concurrency controls are required to prevent overselling.

---

## 21. Multi-Supplier Sourcing

A canonical product can have many supplier listings.

Example:

```text
Product P

Supplier A
  stock = 0

Supplier B
  stock = 50

Supplier C
  stock = 25
```

The sourcing engine can select an eligible supplier according to configurable rules.

Potential decision inputs:

- Stock availability
- Buyer eligibility
- Supplier verification status
- Delivery coverage
- Delivery mode
- Required shelf life
- Storage capability
- Supplier restrictions
- Price
- MOQ
- Lead time
- Supplier reliability metrics

Supplier-selection logic belongs in the backend/domain layer, not the UI.

---

## 22. Product Images and Packaging

Support multiple images.

Recommended roles:

```text
FRONT
BACK
SIDE
LABEL
PACK_SIZE
OTHER
```

Store image binaries in object storage, not relational tables.

Metadata:

```text
image_id
product_id
supplier_listing_id
image_type
object_key
mime_type
width
height
checksum
status
created_at
```

Pipeline:

```text
upload
→ malware/security validation
→ file-type validation
→ resize/compress
→ metadata extraction
→ moderation
→ CDN delivery
```

Original uploads should not automatically become public.

---

## 23. Product Verification

Suggested lifecycle:

```text
DRAFT
→ SUBMITTED
→ UNDER_REVIEW
→ APPROVED
→ ACTIVE
```

Alternative outcomes:

```text
REJECTED
NEEDS_CORRECTION
SUSPENDED
ARCHIVED
```

Review can validate:

- Product identity
- Manufacturer
- Composition
- Strength
- Dosage form
- Pack size
- Images
- Pricing/MRP evidence where required
- Regulatory metadata
- Supplier documentation
- Duplicate matches

---

## 24. Duplicate Product Detection

Supplier submissions must not automatically create duplicate canonical products.

Candidate signals:

- Normalized brand
- Generic/ingredient composition
- Strength
- Dosage form
- Pack size
- Manufacturer
- Product identifiers where available
- Normalized name

Pipeline:

```text
Supplier submission
→ normalize
→ exact match
→ fuzzy/candidate match
→ confidence score
→ auto-link or manual review
```

Low-confidence matches should go to catalog operations.

---

## 25. Product Search Index

Recommended indexed fields:

```text
product_id
canonical_name
brand_name
generic_name
ingredient_names
manufacturer_name
strength_text
dosage_form
pack_description
category_ids
prescription_required
availability
supplier_count
```

Search should support:

- Exact product search
- Brand search
- Generic search
- Ingredient search
- Partial matching
- Typo tolerance
- Synonym support
- Category filters
- Dosage-form filters
- Strength filters
- Availability filters

Search must respect buyer eligibility and product restrictions.

---

## 26. Catalog Versioning

Catalog changes should be auditable.

Recommended:

```text
product_version
changed_by
change_type
previous_value
new_value
reason
created_at
```

Important changes include:

- Composition
- Strength
- Dosage form
- Manufacturer
- Pack size
- Regulatory status
- Storage requirement
- Category
- Product activation/deactivation

Do not silently overwrite important regulatory/product identity changes.

---

## 27. Product Eligibility

Eligibility should be evaluated server-side:

```text
Product active?
   ↓
Supplier verified?
   ↓
Supplier listing active?
   ↓
Buyer eligible?
   ↓
Stock available?
   ↓
Delivery supported?
   ↓
Regulatory restrictions satisfied?
   ↓
Checkout allowed
```

The frontend may hide unavailable products for usability, but backend authorization remains mandatory.

---

## 28. Recall Workflow

Support product/batch recalls.

Recall states:

```text
OPEN
UNDER_REVIEW
BLOCKED
RESOLVED
```

Workflow:

```text
Recall identified
→ identify affected product/batches
→ block inventory
→ prevent new allocation
→ identify affected orders
→ notify operations
→ initiate customer/supplier workflow
→ document resolution
```

Recall actions must be audited.

---

## 29. Expiry Workflow

Scheduled jobs should detect:

- Already expired stock
- Upcoming expiry
- Short-shelf-life stock
- Orders containing affected batches

Example:

```text
daily expiry scan
→ identify batches
→ mark expired
→ remove from available inventory
→ notify supplier
→ update catalog availability
```

Thresholds should be configurable.

---

## 30. Import and Integration Strategy

Catalog data may originate from:

1. Manual admin entry
2. Supplier portal
3. CSV import
4. ERP integration
5. POS integration
6. Supplier API
7. Future third-party catalog sources

All sources should pass through one normalization pipeline:

```text
source
→ staging
→ validation
→ normalization
→ duplicate detection
→ review
→ publish
```

Never write unvalidated external catalog data directly into production tables.

---

## 31. CSV Import

Recommended columns:

```text
supplier_sku
brand_name
generic_name
composition
strength
dosage_form
pack_size
manufacturer
marketer
mrp
selling_price
quantity
batch_number
manufacturing_date
expiry_date
storage_condition
prescription_required
```

Import results should provide:

```text
rows_received
rows_accepted
rows_rejected
rows_needing_review
errors[]
warnings[]
```

Large imports should be asynchronous.

---

## 32. Data Quality Rules

### Product identity

- Canonical name cannot be empty.
- At least one active ingredient or validated product identity must exist for medicine products.
- Dosage form must use controlled vocabulary.
- Pack size must be structurally valid.

### Batch

- Batch number cannot be empty for batch-tracked medicines.
- Expiry must be later than manufacturing date.
- Expired batches cannot be sellable.
- Recalled batches cannot be allocated.

### Pricing

- Selling price cannot be negative.
- MRP cannot be negative.
- Pricing changes must be auditable.

### Supplier

- Supplier must be verified before active sale.
- Supplier listing must belong to the authenticated supplier tenant.

### Images

- Allowed MIME types only.
- Maximum file size enforced.
- Malicious content rejected.
- Image must pass processing/moderation before publication.

---

## 33. Data Ownership

| Data | Owner |
|---|---|
| Canonical product identity | Bezzo Catalog/Admin |
| Taxonomy | Bezzo Catalog/Admin |
| Regulatory metadata | Compliance/Admin |
| Supplier listing | Supplier |
| Supplier SKU | Supplier |
| Supplier price | Supplier |
| Supplier inventory | Supplier/integration |
| Batch data | Supplier/integration |
| Buyer-specific orders | Buyer + Bezzo |
| Product images | Supplier/Admin, subject to moderation |
| Search index | System-generated |

Supplier data must never overwrite canonical catalog data without the appropriate workflow.

---

## 34. Database Entities

Recommended core tables:

```text
catalog_categories
catalog_ingredients
catalog_manufacturers
catalog_marketers
catalog_products
catalog_product_ingredients
catalog_product_categories
catalog_product_images
catalog_product_versions
supplier_product_listings
inventory_batches
inventory_reservations
inventory_movements
catalog_reviews
catalog_import_jobs
catalog_import_rows
product_recalls
product_restrictions
```

These integrate with the broader Bezzo database model.

---

## 35. Example Product JSON

```json
{
  "product_id": "uuid",
  "catalog_code": "BZ-MED-00001234",
  "canonical_name": "Example Medicine 500 mg Tablet",
  "brand_name": "Example Brand",
  "generic_name": "Example Generic",
  "ingredients": [
    {
      "name": "Example Generic",
      "strength": {
        "value": 500,
        "unit": "mg"
      }
    }
  ],
  "dosage_form": "TABLET",
  "route": "ORAL",
  "pack": {
    "quantity": 10,
    "unit": "TABLET",
    "description": "Strip of 10 tablets"
  },
  "manufacturer": {
    "id": "manufacturer-uuid",
    "name": "Example Manufacturer"
  },
  "regulatory": {
    "prescription_required": true,
    "restriction_class": "PRESCRIPTION"
  },
  "storage": {
    "condition": "ROOM_TEMPERATURE",
    "cold_chain_required": false
  },
  "status": "ACTIVE"
}
```

---

## 36. Example Supplier Listing

```json
{
  "listing_id": "listing-uuid",
  "supplier_id": "supplier-uuid",
  "product_id": "product-uuid",
  "supplier_sku": "SUP-12345",
  "selling_price": 84.0,
  "currency": "INR",
  "minimum_order_quantity": 5,
  "available_to_order": 120,
  "lead_time_minutes": 30,
  "status": "ACTIVE"
}
```

---

## 37. Example Inventory Batch

```json
{
  "batch_id": "batch-uuid",
  "supplier_id": "supplier-uuid",
  "product_id": "product-uuid",
  "batch_number": "ABC123",
  "manufacturing_date": "2026-01-01",
  "expiry_date": "2027-12-31",
  "quantity_on_hand": 100,
  "quantity_reserved": 20,
  "quantity_available": 80,
  "mrp": 120.0,
  "status": "AVAILABLE"
}
```

---

## 38. Catalog API Implications

Representative APIs:

```text
GET    /v1/catalog/products
GET    /v1/catalog/products/:productId
GET    /v1/catalog/categories
GET    /v1/catalog/search
POST   /v1/supplier/listings
PATCH  /v1/supplier/listings/:listingId
GET    /v1/supplier/inventory
POST   /v1/supplier/inventory/import
PATCH  /v1/supplier/inventory/batches/:batchId
POST   /v1/admin/catalog/products
PATCH  /v1/admin/catalog/products/:productId
POST   /v1/admin/catalog/imports
POST   /v1/admin/catalog/recalls
```

Authorization:

```text
buyer → buyer-visible catalog
supplier → own listings/inventory
admin → authorized catalog operations
```

---

## 39. Buyer Marketplace Presentation

The buyer experience should remain marketplace-oriented and fast.

A product card can show:

```text
[Product Image]

Brand / Product Name
Generic / Strength
Pack Size

MRP
Supplier Price
Availability

Delivery estimate
Prescription indicator where appropriate
```

Avoid displaying excessive technical/regulatory metadata on the main card. Detailed information belongs on the product detail page.

---

## 40. Catalog Performance Requirements

Targets should be measured using production-like workloads.

Recommended starting objectives:

- Common catalog API: p95 < 300 ms
- Search API: p95 < 500 ms
- Product detail API: p95 < 300 ms
- Cached category requests: p95 < 150 ms

These are engineering targets, not guarantees.

Monitor separately:

- Database
- Cache
- Search
- Object storage/CDN
- API
- Mobile network conditions

---

## 41. Caching

Suitable cache candidates:

- Category trees
- Product summaries
- Product detail responses
- Search suggestions
- Manufacturer/ingredient reference data

Do not cache highly volatile inventory availability without an explicit freshness strategy.

Inventory and price displayed to buyers must be revalidated before checkout.

---

## 42. Catalog Security

Security controls include:

- Tenant isolation
- RBAC
- Server-side validation
- Signed/private object-storage URLs where required
- Malware scanning for uploads
- Audit logs
- Rate limiting
- Input sanitization
- API authorization
- Protection against mass assignment
- Protection against insecure direct object references

Supplier A must never be able to query or modify Supplier B's private catalog/inventory records.

---

## 43. Catalog Administration

Admin capabilities should include:

- Create/edit categories
- Create/merge canonical products
- Review supplier submissions
- Approve/reject listings
- Manage ingredients
- Manage manufacturers
- Manage product images
- Review duplicate candidates
- Manage restrictions
- Block products
- Block batches
- Initiate recalls
- Review expiry alerts
- View change history
- Export catalog reports

All privileged operations should be audited.

---

## 44. Governance

Recommended roles:

```text
CATALOG_ADMIN
CATALOG_REVIEWER
COMPLIANCE_REVIEWER
SUPPLIER_ADMIN
SUPPLIER_CATALOG_MANAGER
SUPPLIER_INVENTORY_MANAGER
```

A supplier should not be able to self-approve a product requiring administrative or compliance review.

---

## 45. Testing Requirements

### Unit tests

- Product normalization
- Pack parsing
- Strength parsing
- Price calculations
- FEFO selection
- Shelf-life validation
- Restriction evaluation

### Integration tests

- Supplier listing creation
- Inventory updates
- Batch reservation
- Search indexing
- Catalog imports
- Recall blocking

### Concurrency tests

- Two buyers purchasing the last units
- Simultaneous supplier inventory updates
- Reservation expiry
- Duplicate import submissions

### Security tests

- Cross-supplier access attempts
- Unauthorized product edits
- Unauthorized batch access
- IDOR testing
- Malicious file uploads

---

## 46. Acceptance Criteria

The catalog implementation is ready for production-readiness review when:

- Canonical products and supplier listings are separated.
- Supplier data is tenant-isolated.
- Batch-level inventory works.
- FEFO allocation is supported.
- Expired/recalled stock cannot be sold.
- Product restrictions are enforced server-side.
- Product images are validated and moderated.
- Duplicate product detection exists.
- Catalog imports are staged and validated.
- Search supports structured medicine attributes.
- Catalog changes are audited.
- Admin moderation is operational.
- Inventory reservation is concurrency-safe.
- APIs expose only authorized data.
- Performance metrics are instrumented.
- Compliance review has approved the applicable production classification model.

---

## 47. Recommended Implementation Sequence

```text
1. Taxonomy
2. Ingredients / manufacturers
3. Canonical products
4. Supplier listings
5. Batch inventory
6. Inventory reservations
7. Product images
8. Catalog moderation
9. Search indexing
10. Supplier imports
11. FEFO allocation
12. Expiry automation
13. Recall workflow
14. Product eligibility
15. Analytics / reporting
```

This sequence minimizes rework and keeps canonical product identity independent from supplier inventory.

---

## 48. Final Architecture Principle

Bezzo should treat the medicine catalog as a **governed domain**, not merely a product table.

The key separation is:

```text
WHAT IS THE PRODUCT?
        ↓
Canonical Product

WHO SELLS IT?
        ↓
Supplier Listing

WHAT STOCK EXISTS?
        ↓
Inventory Batch

CAN THIS BUYER PURCHASE IT?
        ↓
Eligibility / Compliance

HOW IS IT FULFILLED?
        ↓
Order + Fulfillment + Logistics
```

This model gives Bezzo a foundation for a scalable B2B pharmaceutical marketplace while keeping catalog integrity, supplier isolation, inventory accuracy, and regulatory controls separate and auditable.

---

## 49. Document Dependencies

This specification should be implemented alongside:

- Bezzo Product Requirements Document
- Bezzo Technical Requirements Document
- Bezzo Architecture Specification
- Bezzo Database Specification
- Bezzo API Specification
- Bezzo UI/UX Specification
- Bezzo Security & Compliance Specification
- Bezzo DevOps & Infrastructure Specification
- Bezzo Testing & QA Strategy

Future documents should reference this specification as the source of truth for catalog-domain terminology unless a later approved revision supersedes it.

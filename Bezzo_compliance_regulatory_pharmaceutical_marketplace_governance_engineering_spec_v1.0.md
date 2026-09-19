# Bezzo Compliance, Regulatory & Pharmaceutical Marketplace Governance Engineering Specification v1.0

**Product:** Bezzo B2B Pharmaceutical Marketplace  
**Document:** Compliance, Regulatory & Pharmaceutical Marketplace Governance Engineering Specification  
**Version:** 1.0  
**Status:** Engineering Baseline  
**Primary Market:** India  
**Scope:** Supplier licensing, buyer eligibility, medicine catalog governance, product restrictions, prescription/controlled categories, batch/expiry/recall controls, storage/cold-chain metadata, records, invoicing/tax integration, privacy, auditability, compliance workflows, and operational governance

---

# 1. Document Purpose

This document defines the compliance and governance architecture required for Bezzo to operate as a B2B pharmaceutical marketplace.

It translates compliance requirements into:

- Product rules
- Data models
- Workflow states
- Verification processes
- Access controls
- Transaction controls
- Recordkeeping
- Auditability
- Exception handling
- Recall and expiry workflows
- Governance responsibilities
- Compliance configuration
- Operational evidence

**Important:** This document is an engineering specification, not legal advice. Pharmaceutical, tax, privacy, licensing, advertising, controlled-medicine, storage, distribution, and state/jurisdiction-specific requirements must be validated by qualified Indian legal/pharmaceutical compliance professionals before production launch.

The existing Bezzo security/compliance specification explicitly establishes that engineering must not invent legal requirements and that legal/compliance decisions should be represented as versioned policy/configuration. This document follows that principle.

---

# 2. Compliance Architecture Principle

Bezzo shall not implement compliance as a single boolean such as:

```text
user.verified = true
```

Instead, eligibility should be evaluated through multiple layers:

```text
Business Identity
       ↓
Party Verification
       ↓
Applicable Licence / Eligibility
       ↓
Product Eligibility
       ↓
Transaction Eligibility
       ↓
Inventory / Batch Eligibility
       ↓
Fulfillment Eligibility
       ↓
Recordkeeping / Audit
```

This separation is required because a verified business does not automatically imply that every product, quantity, transaction, location, or fulfillment method is permitted.

---

# 3. Compliance Governance Model

Recommended responsibility model:

```text
Management
    ↓
Business policy

Legal / Compliance
    ↓
Determines applicable requirements

Product
    ↓
Defines compliant marketplace workflows

Engineering
    ↓
Implements technical controls

Security
    ↓
Validates security/privacy controls

Operations
    ↓
Performs verification and exception handling

Catalog / Pharma Operations
    ↓
Maintains governed product data

Finance
    ↓
Tax, invoicing, reconciliation

QA
    ↓
Validates compliance scenarios
```

Engineering shall implement approved policy; it shall not independently determine legal eligibility.

---

# 4. Compliance Policy as Configuration

Regulatory rules that can change shall not be hard-coded throughout application logic.

Use versioned policy/configuration such as:

```text
policy_id
policy_version
jurisdiction
effective_from
effective_until
product_scope
party_scope
required_licence_types
transaction_constraints
storage_constraints
recordkeeping_requirements
review_required
status
approved_by
approved_at
```

Policy changes must be:

- Versioned
- Reviewed
- Approved
- Audited
- Effective-dated

---

# 5. Jurisdiction Model

Bezzo should support jurisdiction-aware compliance.

Minimum conceptual model:

```text
Country
  ↓
State / Union Territory
  ↓
Business premises
  ↓
Licence jurisdiction
  ↓
Transaction destination
```

The same product or business rule may require different handling depending on applicable jurisdiction.

Do not assume a single nationwide configuration is sufficient for all pharmaceutical compliance decisions.

---

# 6. Supplier Compliance

Supplier activation shall require verification appropriate to the supplier's business and pharmaceutical activities.

Potential verification categories include:

- Business identity
- GST/business information where applicable
- Applicable wholesale drug licence
- Premises/storage information
- Qualified person/pharmacist information where applicable
- Identity information
- Bank/payment information
- Supporting documents
- Jurisdiction
- Licence validity

The exact requirements must be maintained through approved compliance policy.

---

# 7. Supplier Verification States

Recommended states:

```text
REGISTERED
    ↓
DOCUMENTS_PENDING
    ↓
UNDER_REVIEW
    ↓
VERIFIED
    ↓
ACTIVE
```

Exception states:

```text
REJECTED
SUSPENDED
EXPIRED
REQUIRES_REVERIFICATION
```

Only suppliers satisfying all applicable active requirements may participate in regulated marketplace transactions.

---

# 8. Supplier Licence Data Model

Store structured licence metadata separately from uploaded documents.

Example:

```text
supplier_licences
-----------------
id
supplier_id
licence_type
licence_number
issuing_authority
jurisdiction
issue_date
expiry_date
status
verification_status
verified_at
verified_by
document_id
policy_version
created_at
updated_at
```

A document upload must not itself imply that the licence is valid.

---

# 9. Licence Lifecycle

A licence should be distinguishable as:

```text
NOT_PROVIDED
UPLOADED
UNDER_REVIEW
VERIFIED
ACTIVE
EXPIRING
EXPIRED
SUSPENDED
REVOKED
REJECTED
```

Business rules should be evaluated against the current valid state rather than the existence of a document.

---

# 10. Licence Expiry Monitoring

Bezzo should generate configurable reminders before expiry.

Example policy:

```text
90 days → warning
60 days → warning
30 days → urgent
Expiry → restricted state
```

These intervals are configurable examples, not legal requirements.

On expiry:

- Re-evaluate supplier eligibility.
- Restrict affected operations where required.
- Preserve existing records.
- Prevent new regulated transactions when policy requires.
- Notify supplier.
- Create an operational/compliance task.

---

# 11. Buyer Eligibility

Medical-store buyers should undergo verification appropriate to the marketplace model and applicable law.

Potential information:

```text
Business name
Store address
Business registration
Applicable drug-sale licence
Tax information
Authorized contact
Supporting documents
Jurisdiction
```

Exact requirements must be configured by approved compliance policy.

---

# 12. Buyer Verification States

Recommended:

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
ACTIVE
REJECTED
SUSPENDED
EXPIRED
REQUIRES_REVERIFICATION
```

Buyer verification must be separate from ordinary account authentication.

---

# 13. Party Eligibility Engine

Create a reusable eligibility service rather than embedding rules separately in checkout, catalog, supplier, and admin modules.

Conceptual interface:

```text
evaluatePartyEligibility(
    party,
    jurisdiction,
    transactionContext
)
```

Possible result:

```json
{
  "eligible": true,
  "policy_version": "2026-01",
  "reasons": [],
  "required_actions": []
}
```

A denied decision should provide an internal reason code for operations without exposing sensitive policy details unnecessarily to the customer.

---

# 14. Product Governance

The Bezzo catalog specification defines the medicine catalog as a governed domain rather than a generic product table.

The canonical model separates:

```text
Canonical Product
      ↓
Supplier Listing
      ↓
Inventory Batch
```

This allows regulatory metadata to remain distinct from supplier-specific stock and commercial data. fileciteturn3file0L1-L15

---

# 15. Regulatory Product Metadata

Where applicable, product records should support structured fields such as:

```text
prescription_required
restriction_class
regulated_category
storage_condition
cold_chain_required
controlled_handling_required
minimum_shelf_life
special_recordkeeping_required
recall_sensitive
jurisdiction_rules
```

These fields must be governed by approved catalog/compliance workflows.

Do not allow suppliers to unilaterally change authoritative regulatory classifications.

---

# 16. Prescription / Restricted Products

For products requiring prescription or other special eligibility:

- The applicable rule must be represented explicitly.
- Eligibility must be evaluated server-side.
- Checkout must revalidate eligibility.
- Supplier fulfillment must respect the restriction.
- Relevant records must be retained according to approved policy.
- UI messaging must accurately describe the applicable requirement.

A frontend indicator is informational only; the backend is authoritative.

---

# 17. Controlled / Special-Handling Categories

If a product falls into a legally restricted or specially controlled category, the platform must support configurable rules for:

- Eligible buyer type
- Eligible supplier type
- Required documentation
- Quantity constraints
- Approval requirements
- Recordkeeping
- Fulfillment restrictions
- Audit requirements

The platform must not assume that all medicines follow the same transaction rules.

---

# 18. Product Eligibility Evaluation

At minimum, product eligibility should consider:

```text
Product status
+
Regulatory classification
+
Buyer eligibility
+
Supplier eligibility
+
Jurisdiction
+
Licence status
+
Inventory/batch status
+
Transaction policy
```

Example:

```text
Product is active
BUT
buyer licence is expired
→ transaction denied
```

---

# 19. Batch Governance

For batch-tracked medicines, inventory batches should contain:

```text
batch_number
manufacturing_date
expiry_date
quantity
mrp
storage_condition
recall_status
supplier_id
product_id
```

The catalog specification requires batch numbers for applicable batch-tracked medicines, expiry validation, prevention of expired allocation, and prevention of recalled-batch allocation. fileciteturn3file2L1-L15

---

# 20. Expired Stock Controls

Expired stock must not be:

- Offered for sale
- Reserved
- Allocated
- Dispatched

Expiry checks must exist in:

- Inventory
- Search/availability
- Cart validation
- Checkout
- Reservation
- Fulfillment

Do not rely on a single nightly job as the only control.

---

# 21. Near-Expiry Controls

Bezzo should support configurable near-expiry policies.

Possible rules:

```text
Normal sale
Restricted sale
Operational review
Do not allocate
```

The exact shelf-life threshold must be determined by approved product/compliance policy.

---

# 22. FEFO

Where applicable, fulfillment should support:

**FEFO — First Expiry, First Out**

Conceptually:

```text
Eligible batches
      ↓
Remove expired
      ↓
Remove recalled
      ↓
Apply policy constraints
      ↓
Sort by earliest eligible expiry
      ↓
Reserve
```

The catalog specification identifies FEFO as a required fulfillment capability. fileciteturn3file1

---

# 23. Recall Governance

Bezzo must support product/batch recall workflows.

Conceptual states:

```text
DRAFT
→ UNDER_REVIEW
→ APPROVED
→ ACTIVE
→ RESOLVING
→ CLOSED
```

A recall may identify:

- Product
- Batch
- Supplier
- Manufacturer
- Affected jurisdictions
- Effective date
- Reason/category
- Required action
- Affected orders

---

# 24. Recall Activation

When a recall becomes active:

```text
Recall
  ↓
Block affected inventory
  ↓
Prevent new allocation
  ↓
Identify affected orders
  ↓
Identify affected fulfillments
  ↓
Create operational tasks
  ↓
Notify relevant parties
  ↓
Track resolution
```

The admin specification also identifies recall creation, inventory blocking, affected-order identification, and notification as operational workflows. fileciteturn3file9

---

# 25. Recall Audit Trail

Every recall action must record:

- Actor
- Timestamp
- Product/batch scope
- Previous state
- New state
- Policy/version
- Reason
- Evidence/reference
- Affected operational records

Recall records must not be silently overwritten.

---

# 26. Storage Requirements

Product data should support:

```text
storage_condition
temperature_range
cold_chain_required
special_handling
```

These fields are descriptive/operational until mapped to approved compliance policy.

Do not infer storage requirements from product names alone.

---

# 27. Cold-Chain Governance

If cold-chain products are supported, the system must explicitly define:

- Eligible suppliers
- Storage requirements
- Packaging requirements
- Transport requirements
- Delivery time constraints
- Temperature monitoring requirements where applicable
- Exception handling
- Quarantine rules

A supplier lacking required cold-chain capability must not be selected for an applicable product.

---

# 28. Logistics Compliance

Fulfillment eligibility may depend on:

```text
Product
+
Storage requirement
+
Supplier capability
+
Destination
+
Delivery method
+
Temperature/handling requirements
```

Porter integration must not automatically be treated as suitable for every pharmaceutical product.

Applicable logistics restrictions must be approved before enabling such products.

---

# 29. Supplier Product Submission

Supplier-submitted products should pass through:

```text
Supplier submission
→ Validation
→ Normalization
→ Duplicate detection
→ Compliance review where required
→ Catalog moderation
→ Publish
```

The catalog specification requires external catalog sources to pass through staging, validation, normalization, duplicate detection, review, and publication rather than writing directly to production tables. fileciteturn3file4

---

# 30. Canonical Product Governance

Supplier submissions must not automatically create conflicting canonical products.

Catalog governance should support:

- Duplicate detection
- Product merge
- Product split
- Manufacturer correction
- Ingredient correction
- Pack correction
- Regulatory metadata review
- Version history

Supplier-specific information remains in the supplier listing.

---

# 31. Product Change Control

High-impact product changes should require controlled review.

Examples:

- Composition
- Strength
- Dosage form
- Manufacturer
- Regulatory classification
- Prescription status
- Storage requirement
- Recall status

Commercial changes such as supplier price may follow a different workflow but remain auditable.

---

# 32. Product Versioning

Important catalog data should support version history:

```text
product_version
effective_from
effective_until
changed_by
change_reason
policy_version
```

The system should be able to determine what product metadata was active at the time of a historical transaction.

---

# 33. Historical Transaction Integrity

Historical orders must not change merely because current catalog data changes.

For example:

```text
Current product price ≠ historical order price
```

Orders should preserve transaction-time values required for accounting, support, and audit.

---

# 34. Tax and Invoicing Governance

Bezzo must support a tax/invoicing architecture that can be configured according to the applicable business model.

Potential concerns include:

- GST registration
- Tax treatment
- Tax invoices
- Credit notes
- Debit notes
- E-invoicing where applicable
- IRN/QR-code integration where applicable
- Supplier/customer tax identifiers

Exact applicability must be determined by finance/tax professionals for Bezzo's legal structure and transaction model.

---

# 35. Tax Configuration

Tax rules should be versioned and effective-dated.

Conceptual model:

```text
tax_policy
tax_code
jurisdiction
effective_from
effective_until
rate
applicability
documentation_requirement
```

Do not hard-code a single tax rate into checkout logic.

---

# 36. Invoice Governance

Invoices should contain authoritative transaction information appropriate to the applicable invoicing model.

Potential fields:

- Seller
- Buyer
- Tax identifiers
- Invoice number
- Invoice date
- Product details
- Quantity
- Taxable value
- Tax components
- Total
- Applicable reference numbers
- Payment information

The exact invoice structure must follow the approved tax/accounting design.

---

# 37. Record Retention

Bezzo must define retention schedules for:

- Supplier verification
- Buyer verification
- Licences
- Product records
- Batch records
- Recall records
- Orders
- Invoices
- Payments
- Refunds
- Settlements
- Audit events
- Support/dispute evidence
- Security events

Retention must be driven by applicable legal, tax, regulatory, contractual, and operational requirements.

Do not delete records merely because they are no longer visible in the UI.

---

# 38. Data Retention Architecture

Retention policy should distinguish:

```text
Active
→ Archived
→ Restricted archival
→ Deletion eligible
→ Deleted
```

Deletion eligibility must consider:

- Legal hold
- Dispute
- Investigation
- Audit requirement
- Regulatory retention
- Tax/accounting retention

---

# 39. Legal Hold

Where an investigation, dispute, audit, or other approved hold exists:

```text
normal retention deletion
        ↓
      BLOCKED
```

The hold must be:

- Recorded
- Scoped
- Audited
- Removable only by authorized personnel

---

# 40. Privacy Governance

The existing Bezzo security/compliance specification identifies privacy, data minimization, retention, access control, and auditability as production controls.

Bezzo shall therefore maintain:

- Privacy notice
- Data inventory
- Processing-purpose mapping
- Access controls
- Retention rules
- Deletion/anonymization workflows where legally permitted
- Incident response
- Evidence of privacy controls

Privacy requirements must be mapped to the applicable Indian privacy framework and current implementation status before launch.

---

# 41. Consent and Notice

Where consent is the appropriate legal basis for a processing activity, the system should support:

```text
purpose
consent_status
consent_version
timestamp
source
withdrawal_status
```

Do not collect broad consent as a substitute for identifying the actual processing purpose.

Where another lawful basis or legal obligation applies, the product should use the appropriate compliance workflow rather than forcing an unnecessary consent interaction.

---

# 42. Data Subject / User Requests

Where applicable, Bezzo should support controlled workflows for privacy requests such as:

- Access
- Correction
- Deletion/erasure where applicable
- Withdrawal of consent where applicable
- Other legally applicable requests

Requests involving regulated records must be evaluated against retention and legal-hold requirements.

---

# 43. Privacy by Design

New features must ask:

1. What personal data is collected?
2. Why is it required?
3. Who can access it?
4. How long is it retained?
5. Where is it stored?
6. Is it shared with a third party?
7. Can the feature operate with less data?

---

# 44. Sensitive Document Governance

Regulatory documents are highly sensitive business/identity records.

Access shall be:

- Role-based
- Purpose-limited
- Tenant-isolated
- Audited
- Time-controlled where practical

Supplier documents must never be exposed to another supplier or buyer without an explicit approved workflow.

---

# 45. Compliance Audit Trail

Maintain evidence for:

```text
Supplier verification
Buyer verification
Licence verification
Document review
Product approval
Restriction decisions
Recall decisions
Inventory blocking
Order interventions
Refund approvals
Settlement actions
Policy changes
Admin actions
Security controls
Backup/restore tests
Incident reports
```

The existing security/compliance specification identifies these types of evidence as important for audit readiness. fileciteturn3file8L1-L15

---

# 46. Compliance Decision Records

For material compliance decisions, record:

```text
decision_id
subject
decision_type
decision
reason_code
policy_version
evidence
reviewer
timestamp
effective_from
effective_until
```

This allows Bezzo to answer:

> Why was this transaction, supplier, product, or batch considered eligible at that time?

---

# 47. Policy Change Management

A regulatory rule change must follow:

```text
Regulatory/legal change identified
        ↓
Compliance interpretation
        ↓
Approved policy
        ↓
Impact analysis
        ↓
Engineering change
        ↓
QA/compliance testing
        ↓
Effective-date deployment
        ↓
Monitoring
```

Avoid silently changing compliance behavior directly in production.

---

# 48. Compliance Configuration Testing

Every policy change should have tests for:

- Eligible case
- Ineligible case
- Boundary case
- Expired licence
- Suspended supplier
- Restricted product
- Wrong jurisdiction
- Invalid documentation
- Expired batch
- Recalled batch

---

# 49. Compliance Rules and Checkout

Checkout must re-evaluate compliance-sensitive conditions at the point of transaction.

Do not rely only on:

```text
Product was eligible when added to cart
```

Revalidate:

- Buyer eligibility
- Supplier eligibility
- Product eligibility
- Inventory/batch eligibility
- Destination
- Delivery method
- Current policy

---

# 50. Compliance Rules and Supplier Allocation

Multi-supplier allocation must filter candidates before reservation.

Conceptually:

```text
Candidate suppliers
       ↓
Supplier active?
       ↓
Licence valid?
       ↓
Product allowed?
       ↓
Batch eligible?
       ↓
Storage/fulfillment compatible?
       ↓
Inventory available?
       ↓
Eligible supplier
```

An out-of-stock supplier is not the only reason a supplier should be excluded.

---

# 51. Compliance Rules and Scheduled Delivery

Scheduled orders should be validated again before dispatch.

This matters when:

- Licence expires between order and dispatch
- Product becomes recalled
- Batch becomes blocked
- Storage/transport conditions change
- Delivery destination changes

The system should prevent dispatch where policy requires revalidation.

---

# 52. Compliance Rules and Instant Delivery

Instant delivery must not bypass compliance controls.

The same eligibility checks apply regardless of delivery speed.

```text
Instant
and
Scheduled
```

are delivery modes, not compliance exemptions.

---

# 53. Returns and Reverse Logistics

Returns of pharmaceutical products require special handling.

The system should distinguish:

```text
Ordinary commercial return
vs
Potentially regulated medicine return
```

Returned medicine may require:

- Quarantine
- Inspection
- Batch traceability
- Non-resale state
- Compliance review
- Disposal process where applicable

Do not automatically return pharmaceutical stock to sellable inventory.

---

# 54. Product Recall and Returns Integration

If a recalled batch is associated with a return:

```text
Return received
→ Identify batch
→ Compare recall status
→ Quarantine
→ Prevent resale
→ Create compliance task
```

---

# 55. Expiry and Returns Integration

If returned stock has crossed applicable expiry/shelf-life thresholds:

```text
Return
→ Batch validation
→ Expiry evaluation
→ Quarantine/non-sellable
```

The application must not assume that returned inventory is automatically safe to resell.

---

# 56. Dispute and Compliance Escalation

Support cases involving:

- Suspected counterfeit products
- Wrong medicine
- Batch/expiry concerns
- Recall concerns
- Storage/cold-chain failure
- Licence concerns
- Product safety issues

must support escalation to compliance/operations.

The support specification already defines a batch/expiry concern flow involving compliance escalation, quarantine/inventory blocking, affected-order identification, and resolution. fileciteturn3file6L1-L15

---

# 57. Counterfeit / Authenticity Concerns

Bezzo should support an investigation workflow for suspected counterfeit or authenticity concerns.

Potential actions:

- Suspend listing
- Quarantine batch
- Freeze affected stock
- Identify affected orders
- Preserve evidence
- Escalate to compliance/legal
- Restrict supplier where appropriate
- Document resolution

The system should not make unsupported legal conclusions automatically.

---

# 58. Supplier Suspension

Supplier suspension should be policy-driven and auditable.

Possible triggers:

- Licence expiry
- Licence suspension/revocation
- Compliance failure
- Security incident
- Fraud investigation
- Serious product issue
- Operational decision

Suspension must define its effect on:

- New orders
- Existing orders
- Inventory
- Payouts
- Listings
- Documents

---

# 59. Buyer Suspension

Buyer restrictions may be required for:

- Invalid/expired eligibility documents
- Fraud investigation
- Abuse
- Security incident
- Compliance issue

The system should distinguish:

```text
Account authentication status
vs
Marketplace transaction eligibility
```

---

# 60. Marketplace Advertising / Promotions Governance

Promotions and promotional UI must be reviewed for applicable pharmaceutical advertising/promotion restrictions.

The UI specification already notes that promotional treatment must comply with applicable pharmaceutical rules. fileciteturn3file7L1-L15

Therefore:

- Promotion types should be configurable.
- Restricted products should support exclusion rules.
- Promotional content should have an approval workflow where required.
- Compliance decisions should be auditable.

---

# 61. Search and Recommendations Governance

Search may return products based on user queries.

Recommendations, ranking, and promotional placement must not override mandatory product eligibility rules.

Order of operations should conceptually be:

```text
Candidate products
→ Compliance eligibility
→ Availability
→ Business ranking
→ Presentation
```

Never:

```text
Ranking
→ Compliance check
```

---

# 62. Catalog Moderation

Catalog moderation should identify:

- Missing regulatory metadata
- Suspicious product identity
- Duplicate products
- Incorrect strength/form
- Unsupported claims
- Invalid manufacturer information
- Missing batch attributes
- Inappropriate imagery
- Potentially restricted products

The catalog specification assigns regulatory metadata to Bezzo Catalog/Admin ownership rather than supplier ownership. fileciteturn3file2L1-L15

---

# 63. Import Compliance

Supplier CSV/ERP/API imports must pass:

```text
Authentication
→ Supplier authorization
→ Schema validation
→ Product normalization
→ Compliance validation
→ Duplicate detection
→ Review where required
→ Publish
```

Unvalidated imported regulatory attributes must not automatically become authoritative.

---

# 64. Compliance Data Quality

Critical compliance fields should have explicit quality states:

```text
UNKNOWN
PROVIDED
VALIDATED
VERIFIED
EXPIRED
REJECTED
```

Do not treat:

```text
UNKNOWN
```

as:

```text
VALID
```

---

# 65. Compliance Data Ownership

| Data | Primary Owner |
|---|---|
| Canonical product identity | Catalog/Admin |
| Regulatory metadata | Compliance/Catalog |
| Supplier licence | Supplier + Compliance |
| Buyer licence | Buyer + Compliance |
| Supplier inventory | Supplier/integration |
| Batch data | Supplier/integration |
| Recall state | Compliance/Admin |
| Policy configuration | Compliance/Admin |
| Tax configuration | Finance |
| Audit record | System/Security |
| Search index | System |

Supplier data must not overwrite authoritative regulatory data without the approved workflow.

---

# 66. Access Control for Compliance Data

Access must be scoped by:

- Role
- Organization
- Purpose
- Resource
- Jurisdiction where applicable

Example:

```text
Supplier
→ own compliance documents

Catalog reviewer
→ product compliance metadata

Compliance reviewer
→ applicable regulatory records

Finance
→ tax/invoice information required for duties

Support
→ only minimum information required
```

---

# 67. Compliance APIs

Representative APIs:

```text
GET    /v1/compliance/policies
GET    /v1/compliance/eligibility
GET    /v1/supplier/licences
POST   /v1/supplier/licences
PATCH  /v1/supplier/licences/:id
GET    /v1/buyer/licences
POST   /v1/buyer/licences
POST   /v1/admin/compliance/reviews
POST   /v1/admin/compliance/decisions
POST   /v1/admin/catalog/recalls
POST   /v1/admin/inventory/quarantine
GET    /v1/admin/compliance/audit
```

Actual endpoint naming must remain consistent with the approved Bezzo API specification.

---

# 68. Compliance Events

Important events should be emitted for downstream workflows.

Examples:

```text
SupplierLicenceSubmitted
SupplierLicenceVerified
SupplierLicenceExpired
BuyerEligibilityChanged
ProductRestrictionChanged
BatchExpired
BatchRecalled
BatchQuarantined
RecallActivated
RecallClosed
ComplianceDecisionCreated
CompliancePolicyPublished
```

Events must be versioned and auditable.

---

# 69. Compliance Notifications

Potential notifications:

### Supplier

- Document required
- Licence approaching expiry
- Licence expired
- Verification rejected
- Listing restricted
- Batch blocked

### Buyer

- Verification required
- Eligibility expired
- Order blocked
- Product restriction
- Recall affecting order

### Operations

- Verification queue
- Expiring licences
- Recall activation
- Compliance exception
- Suspicious product
- Quarantine task

---

# 70. Compliance Dashboard

Admin/compliance dashboards should show:

- Supplier verification queue
- Buyer verification queue
- Expiring licences
- Expired licences
- Suspended suppliers
- Restricted products
- Blocked batches
- Active recalls
- Compliance cases
- Pending decisions
- Policy versions
- Audit activity

---

# 71. Compliance SLAs

Operational SLAs may be configured for:

- Supplier verification
- Buyer verification
- Document review
- Recall activation
- Compliance escalation
- Product moderation

These are operational targets, not legal deadlines unless explicitly approved as such.

---

# 72. Auditability Requirements

For every material compliance action, preserve:

```text
Who
What
When
Why
Which policy
Which evidence
Previous state
New state
Affected records
```

This should support internal investigations and authorized external audits.

---

# 73. Evidence Storage

Evidence may include:

- Uploaded documents
- Verification notes
- Review decisions
- Regulatory references
- Screenshots where appropriate
- System-generated reports
- Communication records

Evidence must be protected from unauthorized modification.

---

# 74. Compliance Reporting

Reports may include:

- Supplier verification status
- Licence expiry
- Product restrictions
- Recall status
- Batch quarantine
- Compliance decisions
- Audit history
- Exceptions

Large reports should be generated asynchronously.

---

# 75. Compliance Monitoring

Monitor:

- Expiring licences
- Expired licences
- Invalid documents
- Blocked batches
- Recall coverage
- Compliance decision backlog
- Unreviewed product submissions
- Data quality failures
- Policy evaluation failures

---

# 76. Compliance Failure Handling

If a compliance evaluation service fails:

The system should fail safely for high-risk transactions.

Example:

```text
Eligibility cannot be determined
→ Do not assume eligible
→ Hold/block affected transaction where required
→ Create operational alert
```

This must be balanced against availability and configured per business-critical policy.

---

# 77. Policy Engine Failure

If the policy engine is unavailable, the platform should have a documented fallback strategy.

Possible patterns:

- Cached approved policy version
- Fail closed for regulated transaction decisions
- Allow only previously approved low-risk operations
- Queue transaction for review

The fallback must never silently weaken a mandatory compliance restriction.

---

# 78. Compliance and Offline Operation

Mobile offline behavior must not bypass compliance.

Offline data may support:

- Viewing previously synchronized information
- Draft workflows

But actions requiring current eligibility must revalidate against the server before finalization.

---

# 79. Compliance and Performance

Compliance evaluation should be efficient enough for interactive workflows.

Potential strategies:

- Cached policy versions
- Precomputed eligibility where safe
- Indexed licence state
- Cached regulatory metadata
- Efficient rule evaluation

However, volatile or high-risk eligibility must be revalidated at the appropriate transaction boundary.

---

# 80. Compliance Testing

### Unit

- Policy evaluation
- Licence state
- Expiry
- Product restriction
- Batch eligibility
- Recall blocking

### Integration

- Supplier verification
- Buyer verification
- Checkout eligibility
- Inventory blocking
- Recall workflows
- Policy versioning

### E2E

```text
Supplier onboarding
→ verification
→ listing
→ buyer order
→ eligibility check
→ fulfillment
```

### Negative tests

- Expired supplier licence
- Expired buyer licence
- Suspended supplier
- Recalled batch
- Expired batch
- Restricted product
- Wrong jurisdiction
- Missing document
- Policy service failure

---

# 81. Compliance Security Tests

Test:

- Cross-supplier document access
- Cross-buyer document access
- Unauthorized policy modification
- Unauthorized compliance decision
- Unauthorized recall activation
- Unauthorized inventory quarantine
- IDOR
- Privilege escalation
- Audit-log tampering

---

# 82. Compliance Data Integrity Tests

Validate:

```text
Licence status ↔ expiry date
Product restriction ↔ policy
Batch status ↔ recall
Inventory availability ↔ blocked batch
Order eligibility ↔ buyer/supplier status
Invoice ↔ transaction
Audit record ↔ action
```

---

# 83. Compliance Change Rollout

Regulatory changes should support staged rollout where safe:

```text
Draft policy
→ Test
→ Approved
→ Staging
→ Effective date
→ Production
→ Monitor
```

Where a legal requirement has an immediate effective date, emergency deployment procedures may be used with appropriate review and audit.

---

# 84. Compliance Incident Response

Compliance incidents include:

- Sale involving invalid eligibility
- Recall failure
- Expired product allocation
- Incorrect restriction
- Licence verification failure
- Regulatory document exposure
- Incorrect invoice/tax treatment
- Data retention violation

Response:

```text
Detect
→ Contain
→ Identify affected records
→ Preserve evidence
→ Assess scope
→ Apply corrective controls
→ Notify required stakeholders
→ Reconcile
→ Post-incident review
```

Any required external notification must be determined by authorized legal/compliance personnel.

---

# 85. Compliance Incident Scope Analysis

The system should help identify:

```text
Affected supplier
Affected buyer
Affected product
Affected batch
Affected orders
Affected fulfillments
Affected payments
Affected invoices
Affected notifications
```

This is particularly important for recall and batch incidents.

---

# 86. Governance of Pharmaceutical Data

Bezzo should treat pharmaceutical data as controlled domain data.

The catalog specification establishes:

```text
Canonical Product
→ Supplier Listing
→ Inventory Batch
→ Eligibility
→ Order/Fulfillment
```

This model should remain consistent across:

- Search
- Checkout
- Inventory
- Fulfillment
- Recall
- Support
- Reporting
- Compliance

---

# 87. Regulatory Source Management

Compliance policy should maintain references to the source used to establish a rule.

Example:

```text
policy_id
source_type
source_reference
source_date
reviewed_by
reviewed_at
effective_from
```

The source may be:

- Official regulation
- Government notification
- Approved legal opinion
- Internal compliance decision
- Contractual requirement

Engineering should not treat unofficial web content as authoritative policy without compliance approval.

---

# 88. Compliance Review Board

For significant regulatory changes, Bezzo should establish a review process involving appropriate:

- Compliance
- Legal
- Product
- Engineering
- Security
- Operations
- Finance

The exact organizational structure may vary.

---

# 89. Compliance Exceptions

Exceptions must be explicit.

An exception record should include:

```text
exception_id
scope
reason
approved_by
policy_basis
start_date
end_date
affected_entities
controls
status
```

Never implement hidden compliance exceptions in application code.

---

# 90. Compliance Configuration Governance

Configuration changes affecting regulated transactions should require:

- Authorization
- Review
- Versioning
- Effective date
- Audit event
- Rollback/recovery plan

---

# 91. Launch Gate

Bezzo should not launch regulated medicine transactions until the following are satisfied:

```text
Legal/compliance review
+
Supplier licensing workflow
+
Buyer eligibility workflow
+
Product classification/restriction model
+
Batch/expiry controls
+
Recall capability
+
Storage/fulfillment suitability
+
Invoice/tax architecture
+
Privacy/security controls
+
Audit logging
+
Backup/restore
+
Incident response
+
Compliance test suite
```

This is consistent with the existing Bezzo security/compliance launch gate. fileciteturn3file8L1-L15

---

# 92. Definition of Ready

A regulated feature is ready for implementation when:

- Applicable compliance questions are identified.
- Legal/compliance owner is identified.
- Product/supplier/buyer scope is known.
- Jurisdiction is known.
- Required data is defined.
- Eligibility rules are defined.
- Recordkeeping requirements are defined.
- Failure behavior is defined.
- Audit requirements are defined.

---

# 93. Definition of Done

A regulated feature is complete when:

- Approved policy is represented in versioned configuration.
- Server-side eligibility is implemented.
- Unauthorized access is blocked.
- Required records are stored.
- Audit events exist.
- Negative cases are tested.
- Expiry/restriction behavior is tested.
- Recall/quarantine behavior is tested where relevant.
- Privacy/security controls are verified.
- Compliance sign-off is recorded where required.

---

# 94. Implementation Sequence

## Phase 1 — Governance Foundation

1. Compliance ownership
2. Policy model
3. Jurisdiction model
4. Decision records
5. Audit integration

## Phase 2 — Party Compliance

6. Supplier verification
7. Supplier licences
8. Buyer verification
9. Buyer licences
10. Expiry monitoring

## Phase 3 — Product Compliance

11. Regulatory product metadata
12. Restrictions
13. Prescription handling
14. Batch governance
15. FEFO
16. Expiry blocking

## Phase 4 — Safety Operations

17. Recall management
18. Quarantine
19. Affected-order identification
20. Compliance support escalation

## Phase 5 — Commercial Compliance

21. Tax configuration
22. Invoicing
23. Applicable e-invoicing integration
24. Settlement records

## Phase 6 — Advanced Governance

25. Policy versioning
26. Compliance dashboards
27. Automated alerts
28. Advanced audit reporting
29. Compliance change management
30. Periodic regulatory review

---

# 95. Final Engineering Position

Bezzo should treat regulatory compliance as a **versioned, auditable decision system** rather than a collection of static fields.

The core model is:

```text
Approved Regulatory Policy
        ↓
Party Eligibility
        ↓
Product Eligibility
        ↓
Batch Eligibility
        ↓
Transaction Eligibility
        ↓
Fulfillment Eligibility
        ↓
Record + Audit
```

The platform must be capable of answering:

1. Who was the supplier?
2. Was the supplier eligible at the time?
3. Who was the buyer?
4. Was the buyer eligible at the time?
5. What product was sold?
6. What batch was allocated?
7. Was that batch eligible?
8. Which policy was applied?
9. What decision was made?
10. Who/what made the decision?
11. What evidence supported it?
12. What happened afterward?

The engineering objective is not to guess what the law requires. It is to create a system in which approved legal and compliance requirements can be represented, enforced, changed, tested, audited, and monitored without destabilizing the marketplace.

This specification should be implemented together with the Bezzo product catalog/pharma data, security/compliance, identity, database, API, order/fulfillment, inventory, payment/billing, logistics, support/dispute, admin/backoffice, audit/data governance, privacy, DevOps, observability, performance, and disaster recovery specifications.

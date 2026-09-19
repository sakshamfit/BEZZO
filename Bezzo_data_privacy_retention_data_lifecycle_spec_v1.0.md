# Bezzo Data Privacy, Retention & Data Lifecycle Specification v1.0

## Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Data Privacy, Retention & Data Lifecycle Specification |
| Version | 1.0 |
| Status | Baseline / Implementation Reference |
| Primary Audience | Engineering, security, compliance, DevOps, QA, admin operations, data/analytics |
| Applies To | Web, Android, iOS, Admin, Supplier Portal, APIs, databases, object storage, logs, analytics, backups |

---

# 1. Purpose

This specification defines how Bezzo collects, uses, stores, accesses, shares, retains, archives, anonymizes and deletes data.

The objectives are:

- data minimization
- privacy by design
- clear ownership of data
- controlled access
- appropriate retention
- secure deletion
- auditability
- regulatory/compliance readiness
- separation of transactional and analytical data
- protection of buyer, supplier, employee and partner information

This document defines the technical lifecycle. Exact legal retention periods and regulatory obligations must be finalized through qualified legal/compliance review for the jurisdictions and pharmaceutical activities in which Bezzo operates.

---

# 2. Scope

This specification covers:

1. Buyer/medical-store data
2. Supplier/wholesaler data
3. User identity and authentication data
4. Business verification data
5. Pharmaceutical licence/compliance documents
6. Product/catalog data
7. Inventory and batch data
8. Orders and fulfillment
9. Delivery/logistics data
10. Payment and billing data
11. Support and dispute data
12. Notifications and communication data
13. Audit/security logs
14. Analytics data
15. Event data
16. Uploaded files
17. Backups
18. Temporary/cache data
19. Administrative data
20. Data exports

---

# 3. Data Governance Principles

Bezzo SHALL follow:

### 3.1 Purpose limitation

Collect data for defined business, operational, security, compliance or legal purposes.

### 3.2 Data minimization

Collect the minimum data needed for the stated purpose.

### 3.3 Accuracy

Provide controlled mechanisms for correcting inaccurate user/business information.

### 3.4 Access control

Data access must be role- and tenant-controlled.

### 3.5 Retention limitation

Keep data only for as long as required by its purpose, contractual obligations, legal requirements, regulatory requirements, security needs or approved business policy.

### 3.6 Integrity

Important records must not be silently overwritten or destroyed.

### 3.7 Confidentiality

Sensitive information must be protected in transit, at rest and during operational access.

### 3.8 Accountability

Sensitive operations must be auditable.

---

# 4. Data Classification

Every significant data object SHALL have a classification.

Recommended levels:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
HIGHLY_RESTRICTED
```

## 4.1 PUBLIC

Examples:

- approved public product information
- public category information
- public marketing content

## 4.2 INTERNAL

Examples:

- internal operational metrics
- non-sensitive configuration
- general internal documentation

## 4.3 CONFIDENTIAL

Examples:

- supplier commercial information
- internal operational records
- non-public order information
- support records

## 4.4 RESTRICTED

Examples:

- buyer contact information
- supplier verification information
- compliance documents
- detailed financial records
- private addresses

## 4.5 HIGHLY_RESTRICTED

Examples:

- authentication secrets
- payment credentials/secrets
- encryption keys
- highly sensitive identity information
- security investigation data

The exact classification of each field SHALL be documented in the data dictionary.

---

# 5. Data Ownership

Recommended ownership model:

| Data | Authoritative Owner |
|---|---|
| User identity | Identity domain |
| Buyer profile | Buyer/account domain |
| Supplier profile | Supplier domain |
| Supplier verification | Compliance/admin domain |
| Canonical product | Catalog domain |
| Supplier listing | Supplier/catalog domain |
| Inventory | Inventory domain |
| Order | Order domain |
| Fulfillment | Fulfillment domain |
| Delivery | Logistics domain |
| Payment | Payment domain |
| Invoice | Billing domain |
| Settlement | Settlement/finance domain |
| Support case | Support domain |
| Audit record | Audit/security domain |
| Analytics projection | Analytics domain |

Analytics and cache copies SHALL NOT become accidental authoritative sources.

---

# 6. Data Lifecycle

Every data class should follow:

```text
COLLECT
   |
VALIDATE
   |
STORE
   |
USE
   |
SHARE/PROCESS WHEN AUTHORIZED
   |
ARCHIVE OR RETAIN
   |
ANONYMIZE / DELETE
   |
VERIFY DELETION
```

The lifecycle should be automated wherever practical.

---

# 7. Collection Rules

At collection time:

- identify the purpose
- identify the data owner
- validate the data
- classify sensitivity
- record consent/legal basis where applicable
- avoid collecting unnecessary fields
- define retention category
- protect the data immediately

The application SHALL NOT collect sensitive information simply because it may be useful later.

---

# 8. Identity Data

Typical user identity fields:

```text
user_id
name
mobile
email
status
role
created_at
updated_at
```

Authentication secrets must be handled separately.

Passwords, OTP values and raw authentication secrets SHALL NOT be stored in plaintext.

---

# 9. Buyer / Medical Store Data

Buyer/business data may include:

```text
business name
business address
contact information
business identifiers
applicable licence information
verification status
authorized contacts
delivery addresses
```

Access must be limited to the buyer, authorized Bezzo personnel and systems with a legitimate operational purpose.

Suppliers must not receive unrelated buyer information.

---

# 10. Supplier Data

Supplier data may include:

```text
business identity
contact information
GST/business information
drug licence information
premises information
bank/settlement information
qualified-person/pharmacist information where applicable
verification documents
operational locations
```

Supplier information is tenant-isolated.

A supplier may access only its own organization data unless an explicit administrative workflow grants broader access.

---

# 11. Compliance Documents

Documents may include:

- applicable licences
- identity/business verification documents
- premises/storage evidence
- qualified-person documentation where required
- tax/business records
- other compliance evidence

Documents SHALL be:

- access-controlled
- encrypted at rest
- stored in private object storage
- served through short-lived authorized access
- audit logged
- protected from public indexing
- retained according to approved compliance policy

Permanent public URLs SHALL NOT be used for restricted documents.

---

# 12. Data Processing Purpose Registry

Bezzo should maintain a data-purpose registry.

Example:

| Data | Purpose |
|---|---|
| Mobile number | Authentication and account communication |
| Delivery address | Order fulfillment |
| Supplier licence | Supplier verification/compliance |
| Payment reference | Payment reconciliation |
| Order history | Order management/support |
| Support messages | Case resolution |
| Device token | Push notification delivery |
| Audit event | Security/accountability |

Every sensitive data category should have at least one documented purpose.

---

# 13. Consent and Preference Records

Where consent is applicable, store a versioned record.

Recommended:

```text
consent_records
```

Fields:

```text
id
user_id
purpose
policy_version
status
captured_at
withdrawn_at
source
metadata
```

Do not use a mutable boolean alone for historical consent evidence.

---

# 14. Marketing Preferences

Marketing communications must be separated from transactional communication.

Store preferences for:

```text
push
SMS
email
WhatsApp where enabled
other approved channels
```

Transactional messages should not depend on marketing consent where a different lawful basis applies.

Exact legal treatment must be confirmed for the relevant jurisdiction and communication type.

---

# 15. Data Access

Access must follow least privilege.

Example:

```text
Buyer
  -> own profile/orders

Supplier
  -> own organization/products/orders

Support Agent
  -> assigned/permitted support records

Finance Admin
  -> permitted payment/settlement data

Compliance Admin
  -> permitted compliance records

Analyst
  -> approved analytical datasets

Security Admin
  -> approved security/audit datasets
```

Access SHALL be enforced server-side.

---

# 16. Administrative Access

Administrative access to restricted data should be:

- role-controlled
- time-appropriate
- logged
- monitored
- limited to business need

High-risk access may require:

- MFA
- elevated approval
- reason capture
- two-person approval
- read-only mode

---

# 17. Data Access Audit

Sensitive access should generate audit records containing:

```text
actor
actor_role
action
resource_type
resource_id
purpose/reason where required
timestamp
request_id
correlation_id
result
```

Audit records themselves are sensitive and must be protected.

---

# 18. Modification vs Immutable Records

Not all data should be freely updated.

### Mutable

Examples:

```text
profile name
contact preferences
notification settings
```

### Append-only / immutable where appropriate

Examples:

```text
financial ledger entries
payment events
audit records
compliance decision history
order state history
inventory movement history
consent history
```

Corrections to immutable records should be represented through controlled compensating records rather than silent edits.

---

# 19. Order Data

Orders are business records.

The order system should preserve:

- order identity
- buyer
- supplier fulfillment
- items
- pricing snapshot
- taxes
- delivery information required for fulfillment
- payment references
- state history
- timestamps
- relevant compliance/audit references

Historical order facts should not be rewritten merely because catalog or pricing data later changes.

---

# 20. Financial Data

Payment and billing records require stronger retention and integrity controls.

Bezzo should distinguish:

```text
payment gateway data
payment state
invoice
refund
settlement
financial ledger
reconciliation
```

Sensitive payment credentials should not be stored unless explicitly required and appropriately controlled.

Provider references should be retained for reconciliation.

Exact statutory/accounting retention periods must be configured after qualified finance/legal review.

---

# 21. Logistics Data

Logistics data may include:

```text
pickup location
drop location
delivery reference
driver/provider reference
delivery status
proof of delivery
timestamps
delivery exceptions
```

Retain only what is needed for:

- active fulfillment
- customer support
- dispute handling
- operational analytics
- legal/compliance obligations
- approved historical reporting

Location information should receive an appropriate privacy classification.

---

# 22. Support and Dispute Data

Support cases may contain:

- customer messages
- supplier responses
- internal notes
- evidence
- order references
- payment references
- delivery references
- resolution information

Internal notes SHALL never be exposed to buyers or suppliers through customer-facing APIs.

Support evidence must follow the same access and retention controls as the case.

---

# 23. Communication Data

Communication records may include:

```text
recipient
channel
template
delivery status
provider reference
timestamps
message metadata
```

Store message content only where required by the communication purpose, support requirements, legal obligations or approved retention policy.

Avoid duplicating sensitive order information unnecessarily into every notification record.

---

# 24. Audit Data

Audit logs are required for important actions affecting:

- users
- permissions
- suppliers
- buyers
- compliance
- products
- orders
- inventory
- payments
- refunds
- settlements
- configuration
- security

Administrative actions affecting money, products, orders, compliance or security must be auditable.

This aligns with the Bezzo backoffice requirement for immutable audit records for important administrative actions. 

---

# 25. Event Data

Domain events should contain only information necessary for consumers.

Avoid embedding:

- passwords
- OTPs
- payment secrets
- full identity documents
- unnecessary personal profiles
- sensitive compliance documents

Events should prefer stable IDs over copying entire records.

---

# 26. Analytics Data

Analytics should use minimized datasets.

Where possible:

```text
raw operational data
       |
       v
controlled transformation
       |
       v
analytics dataset
```

Analytics dashboards should avoid exposing:

- full customer addresses
- unnecessary phone numbers
- unnecessary email addresses
- identity documents
- licence documents
- payment-sensitive information

Bezzo analytics already requires data minimization, role-based access, masking, controlled exports, access logging and retention rules. 

---

# 27. Pseudonymization

Where identity is not required, use pseudonymous identifiers.

Example:

```text
buyer_01H...
supplier_01H...
```

Analytics systems should prefer stable internal IDs over direct contact information.

Pseudonymization does not automatically make data anonymous.

---

# 28. Anonymization

When data no longer needs to identify a person/business, approved anonymization may be used.

Examples:

```text
replace user identity with irreversible analytics identifier
aggregate geographic information
remove direct contact details
remove exact addresses
```

Anonymization methods must be reviewed for re-identification risk.

---

# 29. Retention Policy Model

Bezzo should not hard-code arbitrary retention periods into every service.

Instead define a centralized retention policy:

```text
retention_policy
----------------
data_class
purpose
retention_period
legal_basis/reference
archive_strategy
deletion_strategy
anonymization_strategy
owner
version
effective_from
```

Services consume policy rather than independently inventing retention rules.

---

# 30. Retention Categories

Initial categories:

```text
SHORT_LIVED
OPERATIONAL
ACCOUNT
TRANSACTIONAL
FINANCIAL
COMPLIANCE
SECURITY
AUDIT
ANALYTICS
BACKUP
```

Each category receives an approved retention policy.

---

# 31. Retention Periods

This specification intentionally does not prescribe a universal number of days/years for every data type.

Retention must consider:

- applicable Indian law
- pharmaceutical/drug regulatory requirements
- tax/accounting requirements
- contractual obligations
- dispute/chargeback windows
- security requirements
- privacy requirements
- litigation/legal holds
- operational needs

Legal/compliance owners must approve production retention values.

---

# 32. Legal Hold

When a record is subject to an approved legal/compliance hold:

```text
normal retention expiry
        |
        X
        |
legal hold active
        |
        v
retain
```

Deletion SHALL be blocked for records covered by the hold.

Recommended structure:

```text
legal_holds
```

with:

```text
hold_id
scope
reason
created_by
created_at
expires_at
status
released_by
released_at
```

---

# 33. Deletion Policy

Deletion should be classified as:

```text
HARD_DELETE
SOFT_DELETE
ANONYMIZE
ARCHIVE
RESTRICT_ACCESS
```

Use the least destructive method compatible with the business/legal requirement.

---

# 34. User Account Deletion

A user/account deletion request should not automatically delete every related business record.

Example:

```text
Account
  |
  +--> profile data -> eligible for deletion/anonymization
  +--> sessions -> revoke/delete
  +--> preferences -> delete/anonymize
  +--> orders -> retain where required
  +--> invoices -> retain where required
  +--> financial records -> retain where required
  +--> audit records -> retain according to policy
```

The account workflow should produce a deletion/anonymization report.

---

# 35. Supplier Deactivation

Supplier deactivation is not equivalent to immediate deletion.

Recommended:

```text
ACTIVE
  |
SUSPENDED / DEACTIVATED
  |
RETENTION PERIOD
  |
ARCHIVE / ANONYMIZE / DELETE
```

Historical orders, settlements, compliance evidence and audit records may need to remain retained.

---

# 36. Product and Catalog Data

Canonical product records may have long-lived business value.

Do not delete a product merely because it is no longer actively sold.

Use states such as:

```text
ACTIVE
INACTIVE
ARCHIVED
RETIRED
```

Historical order snapshots must remain interpretable.

---

# 37. Inventory and Batch Data

Batch records may be needed for:

- traceability
- expiry management
- recall handling
- dispute resolution
- compliance
- historical order analysis

Expired stock should not automatically be deleted if traceability or regulatory requirements require retention.

---

# 38. Recall and Safety Data

Recall records require strong retention and auditability.

Keep appropriate evidence of:

```text
affected product
batch
supplier
affected orders
decision
actions taken
notifications
quarantine/block status
resolution
```

Recall history must not disappear because a product is later archived.

---

# 39. Object Storage Lifecycle

Private documents and images should use lifecycle policies.

Example:

```text
ACTIVE
  |
ARCHIVE
  |
RETENTION EXPIRY
  |
DELETE
```

Lifecycle automation should be driven by object metadata and approved policy.

Sensitive documents should remain in private storage throughout the lifecycle.

---

# 40. Temporary Files

Temporary files should have short TTLs.

Examples:

- generated report intermediates
- import staging files
- temporary image processing files
- upload fragments
- temporary exports

Temporary data should be automatically cleaned.

---

# 41. Cache Data

Redis/cache data should generally be treated as reconstructable.

Examples:

```text
catalog cache
search cache
dashboard cache
rate-limit counters
temporary sessions
```

Cache expiry should not be used as the only deletion mechanism for authoritative data.

---

# 42. Logs

Logs must have a separate retention policy from transactional data.

Logs should:

- minimize PII
- redact secrets
- avoid full request bodies by default
- avoid payment credentials
- avoid authentication tokens
- use request/correlation IDs
- support security investigation where required

Log retention must balance operational troubleshooting with privacy.

---

# 43. Authentication and Security Data

Security-sensitive records may include:

```text
login events
failed authentication
MFA events
session activity
password reset activity
security alerts
privileged actions
```

These require controlled retention and access.

Never log:

```text
password
OTP
access token
refresh token
private key
payment secret
```

---

# 44. Device and Push Data

Device records may include:

```text
device_id
user_id
push token/reference
platform
app version
created_at
last_seen_at
```

Inactive device registrations should be cleaned according to a defined operational policy.

Push tokens must not be exposed to unrelated users.

---

# 45. Data Export Lifecycle

Exports are copies of source data and therefore require their own lifecycle.

Recommended:

```text
REQUEST
  |
GENERATE
  |
STORE PRIVATELY
  |
SHORT-LIVED ACCESS
  |
EXPIRE
  |
DELETE
```

Every sensitive export should record:

```text
requester
dataset
filters
timestamp
file
expiration
```

Large exports should be asynchronous, consistent with Bezzo analytics/backoffice requirements.

---

# 46. Backup Data

Backups are part of the data lifecycle.

Backups SHALL:

- be encrypted
- have controlled access
- have defined retention
- be monitored
- be tested through restoration
- respect legal/security requirements

Deletion from primary storage may not immediately remove data from immutable backup copies.

The deletion policy must therefore define backup expiry behavior.

---

# 47. Backup Deletion Semantics

When primary data is deleted:

```text
Primary database -> delete/anonymize
Active cache -> expire
Object storage -> lifecycle delete
Analytics -> delete/anonymize according to policy
Backups -> expire through backup retention
```

Do not claim immediate global deletion if backup copies remain within their approved retention window.

---

# 48. Data Subject / User Requests

Where applicable, Bezzo should provide controlled workflows for requests involving:

- access
- correction
- deletion
- consent withdrawal
- communication preferences
- information about processing
- other legally applicable rights

Requests should be verified before releasing or changing personal data.

---

# 49. Request Verification

Sensitive privacy requests SHALL require identity verification appropriate to the risk.

Do not disclose private information merely because someone knows a phone number, email address or order ID.

Requests must be logged.

---

# 50. Privacy Request Workflow

Recommended:

```text
REQUEST
   |
VERIFY IDENTITY
   |
CLASSIFY REQUEST
   |
CHECK LEGAL/RETENTION HOLDS
   |
COLLECT AFFECTED DATA
   |
REVIEW EXCEPTIONS
   |
APPROVE / REJECT / PARTIAL
   |
EXECUTE
   |
VERIFY
   |
RECORD RESULT
```

---

# 51. Deletion Exceptions

Deletion may be restricted or delayed when data must be retained for:

- legal obligations
- regulatory obligations
- financial/accounting records
- active disputes
- fraud/security investigations
- legal holds
- product safety/recall traceability
- contractual obligations where applicable

The specific exception must be documented.

---

# 52. Data Correction

Correction should update mutable source records.

For historical immutable records:

```text
do not rewrite historical transaction
```

Instead:

```text
correction record
+
current profile
+
audit trail
```

This preserves historical integrity.

---

# 53. Data Lineage

Sensitive and important datasets should have documented lineage:

```text
source
  |
processing
  |
storage
  |
projection
  |
consumer
```

Example:

```text
Order DB
   |
order.confirmed
   |
analytics pipeline
   |
analytics fact
   |
admin dashboard
```

This makes deletion, correction and incident analysis more manageable.

---

# 54. Data Inventory

Bezzo should maintain a data inventory/catalog containing:

```text
dataset
table/object
field/category
owner
classification
purpose
source
consumers
retention policy
legal/compliance reference
deletion method
```

This should become the basis for privacy and compliance operations.

---

# 55. Database Schema Metadata

Sensitive fields should be marked in schema/code metadata.

Example:

```text
users.phone        -> RESTRICTED
users.email        -> RESTRICTED
supplier.bank_ref  -> HIGHLY_RESTRICTED
audit_logs.payload -> RESTRICTED
products.name      -> PUBLIC
```

Tooling should help detect accidental exposure.

---

# 56. API Data Minimization

APIs SHALL return only required fields.

For example:

```text
GET /supplier/profile
```

must not return:

- internal security data
- private verification notes
- bank credentials
- administrative comments

unless explicitly authorized.

---

# 57. Search Index Privacy

Search indexes must respect source permissions.

Private supplier/buyer information SHALL NOT be indexed into public search.

When records are deleted or access is revoked:

```text
source update
   |
   v
index update/delete
```

must occur within the defined consistency window.

---

# 58. Analytics Deletion Propagation

When personal data must be removed/anonymized, affected analytical datasets should be included in the data lifecycle process.

Possible approaches:

```text
delete
anonymize
aggregate
rebuild projection
```

The selected method depends on whether the analytical record still qualifies as personal data and the applicable retention obligations.

---

# 59. Event Deletion / Retention

Events may be retained for operational replay, analytics or audit.

However:

- sensitive payloads should be minimized
- event retention must be defined
- personal-data events require lifecycle treatment
- replay must not recreate deleted personal data improperly

Where necessary, publish identifiers and retrieve current authorized data rather than embedding sensitive records.

---

# 60. Data Breach / Exposure Readiness

The data lifecycle system should support incident investigation by preserving:

- relevant audit records
- access logs
- request IDs
- timestamps
- affected resource identifiers
- security events
- administrative actions

Incident handling must follow the security/compliance incident process.

Do not modify evidence merely to make a dataset appear clean.

---

# 61. Third-Party Data Sharing

External sharing should be controlled through approved integrations.

Before sharing data, verify:

- purpose
- fields
- recipient
- security
- contract/terms
- retention by recipient where known
- authorization/legal basis as applicable
- audit requirements

Provider adapters should send only the minimum necessary information.

---

# 62. Logistics Data Sharing

For delivery providers, send only information needed to execute delivery.

Typical categories:

```text
pickup location
drop location
contact information required for delivery
delivery reference
package/handling information required by provider
```

Do not send unrelated buyer profile, payment, licence or account information.

---

# 63. Payment Provider Data Sharing

Payment integrations should use provider-approved references and tokenization mechanisms where applicable.

Bezzo should avoid storing sensitive payment credentials unnecessarily.

The payment specification defines the gateway abstraction; this document defines the privacy/lifecycle controls around the data exchanged.

---

# 64. Notification Provider Data Sharing

Notification providers receive only the data required to deliver the message.

Example:

```text
phone/email/device token
template parameters required for delivery
```

Avoid placing unnecessary medical/product or order details into provider payloads.

---

# 65. Access Revocation

When a user, supplier employee or administrator loses access:

```text
revoke sessions
revoke tokens where applicable
remove role/permission
invalidate cached authorization
remove device access where appropriate
record audit event
```

Deactivation should not depend on natural session expiry alone.

---

# 66. Tenant Data Isolation

Supplier and buyer data must be isolated.

Examples:

```text
Supplier A
  X Supplier B data

Buyer A
  X Buyer B orders

Supplier
  X unrelated buyer private data

Buyer
  X supplier internal financial/compliance data
```

Isolation is a security requirement, not merely a UI behavior.

---

# 67. Data Lifecycle Automation

Recommended jobs:

```text
retention_scan
expired_session_cleanup
temporary_file_cleanup
export_expiry_cleanup
inactive_device_cleanup
audit_archive
analytics_retention
object_storage_lifecycle
backup_expiry
legal_hold_check
```

Jobs must be:

- idempotent
- monitored
- auditable
- resumable

---

# 68. Deletion Job Model

Recommended:

```text
deletion_jobs
```

Fields:

```text
job_id
subject_type
subject_id
request_id
policy_version
status
items_found
items_processed
items_failed
started_at
completed_at
failure_reason
```

Deletion should produce evidence that the workflow was executed.

---

# 69. Deletion Verification

After deletion/anonymization, verify:

```text
primary database
cache
object storage
search index
analytics projection
temporary storage
```

Backups are verified through their separate lifecycle policy rather than immediate physical inspection.

---

# 70. Deletion Safety

Never allow an automated deletion job to bypass:

- legal hold
- financial retention
- regulatory retention
- recall traceability
- active investigation
- audit requirements

Use explicit policy evaluation before destructive action.

---

# 71. Soft Delete

Soft delete is useful where records may need operational restoration.

Example:

```text
deleted_at
deleted_by
deletion_reason
```

However, soft deletion alone is not a privacy deletion strategy.

If data must actually be removed, the lifecycle process must perform the required anonymization/hard deletion.

---

# 72. Archival

Archival may move infrequently accessed data to lower-cost storage.

Example:

```text
Active DB
   |
Archive job
   |
Archive storage
   |
Retention expiry
   |
Deletion
```

Archived data must retain appropriate security controls.

---

# 73. Privacy-Safe Analytics

Prefer:

```text
daily order count
supplier-level performance
category-level sales
aggregated geography
```

over:

```text
individual buyer phone list
full address exports
unnecessary personal profiles
```

unless the business role explicitly requires them.

---

# 74. Data Quality and Privacy

Incorrect data can create privacy/security problems.

Examples:

- wrong buyer linked to an order
- supplier data visible to another supplier
- stale authorization cache
- deleted user still present in search
- expired document still publicly accessible

Data-quality checks should therefore include privacy/authorization checks.

---

# 75. Privacy Testing

Required tests include:

### Access

- Cross-buyer access
- Cross-supplier access
- Unauthorized admin access
- IDOR
- Search leakage

### Deletion

- Account deletion
- Cache invalidation
- Search removal
- Object removal
- Analytics treatment
- Backup policy behavior

### Security

- Token leakage
- Sensitive log leakage
- Export leakage
- Document URL exposure
- Notification payload leakage

---

# 76. Retention Testing

Test:

```text
record reaches retention expiry
        |
        v
retention policy evaluated
        |
        +--> legal hold -> retain
        |
        +--> required retention -> retain
        |
        +--> eligible -> archive/delete/anonymize
```

Do not test deletion only at database level.

Test all downstream copies.

---

# 77. Incident Testing

Test the ability to answer:

```text
What data exists?
Where is it stored?
Who accessed it?
Who changed it?
Which systems received it?
What retention policy applies?
Can it be deleted/anonymized?
Are backups involved?
```

This is a key operational objective of the data inventory.

---

# 78. Implementation Sequence

## Phase 1 — Data Governance Foundation

1. Data classification
2. Data inventory
3. Ownership registry
4. Purpose registry
5. Retention policy model
6. Sensitive-field metadata

## Phase 2 — Access and Protection

7. RBAC review
8. Tenant isolation review
9. Restricted object storage
10. Audit access logging
11. Log redaction
12. Export controls

## Phase 3 — Lifecycle Automation

13. Retention jobs
14. Temporary-file cleanup
15. Export expiry
16. Device/session cleanup
17. Archive workflows
18. Deletion/anonymization workflows

## Phase 4 — Advanced Privacy Operations

19. Privacy request workflow
20. Legal holds
21. Deletion verification
22. Analytics propagation
23. Data lineage
24. Compliance reporting

---

# 79. Required Core Tables

Recommended:

```text
data_classifications
data_assets
data_processing_purposes
retention_policies
consent_records
privacy_requests
legal_holds
deletion_jobs
deletion_job_items
data_access_audit
data_export_jobs
data_export_access
```

Existing domain tables remain authoritative for their business data.

---

# 80. Acceptance Criteria

This specification is considered implemented when:

- Major data classes are inventoried.
- Data owners are documented.
- Sensitive fields are classified.
- Processing purposes are documented.
- Retention policies are configurable.
- Legal holds can prevent deletion.
- Account deletion has controlled behavior.
- Transactional records are not accidentally deleted.
- Restricted documents are private.
- Sensitive API responses are minimized.
- Analytics datasets minimize personal data.
- Search indexes respect deletion/access changes.
- Exports are audited and expire.
- Logs redact sensitive information.
- Backups have defined lifecycle policies.
- Deletion/anonymization jobs are idempotent.
- Deletion can be verified.
- Cross-tenant data access is tested.
- Privacy workflows are audited.
- Production retention periods receive legal/compliance approval.

---

# 81. Definition of Done

For every new data field or dataset:

- [ ] Owner identified.
- [ ] Purpose identified.
- [ ] Classification assigned.
- [ ] Access roles defined.
- [ ] Retention category assigned.
- [ ] Deletion/anonymization method defined.
- [ ] Backup implications reviewed.
- [ ] Analytics implications reviewed.
- [ ] Search/index implications reviewed.
- [ ] Logging implications reviewed.
- [ ] External-sharing requirements reviewed.
- [ ] Security tests added.
- [ ] Privacy tests added.
- [ ] Documentation updated.

---

# 82. Final Architecture Position

Bezzo should treat data as a managed lifecycle rather than permanent database content.

The core model is:

```text
PURPOSE
   |
   v
COLLECT MINIMALLY
   |
   v
CLASSIFY
   |
   v
STORE SECURELY
   |
   v
USE WITH AUTHORIZATION
   |
   v
AUDIT IMPORTANT ACCESS
   |
   v
ARCHIVE / ANONYMIZE / DELETE
   |
   v
VERIFY
```

The most important architectural rule is:

```text
BUSINESS DATA HAS AN OWNER
+
EVERY SENSITIVE DATASET HAS A PURPOSE
+
EVERY DATASET HAS A RETENTION POLICY
+
EVERY PRIVILEGED ACCESS IS CONTROLLED
+
DELETION MUST ACCOUNT FOR COPIES
```

Bezzo should not hard-code legal retention assumptions into application code. Retention values, privacy rights and pharmaceutical recordkeeping requirements must be configurable and approved for the actual operating jurisdictions.

This specification integrates with the existing Bezzo security/compliance, admin/backoffice, analytics, API, event, database, catalog, payment and support architecture.

# Bezzo Audit Logging, Data Governance & Compliance Records Specification v1.0

## 1. Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Audit Logging, Data Governance & Compliance Records Specification |
| Version | 1.0 |
| Status | Draft for implementation |
| Platforms | Web, Android, iOS, Admin |
| Primary Actors | Buyers, suppliers, admins, support, finance, risk, engineering |
| Related Domains | Identity, Orders, Payments, Inventory, Pricing, Settlements, Risk, Support, Catalog, Logistics |

---

## 2. Purpose

This specification defines how Bezzo records, protects, searches, retains, exports, and governs operational audit information and compliance-related records.

The objective is to make important platform activity:

- traceable
- attributable
- tamper-resistant
- searchable by authorized personnel
- privacy-conscious
- retention-controlled
- reproducible for operational and financial investigation

Audit logging is not the same as application debugging logs.

Application logs explain how software behaved.

Audit records explain **who performed or caused an important business/security action, what changed, when it happened, why it happened where available, and which entity was affected**.

---

# 3. Core Principles

1. Important business and security actions must be auditable.
2. Audit records are append-only.
3. Historical audit records must not be silently modified or deleted.
4. Every important action should identify actor, source, time, action, and target.
5. Service-to-service actions must identify the originating service.
6. Administrative actions require stronger audit detail.
7. Financial and settlement changes require complete traceability.
8. Supplier data must remain tenant-isolated.
9. Audit data must be access-controlled.
10. Sensitive data should not be copied into audit records unnecessarily.
11. Retention must be explicitly defined by record type.
12. Legal/compliance retention requirements take precedence where applicable.
13. Audit exports must themselves be audited.
14. Audit infrastructure must remain useful during security incidents.
15. Audit logging must not become a performance bottleneck for transactional workflows.
16. Where an exact legal retention period is not established, the policy should be configurable and approved before production.

---

# 4. Audit Record Categories

Bezzo should maintain separate categories.

## 4.1 Identity and Access

Examples:

- account creation
- login
- failed login
- logout
- password reset
- OTP verification
- MFA changes
- session revocation
- role assignment
- permission changes
- account suspension
- account restoration

## 4.2 Business Operations

Examples:

- product creation
- supplier offer changes
- inventory adjustment
- order status change
- fulfillment change
- return decision
- dispute resolution
- logistics status override

## 4.3 Financial

Examples:

- payment state change
- refund
- commission change
- settlement calculation
- financial adjustment
- payout creation
- payout approval
- payout retry
- payout completion
- reconciliation adjustment

## 4.4 Security and Risk

Examples:

- risk decision
- account hold
- payout hold
- suspicious activity case
- administrative security action
- security configuration change

## 4.5 Compliance

Examples:

- supplier verification decision
- licence/document review
- document approval/rejection
- compliance hold
- recall/block action
- regulated-product restriction

## 4.6 Administrative Configuration

Examples:

- promotion activation
- commission rule change
- pricing rule change
- system configuration change
- role/permission configuration
- feature flag change

---

# 5. Audit Event Structure

Recommended audit record:

```text
audit_id
event_type
action
actor_type
actor_id
actor_role
source_type
source_id
service_name
tenant_type
tenant_id
target_type
target_id
request_id
correlation_id
session_id
ip_reference
user_agent_reference
before_state
after_state
change_set
reason
result
created_at
schema_version
```

Not every field is required for every event.

---

# 6. Actor Types

Supported actor types:

- BUYER
- SUPPLIER_USER
- SUPPLIER_ADMIN
- WAREHOUSE_USER
- SUPPORT_AGENT
- FINANCE_USER
- RISK_USER
- PLATFORM_ADMIN
- SERVICE
- SYSTEM_JOB
- EXTERNAL_PROVIDER

Automated actions must not be recorded as if a human performed them.

---

# 7. Source Types

Possible sources:

- WEB
- ANDROID
- IOS
- ADMIN_PORTAL
- API
- INTERNAL_SERVICE
- SCHEDULED_JOB
- WEBHOOK
- IMPORT
- EXTERNAL_PROVIDER

This allows investigations to distinguish user actions from automated processing.

---

# 8. Target Types

Examples:

```text
USER
SUPPLIER
PRODUCT
SKU
OFFER
INVENTORY
BATCH
ORDER
ORDER_ITEM
FULFILLMENT
PAYMENT
REFUND
PROMOTION
COUPON
SETTLEMENT
PAYOUT
DISPUTE
RETURN
RISK_CASE
DOCUMENT
CONFIGURATION
```

---

# 9. Before and After State

For high-value mutations, audit records should capture the relevant before/after state or a structured change set.

Example:

```json
{
  "changeSet": [
    {
      "field": "sellingPrice",
      "before": "100.00",
      "after": "105.00"
    }
  ]
}
```

Do not store complete objects when a small change set is sufficient.

Sensitive fields such as passwords, authentication secrets, payment credentials, and raw tokens must never be written into audit records.

---

# 10. Audit Event Examples

## Supplier Price Change

```text
actor: supplier_user
action: PRICE_UPDATED
target: supplier_offer
before: ₹100
after: ₹105
reason: supplier_update
```

## Inventory Adjustment

```text
actor: inventory_manager
action: STOCK_ADJUSTED
target: inventory_balance
quantity_delta: -10
reason: physical_count
warehouse: WH-01
```

## Payout Approval

```text
actor: finance_user
action: PAYOUT_APPROVED
target: payout
amount: configured amount
destination: protected reference
```

## Administrative Configuration

```text
actor: platform_admin
action: COMMISSION_RULE_UPDATED
target: commission_rule
before_version: 4
after_version: 5
reason: commercial_configuration
```

---

# 11. Audit vs Application Logs

Application logs:

```text
debug
info
warn
error
```

Audit events:

```text
USER_ROLE_CHANGED
ORDER_CANCELLED
REFUND_APPROVED
PAYOUT_APPROVED
INVENTORY_ADJUSTED
SUPPLIER_VERIFIED
PROMOTION_ACTIVATED
```

The two systems should remain logically separate even if they share an observability platform.

---

# 12. Audit Write Architecture

Recommended:

```text
Business Transaction
       ↓
Transactional Audit/Outbox Record
       ↓
Commit
       ↓
Audit Processing
       ↓
Immutable Audit Store
       ↓
Search / Admin Investigation
```

For critical state changes, the audit/outbox record should be written in the same database transaction as the business mutation.

This prevents:

```text
Business change succeeds
but
Audit record is lost
```

---

# 13. Transactional Outbox

For critical events:

```text
BEGIN
→ update business state
→ create audit/outbox record
COMMIT

Worker
→ publish/store audit event
→ mark processed
```

If publishing fails, retry without changing the original business state.

---

# 14. Immutability

Audit records should be append-only.

If an audit record contains an error:

```text
Incorrect record
→ create correction event
```

Do not silently edit the original historical event.

Corrections must preserve:

- original event reference
- correction actor
- correction reason
- correction timestamp

---

# 15. Tamper Resistance

Recommended controls:

- append-only storage
- restricted database permissions
- separate audit writer role
- restricted deletion privileges
- immutable object storage for long-term archives where appropriate
- integrity checks/hashes where justified
- centralized access auditing
- privileged access monitoring

Audit administrators should not have unrestricted ability to rewrite history.

---

# 16. Audit Access Control

Recommended roles:

### Audit Viewer

Read approved audit records.

### Compliance Analyst

Read compliance-related records and generate authorized reports.

### Risk Analyst

Read risk/security-related records.

### Finance Analyst

Read financial audit records.

### Platform Administrator

Broader operational audit access.

### Security Administrator

Security investigation access.

Access should follow least privilege.

---

# 17. Supplier Audit Isolation

Supplier users can access only their own authorized audit records.

Example:

```text
Supplier A
→ own inventory changes
→ own order/fulfillment activity
→ own pricing changes
→ own settlement events
```

Supplier A must not access:

```text
Supplier B
→ prices
→ inventory
→ financial data
→ internal risk records
```

---

# 18. Buyer Audit Visibility

Buyers should not receive raw internal audit logs.

Instead, customer-facing activity may expose safe status history:

```text
Order placed
Payment confirmed
Order packed
Order dispatched
Order delivered
Refund processed
```

Internal security/risk information remains restricted.

---

# 19. Compliance Records

Compliance records may include:

- supplier verification documents
- business identity records
- licence references
- verification decisions
- document review history
- expiry/review dates
- compliance holds
- recalls
- regulated-product restrictions

Exact regulatory requirements and retention periods must be validated for the jurisdictions and product categories in which Bezzo operates.

---

# 20. Document Metadata

Compliance document metadata should include:

```text
document_id
owner_type
owner_id
document_type
document_reference
storage_reference
status
issued_at
expires_at
verified_at
verified_by
rejection_reason
created_at
updated_at
```

Raw document content should be stored in protected object storage, not directly inside audit rows unless specifically required.

---

# 21. Document Lifecycle

Recommended:

```text
UPLOADED
→ VALIDATING
→ UNDER_REVIEW
→ VERIFIED
```

Alternative:

```text
REJECTED
EXPIRED
REVOKED
SUPERSEDED
```

Every significant transition must be auditable.

---

# 22. Compliance Review

A reviewer should be able to:

- view authorized document metadata
- inspect the document
- approve
- reject
- request replacement
- place a compliance hold
- record reason
- set review/expiry date where applicable

The system must record reviewer identity and timestamp.

---

# 23. Supplier Verification Audit

Example:

```text
Supplier registered
→ documents submitted
→ review started
→ document approved/rejected
→ supplier verified/rejected
→ status changed
```

Each transition should have:

- actor
- timestamp
- reason
- source
- affected supplier
- previous status
- new status

---

# 24. Regulatory Record Strategy

Bezzo should maintain a compliance matrix outside the application code.

The matrix should map:

```text
Jurisdiction
→ Product category
→ Business role
→ Required record
→ Required validation
→ Retention rule
→ Access restriction
→ Responsible owner
```

This prevents regulatory requirements from being scattered across unrelated services.

---

# 25. Data Classification

Recommended classifications:

### Public

Marketplace information intended for public display.

### Internal

Operational information not intended for public access.

### Confidential

Commercial, supplier, buyer, financial, or operational information requiring restricted access.

### Restricted

Highly sensitive information requiring specialized access controls.

Examples:

- authentication secrets
- sensitive financial credentials
- certain identity records
- security/risk investigation data

Classification should be attached to data domains and, where necessary, individual fields.

---

# 26. Personally Identifiable Information

Bezzo should identify PII such as:

- name
- phone
- email
- address
- identity/business information
- account identifiers
- delivery information

Audit records should reference entities rather than duplicate PII where possible.

Example:

```text
actor_id = usr_123
```

instead of copying the user's complete profile into every event.

---

# 27. Data Minimization

Do not log:

- passwords
- OTP values
- access tokens
- refresh tokens
- payment card secrets
- bank credentials
- API secrets
- unnecessary identity documents
- unnecessary medical/product-sensitive information

Use references, masked values, hashes, or provider IDs where appropriate.

---

# 28. Encryption

Audit and compliance records should be protected:

- TLS in transit
- encryption at rest
- protected object storage
- managed key/secrets infrastructure
- restricted key access

Especially sensitive document fields may require application-level encryption or equivalent additional controls.

---

# 29. Retention Policy

Retention must be defined by record category.

Example policy structure:

```text
Record Type
Retention Period
Legal Basis
Business Owner
Deletion/Archive Method
Access Level
```

The actual duration must be approved according to applicable legal, accounting, security, contractual, and operational requirements.

Do not use one global retention period for every record.

---

# 30. Legal Hold

Bezzo should support legal/investigative holds.

A legal hold can prevent normal deletion/expiry of selected records.

Fields:

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

A held record must remain protected until the hold is formally released.

---

# 31. Deletion and Anonymization

Where applicable, personal data may be subject to deletion or anonymization processes.

However:

- legally required records may need retention
- financial records may have mandatory retention
- audit integrity must be preserved
- legal holds override normal deletion

The system should separate:

```text
business record retention
from
personal-data minimization
from
immutable audit history
```

Any anonymization process must itself be audited.

---

# 32. Export

Authorized users may export audit/compliance data.

Exports should support:

- date range
- event type
- actor
- target
- supplier
- order
- compliance category

Export workflow:

```text
Request
→ authorization check
→ query
→ generate file
→ secure temporary storage
→ access/download
→ audit export event
```

Large exports should run asynchronously.

---

# 33. Audit Search

Admin search should support:

- audit ID
- actor
- target
- event type
- supplier
- order
- date range
- source
- result
- correlation ID

Search indexes should not become an authorization bypass.

Every search result must be filtered through access-control rules.

---

# 34. Correlation and Traceability

Every important request should carry:

```text
request_id
correlation_id
```

Example:

```text
Buyer checkout
→ order creation
→ inventory reservation
→ payment
→ fulfillment
→ settlement
```

The same correlation chain allows operators to reconstruct the lifecycle.

---

# 35. Cross-Domain Investigation

An authorized investigator should be able to trace:

```text
User
 ↓
Order
 ↓
Payment
 ↓
Inventory
 ↓
Fulfillment
 ↓
Delivery
 ↓
Refund
 ↓
Settlement
 ↓
Payout
```

This is a primary purpose of correlation IDs and stable entity references.

---

# 36. Audit Integrity Monitoring

Bezzo should monitor:

- audit write failures
- outbox backlog
- missing event rates
- delayed audit processing
- unauthorized audit access
- unusual audit export volume
- unexpected privileged actions
- attempts to modify/delete audit records

Critical audit pipeline failures should generate operational alerts.

---

# 37. Backup and Recovery

Audit and compliance records must be included in the backup strategy.

Requirements:

- encrypted backups
- tested restore procedures
- retention according to record classification
- disaster-recovery procedures
- restricted backup access

For critical audit records, recovery procedures should be tested periodically.

---

# 38. Database Model

Recommended tables:

```text
audit_events
audit_event_changes
audit_event_references
audit_access_logs
compliance_documents
compliance_reviews
compliance_holds
legal_holds
data_retention_policies
data_deletion_requests
data_anonymization_jobs
audit_exports
audit_outbox
```

Important indexes:

```text
created_at
actor_id + created_at
target_type + target_id + created_at
tenant_id + created_at
event_type + created_at
correlation_id
request_id
```

Partitioning by time may be considered at higher scale.

---

# 39. API Surface

## Audit

```http
GET /v1/admin/audit/events
GET /v1/admin/audit/events/{id}
POST /v1/admin/audit/exports
```

## Compliance

```http
GET /v1/admin/compliance/documents
GET /v1/admin/compliance/documents/{id}
POST /v1/admin/compliance/documents/{id}/review
POST /v1/admin/compliance/holds
POST /v1/admin/compliance/holds/{id}/release
```

## Supplier Authorized Views

```http
GET /v1/suppliers/{supplierId}/audit/activity
GET /v1/suppliers/{supplierId}/compliance/status
```

All endpoints require strict authorization and tenant filtering.

---

# 40. Events

Audit-related events may include:

```text
AuditEventCreated
ComplianceDocumentUploaded
ComplianceDocumentVerified
ComplianceDocumentRejected
ComplianceHoldCreated
ComplianceHoldReleased
LegalHoldCreated
LegalHoldReleased
AuditExportCreated
AuditExportAccessed
RetentionJobExecuted
DataAnonymizationCompleted
```

These events must themselves follow audit/security controls.

---

# 41. Security

Requirements:

- least privilege
- strong authentication
- RBAC
- service authentication
- encryption
- secure object storage
- restricted export permissions
- audit access logging
- immutable/archive protections
- secret management
- privileged-action monitoring

Access to audit records must never allow a user to bypass the authorization rules of the underlying entity.

---

# 42. Observability

Metrics:

### Audit Pipeline

- audit events/sec
- audit write latency
- failed audit writes
- outbox backlog
- processing delay

### Compliance

- documents awaiting review
- expired compliance records
- rejected documents
- active compliance holds

### Access

- audit searches
- audit exports
- privileged access
- denied audit requests

### Data Governance

- retention jobs
- anonymization jobs
- legal holds
- failed deletion jobs

---

# 43. Alerts

Critical alerts:

- audit pipeline unavailable
- large audit backlog
- audit write failures above threshold
- unauthorized audit access attempts
- unexpected privileged changes
- abnormal audit exports
- compliance document expiry backlog
- retention job failure
- backup failure
- legal-hold processing failure

---

# 44. Testing

## Unit Tests

- audit event schema
- field masking
- actor identification
- authorization
- retention policy selection
- anonymization rules
- legal hold behavior

## Integration Tests

- business mutation + audit transaction
- outbox processing
- compliance document workflow
- export generation
- access controls
- retention jobs

## Security Tests

- cross-supplier audit access
- unauthorized export
- privileged-role escalation
- direct audit modification attempts
- sensitive-field leakage
- object-storage access control

## Recovery Tests

- audit database restore
- outbox recovery
- failed retention job retry
- compliance document recovery

---

# 45. Acceptance Criteria

The module is production-ready when:

1. Critical business/security actions generate audit records.
2. Audit records identify actor and target.
3. Service and automated actions are distinguishable from human actions.
4. Critical audit writes use transactional/outbox protection.
5. Historical audit records are append-only.
6. Sensitive credentials are never logged.
7. Supplier audit data is tenant-isolated.
8. Compliance documents have lifecycle tracking.
9. Compliance review actions are auditable.
10. Retention policies are configurable by record category.
11. Legal holds are supported.
12. Authorized audit export is supported and audited.
13. Audit searches enforce authorization.
14. Financial actions can be traced end-to-end.
15. Audit pipeline failures are monitored.
16. Backup and recovery procedures are tested.
17. Data minimization and privacy controls are implemented.
18. Security tests pass.
19. Retention/anonymization jobs are auditable.
20. Production runbooks exist.

---

# 46. Implementation Sequence

## Phase 1 — Audit Foundation
- audit event schema
- audit writer
- transactional outbox
- basic admin search
- RBAC

## Phase 2 — Business Audit Coverage
- identity
- orders
- inventory
- pricing
- payments
- fulfillment
- returns
- settlements
- payouts

## Phase 3 — Compliance Records
- supplier documents
- verification history
- compliance holds
- expiry/review workflows

## Phase 4 — Data Governance
- classification
- retention policies
- anonymization
- legal holds
- export workflows

## Phase 5 — Security Hardening
- immutable archive
- integrity monitoring
- privileged-access monitoring
- advanced alerts
- recovery testing

---

# 47. Definition of Done

- Audit schema and migrations exist.
- Critical business actions produce audit events.
- Audit records are append-only.
- Transactional outbox is implemented.
- Supplier isolation is enforced.
- Admin audit search is available.
- Compliance document workflows exist.
- Retention policies are configurable.
- Legal holds work.
- Authorized exports are audited.
- Sensitive data is masked/excluded.
- Backups and recovery are tested.
- Monitoring and alerts are configured.
- Security and access-control tests pass.
- Operational runbooks exist.

---

# 48. Final Architecture Position

Bezzo should treat audit and governance as a foundational platform capability:

```text
Business Action
      ↓
Transactional State Change
      ↓
Audit / Outbox Record
      ↓
Immutable Audit Store
      ↓
Search / Investigation
      ↓
Compliance / Security / Finance Operations
```

The purpose is not to log everything indiscriminately.

The purpose is to preserve enough trustworthy evidence to answer:

```text
Who?
What?
When?
From where?
Against which entity?
What changed?
Why?
Which request caused it?
Which service processed it?
What was the resulting state?
```

This capability provides the traceability foundation required for Bezzo's marketplace operations, financial controls, supplier governance, security investigations, and future regulatory/compliance workflows.

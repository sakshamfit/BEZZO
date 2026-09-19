# Bezo Security & Compliance Specification v1.0

## 1. Purpose

This document defines the security, privacy, regulatory-compliance, and operational-control requirements for Bezo.

Bezo is an India-focused B2B pharmaceutical marketplace connecting medical-store buyers with medicine wholesalers/suppliers. Because the platform handles regulated medicines, business licences, identity/business documents, payment information, addresses, and potentially sensitive personal information, security and compliance must be designed into the platform rather than added after launch.

This document is an engineering control specification, not legal advice. Pharmaceutical, tax, privacy, payments, logistics, and state-specific regulatory requirements must be reviewed by qualified Indian legal/compliance professionals before production launch.

---

# 2. Compliance Baseline

The platform should be designed with at least these regulatory areas in mind:

- Drugs and Cosmetics Act/Rules and applicable licensing requirements
- State/UT drug-control requirements
- GST and applicable invoicing/e-invoicing requirements
- Digital personal-data protection requirements
- Information-security obligations
- Payment-provider and applicable payment-network requirements
- Consumer/e-commerce requirements where applicable
- Applicable accounting and record-retention requirements
- Logistics/transport requirements applicable to the goods and delivery model

The exact obligations depend on:

- Product category
- Drug schedule/category
- Supplier licence
- Buyer eligibility
- State/UT
- Transaction structure
- Tax registration
- Delivery model
- Data processed

The system must therefore use configurable compliance rules rather than assuming one universal rule for every medicine and every Indian state.

---

# 3. Pharmaceutical Regulatory Principle

Bezo must not operate as though medicines are ordinary consumer goods.

The Drugs and Cosmetics Rules contain requirements around wholesale sale/distribution, including restrictions relating to purchasing from appropriately licensed sources and resale to persons holding the requisite licence. The official rules should therefore be treated as a core source for supplier/buyer eligibility design. citeturn0search43

Engineering consequence:

```text
User account
    ↓
Business identity
    ↓
Applicable licence/eligibility verification
    ↓
Product eligibility
    ↓
Transaction eligibility
    ↓
Fulfillment
```

Do not allow a generic “verified user” flag to substitute for product-specific or licence-specific controls where regulations require more.

---

# 4. Compliance Governance

Create a formal compliance owner.

Recommended responsibility model:

```text
Product
    → implements workflow

Engineering
    → implements controls

Security
    → validates technical controls

Operations
    → performs verification/review

Compliance/Legal
    → determines applicable rules

Management
    → approves business policy
```

Engineering must not invent legal requirements.

Legal/compliance decisions should be represented in versioned configuration and documented policy.

---

# 5. Supplier Verification

Supplier activation should require successful verification of applicable business and pharmaceutical credentials.

Potential verification categories:

```text
Business identity
GST/business details
Applicable wholesale drug licence
Premises/storage information
Qualified person/pharmacist information where applicable
Identity information
Bank/payment details
Supporting documents
```

The exact document list must be configured per jurisdiction/business model.

Supplier states:

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
REJECTED
SUSPENDED
```

Only `VERIFIED` suppliers should be eligible for normal marketplace selling, subject to product-specific controls.

---

# 6. Buyer Eligibility

Medical-store buyers should undergo business verification appropriate to the marketplace model and applicable law.

Potential information:

```text
Business name
Store address
Business registration
Applicable drug-sale licence
Tax information
Authorized contact
Supporting documents
```

Do not expose a buyer's licence/document information to unrelated suppliers.

---

# 7. Licence Expiry Management

Store structured licence metadata:

```text
licence_number
licence_type
issuing_authority
issue_date
expiry_date
jurisdiction
document_id
verification_status
verified_at
```

Create alerts before expiry.

Example:

```text
90 days → warning
60 days → warning
30 days → urgent
expired → restrict applicable operations
```

Exact timing is configurable.

The platform must distinguish:

```text
Document uploaded
Document verified
Licence currently valid
Licence expired
Licence suspended/revoked
```

A file existing in object storage does not prove that the licence is currently valid.

---

# 8. Document Security

Supplier/buyer compliance documents are private.

Use:

- Private object-storage buckets
- Short-lived signed URLs
- Encryption at rest
- Encryption in transit
- Access-control checks before generating download URLs
- Malware scanning
- File-type validation
- Size limits
- Audit logging

Never expose permanent public URLs for regulatory documents.

---

# 9. Document Access Rules

Example:

```text
Supplier
→ own documents only

Buyer
→ own documents only

Admin
→ documents necessary for assigned operational/compliance role

Support
→ only minimum information required

Other supplier
→ no access
```

Use least privilege.

---

# 10. Personal Data Protection

India's Digital Personal Data Protection Act, 2023 establishes a framework for processing digital personal data and recognizes individuals' rights concerning their personal data. The Act itself states that commencement occurs on dates notified by the Central Government. citeturn1search5

As of the current documentation update, MeitY states that the Digital Personal Data Protection Rules, 2025 were notified on 14 November 2025 and describe an 18-month phased compliance timeline. Bezo should therefore implement the controls needed for the applicable commencement/phase rather than waiting until the final deadline. citeturn1search7

The compliance implementation should be validated against the latest notified law/rules before launch.

---

# 11. Data Classification

Classify data at minimum as:

## Public

Examples:

```text
Public product information
Public categories
General marketing content
```

## Internal

Examples:

```text
Operational metrics
Non-public configuration
Internal documentation
```

## Confidential

Examples:

```text
Supplier pricing
Business analytics
Operational reports
```

## Restricted

Examples:

```text
Identity documents
Drug licences
Bank information
Authentication credentials
Payment-related tokens
Private addresses
Sensitive support information
```

Apply stronger controls as classification increases.

---

# 12. Data Minimization

Only collect data required for:

- Account creation
- Verification
- Transaction processing
- Delivery
- Tax/invoicing
- Security
- Customer support
- Legal/compliance obligations

Do not collect information simply because it might be useful later.

---

# 13. Purpose Limitation

Each major data category should have a documented purpose.

Example:

```text
Phone
→ authentication/transaction communication

Business licence
→ eligibility verification

Delivery address
→ order fulfillment

Payment token/reference
→ payment processing/reconciliation
```

Avoid repurposing data without an appropriate legal/privacy basis.

---

# 14. Privacy Notice

The application should provide a clear privacy notice covering applicable:

- Data collected
- Purposes
- Processing basis/consent where applicable
- Sharing
- Retention
- Security
- User rights
- Contact mechanism
- Grievance/complaint mechanism where required

The exact wording should be prepared/reviewed by legal counsel.

---

# 15. Consent Management

Do not use one universal checkbox for unrelated purposes.

Separate, where applicable:

```text
Essential service processing
Marketing communication
Optional personalization
Analytics
Third-party sharing
```

Store consent records where required:

```text
user_id
purpose
version
status
timestamp
source
```

---

# 16. Data Subject/User Rights

Build technical capability to support applicable data rights.

Potential workflows include:

```text
Access/request information
Correction
Deletion/erasure where applicable
Consent withdrawal where applicable
Complaint/grievance
```

Some data may need to be retained because of legal, tax, transaction, audit, or regulatory obligations.

Therefore:

```text
Delete from active application use
≠
physically destroy every historical record immediately
```

Retention exceptions must be documented.

---

# 17. Retention Policy

Create a formal retention matrix.

Example structure:

| Data | Retention policy |
|---|---|
| Account data | Based on account/lawful-purpose lifecycle |
| Orders | As required for accounting, tax, regulatory, and business needs |
| Invoices | As required by applicable tax/accounting rules |
| Compliance documents | Based on regulatory/business requirements |
| Audit logs | Risk-based/legal retention |
| Security logs | Defined security retention |
| Marketing consent | Until withdrawn + required audit period |
| Temporary files | Short-lived |

Do not use arbitrary retention periods in production without legal/compliance approval.

---

# 18. Authentication Security

Implement:

- Strong password hashing
- Password policy
- Login rate limiting
- Brute-force protection
- Session revocation
- Refresh-token rotation where appropriate
- Secure token storage
- Device/session visibility
- Password-reset expiration
- OTP rate limiting if OTP is used

Never store plaintext passwords.

---

# 19. Authorization

Use RBAC plus resource ownership.

Roles:

```text
BUYER
SUPPLIER
ADMIN
OPERATIONS
SUPPORT
```

Where necessary, introduce finer permissions:

```text
supplier.products.read
supplier.products.write
supplier.inventory.write
supplier.orders.read
admin.suppliers.verify
admin.payments.refund
admin.audit.read
```

Authorization must be checked server-side.

---

# 20. Supplier Tenant Isolation

This is a critical security requirement.

Every supplier-owned query must enforce supplier scope.

Example:

```text
supplier_id = authenticatedSupplierId
```

Never allow:

```text
GET /suppliers/products/:id
```

to return a product solely because the numeric/string ID exists.

Automated tests must attempt cross-supplier access.

---

# 21. Buyer Privacy Isolation

Buyer A must never access:

- Buyer B's orders
- Buyer B's addresses
- Buyer B's payment information
- Buyer B's private documents
- Buyer B's notifications

Resource ownership must be checked for every private resource.

---

# 22. Admin Security

Admin accounts require stronger controls.

Recommended:

- MFA
- Shorter session duration
- Device/session monitoring
- IP/risk controls where appropriate
- Strong audit logging
- Privileged-action confirmation
- Separate administrative role permissions

High-risk actions should require elevated authorization.

---

# 23. Privileged Actions

Examples:

```text
Approve supplier
Reject supplier
Suspend supplier
Refund payment
Modify compliance configuration
Change tax configuration
Change delivery pricing
Access restricted documents
```

These actions should produce immutable/auditable records.

---

# 24. API Security

Implement:

- HTTPS only
- Strict CORS
- Request validation
- Rate limiting
- Request-size limits
- Secure headers
- Authentication
- Authorization
- Error sanitization
- API versioning
- Idempotency for sensitive writes

---

# 25. Rate Limiting

Apply separate limits for:

```text
Login
OTP
Password reset
Search
Product creation
Bulk inventory
Checkout
Payment
Refund
Webhooks
File-upload authorization
Admin operations
```

Security-sensitive endpoints should have stricter controls.

---

# 26. File Upload Security

Allowed file types must be explicitly defined.

Pipeline:

```text
Upload authorization
↓
Size/type validation
↓
Object storage
↓
Malware scan
↓
Content validation
↓
Metadata persistence
↓
Availability
```

Never trust:

```text
file extension
Content-Type header
client filename
```

as proof of file safety.

---

# 27. Image Security

Product images are user-supplied content.

Protect against:

- Malicious file formats
- Decompression bombs
- Oversized images
- Embedded scripts/content
- Metadata leakage where inappropriate

Re-encode images server-side where practical.

---

# 28. Database Security

Use:

- Private network access
- TLS
- Encryption at rest
- Least-privilege DB users
- Separate migration credentials
- Connection pooling
- Automated backups
- Point-in-time recovery where supported

Production DB should not be directly exposed to the public internet.

---

# 29. Database Access

Application services should use dedicated database identities.

Avoid giving the API process unrestricted administrative DB permissions.

Separate:

```text
application user
migration user
analytics/read-only user
```

where practical.

---

# 30. Secrets Management

Never commit:

```text
API keys
JWT private keys
payment secrets
Porter credentials
database passwords
cloud credentials
```

Use managed secret storage.

Rotate secrets periodically and immediately after suspected compromise.

---

# 31. Encryption

Use encryption:

```text
Client → HTTPS/TLS → API

Application → encrypted database connection

Application → encrypted object storage

Application → encrypted Redis connection where supported
```

Sensitive fields requiring application-level encryption should be identified during threat modeling.

---

# 32. Payment Security

Bezo should minimize payment-card data exposure.

Prefer provider-hosted/tokenized payment flows.

Do not store raw card numbers or CVV.

Store:

```text
payment provider
provider payment ID
status
amount
currency
timestamps
masked/reference data where appropriate
```

Payment webhooks must have signature/authenticity verification.

---

# 33. Payment Fraud Controls

Build controls for:

- Duplicate payment attempts
- Repeated failed payments
- Abnormal order values
- Excessive refund activity
- Account takeover indicators
- Suspicious COD behavior
- Repeated delivery failures

Rules should initially be conservative and operationally reviewable.

---

# 34. COD Controls

COD should be configurable by:

```text
Buyer eligibility
Order value
Geography
Product category
Risk history
Delivery capability
```

Track:

```text
COD order
Collected
Not collected
Partially collected
Returned
Settled
Reconciled
```

---

# 35. GST/Invoicing Compliance

Bezo's invoice model must support applicable GST requirements.

For taxpayers covered by the e-invoicing mandate, official GST/IRP material describes electronic reporting of specified documents to an Invoice Registration Portal and issuance of an IRN/QR code after validation. Applicability must be determined from the current rules for the relevant supplier/entity rather than hard-coded globally. citeturn0search1turn0search46

The invoice system should therefore support:

```text
GSTIN
Supplier legal name/address
Buyer GSTIN where applicable
Taxable value
Tax rates
CGST
SGST
IGST
Cess where applicable
Invoice number
Invoice date
IRN where applicable
QR code/reference where applicable
Credit notes
Debit notes
```

Do not assume every supplier is subject to the same e-invoice obligation.

---

# 36. Invoice Architecture

Separate:

```text
Commercial order
        ↓
Fulfillment
        ↓
Supplier invoice
        ↓
Tax/e-invoice processing where applicable
```

For multi-supplier orders, do not assume that one supplier can issue the invoice for another supplier's goods.

The legal invoicing structure must be validated against Bezo's actual marketplace/intermediary business model.

---

# 37. Audit Logging

Record security/compliance-sensitive actions:

```text
LOGIN
LOGIN_FAILED
PASSWORD_RESET
MFA_CHANGED
SUPPLIER_DOCUMENT_UPLOADED
SUPPLIER_VERIFIED
SUPPLIER_REJECTED
SUPPLIER_SUSPENDED
PRODUCT_APPROVED
PRODUCT_REJECTED
INVENTORY_CHANGED
ORDER_CREATED
PAYMENT_CREATED
PAYMENT_CONFIRMED
REFUND_CREATED
ADMIN_ACCESS
RESTRICTED_DOCUMENT_VIEWED
```

Each event should contain:

```text
event_id
actor_id
actor_role
action
resource_type
resource_id
timestamp
request_id
IP/risk metadata where appropriate
metadata
```

Do not log passwords, payment secrets, or unnecessary personal information.

---

# 38. Audit Log Integrity

Audit logs should be append-only for ordinary application users.

Consider:

- Restricted DB permissions
- Separate log storage
- Centralized logging
- Integrity protection
- Retention policy
- Administrative access logging

---

# 39. Security Monitoring

Monitor:

```text
Repeated failed logins
Privilege escalation attempts
Cross-tenant access attempts
Abnormal document downloads
Unusual admin activity
Webhook failures
Payment anomalies
Large data exports
Rate-limit violations
Unexpected API error spikes
```

---

# 40. Threat Model

Major threat categories:

## Account takeover

Controls:

```text
MFA for privileged users
Rate limiting
Session management
Credential monitoring
Login anomaly detection
```

## Broken access control

Controls:

```text
RBAC
Resource ownership
Tenant isolation
Automated authorization tests
```

## Data leakage

Controls:

```text
Encryption
Private storage
Least privilege
Logging
Data minimization
```

## Payment fraud

Controls:

```text
Server-side payment verification
Idempotency
Provider webhooks
Reconciliation
Risk rules
```

## Inventory manipulation

Controls:

```text
Transactional updates
Authorization
Audit logs
Concurrency control
```

## Malicious uploads

Controls:

```text
File validation
Malware scanning
Re-encoding
Private storage
```

## API abuse

Controls:

```text
Rate limits
Authentication
Validation
WAF
Monitoring
```

---

# 41. OWASP Alignment

Use current OWASP guidance as a security engineering baseline.

At minimum test against:

- Broken access control
- Cryptographic failures
- Injection
- Insecure design
- Security misconfiguration
- Vulnerable components
- Authentication failures
- Software/data integrity failures
- Logging/monitoring failures
- SSRF

Do not treat an OWASP checklist as a substitute for Bezo-specific threat modeling.

---

# 42. Dependency Security

Use:

- Automated dependency scanning
- Lockfiles
- Renovate/Dependabot-style update automation
- SAST
- Secret scanning
- Container scanning
- SBOM generation where appropriate

Critical vulnerabilities should trigger an engineering review.

---

# 43. Supply-Chain Security

Protect the software supply chain:

```text
Developer
→ Git
→ CI
→ Dependency installation
→ Build
→ Container
→ Registry
→ Deployment
```

Use:

- Protected branches
- Signed/reviewed commits where appropriate
- Restricted CI secrets
- Immutable production artifacts
- Container image scanning
- Least-privilege CI identities

---

# 44. CI/CD Security

CI must not expose production credentials unnecessarily.

Separate:

```text
PR credentials
Staging credentials
Production deployment credentials
```

Production deployment should require appropriate authorization.

---

# 45. Infrastructure Security

Use:

```text
CDN
WAF
Load balancer
Private application network
Private database network
Restricted security groups/firewall rules
```

Only required ports should be open.

Example:

```text
Internet → CDN/WAF → LB
LB → Web/API
API → DB/Redis/Search
```

Database should not accept arbitrary internet traffic.

---

# 46. Network Segmentation

Separate:

```text
Public edge
Application
Data
Management
```

Administrative infrastructure should not be reachable from the public internet unless explicitly required and protected.

---

# 47. Backups

Back up:

- PostgreSQL
- Critical configuration
- Audit data
- Required object-storage data

Test restoration regularly.

Define:

```text
RPO
RTO
```

before production.

---

# 48. Disaster Recovery

Initial strategy:

```text
Automated DB backups
+
Point-in-time recovery
+
Object-storage durability/versioning
+
Infrastructure as Code
+
Documented restore procedure
```

A restore test should verify:

```text
Database recovery
Application startup
Object access
Critical order records
Audit data
```

---

# 49. Incident Response

Create an incident process:

```text
Detect
↓
Classify
↓
Contain
↓
Investigate
↓
Eradicate
↓
Recover
↓
Notify where required
↓
Post-incident review
```

Severity examples:

```text
SEV-1 Critical
SEV-2 High
SEV-3 Medium
SEV-4 Low
```

---

# 50. Security Incident Examples

SEV-1 candidates:

- Production database exposure
- Major credential compromise
- Cross-user data leakage
- Payment compromise
- Large-scale unauthorized access
- Malicious production code deployment

Immediate containment should prioritize limiting additional harm.

---

# 51. Privacy Incident Response

If personal data is exposed:

```text
Detect
→ isolate
→ preserve evidence
→ determine affected data
→ determine affected individuals
→ assess legal/regulatory obligations
→ notify relevant parties where required
→ remediate
→ document
```

The exact notification process must be based on the applicable law/rules at the time of the incident.

---

# 52. Compliance Configuration

Do not hard-code all compliance logic in controllers.

Use a policy/configuration layer.

Example:

```text
jurisdiction
product category
drug schedule/category
supplier licence
buyer eligibility
delivery region
payment method
```

Output:

```text
allowed
blocked
verification_required
manual_review
```

---

# 53. Product Compliance Metadata

Catalog should support structured fields for applicable regulatory classification.

Potential fields:

```text
prescription_status
controlled_category
storage_requirement
cold_chain_required
special_handling
eligibility_requirement
regulatory_notes
```

Exact classifications must come from validated regulatory/product data.

---

# 54. Cold Chain / Special Handling

If Bezo supports products requiring controlled temperature or special handling:

The system must validate:

```text
Supplier capability
Storage capability
Packaging capability
Delivery capability
Destination eligibility
Delivery time
```

Do not allow ordinary Porter delivery to be assumed suitable for every product.

---

# 55. Expiry and Batch Controls

For applicable medicines, inventory architecture should be capable of supporting:

```text
batch_number
manufacture_date
expiry_date
quantity
MRP
purchase_cost
supplier
```

Implement FEFO-style inventory logic where legally/operationally appropriate:

```text
First Expiry → First Out
```

Expired inventory must never be offered for sale.

---

# 56. Recall Capability

Bezo should eventually support product/batch recall workflows.

Example:

```text
Recall initiated
↓
Identify affected batches
↓
Identify suppliers
↓
Identify affected orders
↓
Restrict further sale
↓
Notify operational stakeholders
↓
Track resolution
```

This should be designed into the data model even if the complete workflow is implemented later.

---

# 57. Returns and Reverse Logistics

Pharmaceutical returns are not equivalent to ordinary e-commerce returns.

Return eligibility must be governed by:

- Product category
- Packaging state
- Storage conditions
- Applicable law
- Supplier policy
- Recall status
- Delivery condition

Do not implement a generic “7-day return” model for medicines without regulatory/legal validation.

---

# 58. Promotions and Marketing

Any medicine-related promotional feature should undergo compliance review.

Do not build generic consumer-style promotional mechanics assuming that all medicines can be marketed identically.

Potential controls:

```text
Product eligibility
Promotion eligibility
Jurisdiction
Audience
Supplier
Campaign dates
Approval status
```

---

# 59. Data Sharing with Suppliers

Suppliers should receive only information necessary to fulfill their assigned order.

For example:

```text
Required:
Delivery location
Order items
Quantity
Operational contact details where necessary

Not automatically required:
Unrelated buyer history
Other suppliers' information
Internal fraud scores
Private account metadata
```

Apply data minimization.

---

# 60. Data Sharing with Logistics Providers

Only send information required for delivery.

Potential fields:

```text
Pickup location
Drop location
Order reference
Package details
Contact information necessary for delivery
Delivery instructions
```

Avoid sending unrelated customer profile data.

---

# 61. Third-Party Risk

Maintain a third-party inventory:

```text
Payment provider
Porter/logistics provider
SMS provider
Email provider
Push provider
Cloud provider
Analytics provider
Identity/KYC provider
```

For each provider document:

```text
Purpose
Data shared
Security controls
Contract/DPA status
Retention
Geography
Incident process
```

---

# 62. Vendor Failure Planning

Every critical third-party integration needs a fallback state.

Payment:

```text
Provider unavailable
→ retry or alternative provider where configured
```

Logistics:

```text
Porter unavailable
→ hold/reassign/manual operations
```

Notification:

```text
SMS failure
→ retry/fallback channel where appropriate
```

---

# 63. Security Testing Plan

Before production:

## Automated

- Unit security tests
- Authorization tests
- Tenant-isolation tests
- Dependency scanning
- SAST
- Secret scanning
- Container scanning

## Manual

- Authentication testing
- Access-control testing
- API abuse testing
- File-upload testing
- Admin privilege testing

## External

Conduct an independent penetration test before major production scale where appropriate.

---

# 64. Critical Security Test Cases

### Supplier isolation

```text
Supplier A requests Supplier B product
→ 403/404
```

### Buyer isolation

```text
Buyer A requests Buyer B order
→ 403/404
```

### Admin endpoint

```text
Buyer calls admin verification endpoint
→ 403
```

### Payment webhook

```text
Forged webhook
→ rejected
```

### Duplicate order

```text
Same idempotency key
→ no duplicate order
```

### Inventory race

```text
Two buyers request final unit
→ only valid allocation succeeds
```

### Expired reservation

```text
Reservation expires
→ inventory released exactly once
```

---

# 65. Security Headers

Configure appropriate headers such as:

```text
Strict-Transport-Security
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

Exact CSP should be tested against the web application rather than blindly copied.

---

# 66. Logging Privacy

Logs should not contain:

```text
Passwords
OTP values
CVV
Full payment credentials
Private document contents
Authentication tokens
Unnecessary personal data
```

Use masking/redaction.

Example:

```text
+91******1234
```

instead of a full phone number where full data is unnecessary.

---

# 67. Security Observability Metrics

Track:

```text
Failed login rate
Account lockouts
403 rate
Rate-limit violations
Webhook signature failures
Cross-tenant authorization failures
Admin privileged actions
Document access
Payment anomalies
Security scan findings
```

---

# 68. Compliance Change Management

Regulations change.

Create a compliance review process:

```text
Monitor regulatory updates
↓
Legal/compliance assessment
↓
Impact analysis
↓
Policy decision
↓
Engineering change
↓
Testing
↓
Deployment
↓
Evidence/archive
```

Never assume that a rule implemented today will remain unchanged indefinitely.

---

# 69. Evidence and Audit Readiness

Maintain evidence for important controls:

```text
Supplier verification records
Document verification history
Access logs
Admin actions
Security scans
Backup tests
Restore tests
Incident reports
Consent records where applicable
Policy versions
Compliance decisions
```

Evidence should be time-stamped and access-controlled.

---

# 70. Production Security Checklist

## Identity

- [ ] Passwords securely hashed
- [ ] MFA for privileged users
- [ ] Session revocation
- [ ] Rate limiting
- [ ] Password reset protected

## Authorization

- [ ] RBAC
- [ ] Tenant isolation
- [ ] Resource ownership
- [ ] Admin privilege controls

## Data

- [ ] TLS
- [ ] Encryption at rest
- [ ] Private document storage
- [ ] Data minimization
- [ ] Retention policy
- [ ] Privacy notice

## Application

- [ ] Input validation
- [ ] Secure headers
- [ ] CORS
- [ ] CSRF strategy where applicable
- [ ] XSS protection
- [ ] SSRF protection
- [ ] File scanning

## Payments

- [ ] Provider-side/tokenized payment flow
- [ ] Webhook verification
- [ ] Idempotency
- [ ] Reconciliation

## Infrastructure

- [ ] WAF
- [ ] Private DB
- [ ] Secret manager
- [ ] Backups
- [ ] Restore test
- [ ] Monitoring

## Compliance

- [ ] Supplier verification workflow
- [ ] Buyer eligibility workflow
- [ ] Licence expiry handling
- [ ] Product restrictions
- [ ] Invoice/tax architecture
- [ ] Audit logs
- [ ] Recall capability design

---

# 71. Launch Gate

Bezo should not launch regulated medicine transactions until all of the following are satisfied:

```text
Legal/compliance review complete
+
Supplier licensing workflow validated
+
Buyer eligibility workflow validated
+
Product restrictions validated
+
Invoice/tax model validated
+
Privacy/security review complete
+
Payment integration reviewed
+
Logistics suitability reviewed
+
Security testing complete
+
Backup/restore tested
+
Incident response ready
```

---

# 72. Final Security Direction

Bezo's security model should follow:

**least privilege → zero-trust assumptions → tenant isolation → encryption → auditability → resilience → regulatory review.**

The system should assume:

```text
clients can be modified
requests can be replayed
users can be malicious
providers can fail
inventory can race
webhooks can be duplicated
files can be hostile
regulations can change
```

Security controls must therefore exist on the server and infrastructure, not only in the UI.

---

# 73. Source Notes

Primary external references used for this document include:

1. India's official Drugs and Cosmetics Rules, including wholesale-sale/distribution conditions. citeturn0search43turn0search44
2. India's Digital Personal Data Protection Act, 2023, published by MeitY/official Gazette source. citeturn1search5
3. MeitY's 2025–26 annual report describing notification of the DPDP Rules, 2025 and the phased implementation timeline. citeturn1search7
4. Official GST/IRP material describing e-invoicing and IRN/QR-code processes and applicability. citeturn0search1turn0search46

These references establish a technical compliance baseline; they do not replace legal review for Bezo's exact operating model.

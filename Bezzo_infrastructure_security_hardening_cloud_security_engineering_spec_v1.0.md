# Bezzo Infrastructure Security Hardening & Cloud Security Engineering Specification v1.0

**Product:** Bezzo B2B Pharmaceutical Marketplace  
**Document:** Infrastructure Security Hardening & Cloud Security Engineering Specification  
**Version:** 1.0  
**Status:** Engineering Baseline  
**Scope:** Cloud infrastructure, network, compute, containers, PostgreSQL, Redis, search, object storage, CDN/WAF, IAM, secrets, CI/CD, monitoring, backups, developer access, and production operations

---

# 1. Document Purpose

This document defines the infrastructure and cloud security baseline for Bezzo.

The objective is to ensure that Bezzo infrastructure is:

- Secure by default
- Privately networked where appropriate
- Least-privilege
- Auditable
- Resilient against common infrastructure attacks
- Protected against accidental exposure
- Recoverable after compromise
- Suitable for a pharmaceutical B2B marketplace handling business, identity, transaction, payment, supplier, inventory, and compliance-related information

This document complements the broader Bezzo security/compliance, DevOps, disaster recovery, API, database, and application security specifications.

---

# 2. Security Principles

Bezzo infrastructure shall follow:

1. Least privilege
2. Default deny
3. Private by default
4. Explicit trust boundaries
5. Defense in depth
6. Encryption in transit
7. Encryption at rest
8. Strong identity controls
9. Short-lived credentials where practical
10. Immutable/auditable infrastructure changes
11. Continuous monitoring
12. Minimal public exposure
13. Separation of environments
14. Separation of duties
15. Recoverability after compromise
16. Security verification before production release

---

# 3. Infrastructure Trust Zones

Bezzo infrastructure should be separated conceptually into:

```text
Internet
   |
CDN / WAF
   |
Public Load Balancer
   |
Application Zone
   |
Private Data Zone
   |
+-----------------------------+
| PostgreSQL                  |
| Redis                       |
| Search                      |
| Internal services           |
+-----------------------------+

Separate:
Management / CI-CD / Monitoring
```

Only components that genuinely require public exposure should be public.

---

# 4. Environment Isolation

Minimum environments:

- Local
- Test
- Staging
- Production

Production must be isolated from development and test environments.

Requirements:

- Separate credentials
- Separate databases
- Separate object storage locations
- Separate secrets
- Separate infrastructure
- Separate access policies
- Separate monitoring boundaries where appropriate

Production credentials must never be reused in non-production environments.

---

# 5. Cloud Account / Project Separation

Where the selected cloud platform supports it, use separate cloud accounts/projects/subscriptions for major trust boundaries.

Recommended conceptual structure:

```text
Bezzo Organization
|
+-- Production
+-- Staging
+-- Development
+-- Security / Audit
+-- Shared Services where justified
```

The exact cloud account model depends on the selected provider and organizational structure.

---

# 6. Network Architecture

Production networking should use a private network/VPC/VNet.

Conceptual layout:

```text
Internet
   |
CDN / WAF
   |
Public Load Balancer
   |
Private Application Subnets
   |
Private Data Subnets
```

Management access should use controlled administrative paths rather than exposing internal systems directly to the internet.

---

# 7. Subnet Segmentation

Recommended subnet classes:

### Edge/Public

May contain:

- Load balancer
- Internet-facing edge components

### Application

Contains:

- API services
- Worker services
- Internal application components

### Data

Contains:

- PostgreSQL
- Redis
- Search
- Other stateful systems

### Management

Contains:

- Administrative tooling
- Controlled operational access
- Security tooling where appropriate

Data subnets should not accept arbitrary inbound internet traffic.

---

# 8. Security Groups / Firewall Rules

Firewall rules shall follow:

```text
Default deny
+
Explicit allow
```

Rules should be:

- Narrow
- Documented
- Environment-specific
- Reviewed
- Logged where supported

Avoid:

```text
0.0.0.0/0 → PostgreSQL
```

or equivalent unrestricted access.

---

# 9. Internet Exposure

Only required public endpoints should be internet-facing.

Typical public endpoints:

- HTTPS web application
- HTTPS API
- CDN
- Public DNS

Do not publicly expose:

- PostgreSQL
- Redis
- Internal queues
- Internal administration services
- Private object storage
- Internal service discovery
- Management interfaces

---

# 10. TLS

Production external traffic shall use HTTPS.

TLS requirements:

- Valid certificates
- Automated renewal where possible
- Modern TLS configuration
- HTTP-to-HTTPS redirect
- Secure cookie configuration
- Certificate expiry monitoring

Internal service encryption should be used where the architecture and risk justify it.

---

# 11. DNS Security

DNS management must be restricted.

Controls:

- Limited administrative access
- Audit logs
- Change review
- Protected production zones
- Controlled record changes
- Monitoring for unexpected changes

High-impact DNS changes should require elevated authorization.

---

# 12. CDN Security

The CDN shall:

- Serve static assets
- Cache appropriate public content
- Enforce HTTPS
- Support security headers where appropriate
- Integrate with WAF
- Reduce direct origin exposure

Sensitive authenticated responses must not be accidentally cached publicly.

---

# 13. WAF

A Web Application Firewall should protect public HTTP endpoints.

Relevant protections include:

- Common injection patterns
- Malicious request signatures
- Excessive request rates
- Known automated abuse
- Suspicious payloads
- Path traversal patterns

WAF rules must be monitored to prevent excessive false positives.

---

# 14. Rate Limiting

Rate limiting shall exist at appropriate layers:

- CDN/WAF
- API gateway/application
- Authentication
- Sensitive business endpoints

Higher-risk endpoints include:

- Login
- OTP
- Password reset
- Registration
- Search
- Checkout
- Payment initiation
- File upload
- Administrative APIs

Rate limits must account for legitimate B2B usage.

---

# 15. DDoS Protection

Bezzo should use managed edge/DDoS capabilities provided by the selected cloud/CDN architecture.

Protection should cover:

- Network-level attacks
- Volumetric traffic
- HTTP request floods
- Abusive clients

Application-level rate limiting remains necessary even when managed DDoS protection exists.

---

# 16. Identity and Access Management

All infrastructure access shall use centralized IAM where supported.

Principles:

- Individual identities
- No shared administrator accounts
- Least privilege
- Role-based access
- MFA
- Temporary elevation where possible
- Access logging
- Periodic access review

---

# 17. Human Access

Production access should be restricted to authorized personnel.

Avoid direct public SSH/RDP exposure.

Preferred access patterns:

- Identity-aware access
- VPN/private access
- Managed session access
- Bastion or equivalent controlled access where necessary

Administrative access must be auditable.

---

# 18. MFA

MFA shall be required for:

- Cloud console
- Production administrative access
- CI/CD administration
- Secrets management
- Database administration
- Security tooling
- Payment administration
- High-privilege admin accounts

---

# 19. Break-Glass Access

Bezzo should maintain controlled emergency access for critical outages.

Break-glass access shall:

- Be strongly protected
- Require MFA
- Be rarely used
- Generate audit events
- Be reviewed after use
- Have limited permissions

---

# 20. Service Accounts

Service accounts shall:

- Have unique identities
- Use minimum required permissions
- Avoid long-lived static credentials where possible
- Be monitored
- Be periodically reviewed

One service should not automatically inherit broad permissions intended for another service.

---

# 21. IAM Role Separation

Separate roles should exist for:

- Developers
- Operations
- SRE/platform
- Security
- Database administrators
- CI/CD
- Application runtime
- Read-only auditing

Production write access should be limited.

---

# 22. Temporary Privilege Elevation

High-privilege access should preferably be:

```text
Normal access
    ↓
Approved elevation
    ↓
Temporary privileged access
    ↓
Automatic expiration
```

Permanent administrator access should be minimized.

---

# 23. Secrets Management

Secrets shall never be committed to source control.

Store secrets in an approved secret-management system.

Examples:

- Database credentials
- API keys
- Payment credentials
- Porter credentials
- SMS credentials
- Email credentials
- Push credentials
- Signing keys

Applications should retrieve secrets securely at runtime or deployment time.

---

# 24. Secret Rotation

Secrets should have defined rotation procedures.

Rotation must cover:

- Database credentials
- Cloud access keys
- Payment credentials
- Logistics credentials
- Notification credentials
- Signing secrets
- Encryption keys where applicable

Rotation must be tested so that credential changes do not cause avoidable outages.

---

# 25. Encryption at Rest

Encrypt sensitive infrastructure storage at rest, including where supported:

- PostgreSQL
- Redis
- Search
- Object storage
- Backups
- Block storage
- Logs containing sensitive operational information

Use managed key-management facilities where appropriate.

---

# 26. Encryption Key Management

Keys must be:

- Access controlled
- Audited
- Rotated according to policy
- Separated by environment where appropriate
- Protected from application-level unauthorized access

Key deletion must have strict safeguards.

---

# 27. Object Storage Security

Product and supplier documents should use private buckets/containers by default.

Requirements:

- Public access blocked by default
- Least-privilege bucket policies
- Encryption
- Access logging where appropriate
- Malware/file validation for uploads
- Lifecycle management
- Versioning where required

Public access should be explicitly enabled only for content designed to be public.

---

# 28. Secure File Uploads

Supplier uploads may include:

- Product images
- Licences
- Business documents
- Compliance documents

Controls:

- File type validation
- MIME validation
- File size limits
- Filename normalization
- Malware scanning where appropriate
- Storage outside executable web roots
- Private access for sensitive documents
- Signed temporary URLs where required

Never trust the client-provided file extension alone.

---

# 29. Container Security

Containers shall:

- Use minimal base images
- Avoid unnecessary packages
- Run as non-root where possible
- Use read-only filesystems where practical
- Drop unnecessary Linux capabilities
- Avoid privileged mode
- Pin or control dependency versions
- Receive security updates

---

# 30. Container Image Security

CI/CD shall scan images for:

- Known vulnerabilities
- Malicious packages
- Outdated operating-system libraries
- Misconfiguration
- Embedded secrets

Critical vulnerabilities must have defined release-blocking rules.

---

# 31. Image Provenance

Production images should be traceable to:

- Repository
- Commit
- Build
- CI run
- Dependency state

The production image must be reproducible or at least attributable to a trusted build pipeline.

---

# 32. Runtime Container Security

Production workloads should enforce:

- Resource limits
- Resource requests
- Non-root execution
- Restricted network permissions
- Minimal filesystem write access
- Secret access only when required

Containers should not automatically have cloud administrator privileges.

---

# 33. Dependency Security

Application and infrastructure dependencies shall be monitored.

Track:

- Direct dependencies
- Transitive dependencies
- Container packages
- Infrastructure provider modules

Use automated vulnerability scanning in CI.

---

# 34. Patch Management

Define patch classes:

### Critical

Immediate or expedited response.

### High

Prioritized remediation.

### Medium

Scheduled remediation.

### Low

Handled through normal maintenance.

Production patching must include compatibility and rollback considerations.

---

# 35. Operating System Security

Managed infrastructure should be preferred where practical.

For directly managed hosts:

- Automatic security updates where safe
- Minimal installed packages
- Host firewall
- Endpoint monitoring where applicable
- Restricted administrative access
- Centralized logging
- Regular vulnerability scanning

---

# 36. Network Egress Control

Application services should not have unrestricted outbound access by default.

Where practical, restrict outbound traffic to required destinations.

Examples:

- Payment gateway
- Porter
- Notification providers
- Cloud services
- Package/update repositories where required

Egress restrictions reduce the impact of compromised workloads.

---

# 37. Internal Service Communication

Services should authenticate sensitive internal calls.

Do not assume:

```text
Internal network = trusted
```

Use:

- Service identity
- Authentication
- Authorization
- TLS where appropriate

---

# 38. Database Security

PostgreSQL should:

- Run in private networking
- Accept connections only from approved application/admin sources
- Use strong authentication
- Encrypt connections
- Use least-privilege roles
- Restrict administrative access
- Log important administrative activity

Application roles should not automatically have unrestricted schema privileges.

---

# 39. Database Role Separation

Separate database roles for:

- Application runtime
- Migration
- Read-only reporting
- Administration
- Backup/recovery

The application runtime should not normally have permission to drop databases or perform unrestricted administrative operations.

---

# 40. Redis Security

Redis should:

- Remain private
- Require authentication where supported
- Use encryption in transit where appropriate
- Restrict network access
- Avoid public exposure

Redis credentials must not be embedded in source code.

---

# 41. Search Security

Search infrastructure shall:

- Remain private where possible
- Require authentication
- Restrict administrative APIs
- Use encrypted transport where appropriate
- Limit index privileges
- Prevent arbitrary public index access

---

# 42. Monitoring and Logging Security

Security-relevant infrastructure events should be observable.

Monitor:

- Login failures
- Privilege changes
- Security group/firewall changes
- IAM changes
- Secret access
- Key changes
- Public exposure changes
- Database administrative activity
- Object storage policy changes

---

# 43. Centralized Audit Logs

Important infrastructure audit events should be centralized or otherwise protected against tampering.

Examples:

- IAM changes
- Network rule changes
- Production deployments
- Secret changes
- Database administrative changes
- Storage policy changes
- DNS changes

Audit data should have controlled retention and access.

---

# 44. Audit Log Integrity

Audit logs should be protected from ordinary application users and operational users who could otherwise alter evidence.

Where supported:

- Immutable retention
- Restricted deletion
- Separate security account
- Access monitoring

---

# 45. Vulnerability Management

Bezzo shall maintain a vulnerability management process:

```text
Discover
→ Assess
→ Prioritize
→ Remediate
→ Verify
→ Record
```

Sources may include:

- Dependency scanning
- Container scanning
- Cloud security tooling
- Infrastructure scanning
- Penetration testing
- Code security scanning

---

# 46. Infrastructure-as-Code Security

Terraform or equivalent IaC must be scanned for:

- Public storage
- Public databases
- Excessive IAM
- Open firewall rules
- Missing encryption
- Weak network segmentation
- Insecure defaults

Security checks should run before infrastructure changes are applied.

---

# 47. Terraform State Security

Terraform state may contain sensitive infrastructure information.

Protect state with:

- Encryption
- Access controls
- Versioning
- Locking
- Restricted administrative access

Never commit production Terraform state into public source control.

---

# 48. CI/CD Security

CI/CD shall use:

- Short-lived credentials where possible
- Least-privilege deployment identities
- Protected production environments
- Approval gates for sensitive changes
- Secret management
- Artifact integrity controls

The CI runner must not automatically have unrestricted production access.

---

# 49. Production Deployment Permissions

Production deployment should require:

- Approved pipeline
- Trusted artifact
- Required checks passing
- Appropriate authorization
- Auditable deployment event

Direct manual deployment should be exceptional.

---

# 50. Supply Chain Security

Protect the software supply chain through:

- Dependency pinning
- Lockfiles
- Vulnerability scanning
- Trusted registries
- Artifact verification
- Build provenance
- Secret scanning
- Protected branches

---

# 51. Branch and Repository Security

Repositories should enforce:

- Protected main branches
- Required reviews
- CI checks
- Secret scanning
- Dependency scanning
- Limited repository administration

Production credentials must never be stored in repositories.

---

# 52. Administrative Interfaces

Admin interfaces are high-value targets.

Protect with:

- Strong authentication
- MFA
- RBAC
- Rate limiting
- Session controls
- Audit logging
- Restricted access
- Additional verification for sensitive actions

Sensitive actions include:

- Refunds
- Supplier verification
- Settlement actions
- Price overrides
- Role changes
- Order overrides

---

# 53. Production Database Access

Developers should not receive unrestricted production database access by default.

Preferred access:

- Read-only where possible
- Temporary access
- Audited sessions
- Masked data where feasible

Direct production modification should be rare and controlled.

---

# 54. Production Data in Non-Production

Do not copy production data into development/test environments without an approved process.

Where production-derived data is necessary:

- Minimize it
- Mask sensitive data
- Remove unnecessary PII
- Restrict access
- Document the use

Synthetic data should be preferred.

---

# 55. Security Headers

Web applications should implement appropriate security headers, including where applicable:

- Content Security Policy
- Strict Transport Security
- X-Content-Type-Options
- Referrer-Policy
- Frame protection
- Appropriate Permissions Policy

Exact policy values must be validated against application requirements.

---

# 56. Cookie Security

Authentication cookies, where used, should use:

- Secure
- HttpOnly
- Appropriate SameSite policy
- Appropriate expiration
- Narrow domain/path scope

Do not expose session credentials to JavaScript unnecessarily.

---

# 57. Network Monitoring

Monitor:

- Unexpected inbound traffic
- Unexpected outbound traffic
- Firewall denials
- WAF events
- DDoS signals
- Unusual traffic patterns
- Port scanning indicators

Security events should be correlated with application events.

---

# 58. Resource Exposure Monitoring

Automated checks should detect accidental exposure such as:

- Public database
- Public Redis
- Public storage
- Open administrative ports
- Unrestricted security groups
- Public internal dashboards

This should run continuously or at regular intervals.

---

# 59. Security Baselines

Every production component should have a documented baseline covering:

- Network exposure
- Identity
- Encryption
- Logging
- Patch level
- Backup
- Monitoring
- Resource limits
- Administrative access

Deviation from the baseline must be documented.

---

# 60. Configuration Drift

Monitor for drift between:

```text
Declared IaC
vs
Actual cloud configuration
```

Unexpected drift should trigger investigation.

Where safe, infrastructure should be returned to the approved state through IaC rather than manual edits.

---

# 61. Cloud Security Posture Monitoring

Use available cloud security posture capabilities to detect:

- Public resources
- Weak IAM
- Missing encryption
- Vulnerable services
- Network exposure
- Misconfigured storage
- Logging gaps

Findings should be triaged by severity.

---

# 62. Secrets in Logs

CI/CD and application systems must prevent accidental secret exposure.

Scan for:

- API keys
- Tokens
- Passwords
- Private keys
- Authorization headers

If a secret is exposed:

1. Treat it as compromised.
2. Rotate it.
3. Remove exposure.
4. Investigate access.
5. Record the incident.

---

# 63. Encryption in Transit

Use encrypted communication for:

- Client → CDN
- CDN → origin where applicable
- Application → PostgreSQL
- Application → Redis where supported
- Application → Search
- Application → Payment gateway
- Application → Porter
- Application → Notification providers

---

# 64. Backup Security

Backups shall:

- Be encrypted
- Be access controlled
- Be monitored
- Be protected from accidental deletion
- Be isolated from ordinary application permissions
- Be tested through restoration

Backup credentials must not be available to normal application runtime identities.

---

# 65. Disaster Recovery Security

Recovery environments must maintain security controls.

Do not create an emergency recovery environment with:

- Public databases
- Default credentials
- Disabled authentication
- Unencrypted storage
- Broad administrator access

Emergency infrastructure must remain secure.

---

# 66. Security During Incident Response

During incidents:

- Preserve evidence
- Avoid destroying logs
- Restrict emergency access
- Record commands/actions
- Rotate credentials when necessary
- Maintain chain of accountability
- Separate containment from restoration

Speed is important, but uncontrolled emergency changes can increase damage.

---

# 67. Compromised Workload Response

If a container/instance is suspected compromised:

1. Isolate it.
2. Preserve relevant evidence.
3. Stop further access.
4. Revoke credentials if necessary.
5. Replace with trusted artifact.
6. Review lateral movement.
7. Validate dependent systems.
8. Monitor for recurrence.

Do not simply restart a potentially compromised workload and declare the incident resolved.

---

# 68. Ransomware / Destructive Attack Preparedness

Protection should include:

- Isolated backups
- Backup immutability where appropriate
- Least-privilege IAM
- MFA
- Restricted production access
- Audit logging
- Recovery exercises

Recovery should prioritize authoritative data and critical commerce workflows.

---

# 69. Security Testing

Infrastructure security testing should include:

- Vulnerability scans
- Configuration scans
- Network exposure tests
- Container scans
- Dependency scans
- Penetration testing
- IAM review
- Storage exposure tests

Testing must occur before major production launches and periodically thereafter.

---

# 70. Penetration Testing Scope

Where authorized, test:

- Public web endpoints
- API endpoints
- Authentication
- Authorization
- File uploads
- Admin interfaces
- Cloud exposure
- Network boundaries

Testing must avoid uncontrolled disruption to production.

---

# 71. Security Regression Testing

Every major security fix should include a regression test.

Examples:

- Authorization bypass fixed
- Public bucket exposure fixed
- Rate-limit bypass fixed
- Session issue fixed
- Upload validation fixed

---

# 72. Security Monitoring Alerts

Critical alerts may include:

- New public database
- New unrestricted firewall rule
- Privileged IAM change
- Root/admin login anomaly
- Secret access anomaly
- Large object-storage policy change
- Security group modification
- Unexpected production shell/session
- Repeated authentication failures
- Suspicious outbound traffic

---

# 73. Security Alert Severity

### Critical

Potential active compromise or severe exposure.

### High

Significant security misconfiguration or suspicious activity.

### Medium

Potential weakness requiring remediation.

### Low

Hardening opportunity or informational finding.

---

# 74. Access Reviews

Periodic reviews shall validate:

- Who has production access
- Which roles exist
- Which service accounts exist
- Which credentials remain active
- Which permissions are unused
- Which emergency accounts exist

Remove unnecessary access promptly.

---

# 75. Vendor Access

Third-party vendor access should be:

- Explicitly authorized
- Time-bounded where possible
- Least-privileged
- Audited
- Revoked when no longer required

This includes support or infrastructure vendors.

---

# 76. Time Synchronization

Systems should maintain reliable time synchronization.

Accurate time is important for:

- Audit logs
- Incident timelines
- Authentication
- Certificates
- Payment reconciliation
- Distributed tracing

---

# 77. Security and Performance Balance

Security controls must be implemented without creating unnecessary performance bottlenecks.

Examples:

- Rate limiting should be efficient.
- WAF rules should be monitored.
- Logging should be asynchronous where practical.
- Encryption should use managed optimized services where appropriate.

Security must not be disabled merely because it adds measurable overhead.

---

# 78. Security and Availability Balance

Security controls should support availability.

Examples:

- DDoS protection
- Backups
- Immutable recovery
- Multi-instance applications
- Credential rotation without downtime
- Safe emergency access

Security and availability must be designed together.

---

# 79. Production Security Readiness Checklist

### Network

- [ ] Private VPC/VNet
- [ ] Private database
- [ ] Private Redis
- [ ] Restricted search
- [ ] WAF enabled
- [ ] DDoS protection configured
- [ ] Firewall rules reviewed

### IAM

- [ ] MFA enabled
- [ ] No shared admin accounts
- [ ] Least privilege
- [ ] Production access reviewed
- [ ] Break-glass access controlled

### Secrets

- [ ] Secrets manager configured
- [ ] No secrets in repository
- [ ] Rotation process documented
- [ ] Secret exposure scanning enabled

### Compute

- [ ] Hardened images
- [ ] Non-root containers
- [ ] Resource limits
- [ ] Vulnerability scanning
- [ ] Trusted image pipeline

### Data

- [ ] Encryption at rest
- [ ] Encryption in transit
- [ ] Database access restricted
- [ ] Storage private
- [ ] Backups protected

### Operations

- [ ] Audit logs
- [ ] Security monitoring
- [ ] Incident response
- [ ] Drift detection
- [ ] Recovery testing

---

# 80. Definition of Ready

Infrastructure is security-ready when:

- Trust boundaries are documented
- Public exposure is documented
- IAM roles are defined
- Network rules are defined
- Encryption is enabled
- Logging exists
- Secrets management exists
- Backup protection exists
- Security monitoring exists

---

# 81. Definition of Done

Infrastructure security implementation is complete when:

- Production network is appropriately segmented
- Public exposure is minimized
- IAM follows least privilege
- MFA protects privileged access
- Secrets are centrally managed
- Encryption is enabled
- Storage is private by default
- Containers are hardened
- Infrastructure is continuously scanned
- Audit events are retained
- Drift is detectable
- Backup security is verified
- Incident procedures are tested

---

# 82. Implementation Sequence

## Phase 1 — Network Foundation

- VPC/VNet
- Subnets
- Security groups
- Private data services
- WAF
- CDN
- TLS

## Phase 2 — IAM

- Cloud roles
- Service identities
- MFA
- Production access
- Break-glass controls

## Phase 3 — Secrets and Encryption

- Secrets manager
- Key management
- Database encryption
- Storage encryption
- Credential rotation

## Phase 4 — Compute Hardening

- Container hardening
- Image scanning
- Runtime restrictions
- Resource limits

## Phase 5 — Security Monitoring

- Audit logs
- Cloud security monitoring
- Vulnerability scanning
- Exposure detection
- Alerting

## Phase 6 — Security Validation

- Penetration testing
- Recovery testing
- IAM review
- Configuration review
- Incident drills

---

# 83. Final Engineering Position

Bezzo infrastructure should be designed under the assumption that:

```text
Anything publicly exposed
may eventually be attacked.

Anything privileged
may eventually be misused.

Anything unmonitored
may eventually fail unnoticed.

Anything untested
may eventually fail during the worst possible incident.
```

The target architecture therefore combines:

```text
Private-by-default networking
+
Least-privilege IAM
+
Strong authentication
+
Encryption
+
Secure secrets
+
Hardened containers
+
Protected storage
+
Continuous monitoring
+
Auditable changes
+
Secure backups
+
Tested recovery
```

The result should be an infrastructure platform where compromise is harder, accidental exposure is detectable, privileged actions are accountable, and recovery remains possible even when preventive controls fail.

This specification should be implemented together with the Bezzo security/compliance, DevOps, CI/CD, observability, performance, disaster recovery, database, API, and application architecture specifications.

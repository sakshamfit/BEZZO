# Bezzo Identity, Authentication & User Account Specification v1.0

**Product:** Bezzo  
**Document:** Identity, Authentication & User Account Specification  
**Version:** 1.0  
**Status:** Draft for implementation  
**Scope:** Buyer accounts, supplier accounts, administrator identities, authentication, authorization foundations, onboarding, verification states, sessions, devices, recovery, profile management, account lifecycle, and identity security.

---

# 1. Purpose

The Bezzo Identity and Account platform provides the common identity layer for the entire marketplace.

It supports three primary account domains:

1. Medical Store / Pharmacy Buyer
2. Wholesaler / Supplier
3. Bezzo Administrator / Internal Staff

The identity system must provide secure authentication while keeping role-specific business data and permissions isolated.

---

# 2. Identity Principles

## 2.1 One identity, controlled capabilities

A user identity is separate from the business organization and from the permissions granted to that identity.

Recommended model:

```text
User
 |
 +-- Organization / Business
       |
       +-- Membership
             |
             +-- Role
```

This allows future support for multiple employees operating a supplier or medical-store account.

## 2.2 Authentication is not authorization

Successful login does not automatically grant access to business resources.

Every protected request must perform authorization.

## 2.3 Server-side enforcement

The backend is the security boundary.

The client application must never be trusted to enforce:

- Role restrictions
- Organization isolation
- Supplier ownership
- Buyer ownership
- Admin permissions

## 2.4 Minimal identity data

Only identity information necessary for the product and applicable compliance requirements should be collected.

---

# 3. Account Types

## 3.1 Buyer

A medical-store/business buyer account can:

- Browse eligible marketplace products
- Maintain business information
- Manage addresses
- Create orders
- Make payments
- Track orders
- View invoices
- Contact support
- Manage authorized account users where enabled

## 3.2 Supplier

A supplier account can:

- Manage supplier business information
- Upload verification documents
- Manage products
- Manage inventory
- Receive orders
- Manage fulfillment
- View settlements
- View supplier analytics
- Contact support

Supplier access remains restricted until required verification is completed.

## 3.3 Administrator

Admin identities are separate from ordinary marketplace accounts.

Administrative users can access internal operations according to explicit RBAC permissions.

---

# 4. Identity Data Model

Recommended core entities:

```text
users
organizations
organization_members
roles
permissions
role_permissions
user_roles
sessions
devices
otp_challenges
auth_events
account_status_history
password_credentials
external_identities
```

Business-domain entities should reference the identity system rather than duplicating login credentials.

---

# 5. User Entity

Recommended fields:

```text
id
email
phone
display_name
status
email_verified_at
phone_verified_at
last_login_at
created_at
updated_at
deleted_at
```

Sensitive authentication data must not be stored in plaintext.

---

# 6. User Status

Recommended states:

```text
PENDING
ACTIVE
RESTRICTED
SUSPENDED
LOCKED
DEACTIVATED
```

Meaning:

### PENDING

Identity exists but onboarding or required verification is incomplete.

### ACTIVE

Normal access is permitted.

### RESTRICTED

Selected capabilities are disabled while basic account access may remain available.

### SUSPENDED

Account access is blocked due to an administrative/business decision.

### LOCKED

Temporary security lock, typically caused by authentication or security events.

### DEACTIVATED

Account is permanently or administratively inactive.

---

# 7. Organization Model

A business should be represented independently from its users.

Example:

```text
Organization: ABC Medical Store

Members:
- Owner
- Manager
- Staff
```

For a supplier:

```text
Organization: XYZ Pharma Distributors

Members:
- Owner
- Operations Manager
- Inventory Staff
- Finance Staff
```

This enables controlled multi-user business accounts in future releases.

---

# 8. Organization Types

Recommended:

```text
BUYER_ORGANIZATION
SUPPLIER_ORGANIZATION
BEZZO_ORGANIZATION
```

An organization should have a single authoritative business profile.

---

# 9. Organization Membership

Membership fields:

```text
id
organization_id
user_id
membership_status
role_id
invited_by
joined_at
created_at
updated_at
```

Membership states:

```text
INVITED
ACTIVE
SUSPENDED
REMOVED
```

A removed member must lose access immediately.

---

# 10. Buyer Onboarding

Initial buyer onboarding flow:

```text
Select Medical Store Owner
        |
Create identity
        |
Verify phone / email
        |
Create business profile
        |
Submit applicable business/license information
        |
Verification
        |
Account activated
```

Required fields should be configurable based on the applicable onboarding policy.

---

# 11. Supplier Onboarding

Supplier onboarding should use a stronger verification process.

Recommended flow:

```text
Select Wholesaler / Supplier
        |
Create identity
        |
Verify phone / email
        |
Create supplier organization
        |
Business information
        |
Required document submission
        |
Review
        |
Verified
        |
Supplier activated
```

The exact documents and requirements must follow the applicable legal and operational policy for the supplier's jurisdiction and activity.

---

# 12. Verification States

Business verification can use:

```text
REGISTERED
DOCUMENTS_PENDING
UNDER_REVIEW
VERIFIED
REJECTED
SUSPENDED
```

A separate operational `ACTIVE` state may be used after all required onboarding conditions are satisfied.

---

# 13. Phone Authentication

Phone OTP may be used for:

- Initial verification
- Login
- Sensitive account actions
- Recovery

OTP requirements:

- Short expiration
- One-time use
- Attempt limit
- Rate limiting
- Abuse detection
- Secure server-side verification

OTP values must never be logged in plaintext.

---

# 14. Email Authentication

Email verification may be required for:

- Account verification
- Recovery
- Important business communication
- Security notifications

Verification links should:

- Expire
- Be single-use
- Be tied to the intended account
- Be invalidated after successful verification

---

# 15. Password Authentication

If passwords are supported:

- Store only strong password hashes
- Never store plaintext passwords
- Apply password length and security requirements
- Rate-limit login attempts
- Detect credential stuffing
- Support secure password reset
- Invalidate appropriate sessions after password reset

Password hashing parameters should follow current security best practices at implementation time.

---

# 16. Passwordless Authentication

Bezzo may use passwordless login through:

```text
Phone OTP
Email magic link
Passkey
```

The authentication architecture should avoid coupling the account model to a single authentication mechanism.

---

# 17. Passkeys

Passkeys can be introduced as an additional authentication method.

The identity model should support:

```text
user
  |
  +-- passkey credential
```

Passkey credentials must be stored according to WebAuthn/FIDO requirements.

---

# 18. Multi-Factor Authentication

MFA should be required or strongly recommended for privileged administrative accounts.

Potential methods:

- Authenticator application
- Passkey
- Hardware security key
- Approved second factor

SMS OTP should not automatically be considered equivalent to phishing-resistant MFA.

---

# 19. Admin Authentication

Admin identities require stricter controls.

Recommended:

```text
SSO / Identity Provider
        |
MFA
        |
Admin Session
        |
RBAC
        |
Privileged Action
        |
Audit Log
```

Sensitive administrative actions may require re-authentication or step-up authentication.

---

# 20. Session Model

Recommended session information:

```text
session_id
user_id
device_id
created_at
last_seen_at
expires_at
revoked_at
ip_address
user_agent
authentication_method
```

Sessions must be revocable.

---

# 21. Access Tokens

For API access, use short-lived access tokens.

Where refresh tokens are used:

- Rotate them
- Store securely
- Detect reuse
- Revoke compromised token families
- Bind them appropriately to the account/session model

Never put long-lived sensitive credentials in insecure browser storage.

---

# 22. Web Authentication

For web:

- HTTPS only
- Secure cookies where appropriate
- HttpOnly cookies for sensitive session credentials
- SameSite protections
- CSRF protection where applicable
- Strict transport security
- Content security controls
- Session expiration

---

# 23. Mobile Authentication

For Android and iOS:

- Secure OS credential storage
- Short-lived access tokens
- Refresh-token protection
- Device/session management
- Certificate/network security according to threat model
- Logout and revocation support

Sensitive tokens should not be stored in plain local storage.

---

# 24. Device Management

A user should be able to view active sessions/devices where appropriate.

Display:

- Device type
- Approximate location where permitted
- Last active time
- Login method
- Session creation time

Actions:

- Revoke session
- Sign out other devices
- Revoke all sessions

---

# 25. Login Flow

Recommended:

```text
Enter identifier
      |
Account lookup
      |
Authentication challenge
      |
Credential/OTP/passkey verification
      |
Risk/security checks
      |
Create session
      |
Return authenticated state
```

Do not reveal whether an account exists through overly specific error messages during account discovery flows.

---

# 26. Rate Limiting

Rate-limit:

- Login
- OTP request
- OTP verification
- Password reset
- Email verification
- Passkey registration
- Session creation
- Account recovery

Limits should account for:

- User
- IP
- Device
- Identifier
- Endpoint

Do not rely on IP-only rate limiting.

---

# 27. Account Recovery

Recovery should require sufficient proof of account ownership.

Possible methods:

- Verified phone
- Verified email
- Passkey
- Approved recovery process

For business accounts with multiple members, recovery should not automatically transfer ownership of the organization.

High-risk ownership changes should use an administrative verification workflow.

---

# 28. Account Lockout

Temporary security lock may be triggered by:

- Repeated authentication failures
- OTP abuse
- Suspicious session behavior
- Credential stuffing
- Automated attack patterns

Lockouts should avoid creating an easy denial-of-service vector against legitimate users.

---

# 29. Logout

Logout should:

- Revoke/invalidate the relevant session
- Remove local authentication state
- Clear sensitive client-side credentials
- Preserve server-side audit information

"Logout all devices" should revoke all active sessions.

---

# 30. Account Suspension

Suspension should be separate from authentication failure.

When suspended:

```text
User
  |
Authentication may be rejected
  |
Reason/status recorded
  |
Admin action required for restoration
```

Suspension actions must be audited.

---

# 31. Role Model

Initial marketplace roles:

```text
BUYER_OWNER
BUYER_MANAGER
BUYER_STAFF

SUPPLIER_OWNER
SUPPLIER_MANAGER
SUPPLIER_INVENTORY
SUPPLIER_FINANCE

BEZZO_ADMIN
```

Internal admin permissions should use the dedicated admin RBAC model.

---

# 32. Authorization Hierarchy

Authorization should consider:

```text
Authenticated User
        |
Membership
        |
Organization
        |
Role
        |
Permission
        |
Resource Ownership
        |
Action
```

Example:

```text
Supplier Manager
   |
Supplier Organization A
   |
Product X belonging to Supplier A
   |
EDIT
```

The same user must not automatically access Supplier B's product.

---

# 33. Tenant / Organization Isolation

Every organization-owned resource should be associated with an organization identifier.

Example:

```text
supplier_products
    organization_id

supplier_inventory
    organization_id

supplier_orders
    organization_id
```

Queries must always enforce the appropriate organization scope.

---

# 34. Buyer Data Isolation

Buyer-specific data should be scoped to the authenticated buyer organization/user.

Examples:

- Orders
- Addresses
- Payment history
- Invoices
- Support cases
- Saved products

A buyer must never be able to access another buyer's records by changing an ID in a request.

---

# 35. Supplier Data Isolation

Supplier-specific data must be scoped by supplier organization.

Examples:

- Products
- Inventory
- Fulfillments
- Supplier analytics
- Settlements
- Supplier support cases

---

# 36. Ownership Transfer

Business ownership transfer is a sensitive operation.

Recommended workflow:

```text
Current Owner
     |
Transfer Request
     |
Verification
     |
New Owner Confirmation
     |
Administrative Review where required
     |
Ownership Changed
```

The operation must create a permanent audit record.

---

# 37. Organization Invitations

Existing organization members with permission can invite additional users.

Invitation contains:

```text
organization
invited email/phone
role
inviter
expiration
status
```

Invitation states:

```text
PENDING
ACCEPTED
EXPIRED
REVOKED
```

---

# 38. Role Changes

Role changes must be permission-controlled.

Example:

```text
Owner
  |
Invite Manager
  |
Manager accepts
  |
Membership active
```

High-privilege role assignment should be auditable.

---

# 39. Profile Management

Users can manage appropriate personal information:

- Display name
- Phone
- Email
- Profile image where enabled
- Notification preferences

Business organizations manage:

- Business name
- Registered address
- Store/warehouse details
- Applicable business identifiers
- Operational contacts

Changes to regulated business information may require verification.

---

# 40. Address Management

Address entities should be separate from user profiles.

Recommended:

```text
addresses
    id
    organization_id
    type
    line_1
    line_2
    city
    state
    postal_code
    country
    latitude
    longitude
    contact_name
    contact_phone
    is_default
```

Address access must be organization-scoped.

---

# 41. Identity Verification Documents

Verification documents should be stored in a secure document subsystem rather than directly in user tables.

Example:

```text
verification_documents
    id
    organization_id
    document_type
    storage_reference
    status
    submitted_at
    reviewed_at
    reviewer_id
```

Documents must use secure access controls.

---

# 42. Verification History

Every verification decision should retain:

- Submitted state
- Reviewer
- Timestamp
- Decision
- Reason
- Required follow-up
- Document references

History should not be silently overwritten.

---

# 43. Authentication Events

Recommended events:

```text
login_attempted
login_succeeded
login_failed
otp_requested
otp_verified
password_reset_requested
password_reset_completed
session_created
session_revoked
mfa_enabled
mfa_disabled
account_locked
account_unlocked
account_suspended
account_reactivated
role_changed
membership_created
membership_removed
```

Authentication events should feed the security audit system.

---

# 44. Security Notifications

Users should receive appropriate notifications for security-sensitive events.

Examples:

- New login
- New device
- Password changed
- Email changed
- Phone changed
- MFA changed
- Account recovery
- Session revoked
- Organization role changed

Notification content must avoid exposing sensitive credentials.

---

# 45. Email / Phone Changes

Changing a verified identifier should require re-verification.

Recommended:

```text
Request change
     |
Authenticate current account
     |
Verify new identifier
     |
Update
     |
Notify account
```

For high-risk accounts, additional verification may be required.

---

# 46. Deletion and Deactivation

Account deletion must distinguish:

```text
Authentication identity
Business organization
Financial records
Orders
Compliance records
Audit records
```

Not every business record can necessarily be physically deleted immediately.

The final deletion/retention policy must follow applicable legal, contractual, and operational requirements.

---

# 47. Privacy Controls

Identity services should support:

- Data minimization
- Purpose limitation
- Access control
- Audit logging
- Secure deletion where permitted
- Retention rules
- Export/access workflows where applicable

---

# 48. API Design

Recommended identity APIs:

```text
POST /identity/v1/auth/login
POST /identity/v1/auth/logout
POST /identity/v1/auth/refresh

POST /identity/v1/auth/otp/request
POST /identity/v1/auth/otp/verify

POST /identity/v1/auth/password/forgot
POST /identity/v1/auth/password/reset

POST /identity/v1/auth/mfa/enroll
POST /identity/v1/auth/mfa/verify
POST /identity/v1/auth/mfa/disable

GET  /identity/v1/me
PATCH /identity/v1/me

GET  /identity/v1/me/sessions
POST /identity/v1/me/sessions/{id}/revoke
POST /identity/v1/me/sessions/revoke-all

GET  /identity/v1/organizations
POST /identity/v1/organizations
GET  /identity/v1/organizations/{id}
PATCH /identity/v1/organizations/{id}

GET  /identity/v1/organizations/{id}/members
POST /identity/v1/organizations/{id}/invitations
POST /identity/v1/organizations/{id}/members/{id}/remove
PATCH /identity/v1/organizations/{id}/members/{id}/role
```

API naming may be consolidated with the final platform API gateway design.

---

# 49. Authentication Error Model

Use safe, structured errors.

Example:

```json
{
  "code": "AUTHENTICATION_FAILED",
  "message": "Authentication could not be completed."
}
```

Do not expose:

- Password validity
- Internal identity-provider errors
- Database errors
- Stack traces
- Secret values

---

# 50. Idempotency

Idempotency should be supported for operations such as:

- OTP request where appropriate
- Organization creation
- Invitation creation
- Role-change requests
- Ownership transfer requests

Duplicate requests must not create duplicate business state.

---

# 51. Observability

Track:

- Authentication success rate
- Authentication failure rate
- OTP delivery rate
- OTP verification failure rate
- Session creation
- Session revocation
- Account lockouts
- Suspicious login events
- Recovery attempts
- API latency/errors

Never log:

- Passwords
- OTP values
- Access tokens
- Refresh tokens
- Private authentication secrets

---

# 52. Testing

## Unit tests

Cover:

- Password/OTP policies
- Session expiration
- Permission checks
- Organization isolation
- Role transitions
- Account states
- Recovery rules

## Integration tests

Cover:

- Authentication providers
- Database
- Session storage
- OTP provider
- Notification system
- RBAC
- Organization membership

## Security tests

Cover:

- Broken access control
- IDOR/resource enumeration
- Session fixation
- Token replay
- Rate-limit bypass
- OTP brute force
- Privilege escalation
- Cross-organization access

## End-to-end tests

Example:

```text
Create buyer account
    ->
Verify identity
    ->
Create business profile
    ->
Complete required verification
    ->
Login
    ->
Create order
```

Supplier:

```text
Create supplier account
    ->
Submit documents
    ->
Verification
    ->
Organization activation
    ->
Invite staff
    ->
Staff login
    ->
Access only permitted supplier resources
```

---

# 53. Acceptance Criteria

The identity platform is production-ready when:

- Buyer accounts can register and authenticate.
- Supplier accounts can register and authenticate.
- Admin accounts use stronger authentication controls.
- OTP flows are rate-limited and one-time.
- Sessions can be revoked.
- Organization membership is supported.
- Role-based access is enforced server-side.
- Buyer data is isolated.
- Supplier data is isolated.
- Business verification states are supported.
- Verification documents are securely stored.
- Account recovery is controlled.
- Security events are audited.
- Sensitive authentication values are never logged.
- High-risk account changes require appropriate verification.
- Authentication APIs are protected against abuse.
- Automated security tests cover authorization boundaries.

---

# 54. Implementation Sequence

## Phase 1 — Identity Foundation

1. User model
2. Organization model
3. Membership model
4. Authentication
5. Session management
6. OTP
7. Basic account states

## Phase 2 — Authorization

8. Roles
9. Permissions
10. Organization isolation
11. Resource authorization
12. Invitation system

## Phase 3 — Verification

13. Buyer onboarding
14. Supplier onboarding
15. Verification documents
16. Review integration
17. Account activation

## Phase 4 — Security

18. MFA
19. Device/session management
20. Security notifications
21. Recovery
22. Risk controls
23. Advanced audit events

## Phase 5 — Advanced Identity

24. Passkeys
25. SSO for enterprise/admin use
26. Advanced organization administration
27. Ownership transfer workflow

---

# 55. Recommended Initial Authentication Strategy

For the first production version, Bezzo should keep the identity architecture simple and robust:

```text
User Identity
     |
Phone / Email Verification
     |
Secure Session
     |
Organization Membership
     |
RBAC
     |
Business Verification
```

The architecture should remain authentication-provider agnostic so that passkeys, enterprise SSO, or additional identity providers can be added later without redesigning marketplace ownership and authorization.

---

# 56. Final Security Boundary

The most important rule is:

```text
UI visibility != authorization
```

Hiding a button in the web or mobile application does not prevent unauthorized access.

Every protected operation must independently validate:

```text
Who is the user?
        |
What organization are they acting for?
        |
What role do they have?
        |
What permission do they have?
        |
Does this resource belong to their authorized scope?
        |
Is the requested state transition permitted?
```

This identity foundation becomes the security boundary for the entire Bezzo marketplace.

---

# 57. Document Status

**Version:** 1.0  
**Status:** Draft for implementation  
**Product:** Bezzo  
**Primary scope:** Identity, authentication, authorization foundations, onboarding, verification, and user accounts

This specification should be implemented together with the Bezzo PRD, TRD, architecture, database, implementation, API, UI/UX, security/compliance, DevOps, QA, catalog/pharma data, order/fulfillment, payment/billing, logistics, notification, admin/backoffice, analytics/reporting, and customer-support specifications.

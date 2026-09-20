# Bezzo Feature Flags, Configuration Management & Remote Runtime Controls Engineering Specification v1.0

## 1. Purpose

This document defines the production configuration-control system for Bezzo.

It covers:
- application configuration
- environment configuration
- feature flags
- remote runtime controls
- rollout and rollback
- configuration validation
- secret boundaries
- tenant-aware controls
- emergency controls
- auditability
- change management
- caching
- consistency
- observability
- testing
- implementation structure

The objective is to allow Bezzo to change behavior safely without requiring a full application release for every operational adjustment.

---

## 2. Core Principles

1. Configuration must be explicit.
2. Secrets are never treated as ordinary configuration.
3. Production changes are auditable.
4. Defaults must be safe.
5. Every remotely controlled value has an owner.
6. Feature flags must have expiry/cleanup ownership.
7. Runtime controls must not bypass security or compliance.
8. Critical transactional rules remain server-authoritative.
9. Configuration changes must be versioned.
10. Rollback must be possible.

---

## 3. Configuration Classes

Bezzo should distinguish:

```text
Build-time configuration
Environment configuration
Runtime configuration
Feature flags
Business configuration
Operational controls
Secrets
```

### Build-time

Examples:
- frontend build options
- compiled feature capabilities
- static application metadata

### Environment

Examples:
- API base URL
- service endpoints
- environment name
- logging level

### Runtime

Examples:
- search timeout
- cache TTL
- queue worker limits
- pagination limits

### Feature flags

Examples:
- new checkout flow
- new recommendation engine
- new search ranking
- new mobile feature

### Business configuration

Examples:
- delivery slot definitions
- configurable delivery fee
- COD eligibility settings
- supplier commission configuration where permitted

### Operational controls

Examples:
- temporarily pause a provider
- disable a non-critical feature
- reduce traffic to a subsystem

### Secrets

Examples:
- database credentials
- payment gateway secrets
- Porter credentials
- signing keys

Secrets require a dedicated secret-management system.

---

## 4. Configuration Architecture

```text
Admin / Engineering
        |
        v
Configuration Control Plane
        |
        +-------------------+
        |                   |
        v                   v
 Config Store          Audit Log
        |
        v
Configuration API
        |
        v
Bezzo Services
        |
        +----> Web
        +----> Mobile
        +----> Workers
        +----> Admin
```

Application services consume validated configuration rather than arbitrary client-provided values.

---

## 5. Configuration Ownership

Every configuration key should have:

```text
key
description
owner
type
default
environment scope
allowed range
sensitivity
change policy
validation rule
created_at
updated_at
```

Example:

```text
search.max_page_size
type: integer
default: 50
min: 1
max: 100
owner: Search Engineering
```

---

## 6. Strongly Typed Configuration

Configuration must be schema validated.

Avoid unrestricted JSON configuration where typed values are possible.

Supported types may include:

```text
string
integer
decimal
boolean
duration
enum
JSON object
JSON array
```

Configuration loaders should reject invalid values at startup or publish time.

---

## 7. Safe Defaults

Every configurable value must have a safe default where possible.

Examples:

```text
feature disabled
maximum bounded
timeout bounded
retry bounded
public exposure disabled
```

For security-sensitive configuration, fail closed where practical.

---

## 8. Environment Separation

Configuration should be isolated by:

```text
development
staging
production
```

Production values must never be accidentally loaded by development systems.

Production configuration changes require explicit environment targeting.

---

## 9. Feature Flag Model

Conceptual feature flag:

```text
flag_id
key
description
status
default_value
environment
rollout_strategy
owner
created_at
updated_at
expires_at
```

Supported statuses:

```text
OFF
ON
ROLLOUT
PAUSED
ARCHIVED
```

---

## 10. Feature Flag Types

### Release flags

Control incomplete/new functionality.

### Experiment flags

Control controlled product experiments.

### Operational flags

Temporarily enable/disable functionality.

### Permission flags

Control access to specific capabilities.

Permission flags must not replace the main authorization system.

### Kill switches

Emergency-disable non-critical functionality.

Kill switches require strong authorization and audit logging.

---

## 11. Flag Evaluation

Conceptual evaluation:

```text
Request
  |
  v
Identify environment
  |
  v
Identify authenticated context
  |
  v
Load flag
  |
  v
Evaluate targeting rules
  |
  v
Return value
```

Flag evaluation must be deterministic.

---

## 12. Targeting Dimensions

Where required, flags may target:

- environment
- application platform
- application version
- buyer segment
- supplier segment
- internal staff
- percentage rollout
- geography where explicitly supported

Avoid targeting using sensitive personal characteristics unless legally reviewed and genuinely required.

---

## 13. Percentage Rollout

Percentage rollout should use deterministic hashing.

Conceptually:

```text
hash(subject_id + flag_key)
        |
        v
stable bucket
        |
        v
rollout percentage
```

This prevents users from randomly switching between variants.

---

## 14. Platform Targeting

Flags may target:

```text
WEB
ANDROID
IOS
ADMIN
```

This is useful for staged releases.

Example:

```text
new_checkout_flow:
WEB = 100%
ANDROID = 25%
IOS = 25%
```

The exact rollout is operational configuration, not application code.

---

## 15. Version Targeting

Flags may target application versions:

```text
Android >= 5.2
iOS >= 5.2
Web >= release-X
```

Old clients should receive safe behavior.

Never assume every mobile user upgrades immediately.

---

## 16. Tenant/Supplier Targeting

Supplier-specific feature rollout can be supported.

Example:

```text
flag = erp_inventory_sync_v2
supplier_scope = selected suppliers
```

Tenant targeting must be evaluated server-side.

A client must not be able to claim membership in a target group.

---

## 17. Buyer Targeting

Buyer-specific or buyer-segment flags may be used for product experiments.

The system must not expose internal segmentation rules unnecessarily.

Buyer data must remain isolated.

---

## 18. Business Configuration

Business configuration is distinct from feature flags.

Examples:

```text
delivery.instant.enabled
delivery.instant.fee
delivery.scheduled.enabled
delivery.scheduled.slots
cod.enabled
search.max_page_size
```

Business configuration should have:
- validation
- effective date
- owner
- audit trail
- rollback

---

## 19. Pharmaceutical/Compliance Controls

Runtime configuration must not be used to casually bypass pharmaceutical compliance.

Examples of controls that require governed ownership:

- restricted-product availability
- prescription handling
- supplier eligibility
- state-specific marketplace rules
- recall controls
- expiry controls
- storage/cold-chain rules

A configuration change affecting regulatory behavior should require appropriate review and audit.

---

## 20. Secrets Boundary

Never store secrets in:
- feature-flag values
- ordinary configuration tables
- mobile application bundles
- frontend environment variables exposed to browsers
- source control

Use a secret manager for:
- database credentials
- API secrets
- payment credentials
- Porter credentials
- signing keys
- encryption keys

Applications receive only the secrets required for their role.

---

## 21. Configuration Store

The configuration store can initially use PostgreSQL.

Conceptual tables:

```text
configuration_keys
configuration_values
feature_flags
feature_flag_rules
configuration_change_log
```

For high-read configuration, Redis can provide a cache.

PostgreSQL remains authoritative.

---

## 22. Configuration Versioning

Each change should create a new version:

```text
key
version
value
changed_by
changed_at
reason
```

Never silently overwrite history for production configuration.

---

## 23. Configuration Publishing

Recommended lifecycle:

```text
Draft
  ->
Validate
  ->
Review
  ->
Publish
  ->
Propagate
  ->
Monitor
```

High-risk production configuration may require approval from an authorized second operator.

---

## 24. Effective Dates

Business configuration may support:

```text
effective_from
effective_until
```

Useful for:
- scheduled delivery slots
- temporary promotions configuration
- planned provider maintenance
- seasonal marketplace controls

Avoid overlapping active configurations unless precedence is explicitly defined.

---

## 25. Configuration Precedence

Recommended precedence:

```text
Safe application default
        <
Environment configuration
        <
Runtime configuration
        <
Approved targeted override
```

Secrets are outside this hierarchy.

Precedence must be deterministic and documented.

---

## 26. Runtime Configuration API

Administrative endpoints may include:

```http
GET  /api/v1/admin/configuration
POST /api/v1/admin/configuration/validate
POST /api/v1/admin/configuration/publish
POST /api/v1/admin/configuration/rollback
GET  /api/v1/admin/feature-flags
POST /api/v1/admin/feature-flags
```

Exact paths remain governed by the API specification.

---

## 27. Client Configuration

Web/mobile clients may receive safe public configuration such as:

```text
feature availability
minimum supported version
public API metadata
UI configuration
```

Do not send:
- secrets
- internal infrastructure endpoints
- private operational configuration
- security-sensitive rules

Server-side enforcement remains authoritative.

---

## 28. Configuration Propagation

Services can receive changes through:

### Pull

Periodic refresh.

### Push

Event-driven update.

### Hybrid

Startup load plus periodic refresh and event-triggered invalidation.

Recommended initial strategy:

```text
PostgreSQL
   |
   v
Configuration event
   |
   v
Redis invalidation
   |
   v
Service refresh
```

---

## 29. Cache Consistency

Configuration cache should include:

```text
key
version
value
expires_at
```

A service must detect stale versions where possible.

Critical configuration should use shorter refresh windows or explicit invalidation.

---

## 30. Emergency Kill Switches

Kill switches may disable:
- non-critical recommendation surfaces
- experimental UI
- optional integrations
- expensive background processing
- selected external providers

They must not be used to bypass:
- authorization
- payment integrity
- audit requirements
- mandatory compliance controls

Emergency changes must be logged.

---

## 31. External Provider Controls

Runtime controls may support provider state:

```text
ACTIVE
DEGRADED
PAUSED
DISABLED
```

Examples:
- payment provider
- Porter integration
- SMS provider
- email provider
- ERP connector

Provider changes should trigger appropriate fallback behavior.

---

## 32. Provider Failover

Where multiple providers exist:

```text
Primary
   |
   X
   |
Fallback
```

Provider selection should be configuration-driven but constrained by integration capabilities and business policy.

Payment provider failover must preserve idempotency and payment-state correctness.

---

## 33. Rollout Safety

Recommended rollout:

```text
0%
 ->
1%
 ->
5%
 ->
10%
 ->
25%
 ->
50%
 ->
100%
```

Actual stages are configurable.

Advance only after observing:
- error rate
- latency
- conversion
- business metrics
- security signals

---

## 34. Rollback

Rollback must be fast.

For a feature flag:

```text
ON -> OFF
```

For configuration:

```text
version N -> version N-1
```

Rollback should preserve audit history.

---

## 35. Flag Lifecycle

Every flag must have:

```text
owner
created_at
expiry/review date
purpose
cleanup plan
```

Temporary release flags should be removed after stabilization.

Flag debt should be tracked like technical debt.

---

## 36. Configuration Validation

Validation should cover:

- data type
- allowed range
- enum values
- cross-field dependencies
- environment compatibility
- security constraints
- business constraints

Example:

```text
delivery.instant.fee >= 0
```

and:

```text
scheduled_slot.start < scheduled_slot.end
```

---

## 37. Cross-Configuration Validation

Some values must be validated together.

Example:

```text
delivery.scheduled.enabled = true
```

requires at least one valid delivery slot.

Another example:

```text
cod.enabled = true
```

requires COD eligibility configuration to exist.

Configuration publishing should reject invalid combinations.

---

## 38. Configuration Dependency Graph

For complex configuration:

```text
Feature A
  |
  +--> Config B
  |
  +--> Provider C
```

Dependencies should be declared or validated in application code.

Do not allow a flag to activate a feature that has missing required infrastructure.

---

## 39. Audit Logging

Every production change should record:

```text
change_id
actor_id
action
configuration_key
old_version
new_version
reason
timestamp
request_id
approval_id where applicable
```

Audit records should be append-only.

---

## 40. Authorization

Configuration management requires privileged roles.

Example:

```text
VIEW_CONFIG
EDIT_CONFIG
PUBLISH_CONFIG
ROLLBACK_CONFIG
MANAGE_FLAGS
MANAGE_SECURITY_CONTROLS
```

Separate highly sensitive configuration permissions from ordinary admin access.

---

## 41. Two-Person Approval

High-risk changes may require two-person approval.

Examples:
- payment configuration
- security configuration
- regulatory availability controls
- global marketplace shutdown
- major pricing/commission configuration

The exact approval matrix is governed by Bezzo operations/security policy.

---

## 42. Observability

Track:

### Configuration
- change count
- failed validation
- propagation latency
- stale configuration instances

### Flags
- evaluation count
- enabled percentage
- rollout state
- fallback evaluations

### Operations
- emergency overrides
- rollback count
- configuration incidents

---

## 43. Configuration Health

Services should expose non-sensitive health information such as:

```text
config_version
last_config_refresh
config_source
config_refresh_status
```

Do not expose secret values.

---

## 44. Startup Behavior

At startup:

```text
Load defaults
  ->
Load environment config
  ->
Load runtime configuration
  ->
Validate
  ->
Start service
```

For critical configuration, fail startup if required values are invalid or missing.

For optional configuration, use documented safe defaults.

---

## 45. Runtime Refresh Failure

If configuration refresh fails:

1. keep last known valid configuration
2. record failure
3. emit metric/log
4. retry with backoff
5. alert if stale beyond threshold

Do not replace valid configuration with an empty/invalid configuration.

---

## 46. Configuration Security

Protect against:
- unauthorized modification
- configuration injection
- privilege escalation
- malicious flag targeting
- cache poisoning
- stale authorization configuration

Configuration values must be validated before publication.

---

## 47. Testing

### Unit
- schema validation
- flag evaluation
- percentage rollout
- precedence
- defaults

### Integration
- configuration store
- Redis propagation
- service refresh
- admin APIs

### Security
- role enforcement
- tenant isolation
- secret exclusion
- audit integrity

### Operational
- rollout
- rollback
- provider pause
- stale config recovery

---

## 48. Frontend Implementation

Recommended shared package:

```text
packages/config/
  public-config.ts
  feature-flags.ts
  config-types.ts
```

Frontend should only consume safe public configuration.

Do not embed private runtime controls in client bundles.

---

## 49. Backend Implementation

Recommended module:

```text
src/modules/configuration/
  application/
    configuration.service.ts
    feature-flag.service.ts
    rollout.service.ts
    configuration-publish.service.ts
  domain/
    configuration-key.ts
    feature-flag.ts
    rollout-policy.ts
  infrastructure/
    configuration.repository.ts
    configuration-cache.ts
    configuration-events.ts
  dto/
  tests/
```

---

## 50. Admin UI

Admin configuration UI should provide:

- search
- filtering
- current value
- environment
- owner
- version
- last modified
- change reason
- publish action
- rollback
- audit history

High-risk controls should have explicit warnings and approval workflow.

---

## 51. Feature Flag UI

Show:

```text
Flag
Purpose
Owner
Environment
Current state
Rollout %
Target scope
Created
Expiry/review
Last changed
```

Provide:
- enable
- disable
- rollout
- pause
- archive
- audit history

---

## 52. Configuration Documentation

Each key should have documentation:

```text
Name
Purpose
Type
Default
Allowed range
Owner
Impact
Dependencies
Rollback behavior
```

Undocumented production configuration should be considered configuration debt.

---

## 53. Cost Controls

Feature flags can control expensive optional systems, such as:
- advanced analytics
- large recommendation jobs
- expensive report generation
- optional integrations

However, cost controls must not silently disable required operational, security or compliance workloads.

---

## 54. Disaster Recovery

Configuration data is operationally important.

Back up:
- configuration tables
- feature flags
- rollout rules
- audit records

Configuration should be included in database recovery procedures.

Infrastructure-as-code should contain infrastructure defaults, while runtime business configuration remains in the configuration system.

---

## 55. Disaster Scenario

If the configuration control plane fails:

```text
Existing services
      |
      v
Last known valid configuration
      |
      v
Continue safely
```

New configuration changes should be blocked until the control plane is restored.

Do not allow uncontrolled configuration mutation during an outage.

---

## 56. Configuration Change Workflow

```text
Operator
   |
   v
Create change
   |
   v
Schema validation
   |
   v
Dependency validation
   |
   v
Approval if required
   |
   v
Publish
   |
   v
Propagate
   |
   v
Observe
   |
   +----> rollback if required
```

---

## 57. Definition of Done

Complete when:

- configuration schemas exist
- environment separation works
- PostgreSQL-backed configuration store works
- Redis caching/invalidation works
- feature flags work
- percentage rollout is deterministic
- platform/version targeting works
- tenant targeting is server-side
- business configuration is typed and validated
- secrets are separated
- production changes are audited
- rollback works
- emergency kill switches work for approved non-critical controls
- provider controls work
- configuration refresh failure is safe
- stale configuration is observable
- admin UI exists
- role permissions are enforced
- high-risk approval workflow exists where required
- configuration backup/recovery works
- tests pass
- operational documentation exists

---

## 58. Final Architecture

```text
                  ADMIN / ENGINEERING
                          |
                          v
               Configuration Control Plane
                  /        |                         v         v         v
           Config DB    Audit Log   Validation
                 |
                 v
             Redis Cache
                 |
          Config Events
                 |
       +---------+---------+
       |         |         |
       v         v         v
      API      Workers    Admin
       |
       v
 Web / Mobile Safe Public Config
```

**Core rule: runtime configuration can change application behavior safely, but it can never bypass Bezzo's authoritative security, transactional, pharmaceutical, or compliance controls.**

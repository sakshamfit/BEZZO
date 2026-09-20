# Bezzo Feature Flags, Runtime Configuration & Safe Rollout Engineering Specification v1.0

**Product:** Bezzo  
**Document Type:** Engineering Specification  
**Version:** 1.0  
**Status:** Draft for Implementation  
**Scope:** Feature flags, runtime configuration, controlled releases, experimentation, emergency controls, and safe rollout

---

## 1. Purpose

This specification defines the engineering architecture and operating model for feature flags and runtime configuration in Bezzo.

The system must allow Bezzo engineering and operations teams to:

- release code independently from feature exposure;
- enable or disable functionality without redeploying;
- target features to specific environments, users, suppliers, buyers, or cohorts;
- perform percentage and staged rollouts;
- run controlled experiments;
- protect production with kill switches;
- support mobile clients with remote configuration and capability gating;
- audit every configuration change;
- validate configuration before activation;
- roll back unsafe configuration changes quickly;
- prevent stale flags and permanent configuration debt.

Feature flags are a controlled runtime mechanism, not a substitute for sound architecture, testing, authorization, or deployment discipline.

---

## 2. Design Goals

### 2.1 Primary goals

1. Safe production change control.
2. Deterministic targeting.
3. Fast emergency disablement.
4. Strong auditability.
5. Environment isolation.
6. Mobile compatibility.
7. Minimal request-path latency.
8. Clear ownership and lifecycle management.
9. Secure administrative access.
10. Rollback without requiring a full deployment where technically safe.

### 2.2 Non-goals

This system does not replace:

- authentication;
- authorization;
- database migrations;
- secrets management;
- application monitoring;
- CI/CD;
- regulatory controls;
- payment-provider controls;
- supplier verification;
- pharmaceutical compliance enforcement.

---

## 3. Core Principles

### 3.1 Default safe

Every flag must have an explicit default behavior.

For critical functions, failure to retrieve flag state must result in the safer behavior.

### 3.2 Fail closed where risk requires it

Security-sensitive, regulated, payment, or operationally dangerous features should default to disabled when configuration cannot be trusted.

### 3.3 Fail open where availability requires it

Non-critical presentation or convenience features may default to the established stable behavior.

The choice must be documented per flag.

### 3.4 Deterministic evaluation

Percentage rollouts must produce stable cohorts. A user should not randomly move between enabled and disabled states between requests.

### 3.5 Configuration is data

Runtime configuration must be versioned, validated, audited, and observable.

### 3.6 Secrets are not feature flags

Passwords, API keys, private keys, gateway secrets, database credentials, and encryption keys must never be stored as ordinary runtime configuration values.

Secrets belong in the dedicated secrets-management system.

### 3.7 Code remains authoritative for safety

A flag must never allow an operator to bypass mandatory authorization, pharmaceutical compliance, payment integrity, or database integrity checks.

---

# 4. Feature Flag Architecture

## 4.1 Logical architecture

```text
                    Admin / Operations
                           |
                           v
                 Configuration Control Plane
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
      Flag Store       Config Store      Audit Log
          |                |                |
          +----------------+----------------+
                           |
                     Cache / Redis
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
          API/Web       Workers       Mobile Config
             |
             v
        Flag Evaluation SDK
             |
             v
      Application behavior
```

The control plane is responsible for managing configuration.

The application data plane is responsible for evaluating configuration efficiently.

---

# 5. Flag Types

Bezzo should support explicit flag types.

## 5.1 Release flags

Used to hide incomplete functionality behind deployed code.

Examples:

- `buyer_new_checkout`
- `supplier_bulk_upload_v2`
- `order_tracking_v2`

Lifecycle:

```text
OFF -> INTERNAL -> CANARY -> PARTIAL -> ON
```

## 5.2 Experiment flags

Used for controlled A/B or multivariate experiments.

Examples:

- search ranking experiment;
- checkout layout experiment;
- supplier discovery presentation experiment.

Experiment flags must include experiment metadata and measurement requirements.

## 5.3 Operational flags

Used to control behavior during incidents.

Examples:

- `disable_recommendations`
- `disable_bulk_import`
- `reduce_search_refresh`
- `pause_noncritical_notifications`

## 5.4 Permission flags

Used to expose functionality to an authorized group.

They must not replace actual authorization.

Example:

```text
feature_flag == enabled
AND
user_permission == required_permission
```

Both conditions must pass.

## 5.5 Kill switches

Used to immediately disable functionality.

Examples:

- payment method;
- promotion engine;
- external logistics integration;
- recommendation service;
- high-cost background process.

Kill switches must be extremely simple and fast to evaluate.

---

# 6. Naming Standards

Use lowercase snake_case.

Examples:

```text
buyer_new_checkout
supplier_bulk_upload_v2
porter_scheduled_delivery
recommendation_home_v2
payment_cod
search_new_ranking
```

Do not use ambiguous names such as:

```text
test1
new_feature
flag_temp
enable_it
abc
```

A flag name should describe the capability controlled by the flag.

---

# 7. Flag Metadata

Each flag should contain at least:

```text
id
key
description
type
owner
team
status
environment
default_value
evaluation_mode
targeting_rules
rollout_percentage
created_at
updated_at
expires_at
version
change_reason
last_reviewed_at
```

Optional fields:

```text
jira_ticket
experiment_id
parent_flag
dependency_flags
risk_level
rollback_plan
regulatory_classification
```

---

# 8. Targeting

Targeting must support multiple dimensions.

## 8.1 User targeting

Examples:

```text
user_id
account_id
role
region
app_version
platform
```

## 8.2 Supplier targeting

Supplier-specific rollout can use:

```text
supplier_id
supplier_type
verification_status
warehouse_region
integration_type
```

## 8.3 Buyer targeting

Buyer targeting can use:

```text
buyer_id
business_type
region
account_age
activity_segment
```

## 8.4 Environment targeting

Supported environments:

```text
local
development
test
staging
production
```

Production values must never leak into non-production systems.

---

# 9. Targeting Rule Model

A rule should support logical operators.

Example:

```text
IF
    environment == production
AND supplier_id IN [supplier_a, supplier_b]
THEN enabled
```

More complex example:

```text
IF
    role == BUYER
AND app_version >= 5.2.0
AND region IN ["UP", "Delhi"]
AND rollout_bucket < 20
THEN enabled
```

Rule evaluation order must be deterministic.

Recommended precedence:

1. explicit emergency override;
2. explicit user/account override;
3. regulatory/safety constraint;
4. environment rule;
5. segment rule;
6. percentage rollout;
7. default value.

The exact precedence must be stored as part of the platform contract.

---

# 10. Percentage Rollouts

Percentage rollout must use deterministic hashing.

Example conceptual algorithm:

```text
bucket = hash(flag_key + stable_subject_id) % 10000
enabled = bucket < rollout_percentage * 100
```

A stable subject identifier should be used.

For buyer-facing features:

```text
stable_subject_id = buyer_account_id
```

For supplier-facing features:

```text
stable_subject_id = supplier_id
```

For user-level experiments:

```text
stable_subject_id = user_id
```

Do not use request IDs, timestamps, random numbers, or session IDs for cohort assignment.

---

# 11. Cohort Stability

Once a user enters an experiment cohort, the assignment must remain stable for the experiment period unless the experiment explicitly changes allocation.

Example:

```text
10% rollout
```

A user who is selected should remain selected across:

- web sessions;
- mobile sessions;
- API requests;
- device changes;
- application restarts.

---

# 12. Server-Side vs Client-Side Evaluation

## 12.1 Server-side evaluation

Preferred for:

- authorization-sensitive behavior;
- payment behavior;
- pricing;
- supplier eligibility;
- pharmaceutical restrictions;
- order fulfillment;
- fraud controls.

The server remains authoritative.

## 12.2 Client-side evaluation

Suitable for:

- visual presentation;
- navigation;
- UI experiments;
- non-sensitive feature presentation.

Never expose sensitive targeting rules or confidential business logic to clients.

## 12.3 Hybrid model

The recommended model for Bezzo is hybrid:

```text
Server:
authoritative business behavior

Client:
presentation and UX behavior
```

The client must not be able to force a server-disabled capability.

---

# 13. Runtime Configuration

Runtime configuration is broader than feature flags.

Examples:

```text
maximum_cart_items
search_page_size
scheduled_delivery_slot_duration
notification_retry_count
porter_request_timeout_ms
payment_timeout_seconds
maximum_upload_size_mb
```

Configuration values must have schemas and types.

---

# 14. Static vs Dynamic Configuration

## 14.1 Static configuration

Loaded during application startup.

Examples:

- database connection configuration;
- service endpoint defaults;
- infrastructure-level settings.

Changes normally require deployment/restart.

## 14.2 Dynamic configuration

Can be changed at runtime.

Examples:

- operational limits;
- feature flags;
- rollout percentage;
- notification throttles;
- configurable marketplace behavior.

Dynamic configuration requires:

- validation;
- authorization;
- audit trail;
- versioning;
- propagation handling;
- rollback.

---

# 15. Configuration Registry

A central registry should define each configuration item.

Example:

```text
key: porter_request_timeout_ms
type: integer
minimum: 100
maximum: 30000
default: 5000
dynamic: true
owner: logistics
risk: medium
```

The registry should reject unknown or invalid values.

---

# 16. Configuration Precedence

Recommended precedence:

```text
hard-coded safety constraint
        >
environment configuration
        >
tenant/account configuration
        >
runtime configuration
        >
feature flag targeting
        >
default
```

However, security and regulatory constraints must always remain authoritative.

A configuration value must never override an invariant implemented in code.

---

# 17. Configuration Validation

Validation must occur before activation.

Example:

```text
minimum_order_value:
type = integer
minimum = 0
maximum = 10000000
```

Invalid:

```text
minimum_order_value = -100
```

The configuration service must reject the change before it becomes active.

---

# 18. Configuration Versioning

Every change creates a new immutable version.

Example:

```text
version 41
version 42
version 43
```

A configuration record should include:

```text
version
created_by
created_at
reason
previous_version
change_set
```

Rollback should activate a previous known-good version rather than mutating historical records.

---

# 19. Audit Trail

Every configuration change must record:

```text
actor
timestamp
IP/device context where appropriate
old value
new value
reason
approval information
environment
affected flags
change request/ticket
```

Sensitive values must not be written to logs.

---

# 20. Approvals

High-risk production changes should require approval.

Suggested categories:

### Low risk

Single operator may change.

### Medium risk

Operator + owner approval.

### High risk

Operator + designated technical/business approval.

### Critical

Emergency override with mandatory post-incident review.

Examples of high-risk changes:

- payment behavior;
- COD eligibility;
- pharmaceutical restriction;
- order-routing logic;
- supplier eligibility;
- customer-visible pricing behavior.

---

# 21. Staged Rollout

Recommended production rollout:

```text
0%
 |
 v
internal users
 |
 v
1%
 |
 v
5%
 |
 v
10%
 |
 v
25%
 |
 v
50%
 |
 v
100%
```

Each stage should have a monitoring period.

Promotion criteria should include:

- error rate;
- latency;
- conversion or completion rate;
- payment failures;
- order failures;
- support incidents;
- infrastructure load;
- business-specific guardrails.

---

# 22. Canary Releases

Canary rollout should expose a new behavior to a controlled cohort.

Possible canary cohorts:

- internal employees;
- test supplier accounts;
- test buyer accounts;
- selected production suppliers;
- selected geographic regions.

Canary cohorts must be explicitly identified and auditable.

---

# 23. Kill Switches

Every high-risk external dependency should have an emergency control where practical.

Examples:

```text
porter_enabled
payment_gateway_enabled
cod_enabled
recommendations_enabled
bulk_supplier_import_enabled
promotions_enabled
```

Kill switches should:

- evaluate quickly;
- have explicit safe defaults;
- be independently auditable;
- support emergency changes;
- avoid requiring application redeployment.

---

# 24. Emergency Disablement

Emergency sequence:

```text
incident detected
      |
      v
identify affected feature
      |
      v
activate kill switch
      |
      v
verify propagation
      |
      v
monitor recovery
      |
      v
investigate root cause
      |
      v
restore gradually
```

Emergency controls should not silently modify source code or database business records.

---

# 25. Dependency Flags

Some features depend on other features.

Example:

```text
new_checkout
    |
    +--> new_payment_flow
    |
    +--> new_order_confirmation
```

The evaluation system must prevent invalid combinations.

A feature should not become active if a mandatory dependency is disabled.

---

# 26. Flag Lifecycle

Recommended lifecycle:

```text
PROPOSED
  |
  v
CREATED
  |
  v
TESTING
  |
  v
CANARY
  |
  v
ROLLOUT
  |
  v
ACTIVE
  |
  v
DEPRECATION
  |
  v
REMOVED
```

Temporary release flags must have an expected removal date.

---

# 27. Stale Flag Detection

A scheduled job should identify:

- expired flags;
- flags at 100% for a long period;
- flags at 0% for a long period;
- unused flags;
- flags with no recent owner review;
- flags whose code references no longer exist.

Example policy:

```text
ACTIVE > 90 days
```

creates a review task unless explicitly exempted.

---

# 28. Flag Cleanup

When a feature is permanently active:

1. remove the old conditional branch;
2. remove targeting rules;
3. remove flag evaluation code;
4. remove tests specific to the obsolete branch;
5. remove configuration records;
6. update documentation;
7. record cleanup in audit history.

Do not allow feature flags to become permanent architecture.

---

# 29. Experiment Framework

Experiments must define:

```text
experiment_id
hypothesis
owner
start_time
end_time
control
variants
allocation
primary_metric
secondary_metrics
guardrail_metrics
minimum_sample_requirement
```

Experiments must not be used for legally required behavior.

---

# 30. A/B Testing Guardrails

The experiment system must prevent:

- overlapping incompatible experiments;
- accidental exposure of regulated functionality;
- PII leakage;
- unstable cohort assignment;
- changes to allocation without audit;
- misleading metric interpretation caused by partial traffic.

Primary and guardrail metrics must be defined before launch.

---

# 31. Mobile Remote Configuration

Mobile applications cannot assume that every installed client is current.

The remote configuration system should support:

```text
minimum_supported_app_version
recommended_app_version
feature_capabilities
rollout_state
maintenance_mode
```

Example:

```text
Android 5.2.0 -> supported
Android 5.1.x -> limited
Android < 5.0 -> upgrade required
```

Exact versions are configuration examples only.

---

# 32. Capability Gating

The server should distinguish between:

```text
client_version
client_capabilities
server_capabilities
```

A mobile client should not be given a feature it cannot safely render or process.

Example:

```text
client supports checkout_v2 = false
server feature enabled = true

=> continue using compatible checkout path
```

---

# 33. Configuration Propagation

Dynamic configuration may be distributed through:

```text
database
   |
configuration service
   |
Redis/cache
   |
application instances
```

Applications should not query the primary database for every request.

Recommended approach:

- cache active configuration;
- invalidate/update cache after changes;
- use short bounded refresh intervals as a safety net.

---

# 34. Propagation Latency

Every dynamic flag must have a documented expected propagation time.

Example:

```text
normal target: < 30 seconds
emergency kill switch: as close to immediate as architecture permits
```

The exact SLA must be measured in production rather than assumed.

---

# 35. Consistency Model

Configuration may be eventually consistent across application instances.

For critical kill switches, stronger propagation guarantees should be used.

The system must expose:

```text
configuration_version
instance_version
last_refresh_time
```

This makes stale configuration observable.

---

# 36. Startup Behavior

At application startup:

1. load known-good configuration;
2. validate schema;
3. establish cache;
4. fetch current active configuration;
5. verify configuration version;
6. start serving traffic.

If configuration cannot be loaded:

- use the documented safe snapshot/default;
- emit a high-priority operational signal;
- do not silently continue indefinitely.

---

# 37. Hot Reload Safety

Hot configuration reload must be atomic.

Bad:

```text
update timeout
update retry count
update queue size
```

where different instances may observe partially updated state.

Preferred:

```text
configuration version 51
    |
atomic activation
    |
all values become active together
```

---

# 38. Rollback

Rollback should support:

```text
current v43
    |
rollback
    v
known-good v41
```

Rollback must itself be audited.

If a configuration change modified external business behavior, configuration rollback does not automatically reverse already-created business records.

---

# 39. Runtime Configuration Storage

A relational store is recommended for the authoritative control plane.

Conceptual tables:

```text
feature_flags
feature_flag_rules
feature_flag_versions
runtime_configs
runtime_config_versions
configuration_approvals
configuration_audit_log
experiments
experiment_variants
```

Redis may be used as a low-latency distribution/cache layer.

---

# 40. API Design

Administrative APIs should be separated from public marketplace APIs.

Examples:

```http
GET    /admin/config/flags
POST   /admin/config/flags
PATCH  /admin/config/flags/{flagKey}
POST   /admin/config/flags/{flagKey}/activate
POST   /admin/config/flags/{flagKey}/rollback
POST   /admin/config/flags/{flagKey}/kill
GET    /admin/config/flags/{flagKey}/history

GET    /admin/config/runtime
PATCH  /admin/config/runtime/{key}
GET    /admin/config/runtime/{key}/history
```

All administrative endpoints require strong authentication and RBAC.

---

# 41. Internal Evaluation API

Application modules should use a typed internal abstraction.

Example:

```ts
flags.isEnabled("buyer_new_checkout", {
  userId,
  buyerId,
  platform,
  appVersion,
});
```

Configuration:

```ts
config.getNumber("porter_request_timeout_ms");
```

Business modules should not directly access the database or Redis to evaluate flags.

---

# 42. Evaluation Context

A standard evaluation context should include only required data.

Example:

```ts
interface FlagEvaluationContext {
  userId?: string;
  buyerId?: string;
  supplierId?: string;
  role?: "BUYER" | "SUPPLIER" | "ADMIN";
  platform?: "WEB" | "ANDROID" | "IOS";
  appVersion?: string;
  region?: string;
}
```

Avoid putting unnecessary personal data into evaluation records.

---

# 43. Security and RBAC

Configuration administration should support permissions such as:

```text
CONFIG_READ
CONFIG_CREATE
CONFIG_UPDATE
CONFIG_APPROVE
CONFIG_ROLLOUT
CONFIG_ROLLBACK
CONFIG_KILL_SWITCH
CONFIG_AUDIT_READ
```

A developer who can deploy code should not automatically have unrestricted production configuration access.

---

# 44. Secrets Management

Never store:

```text
database_password
razorpay_secret
cashfree_secret
porter_api_secret
jwt_private_key
encryption_key
```

as ordinary feature flag or runtime configuration values.

Use the platform's secret manager and inject secrets securely into workloads.

---

# 45. Privacy

Feature targeting should minimize personal data.

Prefer:

```text
buyer_id
supplier_id
role
region
account_segment
```

over unnecessary personal attributes.

Do not use sensitive personal information for experimentation unless there is a documented legal and privacy basis.

---

# 46. Observability

The system must expose metrics such as:

```text
flag_evaluation_total
flag_evaluation_error_total
config_fetch_total
config_fetch_failure_total
config_refresh_latency
config_version_staleness
flag_override_total
kill_switch_activation_total
rollout_change_total
```

Business systems should correlate relevant feature state with incidents.

---

# 47. Safe Logging

Logs may include:

```text
flag_key
configuration_version
evaluation_result
environment
application_version
```

Do not log:

- passwords;
- API secrets;
- tokens;
- payment credentials;
- unnecessary PII.

---

# 48. Testing Strategy

## 48.1 Unit tests

Test:

- rule evaluation;
- precedence;
- hashing;
- percentage allocation;
- defaults;
- dependency handling;
- type validation.

## 48.2 Integration tests

Test:

- configuration store;
- Redis propagation;
- API updates;
- cache invalidation;
- rollback;
- audit trail.

## 48.3 Contract tests

Verify the configuration API schema and evaluation contracts.

## 48.4 Failure tests

Simulate:

- configuration service unavailable;
- Redis unavailable;
- stale cache;
- malformed configuration;
- partial propagation;
- invalid rollout;
- authorization failure.

---

# 49. Local Development

Local development should use deterministic local defaults.

Example:

```text
BEZZO_ENV=local
FEATURE_CONFIG_SOURCE=local
```

Developers should be able to override flags without touching shared production configuration.

---

# 50. Staging

Staging should support realistic rollout testing.

Recommended:

- test accounts;
- test suppliers;
- test payment providers;
- test logistics adapters;
- full audit behavior;
- production-like flag evaluation.

No production customer should be accidentally targeted by staging configuration.

---

# 51. Production

Production configuration must be isolated.

Required controls:

- RBAC;
- approval for high-risk changes;
- audit logs;
- version history;
- rollback;
- monitoring;
- emergency controls;
- change ownership.

---

# 52. CI/CD Integration

CI should validate:

- configuration schemas;
- known flag references;
- flag key naming;
- duplicate keys;
- invalid dependencies;
- invalid environment configuration;
- stale flag metadata;
- API contract compatibility.

Deployment pipelines should not automatically enable a newly deployed feature unless explicitly configured to do so.

---

# 53. Safe Release Pattern

Recommended:

```text
1. Merge code behind flag
2. Deploy code
3. Verify application health
4. Enable internal cohort
5. Monitor
6. Enable 1%
7. Monitor
8. Enable 5%
9. Monitor
10. Continue staged rollout
11. Reach 100%
12. Remove temporary flag
```

This separates code deployment from feature activation.

---

# 54. Database Migration Interaction

Feature flags must be compatible with database migration strategy.

Use:

```text
expand
  |
deploy compatible code
  |
backfill
  |
enable feature
  |
contract/remove old schema
```

Never activate a feature that requires a schema change before all active application versions can safely operate with the schema.

---

# 55. Rolling Deployment Compatibility

During rolling deployment:

```text
old app version
+
new app version
```

may operate simultaneously.

Therefore:

- configuration must support both versions;
- new fields must be backward compatible;
- flag activation must consider client compatibility;
- database changes must follow expand-and-contract rules.

---

# 56. Supplier-Specific Rollout

Supplier features may be enabled by:

```text
supplier_id
supplier_region
supplier_integration
supplier_verification_status
```

Example use cases:

- new inventory sync;
- ERP connector;
- supplier bulk upload;
- new fulfillment workflow.

A supplier must never receive a feature that violates its verification or compliance state.

---

# 57. Buyer-Specific Rollout

Buyer features may be targeted by:

```text
buyer_id
buyer_region
buyer_account_age
platform
app_version
```

Examples:

- new search;
- new checkout;
- new order tracking;
- new reorder experience.

---

# 58. Operational Runbooks

Each high-risk flag must have a short runbook:

```text
Purpose
Owner
When to disable
How to disable
Expected propagation time
Validation checks
Rollback procedure
Escalation contact
```

---

# 59. Incident Procedure

During an incident:

1. identify the suspected feature;
2. inspect active configuration version;
3. activate the appropriate kill switch;
4. verify propagation;
5. compare metrics before/after;
6. stabilize the system;
7. preserve audit evidence;
8. investigate root cause;
9. restore gradually;
10. remove or correct the offending feature.

---

# 60. Disaster Recovery

Configuration state must be backed up.

Recovery must preserve:

- active configuration;
- historical versions;
- audit records;
- flag ownership;
- experiment definitions.

The platform must have a tested recovery procedure.

---

# 61. Failure Modes

### Configuration database unavailable

Use last known-good cached configuration where safe.

### Redis unavailable

Fall back to local cached configuration or another safe source.

### Malformed configuration

Reject activation.

### Configuration version mismatch

Do not silently assume success; emit operational telemetry.

### Targeting engine error

Use the flag's documented fail-safe default.

### Admin API unavailable

Existing configuration continues operating; changes are temporarily unavailable.

---

# 62. Performance Requirements

Flag evaluation should be inexpensive.

Target architecture:

```text
application request
      |
in-memory/cache evaluation
      |
result
```

Avoid:

```text
application request
      |
database query
      |
flag evaluation
```

for ordinary request paths.

The exact latency budget should be measured and enforced through performance tests.

---

# 63. Configuration Cache

Recommended hierarchy:

```text
L1: process memory
L2: Redis/distributed cache
L3: authoritative configuration store
```

Cache entries should include:

```text
value
version
expires_at
last_refresh
```

Emergency controls may use shorter refresh intervals or push invalidation.

---

# 64. Configuration Push

Where required, the control plane may publish:

```text
CONFIG_UPDATED
FLAG_UPDATED
KILL_SWITCH_ACTIVATED
```

Consumers refresh their local state after receiving the event.

The system must still have a periodic reconciliation mechanism in case an event is missed.

---

# 65. Admin UI

The admin UI should display:

- flag name;
- description;
- owner;
- environment;
- current state;
- rollout percentage;
- targeting rules;
- last change;
- active version;
- expiration;
- risk level;
- dependency status.

For critical controls, the UI should require confirmation before activation.

---

# 66. Change Preview

Before activation, administrators should be able to preview:

```text
current state
proposed state
affected cohorts
rollout percentage
dependencies
risk classification
```

Where technically possible, the system should show an estimated affected population without exposing unnecessary personal information.

---

# 67. Change Diff

Every configuration update should show a structured diff.

Example:

```text
rollout_percentage:
10 -> 25

enabled:
false -> true

target:
supplier_segment_a -> supplier_segment_a + supplier_segment_b
```

---

# 68. Two-Person Control

For highly sensitive controls, support an approval workflow:

```text
operator creates change
       |
       v
reviewer approves
       |
       v
activation
```

Recommended for:

- payment changes;
- regulatory controls;
- high-impact pricing behavior;
- mass customer-facing changes.

---

# 69. Flag Ownership

Every production flag must have:

```text
technical_owner
business_owner
team
review_date
```

Unowned flags are operational debt and should be treated as a governance issue.

---

# 70. Flag Inventory

Maintain a central inventory containing:

```text
key
purpose
owner
created
expires
current_state
risk
dependencies
code_references
```

This inventory should be searchable.

---

# 71. Code Reference Tracking

Where practical, CI should detect:

```text
flag defined but never referenced
flag referenced but not defined
flag defined in code but missing registry metadata
```

This reduces configuration drift.

---

# 72. Experiment Cleanup

After an experiment ends:

1. freeze experiment data;
2. document result;
3. choose the production behavior through the normal product decision process;
4. remove experiment targeting;
5. remove obsolete branches;
6. archive experiment metadata.

The experimentation system must not silently turn an experiment result into a permanent production decision.

---

# 73. Recommended Module Structure

Backend:

```text
src/modules/config/
  application/
    config.service.ts
    flag-evaluator.service.ts
    rollout.service.ts
  domain/
    feature-flag.ts
    runtime-config.ts
    config-version.ts
  infrastructure/
    config.repository.ts
    redis-config-cache.ts
    config-event-publisher.ts
  interfaces/
    admin-config.controller.ts
    config.schemas.ts
```

Shared package:

```text
packages/config-contracts/
packages/feature-flags/
```

---

# 74. Data Model Summary

Conceptual entities:

```text
FeatureFlag
FeatureFlagRule
FeatureFlagVersion
FeatureFlagOverride
RuntimeConfig
RuntimeConfigVersion
ConfigurationApproval
ConfigurationAuditEntry
Experiment
ExperimentVariant
```

Relationships:

```text
FeatureFlag
  -> Versions
  -> Rules
  -> Overrides

RuntimeConfig
  -> Versions

Experiment
  -> Variants
  -> FeatureFlag
```

---

# 75. Example Flag

```json
{
  "key": "buyer_new_checkout",
  "type": "release",
  "default": false,
  "environment": "production",
  "rolloutPercentage": 10,
  "targeting": [
    {
      "role": "BUYER",
      "platform": "WEB"
    }
  ],
  "owner": "checkout-team",
  "risk": "high"
}
```

This is an illustrative configuration shape, not a fixed public API contract.

---

# 76. Example Evaluation

```ts
const enabled = flags.isEnabled(
  "buyer_new_checkout",
  {
    buyerId,
    userId,
    role: "BUYER",
    platform: "WEB",
    appVersion,
  },
);
```

If the flag is disabled, the application must execute the stable checkout path.

---

# 77. Definition of Done

The feature flag/configuration platform is ready when:

- [ ] typed flag evaluation exists;
- [ ] deterministic percentage rollout exists;
- [ ] targeting rules are supported;
- [ ] environment isolation exists;
- [ ] configuration schema validation exists;
- [ ] configuration versions are immutable;
- [ ] rollback exists;
- [ ] audit logging exists;
- [ ] production RBAC exists;
- [ ] high-risk approval workflow exists;
- [ ] kill switches exist;
- [ ] mobile version/capability gating exists;
- [ ] cache propagation exists;
- [ ] stale configuration detection exists;
- [ ] stale flag detection exists;
- [ ] metrics and alerts exist;
- [ ] failure-mode tests exist;
- [ ] disaster recovery is documented and tested;
- [ ] operational runbooks exist.

---

# 78. Recommended Initial Implementation Order

### Phase 1

- feature flag domain model;
- runtime config model;
- typed evaluator;
- PostgreSQL storage;
- Redis cache;
- admin RBAC;
- audit log.

### Phase 2

- targeting;
- deterministic rollout;
- rollback;
- configuration versioning;
- kill switches.

### Phase 3

- mobile remote configuration;
- capability gating;
- approval workflows;
- configuration preview/diff.

### Phase 4

- experiments;
- advanced segmentation;
- automated stale flag detection;
- advanced rollout analytics.

---

# 79. Final Architecture

```text
                    +----------------------+
                    | Bezzo Admin Console  |
                    +----------+-----------+
                               |
                               v
                 +--------------------------+
                 | Configuration Control    |
                 | Plane / Admin API         |
                 +------------+-------------+
                              |
              +---------------+----------------+
              |               |                |
              v               v                v
        PostgreSQL          Redis         Audit/Event Bus
              |               |
              +-------+-------+
                      |
                      v
              +---------------+
              | Flag / Config |
              | Evaluation SDK|
              +-------+-------+
                      |
       +--------------+--------------+
       |              |              |
       v              v              v
     Web/API        Workers        Mobile
       |              |              |
       +--------------+--------------+
                      |
                      v
              Bezzo business modules
```

The control plane governs configuration. The application data plane evaluates configuration locally or from low-latency cache. Business modules remain responsible for their own domain invariants, authorization, compliance, and data integrity.

---

## 80. Engineering Standard

Bezzo should treat feature flags and runtime configuration as production infrastructure.

The system must optimize for:

- safe change;
- deterministic behavior;
- fast rollback;
- strong auditability;
- minimal latency;
- mobile compatibility;
- controlled experimentation;
- operational resilience.

The preferred operating model is:

```text
deploy safely
    ->
activate gradually
    ->
measure
    ->
expand
    ->
stabilize
    ->
remove temporary controls
```

This provides Bezzo with a controlled mechanism for shipping marketplace, supplier, buyer, payment, logistics, search, and operational capabilities without coupling every release to an all-at-once production activation.

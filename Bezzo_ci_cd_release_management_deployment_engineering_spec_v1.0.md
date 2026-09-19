# Bezzo CI/CD, Release Management & Deployment Engineering Specification v1.0

**Product:** Bezzo B2B Pharmaceutical Marketplace  
**Document Type:** CI/CD & Release Engineering Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Web:** Next.js + React + TypeScript  
**Mobile:** React Native + TypeScript  
**Backend:** Node.js + NestJS + TypeScript  
**Infrastructure:** Terraform + Managed Cloud Services  
**Audience:** Engineering, DevOps, SRE, QA, Security, Product and Release teams

---

# 1. Purpose

This document defines the engineering process used to build, test, package, release, deploy, verify and roll back Bezzo software.

It covers:

- source-control workflow
- branch strategy
- pull requests
- code quality gates
- CI pipelines
- artifact creation
- container images
- database migrations
- environment promotion
- staging
- production deployment
- web releases
- backend releases
- mobile releases
- release versioning
- feature flags
- rollback
- hotfixes
- release approvals
- deployment verification
- change management
- security checks
- auditability

The goal is to make releases repeatable, traceable and recoverable.

---

# 2. Release Engineering Principles

## 2.1 Every production release is traceable

A production deployment must identify:

```text
Git commit
Build ID
Application version
Container image digest
Database migration version
Deployment timestamp
Deployment actor/process
```

## 2.2 Build once, promote the same artifact

Where practical:

```text
source
 ↓
build
 ↓
test
 ↓
immutable artifact
 ↓
staging
 ↓
production
```

Do not rebuild different binaries/images for production after staging validation unless the change is intentional and recorded.

## 2.3 Automated gates before production

Production deployment must be blocked when required gates fail.

Minimum gates:

- lint
- typecheck
- unit tests
- build
- dependency/security checks
- integration tests
- contract tests
- migration validation
- staging smoke tests

## 2.4 Small releases

Prefer smaller, independently verifiable changes over large infrequent releases.

Feature flags should be used when functionality needs to be deployed before being exposed to all users.

---

# 3. Repository Strategy

Bezzo should use a Git-based repository structure.

Recommended monorepo:

```text
apps/
  web/
  mobile/
  api/
  worker/

packages/
  api-contracts/
  api-client/
  domain/
  validation/
  ui/
  config/
  analytics/

infra/
  terraform/

docs/
```

A monorepo is recommended initially because web, mobile, API and shared contracts evolve together.

---

# 4. Branching Strategy

Recommended:

```text
main
  ↑
feature/*
fix/*
chore/*
refactor/*
release/*
hotfix/*
```

`main` must remain releasable.

Feature branches should be short-lived.

Avoid long-running branches that diverge substantially from `main`.

---

# 5. Pull Request Requirements

Every pull request should include:

- purpose
- affected modules
- testing performed
- database changes
- API changes
- security implications
- deployment considerations
- screenshots/video for meaningful UI changes where useful

PRs affecting financial, authentication, compliance or infrastructure functionality require appropriate specialist review.

---

# 6. Required Code Review

At least one qualified reviewer should approve normal changes.

Additional review should be required for high-risk changes such as:

- payment
- refunds
- supplier settlements
- authentication
- authorization
- pharmaceutical compliance workflows
- database migrations
- infrastructure
- production secrets
- security controls

---

# 7. Commit Standards

Use clear commit messages.

Recommended format:

```text
feat: add supplier inventory import
fix: prevent duplicate checkout submission
refactor: isolate payment gateway adapter
docs: update order API contract
chore: update dependency
```

Commits should describe the actual change.

---

# 8. Semantic Versioning

Where applicable, use:

```text
MAJOR.MINOR.PATCH
```

Examples:

```text
1.0.0
1.1.0
1.1.1
```

For internal backend deployments, the immutable Git commit/build identifier remains the strongest deployment identity.

---

# 9. Application Version Identity

Every deployed artifact should expose a safe version endpoint or metadata response.

Example:

```json
{
  "application": "bezzo-api",
  "version": "1.4.0",
  "commit": "abc123",
  "buildId": "build-20260919-001"
}
```

Do not expose secrets or internal infrastructure details.

---

# 10. CI Pipeline Overview

Backend/web pipeline:

```text
Checkout
 ↓
Dependency installation
 ↓
Lint
 ↓
Typecheck
 ↓
Unit tests
 ↓
Build
 ↓
Security/dependency scan
 ↓
Integration tests
 ↓
API contract tests
 ↓
Artifact/image creation
 ↓
Artifact scan
 ↓
Publish artifact
```

---

# 11. Pull Request CI

Every pull request should run the fastest useful validation set.

Minimum:

```text
format/lint
typecheck
unit tests
affected integration tests
API contract validation
build validation
dependency/security checks
```

Large or expensive suites may run in parallel or on merge/nightly pipelines.

---

# 12. Main Branch CI

After merge to `main`:

```text
full tests
 ↓
build all affected artifacts
 ↓
container image
 ↓
image scan
 ↓
publish immutable artifact
 ↓
deploy development/test environment
```

`main` should always represent a potentially releasable state.

---

# 13. Test Pyramid

Bezzo CI should use:

```text
Many unit tests
        ↓
Integration tests
        ↓
API/contract tests
        ↓
Fewer end-to-end tests
```

E2E tests should focus on critical business journeys rather than attempting to test every UI detail.

---

# 14. Backend CI

Backend pipeline must include:

- TypeScript compilation
- lint
- unit tests
- module integration tests
- API contract validation
- database integration tests
- migration validation
- security checks
- build
- container creation

---

# 15. Frontend Web CI

Web pipeline:

```text
install
 ↓
lint
 ↓
typecheck
 ↓
unit/component tests
 ↓
build
 ↓
bundle/performance checks
 ↓
E2E smoke tests
 ↓
artifact publish
```

---

# 16. Mobile CI

Mobile pipeline:

```text
install
 ↓
lint
 ↓
typecheck
 ↓
unit/component tests
 ↓
native build
 ↓
E2E tests
 ↓
security checks
 ↓
release artifact
```

Android and iOS builds should run independently so a failure on one platform is clearly identified.

---

# 17. Dependency Installation

CI must use lockfiles.

Examples:

```text
package-lock.json
yarn.lock
pnpm-lock.yaml
```

Only one package manager should be standardized for the repository.

Dependency versions should be deterministic.

---

# 18. Dependency Security

CI should scan dependencies for known vulnerabilities.

The pipeline should distinguish:

```text
informational
low
medium
high
critical
```

Blocking thresholds should be defined by security policy.

Internet-facing critical vulnerabilities require expedited remediation.

---

# 19. Static Analysis

Run:

- TypeScript compiler
- ESLint
- security linting where useful
- dependency scanning
- secret scanning

Infrastructure code should also be statically validated.

---

# 20. Secret Scanning

CI must detect accidental commits of:

- API keys
- private keys
- cloud credentials
- payment secrets
- database passwords
- authentication secrets

A detected production credential should be treated as compromised until rotated.

---

# 21. Container Build

Backend/worker images should be created from controlled Dockerfiles.

Requirements:

- pinned base image
- minimal runtime dependencies
- non-root user where possible
- no development secrets
- reproducible build
- vulnerability scanning

---

# 22. Container Tagging

Use immutable identifiers.

Example:

```text
bezzo-api:git-abc123
bezzo-api:build-20260919-001
```

The deployment system should ultimately reference the immutable image digest.

Avoid production deployment based only on:

```text
latest
```

---

# 23. Artifact Registry

Store:

```text
web artifacts
api images
worker images
migration images where applicable
mobile release artifacts
```

Production artifact access must be controlled.

---

# 24. Database Migration Pipeline

Database migrations must be part of release planning.

Pipeline:

```text
migration lint/validation
 ↓
apply to test DB
 ↓
run schema verification
 ↓
run integration tests
 ↓
apply to staging
 ↓
validate
 ↓
production approval
 ↓
production migration
```

---

# 25. Migration Safety

Production migrations must follow:

```text
expand
 ↓
deploy compatible code
 ↓
backfill
 ↓
switch behavior
 ↓
contract
```

Avoid destructive schema changes in the same release that still requires the old schema.

---

# 26. Migration Failure

If a migration fails:

1. stop further deployment
2. capture migration error
3. determine whether transaction rollback occurred
4. assess schema state
5. do not blindly rerun
6. follow migration-specific recovery procedure
7. verify application compatibility

Database rollback must not be assumed safe.

---

# 27. Environment Promotion

Recommended:

```text
PR
 ↓
development/test
 ↓
staging
 ↓
production
```

Promotion should use the same immutable artifact where possible.

---

# 28. Development Deployment

Development deployments may happen automatically after merge.

Purpose:

- integration
- feature verification
- developer testing

Development may use relaxed infrastructure sizing but must preserve core architecture.

---

# 29. Staging Deployment

Staging should be production-like enough to validate:

- application
- database migrations
- Redis
- search
- object storage
- workers
- payment sandbox
- logistics sandbox/mock
- notifications
- observability
- deployment behavior

---

# 30. Staging Smoke Tests

After deployment:

```text
health
readiness
login
catalog
product
cart
checkout quote
test payment
order flow
supplier login
supplier inventory
admin login
```

Use sandbox/test credentials and synthetic data.

---

# 31. Production Deployment

Production deployment should follow:

```text
release candidate approved
 ↓
pre-deployment checks
 ↓
migration strategy verified
 ↓
deploy
 ↓
health checks
 ↓
smoke tests
 ↓
monitor
 ↓
complete rollout
```

High-risk releases may require manual approval.

---

# 32. Deployment Strategy

Initial production can use rolling deployment if the platform supports safe health-checked replacement.

For higher-risk releases, use:

```text
canary
```

or:

```text
blue/green
```

when operational maturity and traffic justify it.

---

# 33. Zero-Downtime Deployment

The application must support:

- multiple API instances
- graceful shutdown
- compatible database migrations
- health checks
- connection draining
- backwards-compatible API behavior during rollout

Never assume every instance changes simultaneously.

---

# 34. Backward Compatibility

During rolling deployment:

```text
old application
      +
new application
```

may run simultaneously.

Therefore:

- database schema must support both where required
- events must remain compatible
- API responses must remain compatible
- queues must tolerate version overlap

---

# 35. Feature Flags

Use feature flags for controlled rollout.

Examples:

```text
new_checkout
instant_delivery
new_search
supplier_inventory_import
new_order_tracking
```

Feature flags should be:

- centrally configured
- auditable where operationally significant
- removable after rollout

Do not leave temporary flags indefinitely.

---

# 36. Feature Flag Safety

Feature flags must not bypass:

- authorization
- payment validation
- compliance
- security controls

A disabled feature should not leave partially active backend pathways that can be exploited.

---

# 37. Release Candidate

A release candidate should identify:

```text
version
commit
artifacts
database migrations
feature flags
known issues
test results
rollback plan
```

---

# 38. Release Checklist

Before production:

### Code

- PRs merged
- reviews complete
- CI green

### Tests

- unit
- integration
- API contract
- E2E critical paths
- security checks

### Database

- migrations reviewed
- backup status verified
- migration order verified

### Infrastructure

- capacity checked
- deployment configuration checked
- monitoring ready

### Integrations

- payment
- logistics
- notification

### Operations

- release notes
- rollback plan
- owner assigned

---

# 39. Deployment Verification

After deployment verify:

```text
API health
API readiness
error rate
latency
database health
Redis health
queue health
search health
payment callbacks
logistics callbacks
web frontend
mobile compatibility
```

Critical business journey smoke tests should run automatically where possible.

---

# 40. Post-Deployment Monitoring Window

For high-risk releases, actively monitor:

```text
15 minutes
30 minutes
1 hour
```

or according to release risk.

Watch:

- 5xx
- latency
- checkout failures
- payment failures
- order creation
- inventory reservation
- delivery creation

---

# 41. Rollback Strategy

Application rollback:

```text
identify last good release
 ↓
redeploy previous artifact
 ↓
verify health
 ↓
verify critical workflows
```

If database schema changed, verify whether the old application remains compatible before rollback.

---

# 42. Rollback Triggers

Potential triggers:

- severe error spike
- checkout failure
- payment corruption
- order creation failure
- inventory integrity issue
- authentication outage
- data exposure
- severe latency regression
- widespread mobile/web breakage

Rollback is an operational decision based on impact and incident response procedures.

---

# 43. Hotfix Process

For critical production issues:

```text
main/release
 ↓
hotfix branch
 ↓
targeted fix
 ↓
focused tests
 ↓
security/review
 ↓
build artifact
 ↓
staging validation
 ↓
production deployment
 ↓
post-release verification
```

The hotfix must be merged back into the normal development branch.

---

# 44. Emergency Security Release

If a critical security issue is discovered:

1. classify impact
2. contain exposure
3. rotate affected credentials where needed
4. prepare fix
5. test
6. deploy
7. verify
8. review logs
9. document incident

Do not wait for the normal release window when delay creates unacceptable exposure.

---

# 45. Web Release Process

Web release:

```text
source
 ↓
build
 ↓
tests
 ↓
artifact
 ↓
staging
 ↓
smoke
 ↓
production
 ↓
CDN verification
```

Cache invalidation must be handled safely.

Immutable asset filenames are preferred.

---

# 46. Backend Release Process

Backend release:

```text
source
 ↓
tests
 ↓
image
 ↓
migration validation
 ↓
staging
 ↓
smoke
 ↓
production
```

API instances must be drained gracefully during replacement.

---

# 47. Worker Release Process

Worker releases require special attention to job compatibility.

During rolling deployment:

```text
old workers + new workers
```

may coexist.

Jobs should be designed so both versions can safely process compatible events during rollout.

---

# 48. Mobile Release Process

Mobile release differs because users retain older app versions.

Therefore backend APIs must support a compatibility window.

Mobile release:

```text
code
 ↓
tests
 ↓
Android/iOS builds
 ↓
QA
 ↓
beta
 ↓
production release
 ↓
staged rollout
 ↓
monitor
```

---

# 49. Mobile Version Compatibility

The API must support the minimum supported mobile version.

The mobile application should expose:

```text
appVersion
platform
osVersion
```

to backend telemetry where appropriate.

---

# 50. Forced Upgrade

A forced upgrade may be required for:

- security issue
- incompatible API contract
- critical payment issue
- unsupported client version

The server may communicate:

```text
UPDATE_REQUIRED
```

The app should route the user to the official platform store.

---

# 51. Mobile Staged Rollout

Use staged rollout where supported.

Monitor:

- crash rate
- ANR rate on Android
- startup
- checkout
- payment
- order creation
- login
- push/deep-link failures

Increase rollout only after stability is verified.

---

# 52. Release Notes

Each production release should include:

```text
Version
Release date
Features
Bug fixes
Security changes where appropriate
Known issues
Migration notes
Operational notes
```

Do not expose internal security-sensitive details in public release notes.

---

# 53. Change Classification

Classify changes:

### Low risk

- copy
- styling
- non-critical UI
- documentation

### Medium risk

- catalog changes
- search
- notifications
- supplier workflow

### High risk

- payments
- refunds
- settlements
- authentication
- authorization
- database migrations
- infrastructure
- compliance workflows

Release process and approval should scale with risk.

---

# 54. Production Change Approval

High-risk releases should have explicit approval from appropriate owners.

Examples:

```text
Payment → engineering + finance/operations
Security → engineering + security
Compliance → engineering + compliance/business owner
Database → engineering/database owner
Infrastructure → DevOps/SRE
```

---

# 55. Auditability

Deployment systems should retain:

- who/what triggered release
- commit
- artifact
- environment
- timestamp
- result
- approval
- rollback if performed

Production changes must be reconstructable after the fact.

---

# 56. CI/CD Secrets

CI/CD secrets must be stored in a secure secret-management system.

Prefer short-lived credentials or workload identity where supported.

CI should not receive broad permanent production credentials.

---

# 57. Deployment Permissions

Separate:

```text
Build permission
Deploy staging permission
Deploy production permission
Infrastructure permission
Emergency permission
```

The ability to build code should not automatically grant unrestricted production access.

---

# 58. Infrastructure Deployment Pipeline

Terraform pipeline:

```text
terraform fmt
 ↓
terraform validate
 ↓
lint/security checks
 ↓
terraform plan
 ↓
review
 ↓
apply staging
 ↓
validate
 ↓
production approval
 ↓
apply production
```

Production infrastructure changes should use reviewed plans.

---

# 59. Drift Detection

Infrastructure drift should be detected periodically.

If manual changes occur:

```text
detect
 ↓
investigate
 ↓
codify or revert
 ↓
record
```

Do not allow unmanaged production infrastructure to become normal practice.

---

# 60. Automated Rollback vs Manual Rollback

Automated rollback is appropriate for clearly detectable deployment failures such as:

- health check failure
- container startup failure
- immediate severe error threshold

Manual decision may be safer for:

- business-data inconsistency
- payment behavior
- inventory anomalies
- compliance issues

---

# 61. Deployment Failure Handling

If deployment fails:

```text
stop rollout
 ↓
preserve evidence
 ↓
inspect health/logs
 ↓
rollback application if safe
 ↓
verify dependencies
 ↓
fix root cause
```

Do not repeatedly redeploy a known-bad artifact.

---

# 62. Queue and Event Compatibility

When deploying event producers/consumers:

- new consumers should tolerate old events
- old consumers may receive new events during rollout
- event schemas should remain backward compatible
- breaking event changes require versioning

---

# 63. API Compatibility

Before deployment:

- compare OpenAPI against previous version
- detect breaking changes
- verify mobile/web compatibility
- verify partner integrations
- document intentional breaking changes

---

# 64. Database Compatibility

Before deployment:

- migration reviewed
- expected lock duration considered
- indexes considered for production scale
- backfill strategy defined
- rollback implications documented
- old application compatibility checked

---

# 65. Performance Regression Gate

For performance-sensitive changes, CI/staging should compare:

```text
API latency
bundle size
startup
search latency
database query performance
```

against an established baseline.

A performance regression should trigger investigation before broad production rollout.

---

# 66. Release Monitoring Dashboard

A production release dashboard should include:

```text
Release version
Deployment status
API requests
5xx
p95/p99
Orders
Checkout success
Payment success
Inventory reservation failures
Delivery failures
Queue depth
Database health
```

This should be accessible to the on-call engineering/operations team.

---

# 67. Release Incident Flow

If a release causes an incident:

```text
Detect
 ↓
Declare/triage
 ↓
Contain
 ↓
Rollback or mitigation
 ↓
Verify recovery
 ↓
Communicate
 ↓
Root-cause analysis
 ↓
Corrective action
```

The incident record should reference the release/build ID.

---

# 68. Release Calendar

A release calendar may be used for:

- planned production deployments
- high-risk changes
- maintenance
- migrations
- mobile releases

Critical security fixes are exceptions.

---

# 69. Release Freeze

A temporary release freeze may be used during:

- major incidents
- infrastructure migrations
- critical business events
- unresolved production instability

Emergency fixes remain possible under controlled approval.

---

# 70. CI/CD Definition of Ready

A release is ready when:

- code is merged
- CI is green
- tests are complete
- artifacts are immutable
- migrations are reviewed
- environment configuration is verified
- feature flags are configured
- rollback plan exists
- release owner is assigned

---

# 71. CI/CD Definition of Done

A release is done when:

- deployment completed
- health checks passed
- smoke tests passed
- monitoring is stable
- critical business flows are verified
- release is recorded
- migration status is verified
- no unexpected regression is observed during the release monitoring window

---

# 72. Recommended Implementation Sequence

## Phase 1 — Source and CI

1. repository structure
2. branch protections
3. PR checks
4. lint/typecheck
5. unit tests
6. dependency scanning
7. secret scanning

## Phase 2 — Artifacts

8. web build
9. API container
10. worker container
11. registry
12. immutable tags/digests

## Phase 3 — Environments

13. development deployment
14. staging deployment
15. staging smoke tests
16. production deployment pipeline

## Phase 4 — Database and Infrastructure

17. migration automation
18. Terraform pipeline
19. infrastructure review
20. backup verification

## Phase 5 — Release Operations

21. feature flags
22. canary/rolling deployment
23. rollback
24. release dashboard
25. alerts
26. incident integration

## Phase 6 — Mobile

27. Android CI
28. iOS CI
29. beta distribution
30. staged rollout
31. mobile compatibility monitoring

---

# 73. Final Engineering Position

Bezzo releases must be treated as controlled engineering operations rather than manual file deployments.

The desired lifecycle is:

```text
Code
 ↓
Review
 ↓
Automated validation
 ↓
Immutable artifact
 ↓
Staging
 ↓
Verification
 ↓
Controlled production rollout
 ↓
Monitoring
 ↓
Recorded release
```

The system must make the safe path the easiest path.

The release platform should provide strong automation while preserving explicit controls around:

- pharmaceutical compliance
- payments
- refunds
- settlements
- authentication
- authorization
- customer data
- inventory
- database migrations
- infrastructure

The initial implementation should remain operationally simple, but every deployment must be reproducible, observable and recoverable.

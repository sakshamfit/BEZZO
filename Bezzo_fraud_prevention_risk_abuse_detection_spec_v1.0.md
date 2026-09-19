# Bezzo Fraud Prevention, Risk & Abuse Detection Specification v1.0

## 1. Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Fraud Prevention, Risk & Abuse Detection Specification |
| Version | 1.0 |
| Status | Draft for implementation |
| Primary Actors | Buyers, suppliers, admins, finance, support, risk operations |
| Platforms | Web, Android, iOS |
| Related Domains | Identity, Orders, Payments, Inventory, Pricing, Promotions, Settlements, Logistics, Support |

---

## 2. Purpose

This specification defines the risk-control architecture for Bezzo.

The objective is to detect, prevent, contain, investigate, and audit abusive or suspicious activity without unnecessarily blocking legitimate pharmaceutical marketplace transactions.

Risk controls must operate across:

- buyer accounts
- supplier accounts
- authentication
- orders
- payments
- refunds
- coupons
- promotions
- inventory
- delivery
- supplier payouts
- disputes
- account behavior

The system should prefer layered controls rather than relying on a single fraud score.

---

# 3. Core Principles

1. Risk decisions are server-side.
2. No single signal should automatically determine every risk outcome.
3. Rules must be configurable and versioned.
4. Risk decisions must be explainable to authorized operations users.
5. Buyer-facing explanations should reveal only safe information.
6. Legitimate users should have a path for review or appeal where appropriate.
7. Supplier and buyer risk data must remain tenant- and role-isolated.
8. Payment-provider fraud controls should complement, not replace, Bezzo controls.
9. High-risk financial actions require stronger verification.
10. Risk events must be auditable.
11. Risk controls must not bypass pharmaceutical, privacy, payment, or other compliance requirements.
12. Automated controls should support human review for ambiguous cases.
13. Models or rules must be monitored for false positives and false negatives.
14. Risk decisions affecting completed financial records must never silently rewrite historical transactions.

---

# 4. Risk Domains

Bezzo should maintain separate but connected risk domains.

## 4.1 Account Risk

Signals may include:

- repeated failed authentication
- unusual login patterns
- suspicious device changes
- abnormal account creation behavior
- account takeover indicators
- repeated profile changes
- abnormal password reset activity

## 4.2 Buyer Transaction Risk

Signals may include:

- unusual order value
- unusual order frequency
- repeated cancellations
- repeated payment failures
- abnormal refund behavior
- coupon abuse
- unusual delivery patterns
- repeated claims for missing/damaged items

## 4.3 Supplier Risk

Signals may include:

- unusual price changes
- inventory anomalies
- repeated fulfillment failures
- excessive cancellations
- suspicious return patterns
- abnormal refund rates
- payout destination changes
- repeated customer disputes

## 4.4 Payment Risk

Signals may include:

- repeated failed payments
- inconsistent payment identity signals
- unusual payment velocity
- repeated attempts across accounts
- gateway risk signals
- chargeback/dispute patterns

## 4.5 Promotion Abuse

Signals may include:

- repeated first-order promotion usage
- multiple accounts using the same promotion patterns
- rapid coupon redemption
- suspicious campaign activity
- coordinated account behavior

## 4.6 Logistics Risk

Signals may include:

- repeated delivery failures
- abnormal address patterns
- excessive cash-on-delivery rejection where applicable
- repeated claims involving delivery
- suspicious route/order patterns

---

# 5. Risk Architecture

Recommended architecture:

```text
User / Order / Payment / Supplier Activity
                ↓
        Risk Event Collector
                ↓
        Feature / Signal Layer
                ↓
       Rules + Risk Evaluation
                ↓
    ┌───────────┼────────────┐
    ↓           ↓            ↓
ALLOW       STEP-UP       REVIEW/HOLD
                ↓
        Decision / Action
                ↓
       Audit + Analytics
```

The architecture should support later introduction of statistical or machine-learning models without requiring a redesign of the core decision contracts.

---

# 6. Risk Event Model

Important events include:

```text
AccountCreated
LoginAttempted
PasswordResetRequested
DeviceRegistered
ProfileChanged
PaymentAttempted
PaymentFailed
PaymentSucceeded
OrderCreated
OrderCancelled
RefundRequested
RefundIssued
CouponApplied
PromotionRedeemed
DeliveryFailed
ReturnRequested
DisputeCreated
SupplierPriceChanged
SupplierInventoryAdjusted
SupplierBankChanged
PayoutRequested
PayoutFailed
ChargebackReceived
```

Each event should contain:

```text
event_id
event_type
actor_type
actor_id
timestamp
ip_reference
device_reference
session_reference
order_reference
supplier_reference
correlation_id
metadata
schema_version
```

Sensitive values should not be unnecessarily copied into event payloads.

---

# 7. Risk Signals

Risk signals are normalized indicators derived from events and trusted data.

Examples:

```text
payment_failure_velocity
order_value_velocity
coupon_redemption_velocity
account_age
refund_ratio
cancellation_ratio
delivery_failure_ratio
supplier_fulfillment_failure_ratio
device_account_count
address_account_count
payment_method_account_count
bank_account_supplier_count
```

Signals should have:

- signal name
- value
- timestamp/window
- source
- confidence/quality where applicable
- version

---

# 8. Velocity Controls

Velocity limits detect unusually frequent actions.

Examples:

```text
Orders per buyer per hour
Payments per account per hour
Coupon attempts per account per day
Refund requests per buyer per day
Supplier bank changes per period
Payout attempts per period
```

Velocity thresholds must be configurable.

Do not hard-code production thresholds in application code.

---

# 9. Risk Score

Bezzo may use a normalized risk score.

Example conceptual range:

```text
0 → lower observed risk
100 → higher observed risk
```

The score itself is not the final decision.

A decision can depend on:

```text
risk score
+ hard rules
+ account status
+ payment provider result
+ transaction context
+ manual review state
```

Scoring versions must be stored with the decision.

---

# 10. Rule Engine

Rules should be explicit and versioned.

Example:

```text
IF payment_failure_count >= configured_threshold
AND time_window <= configured_window
THEN require additional verification
```

Rules may result in:

- ALLOW
- MONITOR
- STEP_UP
- REVIEW
- HOLD
- DECLINE
- BLOCK

Every automated decision should record which rules/signals contributed.

---

# 11. Decision Layers

## Layer 1 — Hard Safety Rules

Immediate controls for known prohibited or technically unsafe states.

## Layer 2 — Transaction Rules

Evaluate order/payment/promotion context.

## Layer 3 — Behavioral Signals

Evaluate velocity and historical patterns.

## Layer 4 — External Provider Signals

Consume payment/logistics/risk-provider results where available.

## Layer 5 — Human Review

Ambiguous or high-impact cases can be routed to authorized risk operations.

---

# 12. Step-Up Verification

When risk is elevated but the transaction may be legitimate, Bezzo can require additional verification.

Examples:

- re-authentication
- OTP verification
- payment-provider authentication
- verified business information
- supplier documentation review
- bank-account verification

Step-up verification should be proportional to the risk and action being attempted.

---

# 13. Account Protection

Bezzo should detect account takeover indicators.

Controls may include:

- rate limiting
- login anomaly detection
- suspicious password-reset detection
- device/session monitoring
- session invalidation
- MFA/OTP where configured
- sensitive-action reauthentication

Sensitive actions may include:

- changing bank details
- changing business identity information
- changing primary phone/email
- initiating high-value payouts
- administrative permission changes

---

# 14. Buyer Order Risk

Risk evaluation may consider:

- order value
- order frequency
- historical cancellation ratio
- historical refund ratio
- payment success history
- delivery success history
- account age
- promotion usage
- device/session signals
- address patterns

The system should avoid treating a single unusual order as proof of abuse.

---

# 15. Supplier Risk

Supplier risk monitoring should include:

- fulfillment success
- cancellation rate
- stock accuracy
- customer dispute rate
- return rate
- refund rate
- product/content anomalies
- price anomalies
- payout destination changes
- inventory manipulation patterns

Risk actions may include:

```text
MONITOR
REVIEW
LIMIT
HOLD
SUSPEND
```

Supplier operational decisions should be subject to authorized review and documented policy.

---

# 16. Coupon Abuse Prevention

Controls may include:

- per-account usage limits
- per-device velocity
- per-payment-method velocity
- per-address velocity
- campaign budget limits
- first-order eligibility checks
- account-age checks
- suspicious account clustering
- redemption velocity

The promotion engine remains authoritative for whether a coupon is commercially eligible; the risk layer can additionally determine whether an attempted redemption requires review or blocking.

---

# 17. Promotion Budget Protection

Campaign budget must not be overspent due to concurrent redemption.

Use transactional reservation/consumption logic.

Example:

```text
Remaining budget = ₹500

Attempt A → ₹400
Attempt B → ₹400

Expected:
Committed promotion funding <= ₹500.
```

The exact handling of partial eligibility must be defined by the promotion system.

---

# 18. Payment Risk

Payment risk controls should integrate with the payment provider.

Signals may include:

- provider risk result
- repeated failures
- payment velocity
- amount anomalies
- unusual account/payment relationships
- chargeback history

Bezzo must never treat a client-side payment success screen as proof of payment.

Server-side gateway confirmation and reconciliation remain authoritative.

---

# 19. Cash on Delivery Risk

Where COD is supported and legally/business permitted, risk controls may consider:

- previous COD rejection
- repeated failed deliveries
- order value
- order frequency
- address history
- buyer history

Possible outcomes:

- COD allowed
- COD limited
- prepaid required
- review

COD restrictions should be configurable and communicated appropriately.

---

# 20. Refund Abuse

Signals may include:

- unusually high refund frequency
- repeated claims of missing items
- repeated damage claims
- repeated wrong-item claims
- refund requests shortly after successful deliveries
- refund-to-order ratio
- abnormal patterns across linked accounts

Refund risk should not prevent legitimate claims automatically.

Cases can be routed to customer support/dispute review.

---

# 21. Return Abuse

Potential signals:

- unusually high return ratio
- repeated return claims for similar products
- repeated return requests immediately after delivery
- mismatch between delivered and claimed quantities
- repeated high-value returns

Return eligibility remains governed by the Returns & Reverse Logistics specification.

Risk may add review controls where appropriate.

---

# 22. Chargeback Risk

Chargeback events should trigger:

```text
Payment record update
→ order financial review
→ supplier settlement adjustment if applicable
→ risk signal update
→ reconciliation
```

Chargeback evidence must be preserved according to the applicable retention policy.

---

# 23. Supplier Payout Risk

High-impact payout actions should be protected.

Signals may include:

- recently changed bank account
- sudden payout amount increase
- unusual order/refund pattern
- supplier account changes
- unresolved disputes
- compliance holds

Possible control:

```text
Bank change
→ verification
→ configurable cooling/review period
→ payout eligibility
```

Any cooling period must be a business/security configuration.

---

# 24. Device and Session Signals

Bezzo may maintain privacy-conscious device/session references.

Potential signals:

- device count
- session frequency
- device/account relationship count
- recent device change
- suspicious automation indicators

The system should avoid collecting unnecessary device data.

Raw device identifiers should be protected or transformed where practical.

---

# 25. IP and Network Signals

Possible signals:

- excessive login attempts
- excessive account creation
- high transaction velocity
- known abusive infrastructure indicators where lawfully available

IP signals are imperfect and should not independently establish fraud.

Shared networks, mobile carriers, offices, and legitimate VPN usage can create false positives.

---

# 26. Account Linking Signals

The system may identify relationships among accounts using permitted signals such as:

- verified business identifiers
- payment references
- delivery address patterns
- device/session references
- supplier relationships
- repeated promotion behavior

Account linking must be privacy-conscious and access-controlled.

A linkage signal should not automatically imply that accounts are fraudulent.

---

# 27. Risk Actions

### ALLOW

Proceed normally.

### MONITOR

Proceed and increase observation.

### STEP_UP

Require additional verification.

### REVIEW

Route to an authorized operations queue.

### HOLD

Temporarily prevent a high-impact operation.

### DECLINE

Reject the current transaction/action.

### BLOCK

Prevent defined activity until authorized resolution.

The scope of each action must be explicit.

---

# 28. Risk Case Management

Risk operations should have a case-management workflow.

Case fields:

```text
case_id
entity_type
entity_id
risk_category
priority
status
risk_score
trigger
assigned_to
created_at
updated_at
resolution
resolution_reason
```

Case states:

```text
OPEN
ASSIGNED
INVESTIGATING
WAITING_FOR_INFORMATION
RESOLVED
DISMISSED
ESCALATED
```

---

# 29. Evidence

A risk case may contain:

- event references
- payment references
- order references
- support cases
- supplier documents
- audit records
- screenshots or uploaded evidence where permitted
- provider responses

Evidence must be access-controlled and protected.

Risk operations should reference source records rather than duplicating sensitive data unnecessarily.

---

# 30. Manual Review

Reviewers should be able to:

- view relevant evidence
- inspect risk signals
- inspect rule triggers
- view order/payment context
- request additional information
- approve
- reject
- release a hold
- escalate
- document the reason

Review actions must be audited.

---

# 31. False Positive Management

Risk controls should monitor:

- false-positive rate
- review overturn rate
- blocked legitimate transaction rate
- customer complaints associated with risk controls
- supplier appeal outcomes

Rules with excessive false positives should be reviewed and versioned rather than silently tuned in production.

---

# 32. Risk Appeals

Where applicable, users may request review of:

- account restrictions
- supplier holds
- payout holds
- promotion restrictions
- order risk decisions

The appeal workflow should provide:

```text
Request review
→ collect relevant information
→ authorized review
→ decision
→ notify user
→ audit result
```

Not every security decision needs to expose internal detection logic.

---

# 33. Privacy

Risk data may contain sensitive operational information.

Requirements:

- collect only necessary data
- define retention periods
- restrict access
- encrypt sensitive records
- audit access
- avoid exposing internal risk scores to ordinary users unless intentionally designed
- avoid unnecessary cross-account data exposure
- support applicable privacy rights/processes

Risk analytics should use minimized or aggregated data where possible.

---

# 34. Data Retention

Retention periods must be configurable according to:

- legal requirements
- accounting requirements
- payment requirements
- security requirements
- dispute requirements
- operational needs

The retention policy must be documented and approved before production.

---

# 35. Model / Rule Versioning

Every risk decision should record:

```text
rule_version
score_version
feature_version
decision_version
```

This enables investigation of why a historical decision occurred.

Changing a rule must create a new version.

---

# 36. Machine Learning Readiness

Bezzo may later introduce ML models for:

- anomaly detection
- transaction risk
- promotion abuse
- account takeover
- supplier risk

Models should not directly mutate financial records.

Recommended architecture:

```text
Events
→ Features
→ Model inference
→ Risk signal
→ Decision engine
→ Action
```

Models must have:

- version
- input feature version
- output score
- confidence where available
- monitoring
- rollback capability

---

# 37. Model Governance

If ML is introduced:

- monitor drift
- monitor false positives/negatives
- document training data lineage
- maintain model versions
- restrict sensitive attributes
- test fairness and unintended impact where applicable
- establish approval before production deployment
- maintain rollback procedures

The risk system must remain operable if a model is unavailable.

---

# 38. API Surface

## Risk

```http
POST /internal/risk/evaluate/order
POST /internal/risk/evaluate/payment
POST /internal/risk/evaluate/refund
POST /internal/risk/evaluate/coupon
POST /internal/risk/evaluate/payout
POST /internal/risk/events
```

## Operations

```http
GET  /v1/admin/risk/cases
GET  /v1/admin/risk/cases/{id}
POST /v1/admin/risk/cases/{id}/assign
POST /v1/admin/risk/cases/{id}/resolve
POST /v1/admin/risk/cases/{id}/escalate
POST /v1/admin/risk/holds/{id}/release
```

These APIs require service/admin authentication and strict authorization.

---

# 39. Event Processing

Risk evaluation should consume events asynchronously where immediate blocking is not required.

For checkout-critical decisions:

```text
Request
→ synchronous risk evaluation
→ decision
→ continue/step-up/review
```

For monitoring:

```text
Event
→ queue
→ risk processing
→ signal update
→ case/alert if required
```

Use idempotent event processing.

---

# 40. Performance Requirements

Risk checks on checkout/payment paths must be low latency.

Requirements:

- bounded synchronous evaluation
- cached safe reference data
- indexed signal queries
- asynchronous non-critical analytics
- graceful fallback behavior
- no dependency on slow external systems unless required for the decision

If the risk service is unavailable, each action must have an explicitly configured fail-open or fail-closed policy.

High-risk financial actions should generally have stricter failure handling than low-risk browsing.

---

# 41. Security

Risk infrastructure itself is high-value.

Requirements:

- strict RBAC
- service authentication
- encryption
- audit logging
- secret management
- isolated risk operations access
- restricted exports
- rate limiting
- tamper-resistant logs
- protected model/rule configuration
- approval workflow for critical rule changes

Users must not be able to manipulate risk signals from the client.

---

# 42. Database Model

Recommended tables:

```text
risk_events
risk_signals
risk_scores
risk_rules
risk_rule_versions
risk_decisions
risk_actions
risk_cases
risk_case_events
risk_case_evidence
risk_holds
risk_appeals
risk_model_versions
risk_rule_audit
```

Important indexes:

```text
actor_type + actor_id + created_at
event_type + created_at
risk_case status + priority
entity_type + entity_id
decision reference
rule_version
created_at
```

---

# 43. Observability

Metrics:

### Detection
- risk evaluations
- elevated-risk rate
- review rate
- block rate
- step-up rate

### Accuracy
- false-positive rate
- overturned review rate
- confirmed abuse rate
- missed-abuse indicators

### Performance
- evaluation latency
- rule execution latency
- queue lag
- model latency

### Operations
- open cases
- aged cases
- hold duration
- appeal volume

---

# 44. Alerts

Alert on:

- sudden increase in blocked transactions
- sudden decrease/increase in approvals
- rule execution failures
- risk-service latency
- event processing backlog
- model unavailable
- unusual coupon abuse
- unusual refund activity
- payout anomalies
- account takeover spikes
- unexpected rule configuration changes

---

# 45. Testing

## Unit Tests

- rule evaluation
- risk score calculation
- velocity windows
- decision mapping
- action scope
- case creation
- hold/release
- idempotency

## Integration Tests

- identity → risk
- payment → risk
- order → risk
- coupon → risk
- refund → risk
- payout → risk
- risk case → admin workflow

## Concurrency Tests

Verify that repeated simultaneous actions cannot bypass controls.

Example:

```text
One account has a configured coupon usage limit.

10 concurrent redemption attempts occur.

Expected:
The committed redemptions do not exceed the configured limit.
```

## Abuse Simulation

Test scenarios such as:

- account takeover attempts
- coupon farming
- rapid order creation
- repeated failed payments
- refund abuse
- payout destination manipulation
- supplier inventory manipulation

---

# 46. Acceptance Criteria

The risk system is production-ready when:

1. Risk decisions are server-side.
2. Rules are configurable and versioned.
3. Critical decisions are auditable.
4. Account, buyer, supplier, payment, promotion, refund, and payout risk are supported.
5. Step-up verification is supported.
6. High-risk operations can be held for review.
7. Coupon and promotion abuse controls exist.
8. Payout risk controls exist.
9. Risk cases have a defined lifecycle.
10. Evidence is access-controlled.
11. Appeals/review workflows exist where required.
12. Historical decisions preserve rule/model versions.
13. Risk service failure behavior is explicitly configured.
14. Risk metrics and alerts exist.
15. False positives are measured.
16. Concurrency tests prevent control bypass.
17. Privacy and retention controls are implemented.
18. Administrative rule changes are audited.
19. Security controls protect risk infrastructure.
20. Production runbooks exist.

---

# 47. Implementation Sequence

## Phase 1 — Baseline Controls
- rate limiting
- account protection
- payment failure velocity
- order velocity
- coupon usage controls
- basic risk events
- audit logging

## Phase 2 — Transaction Risk
- order risk
- payment risk
- refund risk
- return risk
- COD risk where applicable

## Phase 3 — Supplier Risk
- fulfillment monitoring
- dispute/refund patterns
- inventory anomalies
- payout risk
- financial holds

## Phase 4 — Risk Operations
- risk cases
- review queues
- evidence
- holds
- appeals
- admin dashboards

## Phase 5 — Advanced Detection
- account linking signals
- anomaly detection
- behavioral models
- ML scoring where justified

## Phase 6 — Optimization
- model monitoring
- adaptive thresholds
- advanced analytics
- automated case prioritization

---

# 48. Definition of Done

- Risk event model is implemented.
- Core rules are configurable.
- Checkout/payment risk integration exists.
- Coupon/promotion abuse controls exist.
- Refund/return risk integration exists.
- Supplier and payout risk controls exist.
- Risk case management exists.
- Holds and release workflows exist.
- Audit trails are complete.
- Privacy/access controls are enforced.
- Risk metrics and alerts are configured.
- Concurrency and abuse simulations pass.
- Rule/model versioning works.
- Operational runbooks exist.

---

# 49. Final Architecture Position

Bezzo risk should be a cross-domain control layer rather than a single fraud-score endpoint:

```text
Identity
   ↓
Events
   ↓
Signals
   ↓
Rules / Models
   ↓
Risk Decision
   ↓
Allow / Step-Up / Review / Hold / Decline
   ↓
Audit + Analytics
```

The system should protect buyers, suppliers, payments, promotions, inventory, and payouts while preserving legitimate marketplace activity.

The key design principle is separation of concerns: operational domains remain authoritative for their own state, while the risk layer evaluates context and controls high-risk actions through explicit, auditable decisions.

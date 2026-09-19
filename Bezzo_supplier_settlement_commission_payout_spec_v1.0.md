# Bezzo Supplier Settlement, Commission & Payout Specification v1.0

## 1. Document Control

| Field | Value |
|---|---|
| Product | Bezzo |
| Document | Supplier Settlement, Commission & Payout Specification |
| Version | 1.0 |
| Status | Draft for implementation |
| Primary Actors | Suppliers, finance/admin users, buyers |
| Currency | INR initially |
| Related Domains | Orders, Payments, Pricing, Promotions, Refunds, Inventory, Logistics, Disputes, Analytics |

---

## 2. Purpose

This specification defines how Bezzo calculates supplier earnings, marketplace commissions, fees, discounts, refunds, adjustments, settlement balances, payout eligibility, and payout reconciliation.

The settlement system must preserve a complete financial trail from an order through payment, fulfillment, refund/dispute activity, supplier payable amount, settlement, and payout.

The system must distinguish buyer-facing order totals from supplier-facing settlement calculations.

---

# 3. Core Principles

1. Supplier settlement is calculated server-side.
2. Completed order price snapshots are immutable.
3. Every financial adjustment is auditable.
4. Payment collection and supplier payout are separate processes.
5. Supplier payout must never be based only on client-side order totals.
6. Refunds and disputes can change supplier payable balances.
7. Commission and fee rules must be versioned.
8. Supplier-funded and marketplace-funded discounts must remain distinguishable.
9. Settlement calculations must be deterministic and reproducible.
10. Payouts must be idempotent.
11. A supplier must only see its own financial data.
12. Administrative overrides require elevated permission and audit logging.
13. Reconciliation must identify discrepancies instead of silently correcting them.
14. Historical settlements must remain reproducible even after commercial rules change.
15. Tax/accounting treatment must be configurable and validated with the applicable finance/legal model before production use.

---

# 4. Financial Lifecycle

The recommended lifecycle is:

```text
Order Created
    ↓
Payment Authorized / Paid
    ↓
Supplier Fulfillment
    ↓
Delivery / Completion
    ↓
Refund / Dispute Window
    ↓
Settlement Eligible
    ↓
Settlement Calculated
    ↓
Settlement Approved
    ↓
Payout Initiated
    ↓
Payout Confirmed
    ↓
Reconciled
```

An order can create a financial obligation before it becomes eligible for payout.

---

# 5. Key Financial Concepts

## 5.1 Buyer Order Total

The amount charged to the buyer according to the final order price snapshot.

May include:

- merchandise
- discounts
- delivery charges
- applicable taxes
- other permitted fees

## 5.2 Gross Merchandise Value

The gross value of merchandise before applicable discounts.

## 5.3 Supplier Gross Sales

The portion of merchandise value attributable to a supplier's fulfillment.

## 5.4 Commission

The marketplace fee charged to a supplier according to the applicable commission rule.

## 5.5 Supplier-Funded Discount

A discount funded by the supplier.

## 5.6 Marketplace-Funded Discount

A discount funded by Bezzo.

## 5.7 Refund

Money returned to the buyer that may reduce supplier payable amounts depending on its cause and funding source.

## 5.8 Supplier Payable

The amount owed to the supplier after applicable deductions, adjustments, and approved credits.

## 5.9 Payout

The actual transfer of money to the supplier's configured bank account or supported payout destination.

---

# 6. Recommended Settlement Formula

A conceptual supplier settlement may be:

```text
Supplier Gross Merchandise Value
- Supplier-Funded Discounts
- Marketplace Commission
- Supplier-Funded Fees
- Applicable Adjustments
- Supplier Share of Refunds
- Supplier Dispute/Deduction Amounts
+ Approved Supplier Credits
= Supplier Payable
```

The exact financial treatment of taxes, payment fees, logistics fees, and other charges must be configured according to Bezzo's commercial and accounting model.

The formula must not be hard-coded into multiple services.

---

# 7. Commission Model

Bezzo should support configurable commission rules.

Possible models:

- percentage of merchandise value
- fixed amount per order
- fixed amount per item
- category-specific percentage
- supplier-specific percentage
- buyer/supplier contract percentage
- tiered commission

Example:

```text
Supplier GMV = ₹10,000
Commission = 5%

Commission = ₹500
```

The exact commission rate is commercial configuration and must not be embedded in application code.

---

# 8. Commission Basis

Each commission rule must explicitly define its calculation basis.

Possible bases:

- gross merchandise value
- net merchandise value
- eligible item value
- post-discount value
- supplier-specific payable value

A rule must not rely on an ambiguous term such as `order_total`.

Recommended fields:

```text
commission_type
commission_rate
commission_basis
minimum_fee
maximum_fee
effective_from
effective_until
```

---

# 9. Commission Versioning

When a commission rate changes:

```text
Old orders → old applicable rule
New eligible orders → new rule
```

The settlement record must store:

- commission rule ID
- rule version
- effective period
- calculated commission
- calculation basis

Historical settlements must never be recalculated using a newer commission rule.

---

# 10. Supplier-Funded vs Marketplace-Funded Discounts

Each discount must preserve funding attribution.

Example:

```text
Supplier-funded discount = ₹200
Marketplace-funded discount = ₹100
Total buyer discount = ₹300
```

Settlement must know that the supplier funded only ₹200.

This information originates from the pricing/discount system and must flow into settlement.

---

# 11. Supplier Settlement Snapshot

When settlement is calculated, Bezzo should persist a financial snapshot.

Recommended fields:

```text
settlement_id
supplier_id
order_id
fulfillment_id
currency
gross_merchandise_value
supplier_funded_discount
marketplace_funded_discount
commission_amount
supplier_fees
refund_amount
dispute_adjustment
credits
debits
net_supplier_payable
calculation_version
calculated_at
```

This snapshot allows later reconstruction and auditing.

---

# 12. Multi-Supplier Orders

A buyer may place one order containing multiple suppliers.

Example:

```text
Order #1001
├── Supplier A fulfillment
│   └── ₹2,000
└── Supplier B fulfillment
    └── ₹3,000
```

Settlement must be calculated independently for each supplier fulfillment.

The buyer sees one order, while finance sees supplier-specific settlement records.

---

# 13. Fulfillment-Level Financial Ownership

Every supplier fulfillment should have an explicit financial owner.

Required linkage:

```text
Order
  ↓
Order Item
  ↓
Fulfillment
  ↓
Supplier
  ↓
Settlement
```

This prevents cross-supplier financial contamination.

---

# 14. Settlement Eligibility

An order/fulfillment should become settlement-eligible only after configured conditions are satisfied.

Possible conditions:

- payment successfully collected
- supplier fulfillment completed
- delivery completed
- cancellation processing complete
- required refund window completed
- dispute state acceptable
- no unresolved financial hold
- required documentation available

Eligibility rules must be configurable.

---

# 15. Settlement Status

Recommended states:

```text
PENDING
INELIGIBLE
ELIGIBLE
CALCULATED
UNDER_REVIEW
APPROVED
PAYOUT_PENDING
PAID
PARTIALLY_PAID
ON_HOLD
DISPUTED
REVERSED
CANCELLED
```

State transitions must be validated server-side.

---

# 16. Supplier Financial Holds

A supplier payout may be placed on hold because of:

- unresolved dispute
- payment/reconciliation issue
- compliance review
- bank-account verification issue
- unusual transaction activity
- return/refund exposure
- administrative investigation

A hold must include:

- reason
- created by
- created timestamp
- scope
- optional expiry/review date
- resolution information

Supplier-facing UI should provide an appropriate status without exposing sensitive internal risk details.

---

# 17. Payout Schedule

Bezzo may support configurable payout schedules such as:

- daily
- weekly
- twice monthly
- monthly
- manual

The selected schedule must be stored in supplier configuration.

Example:

```text
Settlement eligible
→ weekly payout cycle
→ approved payout batch
→ bank transfer
```

The actual schedule is a business configuration and should not be hard-coded.

---

# 18. Minimum Payout Threshold

Bezzo may define a minimum payout amount.

Example:

```text
Supplier payable = ₹420
Minimum payout threshold = ₹1,000

₹420 remains in payable balance.
```

When the threshold is reached, the balance can enter the next eligible payout cycle.

Threshold configuration must be versioned.

---

# 19. Payout Destination

Supplier payout profile should contain:

- beneficiary name
- bank account reference
- IFSC or applicable banking identifier
- bank verification state
- payout destination ID
- status
- verification timestamp

Sensitive banking information must be encrypted/protected and access-controlled.

Where possible, the application should store provider tokens/references rather than unnecessarily exposing raw financial credentials.

---

# 20. Supplier Bank Verification

Recommended states:

```text
NOT_SUBMITTED
PENDING
VERIFIED
FAILED
REQUIRES_UPDATE
BLOCKED
```

Payout must not be initiated to an unverified destination unless an explicitly approved business flow permits it.

---

# 21. Payout Batch

A payout batch groups supplier settlement amounts for transfer.

Fields:

```text
payout_batch_id
supplier_id
currency
settlement_count
gross_amount
deductions
net_amount
destination_id
status
created_at
processed_at
```

Batch states:

- CREATED
- VALIDATING
- APPROVED
- INITIATED
- PROCESSING
- COMPLETED
- FAILED
- PARTIALLY_COMPLETED
- CANCELLED

---

# 22. Payout Idempotency

Payout initiation must be idempotent.

The same payout instruction must not create multiple bank transfers.

Use:

```text
payout_id
provider_reference
idempotency_key
```

and maintain a strict mapping between Bezzo payout records and provider transaction references.

---

# 23. Payment Gateway Reconciliation

The payment system may report:

- payment collected
- payment failed
- payment refunded
- partial refund
- chargeback/dispute

Settlement must consume reconciled payment events rather than assuming every created order was successfully paid.

---

# 24. Refund Impact

Refunds can affect supplier settlement.

Examples:

### Supplier-Caused Refund

May reduce supplier payable according to the applicable commercial rule.

### Marketplace-Caused Refund

May be funded partly or fully by Bezzo.

### Supplier-Funded Promotion Refund

Discount funding must be reversed/adjusted consistently.

The exact financial responsibility must be represented by an explicit adjustment record rather than inferred later.

---

# 25. Partial Refunds

Partial refunds require deterministic allocation.

Example:

```text
Order:
Item A = ₹1,000
Item B = ₹2,000
Total = ₹3,000

Refund Item A = ₹1,000
```

Settlement should reduce the supplier obligation only by the financial amount attributable to the refunded item, plus any associated adjustment required by the applicable rule.

---

# 26. Returns and Reverse Logistics

Return outcomes may create:

- supplier debit
- supplier credit
- marketplace debit
- logistics adjustment
- inventory adjustment

Settlement must consume the finalized return/disposition result.

Unresolved returns may create a financial hold or pending adjustment depending on policy.

---

# 27. Disputes

A dispute may involve:

- wrong product
- missing product
- damaged product
- expired product
- quantity mismatch
- price mismatch
- delivery issue
- payment issue

Dispute records should be linked to:

```text
order
fulfillment
order item
supplier
customer claim
evidence
resolution
financial adjustment
```

---

# 28. Financial Adjustments

Settlement must support explicit adjustments.

Adjustment types:

- COMMISSION
- DISCOUNT
- REFUND
- RETURN
- DISPUTE
- LOGISTICS
- PAYMENT_FEE
- TAX
- PENALTY
- CREDIT
- MANUAL_ADJUSTMENT
- RECONCILIATION

Every adjustment requires:

- amount
- direction
- reason
- reference
- actor/source
- timestamp
- rule/version where applicable

---

# 29. Manual Adjustments

Manual financial adjustments are high-risk.

They require:

- authorized role
- reason
- amount
- supporting reference
- maker identity
- timestamp
- optional checker approval

Large adjustments should support maker-checker approval.

Historical adjustments must not be deleted.

---

# 30. Credit Notes / Debit Notes

Where required by the accounting model, Bezzo should support references to supplier credit/debit documents.

A financial adjustment should link to the appropriate accounting document/reference.

The exact tax-document treatment must be defined with the accounting/tax implementation before production.

---

# 31. Taxes

Settlement must support tax-related fields without hard-coding assumptions.

Possible data includes:

- taxable amount
- tax component
- withholding amount
- tax document reference
- supplier tax registration reference
- tax treatment code

Tax calculations and withholding requirements must be implemented according to the applicable jurisdiction and reviewed by qualified tax/accounting professionals.

---

# 32. Invoice and Financial Documents

Supplier-facing financial documents may include:

- settlement statement
- payout statement
- commission statement
- credit/debit adjustment statement
- applicable tax/accounting documents

Documents should be generated from immutable financial records.

---

# 33. Supplier Settlement Statement

A statement should show:

```text
Settlement period
Orders included
Gross merchandise value
Supplier-funded discounts
Marketplace-funded discounts
Commission
Other deductions
Refunds
Disputes
Credits
Net payable
Opening balance
Closing balance
Payouts
Remaining balance
```

Supplier users should be able to filter and export authorized records.

---

# 34. Reconciliation

Three reconciliation layers are recommended:

### Order Reconciliation

Compare orders with fulfillment and financial snapshots.

### Payment Reconciliation

Compare Bezzo payment records with gateway/provider reports.

### Payout Reconciliation

Compare approved payouts with provider/bank results.

Mismatch examples:

- paid order with missing settlement
- settlement without successful payment
- payout marked completed but provider failed
- duplicate provider reference
- amount mismatch
- refund missing from settlement

---

# 35. Reconciliation Workflow

```text
Import/receive provider data
→ Match by reference
→ Compare amounts/status
→ Identify exceptions
→ Queue exception
→ Review
→ Correct via auditable adjustment
→ Close
```

Never silently modify historical financial records to force a match.

---

# 36. Settlement Ledger

A dedicated financial ledger should record supplier balance movements.

Example events:

```text
SALE_CREDIT
COMMISSION_DEBIT
DISCOUNT_DEBIT
REFUND_DEBIT
DISPUTE_DEBIT
LOGISTICS_DEBIT
MANUAL_DEBIT
CREDIT_ADJUSTMENT
PAYOUT_DEBIT
```

Ledger entries should be append-only.

Supplier balance should be derivable from ledger movements.

---

# 37. Supplier Balance

Conceptually:

```text
Opening Balance
+ Eligible Sales
+ Credits
- Commission
- Discounts
- Refunds
- Disputes
- Other Deductions
- Payouts
= Closing Balance
```

The authoritative balance must be backed by ledger entries.

---

# 38. Database Model

Recommended tables:

```text
commission_rules
commission_rule_versions
supplier_settlements
settlement_items
settlement_adjustments
supplier_financial_ledger
supplier_balances
payout_profiles
payouts
payout_batches
payout_transactions
financial_holds
financial_documents
reconciliation_runs
reconciliation_items
supplier_tax_profiles
```

Important indexes:

```text
supplier_id + settlement_status
supplier_id + created_at
order_id
fulfillment_id
payout_id
provider_reference
reconciliation_status
financial_ledger supplier_id + created_at
```

---

# 39. API Surface

## Supplier Finance

```http
GET /v1/suppliers/{supplierId}/finance/summary
GET /v1/suppliers/{supplierId}/finance/settlements
GET /v1/suppliers/{supplierId}/finance/settlements/{id}
GET /v1/suppliers/{supplierId}/finance/ledger
GET /v1/suppliers/{supplierId}/finance/payouts
GET /v1/suppliers/{supplierId}/finance/documents
```

## Admin Finance

```http
POST /v1/admin/settlements/run
POST /v1/admin/settlements/{id}/approve
POST /v1/admin/settlements/{id}/hold
POST /v1/admin/settlements/{id}/release
POST /v1/admin/payouts
POST /v1/admin/payouts/{id}/retry
POST /v1/admin/reconciliation/run
POST /v1/admin/financial-adjustments
```

Internal services:

```http
POST /internal/finance/settlement/calculate
POST /internal/finance/settlement/eligibility
POST /internal/finance/refund-adjustment
POST /internal/finance/payout/reconcile
```

---

# 40. Events

Financial domain events may include:

```text
SettlementEligible
SettlementCalculated
SettlementApproved
SettlementHeld
SettlementReleased
PayoutCreated
PayoutInitiated
PayoutCompleted
PayoutFailed
RefundSettlementAdjusted
DisputeSettlementAdjusted
FinancialAdjustmentCreated
ReconciliationExceptionCreated
ReconciliationCompleted
```

Events should include:

- event ID
- event type
- aggregate ID
- supplier ID
- timestamp
- correlation ID
- source
- schema version

---

# 41. Security

Financial data requires strong controls.

Requirements:

- supplier tenant isolation
- RBAC
- least privilege
- encrypted sensitive financial data
- secure secrets
- provider credential protection
- immutable audit logs
- maker-checker for high-risk actions
- rate limiting
- service-to-service authentication
- restricted financial exports
- secure document access

Supplier users must never access another supplier's settlements or payout information.

---

# 42. Audit Trail

Audit events must capture:

- who
- what
- when
- why
- previous state
- new state
- source
- correlation ID
- affected financial amount
- related entity

Financial history must be traceable from payout back to settlement, order, fulfillment, pricing snapshot, payment, refund, and adjustment.

---

# 43. Observability

Metrics:

### Settlement
- eligible settlement count
- calculated settlement amount
- settlement failures
- settlement processing time

### Payout
- payout amount
- payout success rate
- payout failure rate
- payout latency
- retry count

### Reconciliation
- mismatch count
- unmatched payments
- unmatched payouts
- amount variance
- reconciliation age

### Supplier
- payable balance
- held balance
- refunded amount
- dispute deductions

---

# 44. Alerts

Critical alerts include:

- duplicate payout risk
- payout provider failure
- settlement calculation failure
- unexplained balance mismatch
- reconciliation backlog
- unusually high refund deductions
- provider amount mismatch
- bank destination verification failure
- repeated payout retries
- ledger imbalance

---

# 45. Testing

## Unit Tests

- commission calculation
- discount funding
- settlement formula
- refund allocation
- adjustment direction
- payout threshold
- eligibility rules
- balance calculations

## Integration Tests

- order → settlement
- payment → settlement
- refund → adjustment
- dispute → adjustment
- settlement → payout
- payout → reconciliation

## Concurrency Tests

Verify that two workers cannot create duplicate settlement or payout effects.

Example:

```text
Two workers process the same settlement.

Expected:
One financial settlement is created.
The second request is idempotently ignored or returns the existing result.
```

## Failure Tests

- provider timeout
- duplicate webhook
- payout retry
- partial payout batch failure
- database transaction rollback
- reconciliation mismatch

---

# 46. Acceptance Criteria

The finance module is production-ready when:

1. Supplier financial data is tenant-isolated.
2. Commission rules are versioned.
3. Settlement calculations are deterministic.
4. Supplier and marketplace discounts are distinguishable.
5. Multi-supplier orders settle independently.
6. Refunds and disputes create explicit financial adjustments.
7. Supplier balances are ledger-backed.
8. Historical settlements are immutable.
9. Payouts are idempotent.
10. Bank/payout destinations are verified according to policy.
11. Settlement eligibility is configurable.
12. Financial holds are auditable.
13. Reconciliation identifies provider mismatches.
14. Manual adjustments are permission-controlled.
15. Tax/accounting fields support the configured financial model.
16. Supplier statements can be generated.
17. Critical financial events are observable.
18. Concurrency tests prevent duplicate financial effects.
19. Security controls are enforced.
20. Production runbooks exist for payout and reconciliation failures.

---

# 47. Implementation Sequence

## Phase 1 — Financial Foundation
- supplier financial ledger
- commission rules
- settlement records
- supplier balance
- order/fulfillment integration

## Phase 2 — Refunds and Adjustments
- refund adjustments
- return adjustments
- dispute adjustments
- manual adjustment controls

## Phase 3 — Supplier Payouts
- payout profiles
- bank verification
- payout batches
- payout provider integration
- idempotency

## Phase 4 — Reconciliation
- payment reconciliation
- settlement reconciliation
- payout reconciliation
- exception workflows

## Phase 5 — Financial Documents
- supplier statements
- settlement statements
- payout statements
- accounting document references

## Phase 6 — Advanced Finance
- configurable commission tiers
- supplier contracts
- automated financial holds
- advanced reporting
- finance operations dashboards

---

# 48. Definition of Done

- Financial database schema and migrations exist.
- Commission engine is implemented.
- Settlement calculation is implemented.
- Supplier financial ledger is implemented.
- Refund/dispute adjustments integrate correctly.
- Supplier balances are reproducible.
- Payout flow is idempotent.
- Provider reconciliation is implemented.
- Supplier finance UI exists.
- Admin finance controls exist.
- Audit trails are complete.
- Financial security controls are enforced.
- Unit/integration/concurrency tests pass.
- Operational monitoring and alerts exist.
- Production payout and reconciliation runbooks exist.

---

# 49. Final Architecture Position

Bezzo financial architecture should preserve a clear separation:

```text
Order
  ↓
Payment
  ↓
Fulfillment
  ↓
Settlement Eligibility
  ↓
Settlement Calculation
  ↓
Financial Ledger
  ↓
Payout
  ↓
Provider/Bank
  ↓
Reconciliation
```

Pricing determines what the buyer and supplier offer are worth. Payments determine what Bezzo actually collected. Settlement determines what the supplier is owed. Payout transfers that payable balance. Reconciliation verifies that the financial system and external providers agree.

This separation gives Bezzo a traceable financial chain and provides the foundation for scalable supplier payouts, commissions, refunds, disputes, and marketplace finance operations.

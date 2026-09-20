-- 0015_payment_operations.sql
-- Description: grants the payment backoffice permissions and records reconciliation bookkeeping.
-- References: Bezzo_payment_and_billing_spec (PRD/TRD §26),
--             Bezzo_webhooks_event_delivery_external_integration_reliability_engineering_spec_v1.0.md,
--             Bezzo_admin_operations_and_backoffice_spec_v1.0.md.
--
-- Design notes
--  * Permissions are created by migrations, not only by the development seed: a production database is
--    migrated and never seeded, so a permission that only exists in the seed would be ungrantable there.
--  * `reconciled_at` is nullable and additive: it records the last time the provider's own answer was
--    fetched for this payment, which is the audit trail for "we did not simply trust a webhook".
--  * Forward-only and expand-only: nothing is dropped, renamed or rewritten.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- Payments whose status was last changed authoritatively by a provider poll rather than by a webhook.
-- The reconciliation job scans the partial index from 0007; this one answers "when did we last check?".
CREATE INDEX IF NOT EXISTS payments_reconciled_idx ON payments (reconciled_at)
  WHERE status IN ('PENDING', 'AUTHORIZED');

INSERT INTO permissions (code, description) VALUES
  ('admin.payment.read',   'Read payments, attempts, refunds and webhook evidence'),
  ('admin.payment.review', 'Execute refunds and resolve payment disputes')
ON CONFLICT (code) DO NOTHING;

-- Reading the money trail is broader than moving it: support agents can investigate a failed payment,
-- while only administrators and operations agents may execute a refund.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('admin.payment.read', 'admin.payment.review')
 WHERE r.code IN ('ADMIN', 'SUPER_ADMIN', 'OPERATIONS_AGENT', 'SUPPORT_AGENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code = 'admin.payment.review'
 WHERE r.code IN ('ADMIN', 'SUPER_ADMIN', 'OPERATIONS_AGENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

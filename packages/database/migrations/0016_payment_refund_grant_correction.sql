-- 0016_payment_refund_grant_correction.sql
-- Description: removes the refund right from support agents, which 0015 granted by accident.
-- References: Bezzo_admin_operations_and_backoffice_spec_v1.0.md (least privilege per role),
--             Bezzo_payment_and_billing_spec (who may move money).
--
-- Why this file exists
--   The first version of 0015 granted both `admin.payment.read` and `admin.payment.review` with the
--   permission code selected by an IN list, so every role named in that statement — support agents
--   included — received the refund right. The intent, stated in 0015's own comment and in the
--   backoffice spec, is that support investigates money movements while administrators and operations
--   agents execute them.
--
--   0015 is already applied and is therefore left exactly as it ran (the migrator refuses edited
--   migrations, correctly: a database that already ran it must not silently diverge from a database
--   that has not). Every database — including a fresh one — therefore reaches the intended grants by
--   running 0015 and then this file. The statement below can only ever remove the one grant that was
--   never intended, so it is safe on a fresh database, on an existing one, and on a re-run.
--
-- It is deliberately narrow: it revokes one permission from one role and touches nothing else, so it is
-- safe to run against a live database, and re-running it is a no-op.

DELETE FROM role_permissions rp
 USING roles r, permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.code = 'SUPPORT_AGENT'
   AND p.code = 'admin.payment.review';

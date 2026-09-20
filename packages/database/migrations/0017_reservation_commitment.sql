-- 0017_reservation_commitment.sql
-- Description: a committed inventory reservation has no payment window, so `expires_at` becomes nullable.
-- References: Bezzo_inventory_warehouse_stock_management_spec_v1.0.md (reservation lifecycle),
--             Bezzo_cart_checkout_order_placement_spec_v1.0.md (§14 reservation TTL),
--             Bezzo_business_rules_state_machine_spec_v1.0.md (ACTIVE → CONFIRMED | EXPIRED | RELEASED).
--
-- Why
--   `inventory_reservations.status = 'ACTIVE'` means "held, and released if the payment window elapses".
--   `'CONFIRMED'` means "the commitment is real; the goods are owed to this order". Cash on delivery is
--   committed the moment the order is placed, and a prepaid order is committed the moment the gateway
--   capture is applied — neither has a window left to wait for. Before this migration every reservation
--   carried a mandatory `expires_at`, so a confirmed order still looked like a timed hold and the expiry
--   job could return its stock to the shelf while the order was live and expected to be fulfilled.
--
--   Relaxing the column (rather than rewriting rows) is the expand-contract direction: NOT NULL → NULL
--   is safe for readers, backward compatible for every existing row — which keeps its timestamp — and the
--   partial index on `('ACTIVE')` does not change, because only ACTIVE reservations are ever due.
--
--   No data migration is required or performed: existing ACTIVE rows keep their expiry, and the worker
--   (see `apps/api/src/modules/workers/worker.module.ts`) additionally requires that the order still be
--   waiting for payment before it releases anything.

ALTER TABLE inventory_reservations ALTER COLUMN expires_at DROP NOT NULL;

COMMENT ON COLUMN inventory_reservations.expires_at IS
  'End of the payment window for an ACTIVE reservation. NULL for a CONFIRMED reservation: the commitment is absolute and no timer can release it.';

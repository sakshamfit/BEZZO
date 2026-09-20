-- 0005_listings_inventory.sql
-- Description: supplier commercial listings, authoritative inventory, concurrency-safe reservations
--              and the immutable inventory ledger.
-- References: Bezzo_inventory_warehouse_stock_management_spec_v1.0.md,
--             Bezzo_database_transactions_consistency_data_integrity_engineering_spec_v1.0.md,
--             Bezzo_distributed_locks_idempotency_concurrency_control_engineering_spec_v1.0.md,
--             BEZZO-DATABASE.md §12 (sellable = available - reserved), §30 (concurrency).
--
-- CRITICAL INVARIANTS (must never be violated; enforced by CHECK constraints and atomic updates)
--   I1. inventories.available_quantity >= 0
--   I2. inventories.reserved_quantity  >= 0
--   I3. inventories.reserved_quantity  <= inventories.available_quantity
--   I4. sellable_quantity = available_quantity - reserved_quantity
--   I5. a reservation is only created by a conditional UPDATE that simultaneously increments
--       reserved_quantity; therefore two concurrent buyers can never reserve the same final unit.
--   I6. every quantity change writes an inventory_transactions ledger row.

CREATE TABLE supplier_product_listings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_sku          TEXT,
  selling_price         NUMERIC(14,2) NOT NULL CHECK (selling_price >= 0),
  mrp_reference         NUMERIC(14,2) CHECK (mrp_reference IS NULL OR mrp_reference >= 0),
  tax_rate              NUMERIC(6,3) CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)),
  minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
  lead_time_minutes     INTEGER CHECK (lead_time_minutes IS NULL OR lead_time_minutes >= 0),
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','ACTIVE','PAUSED','OUT_OF_STOCK','SUSPENDED')),
  suspended_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Price must never exceed MRP: B2B pharma pricing above MRP is not a valid marketplace offer.
  CONSTRAINT listings_price_not_above_mrp CHECK (mrp_reference IS NULL OR selling_price <= mrp_reference)
);
CREATE UNIQUE INDEX supplier_listings_supplier_product_unique ON supplier_product_listings (supplier_id, product_id);
CREATE UNIQUE INDEX supplier_listings_sku_unique
  ON supplier_product_listings (supplier_id, supplier_sku) WHERE supplier_sku IS NOT NULL;
CREATE INDEX supplier_listings_product_idx ON supplier_product_listings (product_id, status);
CREATE INDEX supplier_listings_supplier_status_idx ON supplier_product_listings (supplier_id, status, updated_at DESC);

CREATE TRIGGER supplier_listings_touch_updated_at BEFORE UPDATE ON supplier_product_listings
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE price_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_listing_id UUID NOT NULL REFERENCES supplier_product_listings(id) ON DELETE CASCADE,
  price               NUMERIC(14,2) NOT NULL,
  mrp                 NUMERIC(14,2),
  effective_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to        TIMESTAMPTZ,
  changed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX price_history_listing_idx ON price_history (supplier_listing_id, effective_from DESC);

-- ------------------------------------------------------------------------------------------------
-- Authoritative inventory. One row per supplier listing (FK to the listing, per ERD spec §26.1).
-- ------------------------------------------------------------------------------------------------
CREATE TABLE inventories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_listing_id UUID NOT NULL REFERENCES supplier_product_listings(id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  available_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  damaged_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  expired_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (expired_quantity >= 0),
  blocked_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (blocked_quantity >= 0),
  low_stock_threshold INTEGER CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  status              TEXT NOT NULL DEFAULT 'AVAILABLE'
                        CHECK (status IN ('AVAILABLE','LOW_STOCK','OUT_OF_STOCK','QUARANTINED','BLOCKED','DAMAGED','EXPIRED','RECALLED','DEPLETED')),
  batch_number        TEXT,
  expiry_date         DATE,
  -- Optimistic concurrency token; incremented by every stock mutation.
  version             INTEGER NOT NULL DEFAULT 0,
  source              TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','IMPORT','ERP_SYNC','SYSTEM')),
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventories_reserved_within_available CHECK (reserved_quantity <= available_quantity)
);
CREATE UNIQUE INDEX inventories_listing_unique ON inventories (supplier_listing_id);
CREATE INDEX inventories_supplier_idx ON inventories (supplier_id, status);
CREATE INDEX inventories_low_stock_idx ON inventories (supplier_id)
  WHERE low_stock_threshold IS NOT NULL;
CREATE INDEX inventories_expiry_idx ON inventories (expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TRIGGER inventories_touch_updated_at BEFORE UPDATE ON inventories
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE inventory_reservations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id  UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  order_id      UUID,
  order_item_id UUID,
  checkout_id   UUID,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','CONFIRMED','RELEASED','EXPIRED','CANCELLED')),
  expires_at    TIMESTAMPTZ NOT NULL,
  confirmed_at  TIMESTAMPTZ,
  released_at   TIMESTAMPTZ,
  release_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_reservations_inventory_idx ON inventory_reservations (inventory_id, status);
CREATE INDEX inventory_reservations_order_idx ON inventory_reservations (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX inventory_reservations_checkout_idx ON inventory_reservations (checkout_id) WHERE checkout_id IS NOT NULL;
-- The expiring-reservation worker scans only active, due reservations.
CREATE INDEX inventory_reservations_expiry_idx ON inventory_reservations (expires_at) WHERE status = 'ACTIVE';
-- A given order item may hold at most one active reservation.
CREATE UNIQUE INDEX inventory_reservations_order_item_active_unique
  ON inventory_reservations (order_item_id) WHERE status = 'ACTIVE' AND order_item_id IS NOT NULL;

CREATE TRIGGER inventory_reservations_touch_updated_at BEFORE UPDATE ON inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Immutable ledger: every quantity change is explainable after the fact.
CREATE TABLE inventory_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id     UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
                     'STOCK_IN','STOCK_OUT','RESERVATION','RESERVATION_RELEASE','RESERVATION_EXPIRY',
                     'SALE','RETURN','ADJUSTMENT','DAMAGE','EXPIRY','BLOCK','UNBLOCK')),
  quantity         INTEGER NOT NULL,
  before_quantity  INTEGER NOT NULL,
  after_quantity   INTEGER NOT NULL CHECK (after_quantity >= 0),
  reason           TEXT,
  reference_type   TEXT,
  reference_id     UUID,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_transactions_inventory_idx ON inventory_transactions (inventory_id, created_at DESC);
CREATE INDEX inventory_transactions_reference_idx ON inventory_transactions (reference_type, reference_id);
CREATE INDEX inventory_transactions_type_idx ON inventory_transactions (transaction_type, created_at DESC);

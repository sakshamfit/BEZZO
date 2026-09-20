-- 0006_cart_checkout_orders.sql
-- Description: cart, checkout workflow, delivery slots, orders, multi-supplier fulfillments and
--              their status histories.
-- References: Bezzo_cart_checkout_order_placement_spec_v1.0.md,
--             Bezzo_order_fulfillment_and_multi_supplier_spec_v1.0.md,
--             Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md §30–§41,
--             Bezzo_business_rules_state_machine_spec_v1.0.md §12–§16.
--
-- Design notes
--  * Order = what the retailer purchased. Fulfillment = which supplier fulfils it. These are never
--    collapsed (project rule §5). A single order therefore has 1..N fulfillments.
--  * Address snapshots are stored on the order: buyers edit addresses after placing an order and the
--    historical document must not change.
--  * Order totals are always recomputed server-side; client-supplied totals are ignored.

CREATE TABLE delivery_slots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  max_capacity INTEGER CHECK (max_capacity IS NULL OR max_capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delivery_slots_time_order CHECK (end_time > start_time)
);

CREATE TRIGGER delivery_slots_touch_updated_at BEFORE UPDATE ON delivery_slots
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE delivery_slot_capacity (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id            UUID NOT NULL REFERENCES delivery_slots(id) ON DELETE CASCADE,
  delivery_date      DATE NOT NULL,
  capacity           INTEGER NOT NULL CHECK (capacity >= 0),
  reserved_capacity  INTEGER NOT NULL DEFAULT 0 CHECK (reserved_capacity >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delivery_slot_capacity_unique UNIQUE (slot_id, delivery_date),
  CONSTRAINT delivery_slot_capacity_within CHECK (reserved_capacity <= capacity)
);

CREATE TRIGGER delivery_slot_capacity_touch_updated_at BEFORE UPDATE ON delivery_slot_capacity
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE','CHECKOUT_STARTED','CONVERTED','ABANDONED','EXPIRED')),
  currency   TEXT NOT NULL DEFAULT 'INR',
  coupon_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A buyer has at most one open cart; historical (converted/abandoned) carts are retained.
CREATE UNIQUE INDEX carts_active_unique ON carts (buyer_id) WHERE status IN ('ACTIVE','CHECKOUT_STARTED');

CREATE TRIGGER carts_touch_updated_at BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE cart_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id             UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  supplier_listing_id UUID NOT NULL REFERENCES supplier_product_listings(id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cart_items_unique ON cart_items (cart_id, supplier_listing_id);
CREATE INDEX cart_items_cart_idx ON cart_items (cart_id);

CREATE TRIGGER cart_items_touch_updated_at BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Checkout is a short-lived workflow; the order is the financial record.
CREATE TABLE checkout_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id            UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  cart_id             UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'STARTED'
                        CHECK (status IN ('STARTED','PRICING','INVENTORY_CHECK','INVENTORY_RESERVED','PAYMENT_PENDING','PAYMENT_CONFIRMED','ORDER_CREATED','FAILED','EXPIRED','CANCELLED')),
  idempotency_key     TEXT NOT NULL,
  delivery_mode       TEXT NOT NULL CHECK (delivery_mode IN ('INSTANT','SCHEDULED')),
  delivery_date       DATE,
  delivery_slot_id    UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
  address_id          UUID NOT NULL REFERENCES buyer_addresses(id) ON DELETE RESTRICT,
  shipping_address_snapshot JSONB,
  payment_method      TEXT CHECK (payment_method IN ('UPI','CARD','NET_BANKING','WALLET','COD')),
  currency            TEXT NOT NULL DEFAULT 'INR',
  calculated_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  delivery_fee        NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  pricing_snapshot    JSONB NOT NULL DEFAULT '[]'::JSONB,
  failure_reason      TEXT,
  order_id            UUID,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX checkout_sessions_buyer_idempotency_unique ON checkout_sessions (buyer_id, idempotency_key);
CREATE INDEX checkout_sessions_status_idx ON checkout_sessions (status, expires_at);
CREATE INDEX checkout_sessions_buyer_idx ON checkout_sessions (buyer_id, created_at DESC);

CREATE TRIGGER checkout_sessions_touch_updated_at BEFORE UPDATE ON checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number              TEXT NOT NULL UNIQUE,
  buyer_id                  UUID NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  status                    TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                              CHECK (status IN ('PENDING_PAYMENT','CONFIRMED','PROCESSING','PARTIALLY_FULFILLED','FULFILLED','CANCELLED','PARTIALLY_CANCELLED','RETURN_REQUESTED','PARTIALLY_RETURNED','RETURNED','CLOSED')),
  payment_status            TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (payment_status IN ('PENDING','AUTHORIZED','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED','CANCELLED')),
  currency                  TEXT NOT NULL DEFAULT 'INR',
  subtotal                  NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
  discount_total            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  delivery_fee              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  grand_total               NUMERIC(14,2) NOT NULL CHECK (grand_total >= 0),
  delivery_mode             TEXT NOT NULL CHECK (delivery_mode IN ('INSTANT','SCHEDULED')),
  delivery_date             DATE,
  delivery_slot_id          UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
  shipping_address_snapshot JSONB NOT NULL,
  billing_address_snapshot  JSONB,
  buyer_note                TEXT,
  cancellation_reason       TEXT,
  placed_at                 TIMESTAMPTZ,
  confirmed_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  checkout_session_id       UUID REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_buyer_idx ON orders (buyer_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_payment_status_idx ON orders (payment_status) WHERE payment_status <> 'PAID';
CREATE INDEX orders_delivery_schedule_idx ON orders (delivery_date, delivery_slot_id) WHERE delivery_date IS NOT NULL;

CREATE TRIGGER orders_touch_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_listing_id   UUID NOT NULL REFERENCES supplier_product_listings(id) ON DELETE RESTRICT,
  supplier_id           UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  manufacturer_snapshot TEXT,
  composition_snapshot  TEXT,
  pack_size_snapshot    TEXT,
  unit_price            NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  mrp_snapshot          NUMERIC(14,2),
  tax_rate_snapshot     NUMERIC(6,3),
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  discount_amount       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total            NUMERIC(14,2) NOT NULL CHECK (line_total >= 0),
  status                TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','CONFIRMED','ALLOCATED','PROCESSING','DISPATCHED','DELIVERED','CANCELLED','RETURN_REQUESTED','RETURNED','REFUNDED')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_supplier_idx ON order_items (supplier_id, created_at DESC);
CREATE INDEX order_items_product_idx ON order_items (product_id);

CREATE TRIGGER order_items_touch_updated_at BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE order_status_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status  TEXT NOT NULL,
  reason     TEXT,
  actor_type TEXT NOT NULL DEFAULT 'SYSTEM'
               CHECK (actor_type IN ('SYSTEM','USER','ADMIN','SUPPLIER','BUYER','PICKER','HUB','PROVIDER')),
  actor_id   UUID,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, created_at);

-- ------------------------------------------------------------------------------------------------
-- Fulfillments: one per supplier per order.
-- ------------------------------------------------------------------------------------------------
CREATE TABLE fulfillments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id           UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  fulfillment_reference TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL DEFAULT 'CREATED'
                          CHECK (status IN ('CREATED','ALLOCATING','ALLOCATED','PICKING','PACKED','READY_FOR_PICKUP','READY_FOR_DISPATCH','PICKUP_ASSIGNED','COLLECTED','AT_HUB','HANDED_TO_LOGISTICS','IN_TRANSIT','DELIVERED','FAILED','CANCELLED','RETURNING','RETURNED')),
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  delivery_allocation   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (delivery_allocation >= 0),
  total                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  package_count         INTEGER NOT NULL DEFAULT 0 CHECK (package_count >= 0),
  hub_id                UUID,
  accepted_at           TIMESTAMPTZ,
  packed_at             TIMESTAMPTZ,
  ready_at              TIMESTAMPTZ,
  collected_at          TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fulfillments_order_supplier_unique ON fulfillments (order_id, supplier_id);
CREATE INDEX fulfillments_supplier_idx ON fulfillments (supplier_id, status, created_at DESC);
CREATE INDEX fulfillments_status_idx ON fulfillments (status);
-- Pickup task generation scans ready fulfillments that do not yet have an active task.
CREATE INDEX fulfillments_ready_idx ON fulfillments (ready_at) WHERE status IN ('PACKED','READY_FOR_PICKUP','PICKUP_ASSIGNED');

CREATE TRIGGER fulfillments_touch_updated_at BEFORE UPDATE ON fulfillments
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE fulfillment_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id UUID NOT NULL REFERENCES fulfillments(id) ON DELETE CASCADE,
  order_item_id  UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','ALLOCATED','PACKED','COLLECTED','DELIVERED','SHORT_PICKED','CANCELLED')),
  short_picked_quantity INTEGER NOT NULL DEFAULT 0 CHECK (short_picked_quantity >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_items_unique UNIQUE (fulfillment_id, order_item_id)
);
CREATE INDEX fulfillment_items_fulfillment_idx ON fulfillment_items (fulfillment_id);

CREATE TRIGGER fulfillment_items_touch_updated_at BEFORE UPDATE ON fulfillment_items
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE fulfillment_status_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id UUID NOT NULL REFERENCES fulfillments(id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  reason         TEXT,
  actor_type     TEXT NOT NULL DEFAULT 'SYSTEM'
                   CHECK (actor_type IN ('SYSTEM','USER','ADMIN','SUPPLIER','BUYER','PICKER','HUB','PROVIDER')),
  actor_id       UUID,
  request_id     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fulfillment_status_history_idx ON fulfillment_status_history (fulfillment_id, created_at);

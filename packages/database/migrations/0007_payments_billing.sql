-- 0007_payments_billing.sql
-- Description: payments, gateway attempts, verified webhook records, refunds and invoices.
-- References: Bezzo_payment_and_billing_spec (PRD/TRD §26), Bezzo_webhooks_event_delivery_external_integration_reliability_engineering_spec_v1.0.md,
--             Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md §42–§47.
--
-- Design notes
--  * No card data, CVV, UPI PIN or gateway credential is ever persisted. Only provider references.
--  * `payment_webhook_events.external_event_id` is unique per gateway, so a replayed webhook can
--    never double-post a payment (project rule §22 / spec §45).
--  * A payment is only marked PAID from a server-verified provider signal — never from a client.

CREATE TABLE payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  buyer_id                 UUID NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  gateway                  TEXT NOT NULL CHECK (gateway IN ('mock','razorpay','cashfree','payu','cod')),
  gateway_payment_reference TEXT,
  gateway_order_reference  TEXT,
  amount                   NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency                 TEXT NOT NULL DEFAULT 'INR',
  status                   TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING','AUTHORIZED','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED','CANCELLED')),
  payment_method_type      TEXT NOT NULL CHECK (payment_method_type IN ('UPI','CARD','NET_BANKING','WALLET','COD')),
  authorized_at            TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  failed_at                TIMESTAMPTZ,
  failure_code             TEXT,
  failure_message          TEXT,
  refunded_amount          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  idempotency_key          TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_refund_within_amount CHECK (refunded_amount <= amount)
);
-- One active (non-terminal failure) payment per order; retries create a new attempt row instead.
CREATE UNIQUE INDEX payments_order_active_unique ON payments (order_id) WHERE status IN ('PENDING','AUTHORIZED');
CREATE UNIQUE INDEX payments_gateway_reference_unique ON payments (gateway, gateway_payment_reference)
  WHERE gateway_payment_reference IS NOT NULL;
CREATE INDEX payments_buyer_idx ON payments (buyer_id, created_at DESC);
CREATE INDEX payments_status_idx ON payments (status, created_at DESC);
CREATE INDEX payments_reconciliation_idx ON payments (status, updated_at) WHERE status IN ('PENDING','AUTHORIZED');

CREATE TRIGGER payments_touch_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE payment_attempts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id                UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  gateway                   TEXT NOT NULL,
  gateway_attempt_reference TEXT,
  status                    TEXT NOT NULL CHECK (status IN ('INITIATED','PENDING','SUCCESS','FAILED','CANCELLED')),
  amount                    NUMERIC(14,2) NOT NULL,
  failure_code              TEXT,
  failure_message           TEXT,
  request_payload_reference TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_attempts_payment_idx ON payment_attempts (payment_id, created_at DESC);

CREATE TRIGGER payment_attempts_touch_updated_at BEFORE UPDATE ON payment_attempts
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Verified inbound webhooks. `signature_valid=false` rows are retained as security evidence.
CREATE TABLE payment_webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway           TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  payload_digest    TEXT NOT NULL,
  payload_reference TEXT,
  signature_valid   BOOLEAN NOT NULL DEFAULT FALSE,
  processing_status TEXT NOT NULL DEFAULT 'RECEIVED'
                      CHECK (processing_status IN ('RECEIVED','PROCESSED','DUPLICATE','REJECTED','FAILED')),
  processing_attempts INTEGER NOT NULL DEFAULT 0,
  processing_error  TEXT,
  payment_id        UUID REFERENCES payments(id) ON DELETE SET NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  CONSTRAINT payment_webhook_events_unique UNIQUE (gateway, external_event_id)
);
CREATE INDEX payment_webhook_events_status_idx ON payment_webhook_events (processing_status, received_at);
CREATE INDEX payment_webhook_events_payment_idx ON payment_webhook_events (payment_id);

CREATE TABLE refunds (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id               UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  amount                   NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reason                   TEXT,
  status                   TEXT NOT NULL DEFAULT 'REQUESTED'
                             CHECK (status IN ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING','PARTIALLY_REFUNDED','REFUNDED','REJECTED','FAILED','CANCELLED')),
  gateway_refund_reference TEXT,
  requested_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at             TIMESTAMPTZ,
  failure_reason           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refunds_order_idx ON refunds (order_id, created_at DESC);
CREATE INDEX refunds_payment_idx ON refunds (payment_id);
CREATE INDEX refunds_status_idx ON refunds (status, created_at DESC);

CREATE TRIGGER refunds_touch_updated_at BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  buyer_id       UUID NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  supplier_id    UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_type   TEXT NOT NULL CHECK (invoice_type IN ('MARKETPLACE','SUPPLIER','CREDIT_NOTE')),
  status         TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PAID','VOID','OVERDUE')),
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'INR',
  issued_at      TIMESTAMPTZ,
  due_at         TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoices_order_idx ON invoices (order_id);
CREATE INDEX invoices_buyer_idx ON invoices (buyer_id, issued_at DESC);

CREATE TRIGGER invoices_touch_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  description   TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(14,2) NOT NULL,
  tax_rate      NUMERIC(6,3),
  tax_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total    NUMERIC(14,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id);

-- Supplier settlement (commission + payout) — rules stay configurable via `configurations`.
CREATE TABLE supplier_settlements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_code   TEXT NOT NULL UNIQUE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  gross_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'INR',
  status            TEXT NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PROCESSING','PAID','FAILED','CANCELLED')),
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  provider_reference TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_settlements_period_order CHECK (period_end >= period_start),
  CONSTRAINT supplier_settlements_unique_period UNIQUE (supplier_id, period_start, period_end)
);
CREATE INDEX supplier_settlements_supplier_idx ON supplier_settlements (supplier_id, period_start DESC);
CREATE INDEX supplier_settlements_status_idx ON supplier_settlements (status);

CREATE TRIGGER supplier_settlements_touch_updated_at BEFORE UPDATE ON supplier_settlements
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE settlement_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id     UUID NOT NULL REFERENCES supplier_settlements(id) ON DELETE CASCADE,
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id     UUID REFERENCES order_items(id) ON DELETE SET NULL,
  fulfillment_id    UUID REFERENCES fulfillments(id) ON DELETE SET NULL,
  gross_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX settlement_items_settlement_idx ON settlement_items (settlement_id);

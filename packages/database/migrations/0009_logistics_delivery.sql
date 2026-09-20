-- 0009_logistics_delivery.sql
-- Description: hub-to-retailer delivery through the logistics provider abstraction (Porter first).
-- References: Bezzo_logistics_and_porter_integration_spec_v1.0.md,
--             Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md §39–§41,
--             Bezzo_business_rules_state_machine_spec_v1.0.md §17–§18.
--
-- Design notes
--  * Provider-specific payloads are stored in `provider_metadata` JSONB; core columns only ever hold
--    BEZZO-normalised state. Provider statuses are mapped by an adapter, never stored verbatim as the
--    canonical state (project rule §23).

CREATE TABLE deliveries (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fulfillment_id            UUID REFERENCES fulfillments(id) ON DELETE SET NULL,
  buyer_id                  UUID NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  hub_id                    UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  provider                  TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','porter','bezzo_fleet')),
  provider_reference        TEXT,
  provider_delivery_id      TEXT,
  delivery_mode             TEXT NOT NULL CHECK (delivery_mode IN ('INSTANT','SCHEDULED')),
  status                    TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING','QUOTED','BOOKING','ASSIGNED','PICKUP_PENDING','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED','CANCELLED','RETURNED')),
  pickup_address_snapshot   JSONB,
  dropoff_address_snapshot  JSONB NOT NULL,
  scheduled_date            DATE,
  scheduled_slot_id         UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
  quoted_fee                NUMERIC(14,2) CHECK (quoted_fee IS NULL OR quoted_fee >= 0),
  final_fee                 NUMERIC(14,2) CHECK (final_fee IS NULL OR final_fee >= 0),
  tracking_url_reference    TEXT,
  estimated_pickup_at       TIMESTAMPTZ,
  estimated_delivery_at     TIMESTAMPTZ,
  picked_up_at              TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  failed_at                 TIMESTAMPTZ,
  failure_reason            TEXT,
  attempt_count             INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_metadata         JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_provider_reference_unique UNIQUE (provider, provider_delivery_id)
);
CREATE INDEX deliveries_order_idx ON deliveries (order_id);
CREATE INDEX deliveries_status_idx ON deliveries (status, created_at DESC);
CREATE INDEX deliveries_schedule_idx ON deliveries (scheduled_date, scheduled_slot_id) WHERE scheduled_date IS NOT NULL;
CREATE INDEX deliveries_active_idx ON deliveries (updated_at)
  WHERE status NOT IN ('DELIVERED','CANCELLED','FAILED','RETURNED');

CREATE TRIGGER deliveries_touch_updated_at BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE delivery_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id      UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  provider_status  TEXT,
  internal_status  TEXT,
  description      TEXT,
  latitude         NUMERIC(9,6),
  longitude        NUMERIC(9,6),
  provider_event_id TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delivery_events_provider_event_unique UNIQUE (delivery_id, provider_event_id)
);
CREATE INDEX delivery_events_delivery_idx ON delivery_events (delivery_id, occurred_at DESC);
CREATE INDEX delivery_events_type_idx ON delivery_events (event_type, occurred_at DESC);

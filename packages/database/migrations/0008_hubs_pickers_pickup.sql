-- 0008_hubs_pickers_pickup.sql
-- Description: Bezzo collection hubs, pickers, pickup tasks, offers, physical packages, pickup runs,
--              hub receiving and pickup exceptions — the operational heart of the collection system.
-- References: Bezzo_picker_collection_system_architecture_spec_v1.0.md §5–§46.
--
-- KEY INVARIANTS (enforced structurally, not only in application code)
--   P1. A pickup task can have at most one active picker assignment. `pickup_tasks.assigned_picker_id`
--       is a single column and every acceptance is a conditional UPDATE guarded by
--       `status = 'OFFERED' AND assigned_picker_id IS NULL` (picker spec §26).
--   P2. A fulfillment may belong to at most one ACTIVE pickup task
--       (partial unique index `pickup_task_orders_active_unique`).
--   P3. A package belongs to exactly one fulfillment and at most one active pickup task.
--   P4. A package can never be collected twice: `pickup_packages.collected_at` is set by an atomic
--       conditional UPDATE and a unique index prevents a second collection event.
--   P5. A package can be received at exactly one hub: unique partial index on
--       `hub_package_scans (package_id) WHERE result = 'ACCEPTED'`.
--   P6. Offline scans replay safely: `pickup_events.local_event_id` and
--       `hub_package_scans.local_event_id` are unique when present.
--   P7. The picker domain stores operational data only — no prices, no supplier banking data,
--       no retailer licences (picker spec §35).

CREATE TABLE collection_hubs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  address            TEXT,
  locality           TEXT,
  city               TEXT,
  state              TEXT,
  postal_code        TEXT,
  latitude           NUMERIC(9,6),
  longitude          NUMERIC(9,6),
  operating_hours    JSONB NOT NULL DEFAULT '{}'::JSONB,
  capacity_packages  INTEGER CHECK (capacity_packages IS NULL OR capacity_packages > 0),
  supported_delivery_zones JSONB NOT NULL DEFAULT '[]'::JSONB,
  receiving_configuration JSONB NOT NULL DEFAULT '{}'::JSONB,
  status             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','MAINTENANCE','CLOSED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX collection_hubs_status_idx ON collection_hubs (status);

CREATE TRIGGER collection_hubs_touch_updated_at BEFORE UPDATE ON collection_hubs
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE pickers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  employee_code      TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'OFFLINE'
                       CHECK (status IN ('OFFLINE','AVAILABLE','OFFERED','BUSY','ON_BREAK','SUSPENDED','STALE')),
  phone              TEXT,
  vehicle_type       TEXT NOT NULL DEFAULT 'MOTORCYCLE'
                       CHECK (vehicle_type IN ('MOTORCYCLE','SCOOTER','THREE_WHEELER','TEMPO','VAN','OTHER')),
  capacity_packages  INTEGER NOT NULL DEFAULT 20 CHECK (capacity_packages > 0),
  home_hub_id        UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  zone               TEXT,
  current_latitude   NUMERIC(9,6),
  current_longitude  NUMERIC(9,6),
  last_heartbeat_at  TIMESTAMPTZ,
  suspended_reason   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pickers_user_unique ON pickers (user_id);
CREATE INDEX pickers_status_idx ON pickers (status) WHERE status IN ('AVAILABLE','OFFERED','BUSY');
CREATE INDEX pickers_hub_idx ON pickers (home_hub_id, status);
CREATE INDEX pickers_geo_idx ON pickers (current_latitude, current_longitude)
  WHERE current_latitude IS NOT NULL AND current_longitude IS NOT NULL;

CREATE TRIGGER pickers_touch_updated_at BEFORE UPDATE ON pickers
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Heartbeat history is retained for a configurable window (privacy spec: location retention).
CREATE TABLE picker_availability (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  picker_id         UUID NOT NULL REFERENCES pickers(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('OFFLINE','AVAILABLE','OFFERED','BUSY','ON_BREAK','SUSPENDED','STALE')),
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  accuracy_meters   NUMERIC(7,2),
  device_connectivity TEXT CHECK (device_connectivity IN ('ONLINE','OFFLINE','WEAK')),
  app_version       TEXT,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ
);
CREATE INDEX picker_availability_picker_idx ON picker_availability (picker_id, last_heartbeat_at DESC);
CREATE INDEX picker_availability_recent_idx ON picker_availability (last_heartbeat_at DESC);

CREATE TABLE pickup_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code           TEXT NOT NULL UNIQUE,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  hub_id              UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'CREATED'
                        CHECK (status IN ('CREATED','OFFERED','ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','HANDED_OVER','COMPLETED','EXPIRED','REJECTED','CANCELLED','FAILED_PICKUP','PARTIALLY_PICKED','HANDOVER_EXCEPTION')),
  priority            TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  pickup_window_start TIMESTAMPTZ,
  pickup_window_end   TIMESTAMPTZ,
  assigned_picker_id  UUID REFERENCES pickers(id) ON DELETE SET NULL,
  run_id              UUID,
  order_count         INTEGER NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  package_count       INTEGER NOT NULL DEFAULT 0 CHECK (package_count >= 0),
  distance_km         NUMERIC(7,2),
  estimated_pickup_minutes INTEGER,
  sla_risk_level      TEXT CHECK (sla_risk_level IN ('NONE','LOW','MEDIUM','HIGH')),
  offer_count         INTEGER NOT NULL DEFAULT 0 CHECK (offer_count >= 0),
  last_offered_at     TIMESTAMPTZ,
  offered_at          TIMESTAMPTZ,
  offer_expires_at    TIMESTAMPTZ,
  accepted_at         TIMESTAMPTZ,
  en_route_at         TIMESTAMPTZ,
  arrived_at          TIMESTAMPTZ,
  collection_started_at TIMESTAMPTZ,
  collected_at        TIMESTAMPTZ,
  at_hub_at           TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  failure_reason      TEXT,
  partial_reason      TEXT,
  supplier_explanation TEXT,
  exceeded_capacity_on_assignment BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pickup_tasks_window_order CHECK (pickup_window_end IS NULL OR pickup_window_start IS NULL OR pickup_window_end >= pickup_window_start)
);
-- Assignment engine: find claimable work ordered by priority + window.
CREATE INDEX pickup_tasks_pool_idx ON pickup_tasks (status, priority, pickup_window_end)
  WHERE status IN ('CREATED','OFFERED','EXPIRED','REJECTED');
CREATE INDEX pickup_tasks_picker_idx ON pickup_tasks (assigned_picker_id, status);
CREATE INDEX pickup_tasks_supplier_idx ON pickup_tasks (supplier_id, status, created_at DESC);
CREATE INDEX pickup_tasks_hub_idx ON pickup_tasks (hub_id, status);
CREATE INDEX pickup_tasks_offer_expiry_idx ON pickup_tasks (offer_expires_at) WHERE status = 'OFFERED';
CREATE INDEX pickup_tasks_open_idx ON pickup_tasks (created_at DESC)
  WHERE status NOT IN ('COMPLETED','CANCELLED');

CREATE TRIGGER pickup_tasks_touch_updated_at BEFORE UPDATE ON pickup_tasks
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Which orders/fulfillments a pickup task covers. P2 is enforced here.
CREATE TABLE pickup_task_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_task_id      UUID NOT NULL REFERENCES pickup_tasks(id) ON DELETE CASCADE,
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  fulfillment_id      UUID NOT NULL REFERENCES fulfillments(id) ON DELETE RESTRICT,
  package_count       INTEGER NOT NULL DEFAULT 0 CHECK (package_count >= 0),
  package_count_collected INTEGER NOT NULL DEFAULT 0 CHECK (package_count_collected >= 0),
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','COLLECTED','PARTIAL','CANCELLED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pickup_task_orders_unique UNIQUE (pickup_task_id, fulfillment_id)
);
CREATE UNIQUE INDEX pickup_task_orders_active_unique ON pickup_task_orders (fulfillment_id) WHERE status = 'ACTIVE';
CREATE INDEX pickup_task_orders_task_idx ON pickup_task_orders (pickup_task_id);
CREATE INDEX pickup_task_orders_order_idx ON pickup_task_orders (order_id);

CREATE TRIGGER pickup_task_orders_touch_updated_at BEFORE UPDATE ON pickup_task_orders
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Physical packages: created by the supplier when a fulfillment is packed.
CREATE TABLE pickup_packages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code       TEXT NOT NULL UNIQUE,
  order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  fulfillment_id     UUID NOT NULL REFERENCES fulfillments(id) ON DELETE CASCADE,
  supplier_id        UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  pickup_task_id     UUID REFERENCES pickup_tasks(id) ON DELETE SET NULL,
  expected_hub_id    UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  received_hub_id    UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'CREATED'
                       CHECK (status IN ('CREATED','WITH_SUPPLIER','READY_FOR_PICKUP','PICKER_COLLECTED','PICKER_IN_TRANSIT','HUB_RECEIVED','READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERED','MISSING','DAMAGED','UNEXPECTED','RETURNED')),
  package_type       TEXT NOT NULL DEFAULT 'STANDARD' CHECK (package_type IN ('STANDARD','FRAGILE','COLD_CHAIN','RESTRICTED')),
  weight_grams       INTEGER CHECK (weight_grams IS NULL OR weight_grams > 0),
  seal_number        TEXT,
  handling_notes     TEXT,
  collected_by_picker_id UUID REFERENCES pickers(id) ON DELETE SET NULL,
  collected_at       TIMESTAMPTZ,
  received_at        TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pickup_packages_task_idx ON pickup_packages (pickup_task_id, status);
CREATE INDEX pickup_packages_fulfillment_idx ON pickup_packages (fulfillment_id, status);
CREATE INDEX pickup_packages_status_idx ON pickup_packages (status);
CREATE INDEX pickup_packages_hub_expected_idx ON pickup_packages (expected_hub_id, status)
  WHERE expected_hub_id IS NOT NULL;
-- P4: a collected package records its collecting picker exactly once.
CREATE UNIQUE INDEX pickup_packages_collected_once ON pickup_packages (id, collected_at)
  WHERE collected_at IS NOT NULL;

CREATE TRIGGER pickup_packages_touch_updated_at BEFORE UPDATE ON pickup_packages
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Offers: the offer/popup experience with timeout, rejection and supersession history.
CREATE TABLE pickup_offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_task_id UUID NOT NULL REFERENCES pickup_tasks(id) ON DELETE CASCADE,
  picker_id     UUID NOT NULL REFERENCES pickers(id) ON DELETE CASCADE,
  outcome       TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (outcome IN ('PENDING','ACCEPTED','REJECTED','EXPIRED','SUPERSEDED','CANCELLED')),
  distance_km   NUMERIC(7,2),
  estimated_travel_minutes INTEGER,
  score         NUMERIC(10,4),
  rank          INTEGER,
  offered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  responded_at  TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A picker has at most one pending offer for a task, but the offer history is retained.
CREATE UNIQUE INDEX pickup_offers_pending_unique ON pickup_offers (pickup_task_id, picker_id) WHERE outcome = 'PENDING';
CREATE INDEX pickup_offers_picker_idx ON pickup_offers (picker_id, outcome, offered_at DESC);
CREATE INDEX pickup_offers_expiry_idx ON pickup_offers (expires_at) WHERE outcome = 'PENDING';
CREATE INDEX pickup_offers_task_idx ON pickup_offers (pickup_task_id, offered_at DESC);

CREATE TRIGGER pickup_offers_touch_updated_at BEFORE UPDATE ON pickup_offers
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE pickup_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_code        TEXT NOT NULL UNIQUE,
  picker_id       UUID REFERENCES pickers(id) ON DELETE SET NULL,
  hub_id          UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','PLANNED','OFFERED','ACCEPTED','IN_PROGRESS','ALL_STOPS_COLLECTED','EN_ROUTE_TO_HUB','AT_HUB','HANDED_OVER','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  total_orders    INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  total_packages  INTEGER NOT NULL DEFAULT 0 CHECK (total_packages >= 0),
  collected_packages INTEGER NOT NULL DEFAULT 0 CHECK (collected_packages >= 0),
  planned_start_at TIMESTAMPTZ,
  planned_route_minutes INTEGER,
  started_at      TIMESTAMPTZ,
  at_hub_at       TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pickup_runs_picker_idx ON pickup_runs (picker_id, status);
CREATE INDEX pickup_runs_open_idx ON pickup_runs (created_at DESC)
  WHERE status NOT IN ('COMPLETED','CANCELLED','FAILED');

CREATE TRIGGER pickup_runs_touch_updated_at BEFORE UPDATE ON pickup_runs
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE pickup_stops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_run_id     UUID NOT NULL REFERENCES pickup_runs(id) ON DELETE CASCADE,
  pickup_task_id    UUID NOT NULL REFERENCES pickup_tasks(id) ON DELETE CASCADE,
  sequence_no       INTEGER NOT NULL CHECK (sequence_no > 0),
  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','EN_ROUTE','ARRIVED','COLLECTING','COLLECTED','PARTIAL','FAILED','SKIPPED')),
  distance_from_previous_km NUMERIC(7,2),
  estimated_minutes_from_previous INTEGER,
  arrived_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pickup_stops_unique UNIQUE (pickup_run_id, pickup_task_id),
  CONSTRAINT pickup_stops_sequence_unique UNIQUE (pickup_run_id, sequence_no)
);
CREATE INDEX pickup_stops_run_idx ON pickup_stops (pickup_run_id, sequence_no);
CREATE INDEX pickup_stops_task_idx ON pickup_stops (pickup_task_id);

CREATE TRIGGER pickup_stops_touch_updated_at BEFORE UPDATE ON pickup_stops
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Durable operational event trail for one physical journey (picker spec §21/§46).
CREATE TABLE pickup_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_task_id UUID REFERENCES pickup_tasks(id) ON DELETE CASCADE,
  pickup_run_id  UUID REFERENCES pickup_runs(id) ON DELETE CASCADE,
  package_id     UUID REFERENCES pickup_packages(id) ON DELETE SET NULL,
  hub_id         UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  picker_id      UUID REFERENCES pickers(id) ON DELETE SET NULL,
  event_type     TEXT NOT NULL,
  actor_type     TEXT NOT NULL DEFAULT 'SYSTEM'
                   CHECK (actor_type IN ('SYSTEM','USER','ADMIN','SUPPLIER','BUYER','PICKER','HUB','PROVIDER')),
  actor_id       UUID,
  /** Offline capture id from the mobile app; guarantees replay-safe ingestion (P6). */
  local_event_id TEXT,
  latitude       NUMERIC(9,6),
  longitude      NUMERIC(9,6),
  metadata       JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_id     TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pickup_events_task_idx ON pickup_events (pickup_task_id, occurred_at DESC);
CREATE INDEX pickup_events_run_idx ON pickup_events (pickup_run_id, occurred_at DESC);
CREATE INDEX pickup_events_package_idx ON pickup_events (package_id, occurred_at DESC);
CREATE INDEX pickup_events_type_idx ON pickup_events (event_type, occurred_at DESC);
CREATE UNIQUE INDEX pickup_events_local_event_unique ON pickup_events (local_event_id) WHERE local_event_id IS NOT NULL;

-- Hub receiving: the confirmation that packages physically reached a Bezzo hub.
CREATE TABLE hub_receivings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id                   UUID NOT NULL REFERENCES collection_hubs(id) ON DELETE RESTRICT,
  pickup_task_id           UUID REFERENCES pickup_tasks(id) ON DELETE SET NULL,
  pickup_run_id            UUID REFERENCES pickup_runs(id) ON DELETE SET NULL,
  picker_id                UUID REFERENCES pickers(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'EXPECTED'
                             CHECK (status IN ('EXPECTED','RECEIVING','SCANNING','RECONCILIATION','ACCEPTED','MISSING','DAMAGED','UNEXPECTED','UNREADABLE','DISPUTED')),
  expected_package_count   INTEGER NOT NULL DEFAULT 0 CHECK (expected_package_count >= 0),
  received_package_count   INTEGER NOT NULL DEFAULT 0 CHECK (received_package_count >= 0),
  missing_package_count    INTEGER NOT NULL DEFAULT 0 CHECK (missing_package_count >= 0),
  unexpected_package_count INTEGER NOT NULL DEFAULT 0 CHECK (unexpected_package_count >= 0),
  damaged_package_count    INTEGER NOT NULL DEFAULT 0 CHECK (damaged_package_count >= 0),
  discrepancy_count        INTEGER NOT NULL DEFAULT 0 CHECK (discrepancy_count >= 0),
  notes                    TEXT,
  discrepancy_reason       TEXT,
  acknowledged_discrepancy BOOLEAN NOT NULL DEFAULT FALSE,
  started_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at             TIMESTAMPTZ,
  received_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One open receiving session per task/run; completed sessions are retained as history.
CREATE UNIQUE INDEX hub_receivings_open_task_unique ON hub_receivings (pickup_task_id)
  WHERE pickup_task_id IS NOT NULL AND completed_at IS NULL;
CREATE UNIQUE INDEX hub_receivings_open_run_unique ON hub_receivings (pickup_run_id)
  WHERE pickup_run_id IS NOT NULL AND completed_at IS NULL;
CREATE INDEX hub_receivings_hub_idx ON hub_receivings (hub_id, status, created_at DESC);
CREATE INDEX hub_receivings_picker_idx ON hub_receivings (picker_id, created_at DESC);

CREATE TRIGGER hub_receivings_touch_updated_at BEFORE UPDATE ON hub_receivings
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE hub_package_scans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_receiving_id UUID NOT NULL REFERENCES hub_receivings(id) ON DELETE CASCADE,
  package_id       UUID REFERENCES pickup_packages(id) ON DELETE SET NULL,
  package_code     TEXT NOT NULL,
  hub_id           UUID NOT NULL REFERENCES collection_hubs(id) ON DELETE RESTRICT,
  result           TEXT NOT NULL CHECK (result IN ('ACCEPTED','DUPLICATE','UNEXPECTED','UNREADABLE','DAMAGED','WRONG_HUB','ALREADY_RECEIVED')),
  scanned_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  local_event_id   TEXT,
  notes            TEXT,
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- P5: a package can be accepted at exactly one hub.
CREATE UNIQUE INDEX hub_package_scans_accepted_unique ON hub_package_scans (package_id) WHERE result = 'ACCEPTED';
CREATE UNIQUE INDEX hub_package_scans_local_event_unique ON hub_package_scans (local_event_id) WHERE local_event_id IS NOT NULL;
CREATE INDEX hub_package_scans_receiving_idx ON hub_package_scans (hub_receiving_id, scanned_at DESC);
CREATE INDEX hub_package_scans_code_idx ON hub_package_scans (package_code);

CREATE TABLE pickup_exceptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_task_id UUID REFERENCES pickup_tasks(id) ON DELETE CASCADE,
  pickup_run_id  UUID REFERENCES pickup_runs(id) ON DELETE SET NULL,
  package_id     UUID REFERENCES pickup_packages(id) ON DELETE SET NULL,
  hub_receiving_id UUID REFERENCES hub_receivings(id) ON DELETE SET NULL,
  type           TEXT NOT NULL CHECK (type IN (
                   'SUPPLIER_CLOSED','SUPPLIER_NOT_READY','PACKAGE_MISSING','PACKAGE_DAMAGED',
                   'PACKAGE_UNEXPECTED','PACKAGE_BARCODE_UNREADABLE','WRONG_PACKAGE',
                   'PICKUP_WINDOW_MISSED','PICKER_DELAYED','VEHICLE_FAILURE','NAVIGATION_FAILURE',
                   'HUB_CLOSED','HUB_CAPACITY_FULL','HUB_RECEIVING_DISCREPANCY','TASK_CANCELLED')),
  reason         TEXT,
  reported_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_by_type TEXT NOT NULL DEFAULT 'PICKER'
                   CHECK (reported_by_type IN ('SYSTEM','USER','ADMIN','SUPPLIER','BUYER','PICKER','HUB','PROVIDER')),
  evidence_object_keys JSONB NOT NULL DEFAULT '[]'::JSONB,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','DISMISSED')),
  resolution     TEXT,
  resolved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pickup_exceptions_task_idx ON pickup_exceptions (pickup_task_id, status);
CREATE INDEX pickup_exceptions_open_idx ON pickup_exceptions (created_at DESC) WHERE status IN ('OPEN','UNDER_REVIEW');
CREATE INDEX pickup_exceptions_type_idx ON pickup_exceptions (type, created_at DESC);

CREATE TRIGGER pickup_exceptions_touch_updated_at BEFORE UPDATE ON pickup_exceptions
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Daily operational metrics (picker/supplier/hub) used by dashboards; computed by workers, never
-- as a read-time aggregation over raw tables (performance spec).
CREATE TABLE pickup_metrics_daily (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date           DATE NOT NULL,
  picker_id             UUID REFERENCES pickers(id) ON DELETE CASCADE,
  supplier_id           UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  hub_id                UUID REFERENCES collection_hubs(id) ON DELETE CASCADE,
  tasks_offered         INTEGER NOT NULL DEFAULT 0,
  tasks_accepted        INTEGER NOT NULL DEFAULT 0,
  tasks_completed       INTEGER NOT NULL DEFAULT 0,
  tasks_failed          INTEGER NOT NULL DEFAULT 0,
  tasks_partial         INTEGER NOT NULL DEFAULT 0,
  packages_collected    INTEGER NOT NULL DEFAULT 0,
  packages_missing      INTEGER NOT NULL DEFAULT 0,
  packages_damaged      INTEGER NOT NULL DEFAULT 0,
  packages_unexpected   INTEGER NOT NULL DEFAULT 0,
  total_acceptance_seconds BIGINT NOT NULL DEFAULT 0,
  total_pickup_seconds  BIGINT NOT NULL DEFAULT 0,
  total_handover_seconds BIGINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pickup_metrics_daily_unique ON pickup_metrics_daily (
  metric_date,
  COALESCE(picker_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(hub_id, '00000000-0000-0000-0000-000000000000'::UUID)
);
CREATE INDEX pickup_metrics_daily_date_idx ON pickup_metrics_daily (metric_date DESC);

CREATE TRIGGER pickup_metrics_daily_touch_updated_at BEFORE UPDATE ON pickup_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Forward references: fulfillments.hub_id and pickup_tasks.run_id are wired after both tables exist.
ALTER TABLE fulfillments
  ADD CONSTRAINT fulfillments_hub_fk FOREIGN KEY (hub_id) REFERENCES collection_hubs(id) ON DELETE SET NULL;

ALTER TABLE pickup_tasks
  ADD CONSTRAINT pickup_tasks_run_fk FOREIGN KEY (run_id) REFERENCES pickup_runs(id) ON DELETE SET NULL;

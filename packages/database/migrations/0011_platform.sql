-- 0011_platform.sql
-- Description: platform infrastructure — transactional outbox, audit trail, idempotency records,
--              runtime configuration, feature flags, analytics events, job runs and file metadata.
-- References: Bezzo_event_driven_architecture_domain_events_spec_v1.0.md,
--             Bezzo_audit_logging_data_governance_compliance_records_spec_v1.0.md,
--             Bezzo_distributed_locks_idempotency_concurrency_control_engineering_spec_v1.0.md,
--             Bezzo_feature_flags_runtime_configuration_safe_rollout_engineering_spec_v1.0.md,
--             Bezzo_background_jobs_queue_workers_async_processing_engineering_spec_v1.0.md.
--
-- Design notes
--  * The outbox guarantees that a domain event is published if and only if the state change that
--    caused it committed. Publishing happens in a worker, never inside the request transaction.
--  * Audit rows are append-only: no UPDATE/DELETE is exposed by the application.
--  * Idempotency records store a request fingerprint + response snapshot so a retried mutation
--    returns the original result instead of repeating a side effect.

CREATE TABLE domain_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name        TEXT NOT NULL,
  event_version     INTEGER NOT NULL DEFAULT 1 CHECK (event_version > 0),
  aggregate_type    TEXT NOT NULL,
  aggregate_id      TEXT NOT NULL,
  actor_type        TEXT NOT NULL DEFAULT 'SYSTEM'
                      CHECK (actor_type IN ('SYSTEM','USER','ADMIN','SUPPLIER','BUYER','PICKER','HUB','PROVIDER')),
  actor_id          UUID,
  order_id          UUID,
  fulfillment_id    UUID,
  pickup_task_id    UUID,
  pickup_run_id     UUID,
  package_id        UUID,
  hub_receiving_id  UUID,
  payment_id        UUID,
  delivery_id       UUID,
  request_id        TEXT,
  correlation_id    TEXT,
  payload           JSONB NOT NULL DEFAULT '{}'::JSONB,
  publish_status    TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (publish_status IN ('PENDING','PUBLISHED','FAILED','DEAD_LETTER')),
  publish_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
  last_error        TEXT,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX domain_events_outbox_idx ON domain_events (publish_status, next_attempt_at)
  WHERE publish_status IN ('PENDING','FAILED');
CREATE INDEX domain_events_aggregate_idx ON domain_events (aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX domain_events_order_idx ON domain_events (order_id, occurred_at DESC) WHERE order_id IS NOT NULL;
CREATE INDEX domain_events_task_idx ON domain_events (pickup_task_id, occurred_at DESC) WHERE pickup_task_id IS NOT NULL;
CREATE INDEX domain_events_name_idx ON domain_events (event_name, occurred_at DESC);

CREATE TABLE audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID,
  actor_role     TEXT,
  actor_type     TEXT NOT NULL DEFAULT 'SYSTEM'
                   CHECK (actor_type IN ('SYSTEM','USER','ADMIN','SUPPLIER','BUYER','PICKER','HUB','PROVIDER')),
  action         TEXT NOT NULL,
  resource_type  TEXT NOT NULL,
  resource_id    TEXT,
  request_id     TEXT,
  ip_address     INET,
  user_agent     TEXT,
  reason         TEXT,
  before_data    JSONB,
  after_data     JSONB,
  metadata       JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);

CREATE TABLE idempotency_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                TEXT NOT NULL,
  user_id            UUID,
  operation          TEXT NOT NULL,
  request_hash       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'IN_PROGRESS'
                       CHECK (status IN ('IN_PROGRESS','COMPLETED','FAILED')),
  response_status    INTEGER,
  response_body      JSONB,
  resource_type      TEXT,
  resource_id        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL
);
-- A generated scope column (instead of an expression index) keeps `ON CONFLICT (key, operation,
-- user_scope)` inference deterministic, which the idempotency service relies on for its atomic
-- reserve-or-replay guarantee.
ALTER TABLE idempotency_keys
  ADD COLUMN user_scope UUID GENERATED ALWAYS AS (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::UUID)) STORED;

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_scope_unique UNIQUE (key, operation, user_scope);

CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys (expires_at);

CREATE TABLE configurations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER configurations_touch_updated_at BEFORE UPDATE ON configurations
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  rollout_percentage INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  targeting   JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER feature_flags_touch_updated_at BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Product/behavioural analytics events (analytics event tracking spec). Not a substitute for audit.
CREATE TABLE analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name    TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  event_id      TEXT NOT NULL UNIQUE,
  user_id       UUID,
  anonymous_id  TEXT,
  session_id    TEXT,
  platform      TEXT CHECK (platform IN ('web','android','ios','admin','server')),
  actor_type    TEXT,
  properties    JSONB NOT NULL DEFAULT '{}'::JSONB,
  context       JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_name_idx ON analytics_events (event_name, occurred_at DESC);
CREATE INDEX analytics_events_user_idx ON analytics_events (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE job_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name      TEXT NOT NULL,
  job_key       TEXT,
  status        TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_failed  INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  duration_ms   INTEGER,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}'::JSONB
);
CREATE INDEX job_runs_name_idx ON job_runs (job_name, started_at DESC);
CREATE INDEX job_runs_running_idx ON job_runs (job_name) WHERE status = 'RUNNING';

-- Object-storage metadata for every uploaded artefact (documents, evidence photos, product images).
CREATE TABLE files (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key     TEXT NOT NULL UNIQUE,
  bucket         TEXT,
  file_name      TEXT NOT NULL,
  content_type   TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 TEXT,
  owner_type     TEXT CHECK (owner_type IN ('SUPPLIER','BUYER','PRODUCT','PICKUP','HUB','USER','OTHER')),
  owner_id       UUID,
  visibility     TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','INTERNAL','PUBLIC')),
  status         TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','SCANNED','REJECTED','DELETED')),
  malware_scan_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (malware_scan_status IN ('PENDING','CLEAN','INFECTED','SKIPPED')),
  uploaded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX files_owner_idx ON files (owner_type, owner_id, created_at DESC);
CREATE INDEX files_pending_scan_idx ON files (created_at) WHERE malware_scan_status = 'PENDING';

CREATE TRIGGER files_touch_updated_at BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Search projection state: which catalog entities are stale relative to OpenSearch.
CREATE TABLE search_index_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('PRODUCT','LISTING','SUPPLIER')),
  entity_id     UUID NOT NULL,
  operation     TEXT NOT NULL CHECK (operation IN ('UPSERT','DELETE')),
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DONE','FAILED')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX search_index_jobs_pending_unique ON search_index_jobs (entity_type, entity_id)
  WHERE status IN ('PENDING','PROCESSING');
CREATE INDEX search_index_jobs_queue_idx ON search_index_jobs (status, next_attempt_at)
  WHERE status IN ('PENDING','FAILED');

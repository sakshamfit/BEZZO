-- 0010_notifications_support.sql
-- Description: notifications with per-channel delivery attempts, device push tokens, support tickets
--              and disputes.
-- References: Bezzo_notification_and_communication_spec_v1.0.md,
--             Bezzo_customer_support_and_dispute_resolution_spec_v1.0.md,
--             Bezzo_background_jobs_queue_workers_async_processing_engineering_spec_v1.0.md.
--
-- Design notes
--  * A notification is a durable record; delivery attempts per channel are separate rows so retries,
--    failures and dead letters are observable (spec §31: async with retries + DLQ).
--  * A notification that fails to push must never block the underlying operational task: the picker
--    can always recover work through `GET /picker/tasks/available` (project rule §42).

CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP')),
  status         TEXT NOT NULL DEFAULT 'QUEUED'
                   CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','READ','DEAD_LETTER')),
  reference_type TEXT,
  reference_id   UUID,
  correlation    JSONB NOT NULL DEFAULT '{}'::JSONB,
  payload        JSONB NOT NULL DEFAULT '{}'::JSONB,
  scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_queue_idx ON notifications (status, scheduled_at) WHERE status = 'QUEUED';
CREATE INDEX notifications_reference_idx ON notifications (reference_type, reference_id);

CREATE TRIGGER notifications_touch_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE notification_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP')),
  provider        TEXT,
  provider_message_id TEXT,
  status          TEXT NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','DEAD_LETTER')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_deliveries_queue_idx ON notification_deliveries (status, next_attempt_at)
  WHERE status IN ('QUEUED','FAILED');
CREATE INDEX notification_deliveries_notification_idx ON notification_deliveries (notification_id);

CREATE TRIGGER notification_deliveries_touch_updated_at BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE device_push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  platform   TEXT NOT NULL CHECK (platform IN ('android','ios','web')),
  app_version TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX device_push_tokens_user_idx ON device_push_tokens (user_id) WHERE active;

CREATE TRIGGER device_push_tokens_touch_updated_at BEFORE UPDATE ON device_push_tokens
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE notification_preferences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP')),
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_unique UNIQUE (user_id, event_type, channel)
);

CREATE TRIGGER notification_preferences_touch_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE support_tickets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number      TEXT NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject            TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN ('ORDER','DELIVERY','PAYMENT','PRODUCT','ACCOUNT','RETURN','PICKUP','OTHER')),
  priority           TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status             TEXT NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','ESCALATED','RESOLVED','CLOSED')),
  order_id           UUID REFERENCES orders(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sla_due_at         TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON support_tickets (created_by_user_id, created_at DESC);
CREATE INDEX support_tickets_status_idx ON support_tickets (status, priority, created_at DESC);
CREATE INDEX support_tickets_assignee_idx ON support_tickets (assigned_to_user_id, status);

CREATE TRIGGER support_tickets_touch_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE support_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_type     TEXT NOT NULL DEFAULT 'USER' CHECK (sender_type IN ('USER','SUPPORT','SYSTEM')),
  message         TEXT NOT NULL,
  attachment_object_keys JSONB NOT NULL DEFAULT '[]'::JSONB,
  internal_only   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_idx ON support_messages (ticket_id, created_at);

CREATE TABLE disputes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  raised_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type          TEXT NOT NULL CHECK (type IN ('NON_DELIVERY','WRONG_ITEM','DAMAGED_ITEM','SHORT_QUANTITY','QUALITY','PAYMENT','OTHER')),
  status        TEXT NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','UNDER_REVIEW','AWAITING_EVIDENCE','RESOLVED','REJECTED','ESCALATED')),
  reason        TEXT NOT NULL,
  resolution    TEXT,
  refund_amount NUMERIC(14,2) CHECK (refund_amount IS NULL OR refund_amount >= 0),
  resolved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX disputes_order_idx ON disputes (order_id, created_at DESC);
CREATE INDEX disputes_status_idx ON disputes (status, created_at DESC);

CREATE TRIGGER disputes_touch_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE risk_cases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  buyer_id    UUID REFERENCES buyers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  risk_type   TEXT NOT NULL CHECK (risk_type IN ('PAYMENT_FRAUD','ACCOUNT_ABUSE','ORDER_ANOMALY','CATALOG_MISUSE','RETURN_ABUSE','OTHER')),
  risk_score  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (risk_score >= 0),
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','CLEARED','CONFIRMED','DISMISSED')),
  reason      TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX risk_cases_status_idx ON risk_cases (status, risk_score DESC);
CREATE INDEX risk_cases_order_idx ON risk_cases (order_id);

CREATE TRIGGER risk_cases_touch_updated_at BEFORE UPDATE ON risk_cases
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id   UUID REFERENCES order_items(id) ON DELETE SET NULL,
  buyer_id        UUID NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'REQUESTED'
                    CHECK (status IN ('REQUESTED','UNDER_REVIEW','APPROVED','REJECTED','PICKUP_SCHEDULED','IN_TRANSIT','RECEIVED','INSPECTING','RESOLVED','CANCELLED')),
  resolution      TEXT,
  refund_id       UUID REFERENCES refunds(id) ON DELETE SET NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX returns_order_idx ON returns (order_id, created_at DESC);
CREATE INDEX returns_status_idx ON returns (status, created_at DESC);

CREATE TRIGGER returns_touch_updated_at BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

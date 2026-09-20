-- 0013_onboarding_settings.sql
-- Operational onboarding tables discovered while implementing the identity slice.
--
--  * picker_invites — picker accounts are created by Bezzo operations, not self-service. An invite
--    code ties the new picker account to the issuing operator and the home hub, and is single-use
--    (identity spec §4 "staff accounts are provisioned by an administrator").
--  * buyer_settings — per-store purchasing preferences (default delivery slot, PO prefix for the
--    buyer's own invoice numbering, auto-approve threshold). Kept out of `buyers` so the business
--    profile table stays stable for compliance review.
--
-- Forward-only migration. No destructive statements.

CREATE TABLE picker_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  home_hub_id   UUID REFERENCES collection_hubs(id) ON DELETE SET NULL,
  vehicle_type  TEXT CHECK (vehicle_type IN ('MOTORCYCLE','SCOOTER','THREE_WHEELER','TEMPO','VAN','OTHER')),
  issued_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  role          TEXT NOT NULL DEFAULT 'PICKER' CHECK (role IN ('PICKER','HUB_OPERATOR')),
  notes         TEXT,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  used_at       TIMESTAMPTZ,
  used_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX picker_invites_active_idx ON picker_invites (code) WHERE used_at IS NULL;
CREATE INDEX picker_invites_issuer_idx ON picker_invites (issued_by, created_at DESC);

CREATE TABLE buyer_settings (
  buyer_id                 UUID PRIMARY KEY REFERENCES buyers(id) ON DELETE CASCADE,
  default_delivery_slot_id UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
  purchase_order_prefix    TEXT,
  auto_approve_reorder     BOOLEAN NOT NULL DEFAULT FALSE,
  max_open_orders          INTEGER CHECK (max_open_orders IS NULL OR max_open_orders > 0),
  preferences              JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER buyer_settings_touch_updated_at
  BEFORE UPDATE ON buyer_settings
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Picker invite codes are security-relevant: the plaintext code is stored (it must be verified at
-- signup) but never logged. Index the expiry for the cleanup job.
CREATE INDEX picker_invites_expiry_idx ON picker_invites (expires_at) WHERE used_at IS NULL;

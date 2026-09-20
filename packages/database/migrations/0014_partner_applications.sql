-- 0014_partner_applications.sql
-- Public partner intake: "apply to sell", "apply to pick", "apply to buy", other partnerships.
--
-- Why a dedicated table rather than reusing `users`/`suppliers`:
--   * an application arrives BEFORE an account exists and must never create a half-built identity —
--     identity spec §4 keeps account creation behind verification;
--   * compliance requires the raw application (who applied, from where, with which licence) to be
--     retained independently of whatever the account later becomes;
--   * operations follow every application up on the WhatsApp business line, so delivery state is part
--     of the record.
--
-- Forward-only migration. No destructive statements.

-- Human-readable reference, e.g. BZ-APP-2026-000001 (mirrors the order-number convention).
CREATE SEQUENCE IF NOT EXISTS bezzo_application_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION bezzo_next_application_reference()
RETURNS TEXT AS $$
BEGIN
  RETURN 'BZ-APP-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' ||
         lpad(nextval('bezzo_application_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE partner_applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          TEXT NOT NULL UNIQUE,
  application_type   TEXT NOT NULL CHECK (application_type IN ('SUPPLIER','PICKER','RETAILER','PARTNER')),
  status             TEXT NOT NULL DEFAULT 'NEW'
                       CHECK (status IN ('NEW','CONTACTED','IN_REVIEW','APPROVED','REJECTED','DUPLICATE')),

  applicant_name     TEXT NOT NULL,
  business_name      TEXT NOT NULL,
  contact_phone      TEXT NOT NULL,
  contact_email      TEXT,
  city               TEXT NOT NULL,
  state              TEXT NOT NULL,
  postal_code        TEXT,
  gstin              TEXT,
  licence_reference  TEXT,
  years_in_business  SMALLINT CHECK (years_in_business IS NULL OR (years_in_business >= 0 AND years_in_business <= 200)),
  monthly_volume     TEXT,
  message            TEXT,

  -- Routing: which operations line received the hand-off, and the outbound WhatsApp deep link.
  routed_to_number   TEXT NOT NULL,
  whatsapp_url       TEXT NOT NULL,
  delivery_channel   TEXT NOT NULL DEFAULT 'WHATSAPP_HANDOFF'
                       CHECK (delivery_channel IN ('WHATSAPP_HANDOFF','MANUAL','API')),

  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  source             TEXT NOT NULL DEFAULT 'web',
  reviewed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        TIMESTAMPTZ,
  review_notes       TEXT,
  request_id         TEXT,
  ip_address         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX partner_applications_status_idx ON partner_applications (status, created_at DESC);
CREATE INDEX partner_applications_type_idx ON partner_applications (application_type, created_at DESC);
CREATE INDEX partner_applications_phone_idx ON partner_applications (contact_phone);
CREATE INDEX partner_applications_created_idx ON partner_applications (created_at DESC);

-- New permissions for the operations queue, granted to the roles that triage applications.
INSERT INTO permissions (code, description) VALUES
  ('admin.application.read',  'Read partner applications submitted through the public intake'),
  ('admin.application.write', 'Triage partner applications (status, notes)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('admin.application.read', 'admin.application.write')
 WHERE r.code IN ('ADMIN', 'SUPER_ADMIN', 'OPERATIONS_AGENT', 'SUPPORT_AGENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

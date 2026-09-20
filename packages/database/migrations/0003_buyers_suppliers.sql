-- 0003_buyers_suppliers.sql
-- Description: buyer (medical store) and supplier (wholesaler) business entities, addresses,
--              documents, service areas and verification reviews.
-- References: Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md §11–§16,
--             Bezzo_compliance_regulatory_pharmaceutical_marketplace_governance_engineering_spec_v1.0.md,
--             Bezzo_business_rules_state_machine_spec_v1.0.md §6 (supplier verification).
--
-- Design notes
--  * Supplier `status` (operational lifecycle) and `verification_status` (compliance lifecycle) are
--    deliberately separate concepts, as required by the schema specification §13.1.
--  * Documents store only object-storage references; binary content never lives in PostgreSQL.
--  * `pickup_latitude`/`pickup_longitude` are non-nullable for active suppliers because the picker
--    assignment engine requires coordinates (picker spec §27).

CREATE TABLE buyers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id      UUID REFERENCES organizations(id) ON DELETE SET NULL,
  business_name        TEXT NOT NULL,
  store_name           TEXT NOT NULL,
  business_type        TEXT,
  gstin                TEXT,
  license_reference    TEXT,
  status               TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
                         CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','RESTRICTED','SUSPENDED','DEACTIVATED')),
  verification_status  TEXT NOT NULL DEFAULT 'REGISTERED'
                         CHECK (verification_status IN ('REGISTERED','DOCUMENTS_PENDING','UNDER_REVIEW','VERIFIED','REJECTED','SUSPENDED')),
  verified_at          TIMESTAMPTZ,
  suspended_at         TIMESTAMPTZ,
  suspension_reason    TEXT,
  credit_terms_days    INTEGER NOT NULL DEFAULT 0 CHECK (credit_terms_days >= 0),
  metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX buyers_user_unique ON buyers (user_id);
CREATE INDEX buyers_status_idx ON buyers (status, verification_status);
CREATE INDEX buyers_gstin_idx ON buyers (gstin) WHERE gstin IS NOT NULL;

CREATE TRIGGER buyers_touch_updated_at BEFORE UPDATE ON buyers
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE buyer_addresses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id       UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  contact_name   TEXT NOT NULL,
  contact_phone  TEXT NOT NULL,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  landmark       TEXT,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  postal_code    TEXT NOT NULL,
  country        TEXT NOT NULL DEFAULT 'IN',
  latitude       NUMERIC(9,6),
  longitude      NUMERIC(9,6),
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT buyer_addresses_postal_code_len CHECK (char_length(postal_code) BETWEEN 3 AND 12)
);
CREATE INDEX buyer_addresses_buyer_idx ON buyer_addresses (buyer_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX buyer_addresses_default_unique ON buyer_addresses (buyer_id) WHERE is_default AND status = 'ACTIVE';

CREATE TRIGGER buyer_addresses_touch_updated_at BEFORE UPDATE ON buyer_addresses
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE buyer_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id         UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL CHECK (document_type IN (
                     'RETAIL_DRUG_LICENSE','GST_CERTIFICATE','PAN','BUSINESS_REGISTRATION',
                     'PREMISES_PROOF','AUTHORIZED_PERSON_PROOF','QUALIFIED_PERSON_DOCUMENT',
                     'BANK_DOCUMENT','STORAGE_FACILITY_PROOF','OTHER')),
  document_number  TEXT,
  object_key       TEXT NOT NULL,
  file_name        TEXT,
  content_type     TEXT,
  file_size_bytes  BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED')),
  issued_at        DATE,
  expires_at       DATE,
  verified_at      TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX buyer_documents_buyer_idx ON buyer_documents (buyer_id, status);
CREATE INDEX buyer_documents_expiry_idx ON buyer_documents (expires_at) WHERE status = 'APPROVED';

CREATE TRIGGER buyer_documents_touch_updated_at BEFORE UPDATE ON buyer_documents
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- ------------------------------------------------------------------------------------------------
-- Suppliers
-- ------------------------------------------------------------------------------------------------
CREATE TABLE suppliers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
  legal_name            TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  business_type         TEXT,
  gstin                 TEXT,
  pan                   TEXT,
  status                TEXT NOT NULL DEFAULT 'REGISTERED'
                          CHECK (status IN ('REGISTERED','ACTIVE','INACTIVE','SUSPENDED','CLOSED')),
  verification_status   TEXT NOT NULL DEFAULT 'REGISTERED'
                          CHECK (verification_status IN ('REGISTERED','DOCUMENTS_PENDING','UNDER_REVIEW','VERIFIED','REJECTED','SUSPENDED')),
  pickup_address        TEXT,
  locality              TEXT,
  city                  TEXT,
  state                 TEXT,
  postal_code           TEXT,
  pickup_latitude       NUMERIC(9,6),
  pickup_longitude      NUMERIC(9,6),
  contact_phone         TEXT,
  contact_email         TEXT,
  operating_hours       JSONB NOT NULL DEFAULT '{}'::JSONB,
  bank_account_name     TEXT,
  bank_account_number   TEXT,
  bank_ifsc             TEXT,
  verified_at           TIMESTAMPTZ,
  suspended_at          TIMESTAMPTZ,
  suspension_reason     TEXT,
  rejection_reason      TEXT,
  submitted_for_review_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suppliers_user_unique ON suppliers (user_id);
CREATE INDEX suppliers_verification_idx ON suppliers (verification_status, status);
CREATE INDEX suppliers_geo_idx ON suppliers (pickup_latitude, pickup_longitude)
  WHERE pickup_latitude IS NOT NULL AND pickup_longitude IS NOT NULL;
CREATE INDEX suppliers_gstin_idx ON suppliers (gstin) WHERE gstin IS NOT NULL;

CREATE TRIGGER suppliers_touch_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE supplier_business_details (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id                    UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  registered_address             TEXT,
  warehouse_address              TEXT,
  contact_person                 TEXT,
  business_registration_reference TEXT,
  storage_configuration          JSONB NOT NULL DEFAULT '{}'::JSONB,
  qualified_person_reference     TEXT,
  annual_turnover_reference      TEXT,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supplier_business_details_supplier_unique ON supplier_business_details (supplier_id);

CREATE TRIGGER supplier_business_details_touch_updated_at BEFORE UPDATE ON supplier_business_details
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE supplier_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL CHECK (document_type IN (
                     'WHOLESALE_DRUG_LICENSE','GST_CERTIFICATE','PAN','BUSINESS_REGISTRATION',
                     'PREMISES_PROOF','AUTHORIZED_PERSON_PROOF','QUALIFIED_PERSON_DOCUMENT',
                     'BANK_DOCUMENT','STORAGE_FACILITY_PROOF','OTHER')),
  document_number  TEXT,
  object_key       TEXT NOT NULL,
  file_name        TEXT,
  content_type     TEXT,
  file_size_bytes  BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED')),
  issued_at        DATE,
  expires_at       DATE,
  verified_at      TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX supplier_documents_supplier_idx ON supplier_documents (supplier_id, status);
CREATE INDEX supplier_documents_expiry_idx ON supplier_documents (expires_at) WHERE status = 'APPROVED';
CREATE UNIQUE INDEX supplier_documents_type_active_unique
  ON supplier_documents (supplier_id, document_type)
  WHERE status IN ('PENDING','UNDER_REVIEW','APPROVED');

CREATE TRIGGER supplier_documents_touch_updated_at BEFORE UPDATE ON supplier_documents
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE supplier_service_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  postal_code TEXT NOT NULL,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'DELIVERY' CHECK (service_type IN ('DELIVERY','PICKUP','BOTH')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_service_areas_unique UNIQUE (supplier_id, postal_code, service_type)
);
CREATE INDEX supplier_service_areas_postal_idx ON supplier_service_areas (postal_code) WHERE active;

CREATE TRIGGER supplier_service_areas_touch_updated_at BEFORE UPDATE ON supplier_service_areas
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Verification decisions are append-only: the current status is denormalised onto the entity.
CREATE TABLE verification_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('SUPPLIER','BUYER','PRODUCT','DOCUMENT')),
  entity_id        UUID NOT NULL,
  reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision         TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','REQUEST_CHANGES','SUSPENDED','REINSTATED')),
  reason           TEXT,
  checklist        JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verification_reviews_entity_idx ON verification_reviews (entity_type, entity_id, created_at DESC);
CREATE INDEX verification_reviews_reviewer_idx ON verification_reviews (reviewer_user_id, created_at DESC);

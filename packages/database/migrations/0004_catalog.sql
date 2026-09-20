-- 0004_catalog.sql
-- Description: canonical pharmaceutical product catalog — categories, manufacturers, dosage forms,
--              products, compositions, images and identifiers.
-- References: Bezzo_product_catalog_and_pharma_data_spec_v1.0.md,
--             Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md §17–§24.
--
-- Design notes
--  * Canonical product data is strictly separated from supplier listings (§17). A supplier never
--    edits the product master; it creates a listing referencing it.
--  * `normalized_name` columns are maintained in application code with the same normalisation used
--    by the search projection, so ranking stays consistent between the fallback and OpenSearch.
--  * Composition rows are first-class so search can filter by ingredient (search spec).

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  image_object_key TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX categories_parent_idx ON categories (parent_id, sort_order) WHERE status = 'ACTIVE';

CREATE TRIGGER categories_touch_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE manufacturers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX manufacturers_normalized_unique ON manufacturers (normalized_name);
CREATE INDEX manufacturers_status_idx ON manufacturers (status);

CREATE TRIGGER manufacturers_touch_updated_at BEFORE UPDATE ON manufacturers
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE dosage_forms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER dosage_forms_touch_updated_at BEFORE UPDATE ON dosage_forms
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE products (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id                 UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  manufacturer_id             UUID REFERENCES manufacturers(id) ON DELETE SET NULL,
  dosage_form_id              UUID REFERENCES dosage_forms(id) ON DELETE SET NULL,
  name                        TEXT NOT NULL,
  slug                        TEXT NOT NULL UNIQUE,
  normalized_name             TEXT NOT NULL,
  generic_name                TEXT,
  normalized_generic_name     TEXT,
  brand_name                  TEXT,
  composition_summary         TEXT,
  strength                    TEXT,
  pack_size                   TEXT,
  pack_unit                   TEXT,
  prescription_classification TEXT NOT NULL DEFAULT 'NOT_SCHEDULED'
                                CHECK (prescription_classification IN ('NOT_SCHEDULED','PRESCRIPTION_REQUIRED','CONTROLLED_SCHEDULE','NARCOTIC','OTC')),
  storage_requirements        TEXT,
  description                 TEXT,
  status                      TEXT NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','UNDER_REVIEW','PUBLISHED','UNPUBLISHED','BLOCKED','ARCHIVED')),
  blocked_reason              TEXT,
  published_at                TIMESTAMPTZ,
  search_metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id, status);
CREATE INDEX products_manufacturer_idx ON products (manufacturer_id, status);
CREATE INDEX products_status_idx ON products (status, created_at DESC);
CREATE INDEX products_normalized_name_idx ON products (normalized_name);
CREATE INDEX products_generic_idx ON products (normalized_generic_name) WHERE normalized_generic_name IS NOT NULL;
-- Trigram search support for the degraded (database fallback) search path.
CREATE INDEX products_name_trgm_idx ON products USING gin (normalized_name gin_trgm_ops);

CREATE TRIGGER products_touch_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE product_compositions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_name           TEXT NOT NULL,
  normalized_ingredient_name TEXT NOT NULL,
  strength                  TEXT,
  unit                      TEXT,
  sequence                  INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_compositions_product_idx ON product_compositions (product_id, sequence);
CREATE INDEX product_compositions_ingredient_idx ON product_compositions (normalized_ingredient_name);

CREATE TRIGGER product_compositions_touch_updated_at BEFORE UPDATE ON product_compositions
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE product_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_type   TEXT NOT NULL DEFAULT 'FRONT' CHECK (image_type IN ('FRONT','BACK','SIDE','LABEL','OTHER')),
  object_key   TEXT NOT NULL,
  alt_text     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order) WHERE status = 'ACTIVE';

CREATE TRIGGER product_images_touch_updated_at BEFORE UPDATE ON product_images
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE product_identifiers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  identifier_type  TEXT NOT NULL CHECK (identifier_type IN ('SKU','EAN','GTIN','MANUFACTURER_CODE','INTERNAL_REFERENCE')),
  identifier_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_identifiers_unique ON product_identifiers (identifier_type, normalized_value);
CREATE INDEX product_identifiers_product_idx ON product_identifiers (product_id);

CREATE TRIGGER product_identifiers_touch_updated_at BEFORE UPDATE ON product_identifiers
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- trgm extension is created after products are defined only because the index above needs it.
-- Kept in this migration so the schema is self-contained when applied from scratch.

-- 0001_foundation.sql
-- Description: database prerequisites and shared helper functions used across every BEZZO domain.
-- References: Bezzo_database_migration_seed_data_environment_setup_spec_v1.0.md §8 (ordering),
--             BEZZO-DATABASE.md §27–§28 (money + time), §30 (concurrency).
--
-- Design notes
--  * Idempotent: prerequisites may be re-applied to an existing environment without side effects.
--  * PostGIS is used when the extension is available (geographic assignment); otherwise BEZZO falls
--    back to the equivalent haversine implementation below so that behaviour is identical on
--    managed PostgreSQL instances where PostGIS is not yet enabled. See ADR-0005.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigram indexes back the degraded (database fallback) product search path when OpenSearch is
-- unavailable. PostgreSQL search is never the primary marketplace search (search spec), but it must
-- remain usable and fast for operational/admin lookups.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Try PostGIS but never fail the migration when the extension is unavailable in this environment.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS postgis';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS is not available in this environment; BEZZO will use built-in geographic functions';
END
$$;

-- ------------------------------------------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bezzo_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------------------------
-- Geographic helpers (kilometres, WGS84)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bezzo_haversine_km(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  earth_radius_km CONSTANT DOUBLE PRECISION := 6371.0088;
  d_lat DOUBLE PRECISION;
  d_lon DOUBLE PRECISION;
  a DOUBLE PRECISION;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;
  d_lat := radians(lat2 - lat1);
  d_lon := radians(lon2 - lon1);
  a := sin(d_lat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ^ 2;
  RETURN 2 * earth_radius_km * asin(least(1::DOUBLE PRECISION, sqrt(a)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Average urban two-wheeler speed assumed by the assignment engine when a routing provider is not
-- configured. The value is deliberately conservative and is used only for ranking candidates.
CREATE OR REPLACE FUNCTION bezzo_estimate_travel_minutes(distance_km DOUBLE PRECISION)
RETURNS INTEGER AS $$
DECLARE
  average_speed_kmh CONSTANT DOUBLE PRECISION := 18.0;
  fixed_overhead_minutes CONSTANT INTEGER := 4;
BEGIN
  IF distance_km IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN ceil((distance_km / average_speed_kmh) * 60)::INTEGER + fixed_overhead_minutes;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------------------------------------------
-- Human-readable identifier sequences (spec: order numbers, task codes, package codes)
-- ------------------------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS bezzo_order_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS bezzo_pickup_task_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS bezzo_pickup_run_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS bezzo_package_seq START WITH 100000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS bezzo_settlement_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS bezzo_invoice_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS bezzo_ticket_seq START WITH 1 INCREMENT BY 1;

-- Public order number, e.g. BZ-2026-000001 (BEZZO-DATABASE.md §15).
CREATE OR REPLACE FUNCTION bezzo_next_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'BZ-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' ||
         lpad(nextval('bezzo_order_number_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Pickup task code, e.g. PT-1021 (picker spec §10).
CREATE OR REPLACE FUNCTION bezzo_next_pickup_task_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PT-' || nextval('bezzo_pickup_task_seq')::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Pickup run code, e.g. PR1021 (picker spec §16).
CREATE OR REPLACE FUNCTION bezzo_next_pickup_run_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PR' || nextval('bezzo_pickup_run_seq')::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Package code, e.g. PKG-BZ-000019283 (picker spec §14).
CREATE OR REPLACE FUNCTION bezzo_next_package_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PKG-BZ-' || lpad(nextval('bezzo_package_seq')::TEXT, 9, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bezzo_next_settlement_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'STL-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' ||
         lpad(nextval('bezzo_settlement_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bezzo_next_invoice_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'INV-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' ||
         lpad(nextval('bezzo_invoice_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bezzo_next_ticket_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TKT-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' ||
         lpad(nextval('bezzo_ticket_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------------------------
-- Business day helper — BEZZO schedules in Asia/Kolkata but stores UTC (BEZZO-DATABASE.md §28).
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bezzo_business_date(ts TIMESTAMPTZ DEFAULT now())
RETURNS DATE AS $$
  SELECT (ts AT TIME ZONE 'Asia/Kolkata')::DATE;
$$ LANGUAGE sql STABLE;

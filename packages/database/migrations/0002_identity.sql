-- 0002_identity.sql
-- Description: identity, organizations, RBAC, sessions and authentication challenges.
-- References: Bezzo_identity_authentication_user_account_spec_v1.0.md §4–§25,
--             Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md §6–§10,
--             Bezzo_api_implementation_endpoint_by_endpoint_engineering_spec_v1.0.md §6.
--
-- Design notes
--  * Role/status columns are TEXT + CHECK instead of PostgreSQL ENUM. ENUM values cannot be removed
--    and ALTER TYPE ... ADD VALUE historically could not run inside a transaction, which conflicts
--    with the expand-and-contract migration requirement. See ADR-0001.
--  * Refresh tokens are stored as SHA-256 hashes only; raw tokens never touch the database.
--  * `sessions.token_family_id` plus `replaced_by_session_id` enable refresh-token rotation with
--    reuse detection (identity spec §21).

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT,
  phone               TEXT,
  email_normalized    TEXT GENERATED ALWAYS AS (lower(email)) STORED,
  display_name        TEXT NOT NULL,
  password_hash       TEXT,
  password_updated_at TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','ACTIVE','RESTRICTED','SUSPENDED','LOCKED','DEACTIVATED')),
  email_verified_at   TIMESTAMPTZ,
  phone_verified_at   TIMESTAMPTZ,
  failed_login_count  INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until        TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  terms_accepted_at   TIMESTAMPTZ,
  terms_version       TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT users_identifier_present CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX users_email_unique ON users (email_normalized) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX users_phone_unique ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX users_status_idx ON users (status);
CREATE INDEX users_created_at_idx ON users (created_at DESC);

CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Organizations allow a business to have several staff identities without sharing credentials.
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('BUYER_ORGANIZATION','SUPPLIER_ORGANIZATION','BEZZO_ORGANIZATION')),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  parent_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organizations_type_idx ON organizations (type);

CREATE TRIGGER organizations_touch_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  scope       TEXT NOT NULL DEFAULT 'MARKETPLACE' CHECK (scope IN ('MARKETPLACE','ADMIN')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  granted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX user_roles_unique_active ON user_roles (user_id, role_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::UUID))
  WHERE revoked_at IS NULL;
CREATE INDEX user_roles_user_idx ON user_roles (user_id) WHERE revoked_at IS NULL;

CREATE TABLE organization_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (membership_status IN ('INVITED','ACTIVE','SUSPENDED','REMOVED')),
  is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organization_members_unique ON organization_members (organization_id, user_id);
CREATE INDEX organization_members_user_idx ON organization_members (user_id) WHERE membership_status = 'ACTIVE';

CREATE TRIGGER organization_members_touch_updated_at BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- Sessions: refresh-token family tracking with rotation + reuse detection.
CREATE TABLE sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_family_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  refresh_token_hash     TEXT NOT NULL,
  replaced_by_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  device_id              TEXT,
  device_type            TEXT CHECK (device_type IN ('web','android','ios','admin')),
  device_name            TEXT,
  ip_address             INET,
  user_agent             TEXT,
  authentication_method  TEXT NOT NULL DEFAULT 'PASSWORD'
                           CHECK (authentication_method IN ('PASSWORD','OTP','REFRESH','ADMIN_PASSWORD','INVITED')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ NOT NULL,
  revoked_at             TIMESTAMPTZ,
  revoked_reason         TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id, created_at DESC);
CREATE INDEX sessions_family_idx ON sessions (token_family_id);
CREATE UNIQUE INDEX sessions_refresh_hash_unique ON sessions (refresh_token_hash);
CREATE INDEX sessions_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE devices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id      TEXT NOT NULL,
  platform       TEXT NOT NULL CHECK (platform IN ('web','android','ios','admin')),
  app_version    TEXT,
  push_token     TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX devices_unique ON devices (user_id, device_id);

CREATE TRIGGER devices_touch_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION bezzo_touch_updated_at();

-- OTP challenges: hashed with a server-side pepper; never stored in clear text.
CREATE TABLE otp_challenges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  identifier       TEXT NOT NULL,
  identifier_type  TEXT NOT NULL CHECK (identifier_type IN ('EMAIL','PHONE')),
  purpose          TEXT NOT NULL CHECK (purpose IN ('LOGIN','PHONE_VERIFY','EMAIL_VERIFY','PASSWORD_RESET')),
  code_hash        TEXT NOT NULL,
  attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts     INTEGER NOT NULL DEFAULT 5,
  consumed_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL,
  ip_address       INET,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_identifier_idx ON otp_challenges (identifier, purpose, created_at DESC);
CREATE INDEX otp_challenges_expiry_idx ON otp_challenges (expires_at) WHERE consumed_at IS NULL;

-- Authentication + account status history (append-only audit support tables).
CREATE TABLE auth_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  identifier  TEXT,
  event_type  TEXT NOT NULL,
  success     BOOLEAN NOT NULL,
  reason      TEXT,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  ip_address  INET,
  user_agent  TEXT,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_user_idx ON auth_events (user_id, created_at DESC);
CREATE INDEX auth_events_type_idx ON auth_events (event_type, created_at DESC);

CREATE TABLE account_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  reason      TEXT,
  actor_type  TEXT NOT NULL DEFAULT 'SYSTEM'
                CHECK (actor_type IN ('SYSTEM','USER','ADMIN','SUPPLIER','BUYER','PICKER','HUB','PROVIDER')),
  actor_id    UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_status_history_user_idx ON account_status_history (user_id, created_at DESC);

-- Password history prevents immediate reuse of the previous credential.
CREATE TABLE password_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_history_user_idx ON password_history (user_id, created_at DESC);

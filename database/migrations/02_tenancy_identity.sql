-- ============================================================================
-- 02_tenancy_identity.sql — Tenants, global users, memberships, auth methods
-- ============================================================================

-- ── Tenants ────────────────────────────────────────────────────────────────
-- The isolation boundary and top of every hierarchy. NOT itself tenant-scoped
-- (it *is* the tenant), so no RLS here; access is gated at the app/control layer.
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  name          TEXT  NOT NULL,
  slug          CITEXT NOT NULL UNIQUE,                 -- subdomain label
  custom_domain CITEXT UNIQUE,                          -- optional vanity domain
  status        TEXT  NOT NULL DEFAULT 'active',        -- active|suspended|deleted
  plan          TEXT  NOT NULL DEFAULT 'free',
  data_region   TEXT  NOT NULL DEFAULT 'eu',            -- residency anchor
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,                            -- soft delete
  CONSTRAINT tenants_status_chk CHECK (status IN ('active','suspended','deleted')),
  CONSTRAINT tenants_slug_fmt_chk CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
);
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Users (GLOBAL identity) ──────────────────────────────────────────────────
-- Deliberately NOT tenant-scoped: one human = one row, may join many tenants.
-- This is the spec's "identity vs membership" separation. Email is the global
-- natural key. No password here — credentials live in auth_methods.
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuidv7(),
  email             CITEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  status            TEXT  NOT NULL DEFAULT 'active',    -- active|suspended|deleted
  profile           JSONB NOT NULL DEFAULT '{}',        -- name, locale, tz, prefs
  mfa_secret        TEXT,                               -- TOTP seed (encrypted app-side)
  mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT users_status_chk CHECK (status IN ('active','suspended','deleted')),
  CONSTRAINT users_email_fmt_chk CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Tenant membership (user ↔ tenant relationship) ───────────────────────────
-- This IS tenant-scoped. A user's belonging to an org, with an external SIS id.
CREATE TABLE tenant_memberships (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active',        -- active|suspended|invited
  idnumber    TEXT,                                  -- external SIS / HR id
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT tm_status_chk CHECK (status IN ('active','suspended','invited')),
  -- external id, when present, is unique within the tenant
  CONSTRAINT tm_idnumber_uq UNIQUE (tenant_id, idnumber)
);
CREATE INDEX idx_tm_user ON tenant_memberships (user_id);   -- "which tenants am I in"

-- ── Auth methods (pluggable credentials) ─────────────────────────────────────
-- Decoupled from identity. A user can hold several (local + OIDC + SAML).
-- Scoped per tenant because external_id namespaces (e.g. an OIDC sub) are
-- issued by a tenant's IdP and only meaningful within that tenant.
CREATE TABLE auth_methods (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  type        TEXT NOT NULL,                         -- local|oidc|saml|ldap|social
  external_id TEXT,                                  -- IdP subject / DN / social id
  secret_hash TEXT,                                  -- argon2id (local only)
  data        JSONB NOT NULL DEFAULT '{}',           -- provider, claims, reset tokens
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT am_type_chk CHECK (type IN ('local','oidc','saml','ldap','social')),
  -- one external identity maps to one row within (tenant, type)
  CONSTRAINT am_external_uq UNIQUE (tenant_id, type, external_id),
  -- at most one local credential per user per tenant
  CONSTRAINT am_local_secret_chk CHECK (type <> 'local' OR secret_hash IS NOT NULL)
);
CREATE INDEX idx_am_user ON auth_methods (tenant_id, user_id);
-- enforce single local credential per (tenant,user) via partial unique index
CREATE UNIQUE INDEX uq_am_one_local ON auth_methods (tenant_id, user_id)
  WHERE type = 'local';
CREATE TRIGGER trg_am_updated BEFORE UPDATE ON auth_methods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

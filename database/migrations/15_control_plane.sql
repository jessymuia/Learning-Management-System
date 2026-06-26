-- ============================================================================
-- 15_control_plane.sql — PHASE 5: Control plane (operator/reseller scope)
-- ----------------------------------------------------------------------------
-- These tables belong to the SaaS operator, NOT to any single tenant. They sit
-- ABOVE the engine (the spec places them in a separate service). They are
-- therefore NOT tenant-scoped and carry NO RLS — access is gated to the
-- operator/reseller role at the app layer. Schematized here for completeness;
-- in production these may live in a separate database.
-- ============================================================================

CREATE TABLE plans (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  code         TEXT NOT NULL UNIQUE,              -- free|pro|enterprise
  name         TEXT NOT NULL,
  limits       JSONB NOT NULL DEFAULT '{}',       -- {max_users, max_courses, storage_gb}
  price_minor  BIGINT NOT NULL DEFAULT 0,
  currency     CHAR(3) NOT NULL DEFAULT 'USD',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_subscriptions (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id      UUID NOT NULL REFERENCES plans(id),
  reseller_id  UUID,                              -- optional reseller owner
  status       TEXT NOT NULL DEFAULT 'active',    -- active|past_due|cancelled
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ts_status_chk CHECK (status IN ('active','past_due','cancelled'))
);
CREATE INDEX idx_ts_tenant ON tenant_subscriptions (tenant_id);

-- Per-tenant usage metering (the billing/throttling signal)
CREATE TABLE usage_metering (
  id           UUID NOT NULL DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL,
  metric       TEXT NOT NULL,                     -- active_users|storage_bytes|api_calls
  value        BIGINT NOT NULL,
  period       DATE NOT NULL,                     -- the day/month bucketed
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE INDEX idx_um_tenant_metric ON usage_metering (tenant_id, metric, period);

-- Reseller registry (control-plane operator role)
CREATE TABLE resellers (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  name         TEXT NOT NULL,
  branding     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backup/restore catalog (per-tenant DR)
CREATE TABLE backups (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  scope        TEXT NOT NULL,                     -- course|tenant|full
  scope_id     UUID,                              -- course_id when scope='course'
  format       TEXT NOT NULL DEFAULT 'native',    -- native|imscc
  storage_key  TEXT NOT NULL,
  size_bytes   BIGINT,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending|complete|failed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bk_scope_chk CHECK (scope IN ('course','tenant','full')),
  CONSTRAINT bk_format_chk CHECK (format IN ('native','imscc')),
  CONSTRAINT bk_status_chk CHECK (status IN ('pending','complete','failed'))
);
CREATE INDEX idx_bk_tenant ON backups (tenant_id, created_at DESC);

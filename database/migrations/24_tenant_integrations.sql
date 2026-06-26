-- Per-tenant integration credentials (entered via the admin settings UI rather
-- than .env). Secrets are write-only over the API: stored here, never returned.
-- Secrets are encrypted at the application layer (Laravel Crypt) before storage.
-- RLS-scoped to the tenant like everything else.
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  provider    TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',   -- non-secret fields (public keys, shortcode, host)
  secrets     JSONB NOT NULL DEFAULT '{}',   -- secret fields, app-layer encrypted values
  enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID REFERENCES users(id),     -- audit: who last changed these credentials
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider),
  -- only known providers may be configured; a typo cannot create a phantom row
  CONSTRAINT ti_provider_chk CHECK (provider IN ('stripe','mpesa','mux','smtp','sso_oidc'))
);

-- fast lookup of a tenant's enabled integrations (the engine read path)
CREATE INDEX IF NOT EXISTS ti_tenant_enabled_idx
  ON tenant_integrations (tenant_id, provider) WHERE enabled;

ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_integrations_isolation ON tenant_integrations
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid
         OR current_setting('app.bypass_rls', true) = 'on');

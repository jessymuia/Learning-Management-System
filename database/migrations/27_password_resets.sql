-- ============================================================================
-- Migration 27 — Password reset tokens
-- A short-lived, single-use token lets a user reset their password via email.
-- Token is stored hashed; the raw token only ever goes to the user.
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                          -- sha256 of the raw token
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pwreset_token ON password_resets (token_hash);
CREATE INDEX IF NOT EXISTS idx_pwreset_user  ON password_resets (tenant_id, user_id);

ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pwreset_isolation ON password_resets;
CREATE POLICY pwreset_isolation ON password_resets
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid
         OR current_setting('app.bypass_rls', true) = 'on');

COMMENT ON TABLE password_resets IS 'Single-use, expiring password reset tokens (stored hashed).';

-- LTI 1.3 launch state (OIDC login → id_token verification), spec §8
CREATE TABLE IF NOT EXISTS lti_launch_state (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id UUID NOT NULL,
  registration_id UUID NOT NULL,
  state TEXT NOT NULL,
  nonce TEXT NOT NULL,
  target_link_uri TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lti_launch_state ON lti_launch_state(state);
ALTER TABLE lti_launch_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY lti_launch_tenant ON lti_launch_state USING (tenant_id = app_current_tenant());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

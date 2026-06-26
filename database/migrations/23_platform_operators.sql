-- Platform operators (super-admins) — the control-plane identity that can
-- provision tenants, see metering across all tenants, run billing/backups.
-- Deliberately OUTSIDE the per-tenant RBAC system (spec §15 reseller console).
CREATE TABLE IF NOT EXISTS platform_operators (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  level TEXT NOT NULL DEFAULT 'operator' CHECK (level IN ('operator','superadmin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS: this is a global control-plane table, queried only via withSystem().

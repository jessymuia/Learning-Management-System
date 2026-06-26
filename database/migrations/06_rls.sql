-- ============================================================================
-- 06_rls.sql — Row-Level Security policies (tenant isolation at the DB)
-- ----------------------------------------------------------------------------
-- Every tenant-scoped table gets RLS keyed on app_current_tenant(). The app
-- sets app.current_tenant per transaction after PgBouncer checkout. A trusted
-- ETL/maintenance path sets app.bypass_rls='on' to opt out.
--
-- NOTE: 'users' and 'permissions' are GLOBAL (not tenant-scoped) -> no RLS.
-- 'tenants' is the boundary itself -> gated at the app/control layer, no RLS.
-- ============================================================================

DO $$
DECLARE
  t text;
  tenant_scoped text[] := ARRAY[
    'tenant_memberships','auth_methods',
    'roles','model_has_roles','model_has_permissions',
    'contexts','context_role_assignments','permission_overrides',
    'files','file_blobs','audit_log','event_log','async_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);  -- apply to owner too
    -- single policy: visible iff bypass is on OR row belongs to current tenant
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (app_bypass_rls() OR tenant_id = app_current_tenant())
      WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())
    $f$, t);
  END LOOP;
END $$;

-- role_has_permissions has no tenant_id column (it joins role->permission).
-- It's protected transitively: roles is RLS-scoped, so a tenant can only see
-- role_ids it owns. We still enable RLS via the role relationship.
ALTER TABLE role_has_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_has_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY rhp_isolation ON role_has_permissions
  USING (
    app_bypass_rls() OR EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_has_permissions.role_id
        AND (r.tenant_id = app_current_tenant() OR r.tenant_id IS NULL)
    )
  );

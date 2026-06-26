-- ============================================================================
-- 16_rls_all.sql — Extend RLS to every tenant-scoped table (Phases 1–4)
-- ----------------------------------------------------------------------------
-- Auto-applies the tenant_isolation policy to every base/partitioned table that
-- has a tenant_id column, EXCEPT control-plane tables (operator-scoped) and the
-- global tables. Idempotent: skips tables that already have the policy.
-- ============================================================================
DO $$
DECLARE
  r RECORD;
  control_plane TEXT[] := ARRAY['backups','tenant_subscriptions','usage_metering'];
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('r','p')                       -- base + partitioned
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
      AND c.relname NOT LIKE '%\_2025%' ESCAPE '\'
      AND c.relname NOT LIKE '%\_2026%' ESCAPE '\'
      AND NOT (c.relname = ANY(control_plane))
  LOOP
    -- enable + force (skip if already enabled to stay idempotent)
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.relname);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      JOIN pg_class pc ON pc.oid=p.polrelid
      WHERE pc.relname=r.relname AND p.polname='tenant_isolation'
    ) THEN
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
        USING (app_bypass_rls() OR tenant_id = app_current_tenant())
        WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())
      $f$, r.relname);
    END IF;
  END LOOP;
END $$;

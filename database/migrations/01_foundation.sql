-- ============================================================================
-- 01_foundation.sql — Extensions, RLS plumbing, shared helpers
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive email/slug
CREATE EXTENSION IF NOT EXISTS ltree;        -- materialized-path hierarchies
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- composite GiST (tenant_id + path)
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_bytes for uuidv7()

-- ----------------------------------------------------------------------------
-- Current-tenant context for Row-Level Security.
-- The app sets this once per connection/transaction (after PgBouncer checkout):
--     SELECT set_config('app.current_tenant', '<uuid>', true);   -- tx-local
-- RLS policies filter every row on tenant_id = app.current_tenant().
-- A separate 'app.bypass_rls' flag lets trusted maintenance/ETL roles opt out.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), 'off') = 'on';
$$;

-- Reusable trigger: stamp updated_at on UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Reusable trigger: stamp modified_at on UPDATE (for tables using that column name).
CREATE OR REPLACE FUNCTION set_modified_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.modified_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- add-school.sql — onboard ONE school (tenant) ready to use.
-- Creates: the school, its root context, all 5 roles with permissions,
-- and a first admin user who can log in and run everything for that school.
--
-- Usage (pass the school details as variables):
--   psql -d lms_full \
--     -v school_name="'Greenwood High'" \
--     -v school_slug="'greenwood'" \
--     -v admin_email="'admin@greenwood.edu'" \
--     -f add-school.sql
--
-- The admin's password is set to 'changeme' (bcrypt) — change it on first login.
-- ============================================================================
SET app.bypass_rls = 'on';

-- capture the psql variables into session settings (DO blocks can't read :vars)
SELECT set_config('lms.new_school_name',  :school_name,  false);
SELECT set_config('lms.new_school_slug',  :school_slug,  false);
SELECT set_config('lms.new_admin_email',  :admin_email,  false);

DO $$
DECLARE
  v_name   TEXT := current_setting('lms.new_school_name');
  v_slug   TEXT := current_setting('lms.new_school_slug');
  v_email  TEXT := current_setting('lms.new_admin_email');
  v_tenant UUID;
  v_admin  UUID;
  v_role   UUID;
  v_ctx    UUID;
  v_perms  TEXT[] := ARRAY['course.view','course.manage','enrol.manage','grade.view','grade.edit','quiz.attempt','quiz.manage'];
  r_name   TEXT;
  r_perms  TEXT[];
BEGIN
  -- 1. The school (tenant) — skip if the slug already exists
  SELECT id INTO v_tenant FROM tenants WHERE slug = v_slug;
  IF v_tenant IS NULL THEN
    INSERT INTO tenants (name, slug, plan, status)
    VALUES (v_name, v_slug, 'standard', 'active')
    RETURNING id INTO v_tenant;
    RAISE NOTICE 'Created school "%" (slug: %)', v_name, v_slug;
  ELSE
    RAISE NOTICE 'School "%" already exists — ensuring roles + admin', v_slug;
  END IF;

  PERFORM set_config('app.current_tenant', v_tenant::text, true);

  -- 2. Root context node for this school (RBAC hierarchy anchor)
  IF NOT EXISTS (SELECT 1 FROM contexts WHERE level='tenant' AND instance_id=v_tenant) THEN
    INSERT INTO contexts (tenant_id, level, instance_id, path, depth)
    VALUES (v_tenant, 'tenant', v_tenant, ('t_'||replace(v_tenant::text,'-','_'))::ltree, 0);
  END IF;
  SELECT id INTO v_ctx FROM contexts WHERE level='tenant' AND instance_id=v_tenant;

  -- 3. All 5 roles, each with its permission bundle
  FOR r_name, r_perms IN
    SELECT * FROM (VALUES
      ('tenant_admin', ARRAY['course.view','course.manage','enrol.manage','grade.view','grade.edit','quiz.attempt','quiz.manage']),
      ('manager',      ARRAY['course.view','course.manage','enrol.manage','grade.view','grade.edit','quiz.attempt','quiz.manage']),
      ('teacher',      ARRAY['course.view','grade.view','grade.edit','quiz.attempt','quiz.manage']),
      ('ta',           ARRAY['course.view','grade.view','grade.edit']),
      ('student',      ARRAY['course.view','quiz.attempt'])
    ) AS t(name, perms)
  LOOP
    SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name=r_name;
    IF v_role IS NULL THEN
      INSERT INTO roles (tenant_id, name) VALUES (v_tenant, r_name) RETURNING id INTO v_role;
    END IF;
    INSERT INTO role_has_permissions (role_id, permission_id)
      SELECT v_role, id FROM permissions WHERE name = ANY(r_perms)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 4. First admin user (global user + membership + login + tenant_admin role)
  SELECT id INTO v_admin FROM users WHERE email = v_email;
  IF v_admin IS NULL THEN
    INSERT INTO users (email, email_verified_at) VALUES (v_email, now()) RETURNING id INTO v_admin;
  END IF;
  INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES (v_tenant, v_admin, 'active') ON CONFLICT DO NOTHING;
  -- password 'changeme' (bcrypt). Replace on first login.
  INSERT INTO auth_methods (tenant_id, user_id, type, secret_hash)
  VALUES (v_tenant, v_admin, 'local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
  ON CONFLICT DO NOTHING;
  -- give them tenant_admin at the school root (cascades to everything in the school)
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='tenant_admin';
  INSERT INTO context_role_assignments (tenant_id, role_id, user_id, context_id)
  VALUES (v_tenant, v_role, v_admin, v_ctx) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'School ready. Admin: %  (password: changeme)', v_email;
END $$;

\echo ''
\echo 'School onboarded. The admin can log in and start creating courses, teachers, and students.'

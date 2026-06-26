-- ============================================================================
-- seed.sql — one-time setup for local development / testing
-- Run AFTER applying the schema migrations:
--   psql -d lms_full -v ON_ERROR_STOP=1 -f seed.sql
--
-- Creates:
--   1. the non-owner application role `lms_app` (required for RLS to work)
--   2. a demo tenant  (slug = 'acme')   + its root context
--   3. the core permission vocabulary
--   4. a 'manager' role bundling those permissions
--
-- Users are created through the API (POST /api/auth/register). After you
-- register your first user, run grant-manager.sql to make them a manager so
-- they can create courses.
-- ============================================================================

-- 1. Application role (idempotent). LOGIN so the API can connect as it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lms_app') THEN
    CREATE ROLE lms_app LOGIN PASSWORD 'lms_app_password';
  ELSE
    ALTER ROLE lms_app LOGIN PASSWORD 'lms_app_password';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO lms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lms_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO lms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO lms_app;

-- 2. Demo tenant + root context
DO $$
DECLARE
  v_tenant UUID;
BEGIN
  INSERT INTO tenants (name, slug, plan, status)
  VALUES ('Acme University', 'acme', 'free', 'active')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_tenant FROM tenants WHERE slug = 'acme';

  -- tenant root context (idempotent)
  IF NOT EXISTS (SELECT 1 FROM contexts WHERE level='tenant' AND instance_id=v_tenant) THEN
    INSERT INTO contexts (tenant_id, level, instance_id, path, depth)
    VALUES (v_tenant, 'tenant', v_tenant,
            ('t_' || replace(v_tenant::text, '-', '_'))::ltree, 0);
  END IF;
END $$;

-- 3. Permission vocabulary
INSERT INTO permissions (name) VALUES
  ('course.view'), ('course.manage'),
  ('enrol.manage'),
  ('grade.view'), ('grade.edit'),
  ('quiz.attempt'), ('quiz.manage'),
  -- finer-grained permissions (Program→Course→Unit→Lesson→Activity hierarchy)
  ('program.manage'),       -- create/manage programs (manager/admin)
  ('category.manage'),      -- manage course categories (course manager)
  ('content.upload'),       -- upload videos/files/notes (teacher)
  ('payment.manage'),       -- configure gateways / financial settings (admin)
  ('payment.verify'),       -- verify/approve payments (tenant manager)
  ('payment.view'),         -- view payment/enrolment status (teacher, read-only)
  ('report.view')           -- view reports/audit (observer, manager)
ON CONFLICT (name, guard_name) DO NOTHING;

-- 4. 'manager' role for the demo tenant, bundling the permissions
DO $$
DECLARE
  v_tenant UUID;
  v_role   UUID;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'acme';

  SELECT id INTO v_role FROM roles WHERE tenant_id = v_tenant AND name = 'manager';
  IF v_role IS NULL THEN
    INSERT INTO roles (tenant_id, name) VALUES (v_tenant, 'manager') RETURNING id INTO v_role;
  END IF;

  INSERT INTO role_has_permissions (role_id, permission_id)
  SELECT v_role, id FROM permissions
   WHERE name IN ('course.view','course.manage','enrol.manage',
                  'grade.view','grade.edit','quiz.attempt','quiz.manage')
  ON CONFLICT DO NOTHING;
END $$;

-- Also seed a 'student' role (course.view + quiz.attempt) for completeness
DO $$
DECLARE
  v_tenant UUID; v_role UUID;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'acme';
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='student';
  IF v_role IS NULL THEN
    INSERT INTO roles (tenant_id, name) VALUES (v_tenant,'student') RETURNING id INTO v_role;
  END IF;
  INSERT INTO role_has_permissions (role_id, permission_id)
  SELECT v_role, id FROM permissions WHERE name IN ('course.view','quiz.attempt')
  ON CONFLICT DO NOTHING;
END $$;

\echo ''
\echo 'Seed complete.'
\echo '  - role lms_app  (password: lms_app_password)'
\echo '  - tenant slug:  acme'
\echo '  - roles:        manager, student'
\echo ''
\echo 'Next: register a user via the API, then run grant-manager.sql'

-- ============================================================================
-- Expanded role set (teacher, ta, tenant_admin) — runs after the tenant +
-- base roles exist. Idempotent. See migrations/23 comment for the rationale.
-- ============================================================================
DO $$
DECLARE v_tenant UUID; v_role UUID;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug='acme';
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- tenant_admin (Tenant Administrator / Manager): full org control incl.
  -- programs, payments verification, reports.
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='tenant_admin';
  IF v_role IS NULL THEN INSERT INTO roles (tenant_id,name) VALUES (v_tenant,'tenant_admin') RETURNING id INTO v_role; END IF;
  INSERT INTO role_has_permissions (role_id,permission_id)
    SELECT v_role,id FROM permissions WHERE name IN
     ('course.view','course.manage','enrol.manage','grade.view','grade.edit','quiz.attempt','quiz.manage',
      'program.manage','category.manage','content.upload','payment.verify','payment.view','report.view')
  ON CONFLICT DO NOTHING;

  -- manager (same as tenant_admin in capability; kept for compatibility)
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='manager';
  IF v_role IS NULL THEN INSERT INTO roles (tenant_id,name) VALUES (v_tenant,'manager') RETURNING id INTO v_role; END IF;
  INSERT INTO role_has_permissions (role_id,permission_id)
    SELECT v_role,id FROM permissions WHERE name IN
     ('course.view','course.manage','enrol.manage','grade.view','grade.edit','quiz.attempt','quiz.manage',
      'program.manage','category.manage','content.upload','payment.verify','payment.view','report.view')
  ON CONFLICT DO NOTHING;

  -- course_manager (Course Manager): manages course STRUCTURE — categories,
  -- courses, units, modules, assign instructors, view course reports. NOT
  -- enrol.manage org-wide, NOT payments verification.
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='course_manager';
  IF v_role IS NULL THEN INSERT INTO roles (tenant_id,name) VALUES (v_tenant,'course_manager') RETURNING id INTO v_role; END IF;
  INSERT INTO role_has_permissions (role_id,permission_id)
    SELECT v_role,id FROM permissions WHERE name IN
     ('course.view','course.manage','category.manage','content.upload','quiz.manage','grade.view','report.view')
  ON CONFLICT DO NOTHING;

  -- teacher (Teacher / Instructor): manage assigned course content (units,
  -- lessons, content uploads, quizzes, assignments) + grade. NOT enrol.manage,
  -- NOT programs, NOT payments.
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='teacher';
  IF v_role IS NULL THEN INSERT INTO roles (tenant_id,name) VALUES (v_tenant,'teacher') RETURNING id INTO v_role; END IF;
  INSERT INTO role_has_permissions (role_id,permission_id)
    SELECT v_role,id FROM permissions WHERE name IN
     ('course.view','course.manage','content.upload','grade.view','grade.edit','quiz.attempt','quiz.manage','payment.view')
  ON CONFLICT DO NOTHING;

  -- ta: view + grade only
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='ta';
  IF v_role IS NULL THEN INSERT INTO roles (tenant_id,name) VALUES (v_tenant,'ta') RETURNING id INTO v_role; END IF;
  INSERT INTO role_has_permissions (role_id,permission_id)
    SELECT v_role,id FROM permissions WHERE name IN ('course.view','grade.view','grade.edit')
  ON CONFLICT DO NOTHING;

  -- observer (Observer / Read-Only): view courses, reports, progress. No edits.
  SELECT id INTO v_role FROM roles WHERE tenant_id=v_tenant AND name='observer';
  IF v_role IS NULL THEN INSERT INTO roles (tenant_id,name) VALUES (v_tenant,'observer') RETURNING id INTO v_role; END IF;
  INSERT INTO role_has_permissions (role_id,permission_id)
    SELECT v_role,id FROM permissions WHERE name IN ('course.view','grade.view','report.view','payment.view')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Roles ensured: tenant_admin, manager, course_manager, teacher, ta, student, observer';
END $$;

-- ============================================================================
-- Default billing plans (for tenant subscriptions / the operator console).
-- ============================================================================
INSERT INTO plans (code, name, price_minor, currency, limits) VALUES
  ('free',     'Free',          0,      'KES', '{"max_users":50,"max_courses":5}'),
  ('standard', 'Standard',      1500000,'KES', '{"max_users":1000,"max_courses":100}'),
  ('premium',  'Premium',       5000000,'KES', '{"max_users":10000,"max_courses":1000}')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- demo-data-remove.sql — removes ONLY the data added by demo-data.sql.
-- Safe to run repeatedly. Leaves schema, seed (roles/tenant), and real data intact.
--   psql -d lms_full -v ON_ERROR_STOP=1 -f demo-data-remove.sql
-- ============================================================================
SET app.bypass_rls = 'on';

DO $$
DECLARE
  v_tenant UUID;
  v_course UUID;
  v_demo_users UUID[];
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug='acme';
  PERFORM set_config('app.current_tenant', v_tenant::text, true);
  SELECT id INTO v_course FROM courses WHERE shortname='DEMO_BIO101';
  SELECT array_agg(id) INTO v_demo_users FROM users
   WHERE email IN ('alice@acme.com','bob@acme.com','carol@acme.com','operator@acme.com','teacher@acme.com','ta@acme.com','tenantadmin@acme.com','coursemanager@acme.com','observer@acme.com');

  IF v_course IS NOT NULL THEN
    -- delete child rows first (FK-safe), all scoped to the demo course
    DELETE FROM grade_grades WHERE grade_item_id IN (SELECT id FROM grade_items WHERE course_id=v_course);
    DELETE FROM grade_items WHERE course_id=v_course;
    DELETE FROM course_sections WHERE course_id=v_course;
    DELETE FROM user_enrolments WHERE course_id=v_course;
    DELETE FROM enrolment_methods WHERE course_id=v_course;
    DELETE FROM context_role_assignments WHERE context_id IN (SELECT id FROM contexts WHERE instance_id=v_course);
    DELETE FROM contexts WHERE level='course' AND instance_id=v_course;
    DELETE FROM courses WHERE id=v_course;
  END IF;

  DELETE FROM course_categories WHERE tenant_id=v_tenant AND name='DEMO_Science';

  -- demo users + their auth/memberships
  IF v_demo_users IS NOT NULL THEN
    DELETE FROM platform_operators WHERE user_id = ANY(v_demo_users);
    DELETE FROM auth_methods WHERE user_id = ANY(v_demo_users);
    DELETE FROM context_role_assignments WHERE user_id = ANY(v_demo_users);
    DELETE FROM tenant_memberships WHERE user_id = ANY(v_demo_users);
    DELETE FROM users WHERE id = ANY(v_demo_users);
  END IF;

  RAISE NOTICE 'DEMO data removed.';
END $$;

\echo 'Demo data removed (schema + real data untouched).'

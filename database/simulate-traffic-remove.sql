-- Removes ONLY the simulated traffic from simulate-traffic.sql. Safe to repeat.
SET app.bypass_rls = 'on';
DO $$
DECLARE
  v_tenant UUID; v_course UUID; v_sim_users UUID[];
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug='acme';
  PERFORM set_config('app.current_tenant', v_tenant::text, true);
  SELECT id INTO v_course FROM courses WHERE shortname='SIM_CS100';
  SELECT array_agg(id) INTO v_sim_users FROM users WHERE email LIKE 'sim+%@acme.com';

  IF v_sim_users IS NOT NULL THEN
    DELETE FROM event_log WHERE user_id = ANY(v_sim_users);
    DELETE FROM quiz_attempts WHERE user_id = ANY(v_sim_users);
    DELETE FROM grade_grades WHERE user_id = ANY(v_sim_users);
    DELETE FROM gradebook_summary WHERE user_id = ANY(v_sim_users);
    DELETE FROM course_completion WHERE user_id = ANY(v_sim_users);
    DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY(v_sim_users));
    DELETE FROM orders WHERE user_id = ANY(v_sim_users);
    DELETE FROM user_enrolments WHERE user_id = ANY(v_sim_users);
    DELETE FROM auth_methods WHERE user_id = ANY(v_sim_users);
    DELETE FROM tenant_memberships WHERE user_id = ANY(v_sim_users);
    DELETE FROM users WHERE id = ANY(v_sim_users);
  END IF;

  IF v_course IS NOT NULL THEN
    DELETE FROM quizzes WHERE course_id=v_course;
    DELETE FROM grade_items WHERE course_id=v_course;
    DELETE FROM enrolment_methods WHERE course_id=v_course;
    DELETE FROM courses WHERE id=v_course;
  END IF;
  DELETE FROM course_categories WHERE tenant_id=v_tenant AND name='SIM_Faculty';

  RAISE NOTICE 'SIM traffic removed.';
END $$;
\echo 'Simulated traffic removed.'

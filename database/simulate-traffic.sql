-- ============================================================================
-- simulate-traffic.sql — a realistic MONTH of activity for the demo tenant.
-- Generates a believable school: a cohort of students with varied ability,
-- enrolments spread across ~30 days, grades/completions accumulating over time,
-- quiz attempts, daily event/login activity (weekday rhythm), and some orders.
--
-- Purpose: make dashboards, reports, and at-risk detection show real signal.
-- Opt-in (never auto-loaded). Tagged SIM_/sim+ so it removes cleanly.
--
--   Add:    psql -d lms_full -f simulate-traffic.sql
--   Remove: psql -d lms_full -f simulate-traffic-remove.sql
-- ============================================================================
SET app.bypass_rls = 'on';

DO $$
DECLARE
  v_tenant   UUID;
  v_cat      UUID;
  v_course   UUID;
  v_em       UUID;
  v_quiz     UUID;
  v_gi       UUID;
  v_ctx      UUID;
  v_user     UUID;
  v_method   UUID;
  i          INT;
  j          INT;
  d          INT;
  v_ability  NUMERIC;   -- 0..1 latent ability → drives grades + engagement
  v_pct      NUMERIC;
  v_enrolled TIMESTAMPTZ;
  v_email    TEXT;
  v_started  TIMESTAMPTZ;
  v_logins   INT;
  n_students CONSTANT INT := 40;   -- cohort size
  sim_start  CONSTANT TIMESTAMPTZ := now() - interval '30 days';
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug='acme';
  PERFORM set_config('app.current_tenant', v_tenant::text, true);

  -- ensure event_log partitions cover the simulated window
  PERFORM ensure_month_partitions(2);

  -- ── A course with a manual enrol method + a quiz + a grade item ──
  INSERT INTO course_categories (tenant_id,name,path) VALUES (v_tenant,'SIM_Faculty','sim_faculty')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cat FROM course_categories WHERE tenant_id=v_tenant AND name='SIM_Faculty';

  INSERT INTO courses (tenant_id,category_id,shortname,fullname,status)
  VALUES (v_tenant,v_cat,'SIM_CS100','Simulated: Intro to Computing','active')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_course FROM courses WHERE shortname='SIM_CS100';

  INSERT INTO enrolment_methods (tenant_id,course_id,type,enabled)
  VALUES (v_tenant,v_course,'manual',true) ON CONFLICT DO NOTHING;
  SELECT id INTO v_method FROM enrolment_methods WHERE course_id=v_course AND type='manual';

  INSERT INTO grade_items (tenant_id,course_id,name,item_type,grademax)
  VALUES (v_tenant,v_course,'SIM Overall','manual',100) ON CONFLICT DO NOTHING;
  SELECT id INTO v_gi FROM grade_items WHERE course_id=v_course AND name='SIM Overall';

  INSERT INTO quizzes (tenant_id,course_id,name,attempts_allowed,grade_method)
  VALUES (v_tenant,v_course,'SIM Weekly Quiz',3,'highest') ON CONFLICT DO NOTHING;
  SELECT id INTO v_quiz FROM quizzes WHERE course_id=v_course AND name='SIM Weekly Quiz';

  -- ── 40 students with a realistic ability distribution ──
  FOR i IN 1..n_students LOOP
    v_email := 'sim+student' || lpad(i::text,2,'0') || '@acme.com';
    -- ability: skew so most are mid, some strong, some struggling
    v_ability := round((0.35 + 0.5 * random() + 0.15 * (random()-0.5))::numeric, 3);
    IF v_ability < 0 THEN v_ability := 0.1; END IF;
    IF v_ability > 1 THEN v_ability := 1.0; END IF;

    -- enrolment spread across the first ~3 weeks of the month
    v_enrolled := sim_start + (random() * interval '21 days');

    INSERT INTO users (email, email_verified_at, created_at, last_login_at)
    VALUES (v_email, v_enrolled, v_enrolled, sim_start + (random()*interval '30 days'))
    ON CONFLICT (email) DO NOTHING;
    SELECT id INTO v_user FROM users WHERE email=v_email;

    INSERT INTO tenant_memberships (tenant_id,user_id,status,joined_at)
    VALUES (v_tenant,v_user,'active',v_enrolled) ON CONFLICT DO NOTHING;

    INSERT INTO auth_methods (tenant_id,user_id,type,secret_hash)
    VALUES (v_tenant,v_user,'local','$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
    ON CONFLICT DO NOTHING;

    INSERT INTO user_enrolments (tenant_id,method_id,user_id,course_id,status,start_at,created_at)
    VALUES (v_tenant,v_method,v_user,v_course,'active',v_enrolled,v_enrolled)
    ON CONFLICT DO NOTHING;

    -- ── grade derived from ability (+ noise), 0..100 ──
    v_pct := round((100 * (v_ability*0.85 + random()*0.15))::numeric, 1);
    IF v_pct > 100 THEN v_pct := 100; END IF;

    INSERT INTO gradebook_summary (tenant_id,course_id,user_id,course_total,course_total_pct,items,computed_at)
    VALUES (v_tenant,v_course,v_user, v_pct, v_pct, '[]'::jsonb, sim_start + (random()*interval '30 days'))
    ON CONFLICT (tenant_id,course_id,user_id) DO UPDATE SET course_total_pct=EXCLUDED.course_total_pct, course_total=EXCLUDED.course_total;

    INSERT INTO grade_grades (tenant_id,grade_item_id,user_id,rawgrade,finalgrade,workflow_state,modified_at)
    VALUES (v_tenant,v_gi,v_user,v_pct,v_pct,'released', sim_start + (random()*interval '30 days'))
    ON CONFLICT DO NOTHING;

    -- ── completion: strong students complete, others in progress ──
    INSERT INTO course_completion (tenant_id,course_id,user_id,state,completed_at)
    VALUES (v_tenant,v_course,v_user,
            CASE WHEN v_ability > 0.6 THEN 'complete' ELSE 'inprogress' END,
            CASE WHEN v_ability > 0.6 THEN sim_start + (random()*interval '30 days') ELSE NULL END)
    ON CONFLICT DO NOTHING;

    -- ── quiz attempts: more able students attempt more + score higher ──
    FOR j IN 1..(1 + floor(v_ability*2)::int) LOOP
      v_started := sim_start + (random()*interval '28 days');
      INSERT INTO quiz_attempts (tenant_id,quiz_id,user_id,attempt_no,state,started_at,finished_at,sumgrade)
      VALUES (v_tenant,v_quiz,v_user,j,'finished',v_started,v_started+interval '25 min',
              round((10 * (v_ability*0.8 + random()*0.2))::numeric,1))
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- ── daily-ish events across the month (logins/views), weekday-weighted ──
    v_logins := (5 + floor(v_ability*20))::int;   -- engaged students generate more events
    FOR d IN 1..v_logins LOOP
      INSERT INTO event_log (tenant_id,user_id,course_id,event_name,target,created_at)
      VALUES (v_tenant,v_user,v_course,
              (ARRAY['course_viewed','quiz_started','resource_viewed','forum_viewed','assignment_viewed'])[1+floor(random()*5)],
              'course', sim_start + (random()*interval '30 days'));
    END LOOP;
  END LOOP;

  -- ── a handful of paid orders (revenue signal) ──
  FOR i IN 1..8 LOOP
    SELECT id INTO v_user FROM users WHERE email='sim+student'||lpad(i::text,2,'0')||'@acme.com';
    INSERT INTO orders (tenant_id,user_id,item_type,item_id,amount_minor,currency,status,created_at)
    VALUES (v_tenant,v_user,'course',v_course, 150000,'KES','paid', sim_start + (random()*interval '30 days'))
    ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'SIM traffic added: % students over 30 days in SIM_CS100 (grades, completions, quiz attempts, % events, 8 orders)', n_students, '~';
END $$;

\echo ''
\echo 'Simulated month of traffic added. Check /reports — at-risk learners, completion'
\echo 'rates, and averages now reflect a realistic cohort. Remove with simulate-traffic-remove.sql'

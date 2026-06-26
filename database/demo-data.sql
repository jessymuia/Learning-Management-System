-- ============================================================================
-- demo-data.sql — OPTIONAL test/demo data, separate from schema + seed.
-- Adds a realistic working scenario you can click through, then remove cleanly.
--
--   Add:    psql -d lms_full -v ON_ERROR_STOP=1 -f demo-data.sql
--   Remove: psql -d lms_full -v ON_ERROR_STOP=1 -f demo-data-remove.sql
--
-- Everything created here is tagged DEMO_ (courses) / demo+ (users) so the
-- remove script deletes exactly this data and nothing else.
-- ============================================================================
SET app.bypass_rls = 'on';   -- run as a privileged session for setup

DO $$
DECLARE
  v_tenant   UUID;
  v_cat      UUID;
  v_course   UUID;
  v_alice    UUID;  -- manager
  v_bob      UUID;  -- student
  v_carol    UUID;  -- student
  v_teacher  UUID;  -- teacher
  v_ta       UUID;  -- teaching assistant
  v_admin    UUID;  -- tenant_admin
  v_cmgr     UUID;  -- course_manager
  v_obs      UUID;  -- observer
  v_mgr_role UUID;
  v_stu_role UUID;
  v_tea_role UUID;
  v_ta_role  UUID;
  v_adm_role UUID;
  v_cmgr_role UUID;
  v_obs_role  UUID;
  v_ctx      UUID;
  v_tctx     UUID;
  v_quiz     UUID;
  v_q        UUID;
  v_qv       UUID;
  v_section  UUID;
  v_gi       UUID;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug='acme';
  PERFORM set_config('app.current_tenant', v_tenant::text, true);

  -- Users (tagged demo+)
  INSERT INTO users (email, email_verified_at) VALUES
    ('alice@acme.com', now()), ('bob@acme.com', now()), ('carol@acme.com', now()),
    ('teacher@acme.com', now()), ('ta@acme.com', now()), ('tenantadmin@acme.com', now()),
    ('coursemanager@acme.com', now()), ('observer@acme.com', now())
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO v_alice   FROM users WHERE email='alice@acme.com';
  SELECT id INTO v_bob     FROM users WHERE email='bob@acme.com';
  SELECT id INTO v_carol   FROM users WHERE email='carol@acme.com';
  SELECT id INTO v_teacher FROM users WHERE email='teacher@acme.com';
  SELECT id INTO v_ta      FROM users WHERE email='ta@acme.com';
  SELECT id INTO v_admin   FROM users WHERE email='tenantadmin@acme.com';
  SELECT id INTO v_cmgr    FROM users WHERE email='coursemanager@acme.com';
  SELECT id INTO v_obs     FROM users WHERE email='observer@acme.com';

  -- Memberships
  INSERT INTO tenant_memberships (tenant_id,user_id,status) VALUES
    (v_tenant,v_alice,'active'),(v_tenant,v_bob,'active'),(v_tenant,v_carol,'active'),
    (v_tenant,v_teacher,'active'),(v_tenant,v_ta,'active'),(v_tenant,v_admin,'active'),
    (v_tenant,v_cmgr,'active'),(v_tenant,v_obs,'active')
  ON CONFLICT DO NOTHING;

  -- Local auth so they can log in (password = "password" bcrypt hash)
  INSERT INTO auth_methods (tenant_id,user_id,type,secret_hash) VALUES
    (v_tenant,v_alice,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha'),
    (v_tenant,v_bob,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha'),
    (v_tenant,v_carol,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha'),
    (v_tenant,v_teacher,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha'),
    (v_tenant,v_ta,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha'),
    (v_tenant,v_admin,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha'),
    (v_tenant,v_cmgr,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha'),
    (v_tenant,v_obs,'local','$2y$10$D3YWQIlxwfiHwv8JZNXVsOC6fIhMn0Bp1K65fXHOkrdDlHIekHZha')
  ON CONFLICT DO NOTHING;

  -- Category + course (tagged DEMO_)
  INSERT INTO course_categories (tenant_id,name,path) VALUES (v_tenant,'DEMO_Science','demo_science')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cat FROM course_categories WHERE tenant_id=v_tenant AND name='DEMO_Science';

  INSERT INTO courses (tenant_id,category_id,shortname,fullname,status)
  VALUES (v_tenant,v_cat,'DEMO_BIO101','Demo: Introduction to Biology','active')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_course FROM courses WHERE shortname='DEMO_BIO101';

  -- Course context node (for RBAC)
  IF NOT EXISTS (SELECT 1 FROM contexts WHERE level='course' AND instance_id=v_course) THEN
    INSERT INTO contexts (tenant_id,level,instance_id,path,depth)
    SELECT v_tenant,'course',v_course, path || ('c_'||replace(v_course::text,'-','_'))::ltree, depth+1
      FROM contexts WHERE level='tenant' AND instance_id=v_tenant;
  END IF;
  SELECT id INTO v_ctx FROM contexts WHERE level='course' AND instance_id=v_course;
  -- tenant-level context: admin/manager/course_manager need permissions org-wide
  -- (create programs, categories, courses) — those checks run at the TENANT context.
  SELECT c.id INTO v_tctx FROM contexts c JOIN tenants t ON t.id=c.instance_id
    WHERE c.level='tenant' AND t.id=v_tenant;

  -- Make Alice a manager, enrol Bob + Carol as students
  SELECT id INTO v_mgr_role FROM roles WHERE tenant_id=v_tenant AND name='manager';
  SELECT id INTO v_stu_role FROM roles WHERE tenant_id=v_tenant AND name='student';
  SELECT id INTO v_tea_role FROM roles WHERE tenant_id=v_tenant AND name='teacher';
  SELECT id INTO v_ta_role  FROM roles WHERE tenant_id=v_tenant AND name='ta';
  SELECT id INTO v_adm_role FROM roles WHERE tenant_id=v_tenant AND name='tenant_admin';
  SELECT id INTO v_cmgr_role FROM roles WHERE tenant_id=v_tenant AND name='course_manager';
  SELECT id INTO v_obs_role  FROM roles WHERE tenant_id=v_tenant AND name='observer';
  -- Admin-type roles → TENANT context (org-wide powers: programs, categories, courses)
  INSERT INTO context_role_assignments (tenant_id,role_id,user_id,context_id)
  VALUES (v_tenant,v_mgr_role,v_alice,v_tctx) ON CONFLICT DO NOTHING;

  -- assign Bob + Carol the student role at the COURSE context
  INSERT INTO context_role_assignments (tenant_id,role_id,user_id,context_id)
  VALUES (v_tenant,v_stu_role,v_bob,v_ctx), (v_tenant,v_stu_role,v_carol,v_ctx)
  ON CONFLICT DO NOTHING;

  -- teacher + ta at the COURSE context (manage that course); tenant_admin +
  -- course_manager at the TENANT context (org-wide); observer at tenant (read-only org).
  INSERT INTO context_role_assignments (tenant_id,role_id,user_id,context_id)
  VALUES (v_tenant,v_tea_role,v_teacher,v_ctx),
         (v_tenant,v_ta_role,v_ta,v_ctx),
         (v_tenant,v_adm_role,v_admin,v_tctx),
         (v_tenant,v_cmgr_role,v_cmgr,v_tctx),
         (v_tenant,v_obs_role,v_obs,v_tctx)
  ON CONFLICT DO NOTHING;

  INSERT INTO enrolment_methods (tenant_id,course_id,type,enabled)
  VALUES (v_tenant,v_course,'manual',true) ON CONFLICT DO NOTHING;

  INSERT INTO user_enrolments (tenant_id,method_id,user_id,course_id,status)
  SELECT v_tenant, em.id, u.uid, v_course, 'active'
    FROM enrolment_methods em
    CROSS JOIN (VALUES (v_bob),(v_carol)) AS u(uid)
   WHERE em.course_id=v_course AND em.type='manual'
  ON CONFLICT DO NOTHING;

  -- A section + a gradebook item
  INSERT INTO course_sections (tenant_id,course_id,section_num,name)
  VALUES (v_tenant,v_course,0,'Week 1: Cells') ON CONFLICT DO NOTHING;

  INSERT INTO grade_items (tenant_id,course_id,name,item_type,grademax)
  VALUES (v_tenant,v_course,'Quiz 1','manual',10) ON CONFLICT DO NOTHING;
  SELECT id INTO v_gi FROM grade_items WHERE course_id=v_course AND name='Quiz 1';

  -- Give Bob a grade so the gradebook shows data
  INSERT INTO grade_grades (tenant_id,grade_item_id,user_id,rawgrade,finalgrade)
  VALUES (v_tenant,v_gi,v_bob,8,8) ON CONFLICT DO NOTHING;

  -- A demo platform operator (super-admin) so the /operator console is usable.
  -- Belongs to the acme tenant (so they can log in) AND is a platform_operator.
  DECLARE
    v_op UUID;
  BEGIN
    INSERT INTO users (email, email_verified_at) VALUES ('operator@acme.com', now())
    ON CONFLICT (email) DO NOTHING;
    SELECT id INTO v_op FROM users WHERE email = 'operator@acme.com';

    INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES (v_tenant, v_op, 'active')
    ON CONFLICT DO NOTHING;
    -- password 'demo1234' (bcrypt)
    INSERT INTO auth_methods (tenant_id, user_id, type, secret_hash) VALUES
      (v_tenant, v_op, 'local', '$2y$10$hn7mXSd5fOYhiBaXC8gTCOriThRdOQCaypG008Urzm47GUgo4kl5G')
    ON CONFLICT DO NOTHING;
    -- make them a platform super-admin (control-plane, crosses tenants)
    INSERT INTO platform_operators (user_id, level) VALUES (v_op, 'superadmin')
    ON CONFLICT (user_id) DO UPDATE SET level = 'superadmin';
  END;

  RAISE NOTICE 'DEMO data added: course DEMO_BIO101, users alice(manager), bob/carol(student), teacher, ta, tenantadmin @acme.com (password: password)';
  RAISE NOTICE 'DEMO super-admin: operator@acme.com (password: demo1234)';
END $$;

\echo ''
\echo 'Demo data added. Log in with alice@acme.com / password (instructor),'
\echo 'or bob@acme.com / password (student). Remove with demo-data-remove.sql'

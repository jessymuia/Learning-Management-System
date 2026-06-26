-- Make a user a platform operator (super-admin).
--   psql -d lms_full -v email="'you@platform.com'" -f make-operator.sql
SET app.bypass_rls = 'on';
DO $$
DECLARE v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM users WHERE email = current_setting('lms.op_email', true);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No user with that email. Register the account first, then run this.';
  END IF;
  INSERT INTO platform_operators (user_id, level) VALUES (v_uid, 'superadmin')
  ON CONFLICT (user_id) DO UPDATE SET level = 'superadmin';
  RAISE NOTICE 'User % is now a platform super-admin.', current_setting('lms.op_email', true);
END $$;

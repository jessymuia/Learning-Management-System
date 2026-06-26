-- ============================================================================
-- grant-manager.sql — give a registered user the 'manager' role
-- so they can create courses, enrol users, etc.
--
-- Usage (pass the email of a user you already registered via the API):
--   psql -d lms_full -v email="alice@acme.com" -f grant-manager.sql
--
-- Pass the email WITHOUT extra quotes; this script quotes it via :'email'.
-- ============================================================================

SELECT id AS tenant_id  FROM tenants  WHERE slug = 'acme' \gset
SELECT id AS user_id    FROM users    WHERE email = :'email' \gset
SELECT id AS role_id    FROM roles    WHERE tenant_id = :'tenant_id' AND name = 'manager' \gset
SELECT id AS context_id FROM contexts WHERE level='tenant' AND instance_id = :'tenant_id' \gset

INSERT INTO context_role_assignments (tenant_id, user_id, role_id, context_id)
VALUES (:'tenant_id', :'user_id', :'role_id', :'context_id')
ON CONFLICT DO NOTHING;

\echo 'Granted manager role to' :email

#!/bin/bash
# Postgres container entrypoint init — runs ONCE on first boot of the volume.
# Applies all migrations in order, then seeds roles/tenant/permissions.
# Demo/test data is NOT loaded here — that is a manual step (see end of script).
set -e
DB="${POSTGRES_DB:-lms_full}"
MIG=/migrations
SEED=/seed

echo "==> Applying migrations in order"
for f in 00_uuidv7 01_foundation 02_tenancy_identity 03_rbac 04_files_async_audit \
         05_partitions 06_rls 07_courses_enrolment 08_grading 09_assessment \
         10_immutability_triggers 11_engagement 12_credentials_programs \
         13_content_video 14_integrations 15_control_plane 16_rls_all \
         17_partitions_all 18_notifications 19_calc_formula 20_surveys \
         21_lti_launch_state 22_overrides_ratings 23_platform_operators 24_tenant_integrations; do
  if [ -f "$MIG/$f.sql" ]; then
    echo "    - $f"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" -q -f "$MIG/$f.sql"
  fi
done

echo "==> Provisioning partitions"
psql --username "$POSTGRES_USER" --dbname "$DB" -q -c "SELECT ensure_month_partitions(3);" || true

echo "==> Seeding role, tenant, permissions"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" -q -f "$SEED/seed.sql"

echo "==> DB init complete (schema + seed only — no demo/test data)"
echo "    To load demo/test data manually, run:"
echo "      docker compose exec postgres psql -U postgres -d $DB -f /seed/demo-data.sql"

#!/usr/bin/env bash
# ============================================================================
# setup-db.sh — create the database, apply all schema migrations, seed.
# Usage:
#   ./setup-db.sh                 # uses defaults below
#   DB=lms_full PGUSER=postgres ./setup-db.sh
#
# Requires: postgres running, and a superuser/owner psql login (PGUSER) that can
# create databases and roles. The APP later connects as the lms_app role.
# ============================================================================
set -euo pipefail

DB="${DB:-lms_full}"
ADMIN="${PGUSER:-postgres}"
HOSTARGS=""
[ -n "${PGHOST:-}" ] && HOSTARGS="$HOSTARGS -h $PGHOST"
[ -n "${PGPORT:-}" ] && HOSTARGS="$HOSTARGS -p $PGPORT"

DIR="$(cd "$(dirname "$0")" && pwd)"
MIG="$DIR/migrations"

echo "==> Creating database '$DB' (if absent)"
createdb $HOSTARGS -U "$ADMIN" "$DB" 2>/dev/null || echo "    (already exists, continuing)"

echo "==> Applying schema migrations"
for f in 00_uuidv7 01_foundation 02_tenancy_identity 03_rbac 04_files_async_audit \
         05_partitions 06_rls 07_courses_enrolment 08_grading 09_assessment \
         10_immutability_triggers 11_engagement 12_credentials_programs \
         13_content_video 14_integrations 15_control_plane 16_rls_all \
         17_partitions_all 18_notifications 19_calc_formula 20_surveys \
         21_lti_launch_state 22_overrides_ratings 23_platform_operators 24_tenant_integrations 25_course_pricing 26_lessons 27_password_resets 28_grade_wiring; do
  echo "    - $f"
  psql $HOSTARGS -U "$ADMIN" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG/$f.sql"
done

echo "==> Provisioning monthly partitions"
psql $HOSTARGS -U "$ADMIN" -d "$DB" -q -c "SELECT ensure_month_partitions(3);"

echo "==> Seeding role, tenant, permissions"
psql $HOSTARGS -U "$ADMIN" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$DIR/seed.sql"

echo ""
echo "Done. Database '$DB' is ready."
echo "Next:"
echo "  1. cd ../backend && npm install && cp .env.example .env   (edit DB creds)"
echo "  2. npm start"
echo "  3. register a user, then:"
echo "     psql -d $DB -v email=\"'you@acme.com'\" -f $DIR/grant-manager.sql"

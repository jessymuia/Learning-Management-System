#!/usr/bin/env bash
# Onboard a school (tenant) in one command.
#   ./add-school.sh "Greenwood High" greenwood admin@greenwood.edu
set -euo pipefail
NAME="${1:?Usage: ./add-school.sh \"School Name\" school-slug admin@email}"
SLUG="${2:?slug required (e.g. greenwood)}"
EMAIL="${3:?admin email required}"
DB="${DB:-lms_full}"
DIR="$(cd "$(dirname "$0")" && pwd)"
H=""; [ -n "${PGHOST:-}" ] && H="$H -h $PGHOST"; [ -n "${PGPORT:-}" ] && H="$H -p $PGPORT"
psql $H -U "${PGUSER:-postgres}" -d "$DB" -v ON_ERROR_STOP=1 \
  -v school_name="'$NAME'" -v school_slug="'$SLUG'" -v admin_email="'$EMAIL'" \
  -f "$DIR/add-school.sql"

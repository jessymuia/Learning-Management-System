#!/usr/bin/env bash
# Make a registered user a platform super-admin.
#   ./make-operator.sh you@platform.com
set -euo pipefail
EMAIL="${1:?Usage: ./make-operator.sh email@example.com}"
DB="${DB:-lms_full}"
DIR="$(cd "$(dirname "$0")" && pwd)"
H=""; [ -n "${PGHOST:-}" ] && H="$H -h $PGHOST"; [ -n "${PGPORT:-}" ] && H="$H -p $PGPORT"
psql $H -U "${PGUSER:-postgres}" -d "$DB" -v ON_ERROR_STOP=1 \
  -c "SELECT set_config('lms.op_email','$EMAIL',false);" \
  -f "$DIR/make-operator.sql"

#!/usr/bin/env bash
# Add or remove demo/test data by command.
#   ./demo.sh add       → insert demo course + users + grades
#   ./demo.sh remove     → remove exactly that demo data
set -euo pipefail
DB="${DB:-lms_full}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HOSTARGS=""
[ -n "${PGHOST:-}" ] && HOSTARGS="$HOSTARGS -h $PGHOST"
[ -n "${PGPORT:-}" ] && HOSTARGS="$HOSTARGS -p $PGPORT"
ADMIN="${PGUSER:-postgres}"
case "${1:-help}" in
  add)    psql $HOSTARGS -U "$ADMIN" -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/demo-data.sql" ;;
  remove) psql $HOSTARGS -U "$ADMIN" -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/demo-data-remove.sql" ;;
  sim-add)    psql $HOSTARGS -U "$ADMIN" -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/simulate-traffic.sql" ;;
  sim-remove) psql $HOSTARGS -U "$ADMIN" -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/simulate-traffic-remove.sql" ;;
  *)      echo "Usage: ./demo.sh {add|remove|sim-add|sim-remove}" ;;
esac

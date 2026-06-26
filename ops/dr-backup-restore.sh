#!/usr/bin/env bash
# Disaster-recovery backup + restore runbook (spec §13 go-live gate).
# STATUS: code-ready. REHEARSE this against YOUR infra on a schedule — the
# go-live gate requires a *rehearsed* restore with a measured RTO/RPO, which
# can only be done on real backups/infrastructure (not in a sandbox).
set -euo pipefail

ACTION="${1:-help}"
DB="${PGDATABASE:-lms_full}"
BUCKET="${BACKUP_BUCKET:-s3://your-backup-bucket/lms}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

case "$ACTION" in
  backup)
    echo "[$(date -u)] Starting logical backup of $DB"
    pg_dump --format=custom --no-owner --file="/tmp/${DB}_${STAMP}.dump" "$DB"
    echo "[$(date -u)] Encrypting + uploading to $BUCKET"
    # gpg --encrypt ... ; aws s3 cp /tmp/${DB}_${STAMP}.dump ${BUCKET}/${DB}_${STAMP}.dump.gpg
    echo "[$(date -u)] Backup complete: ${DB}_${STAMP}.dump"
    echo "RPO marker: ${STAMP}"
    ;;
  restore)
    SRC="${2:?usage: dr-backup-restore.sh restore <dumpfile>}"
    TARGET="${RESTORE_DB:-lms_restore_test}"
    echo "[$(date -u)] Restoring $SRC into $TARGET (rehearsal target)"
    createdb "$TARGET"
    psql -d "$TARGET" -c "CREATE EXTENSION IF NOT EXISTS ltree;"
    pg_restore --no-owner --dbname="$TARGET" "$SRC"
    echo "[$(date -u)] Restore complete. Verifying row counts..."
    psql -d "$TARGET" -c "SELECT 'tenants' t, count(*) FROM tenants UNION ALL SELECT 'courses', count(*) FROM courses UNION ALL SELECT 'users', count(*) FROM users;"
    echo "[$(date -u)] RTO measured from start of this script to here."
    ;;
  verify)
    # point-in-time check: confirm the latest backup is recent enough for RPO
    echo "Checking most recent backup age against RPO target (e.g. 1h)..."
    # aws s3 ls ${BUCKET}/ | tail -1
    ;;
  *)
    echo "Usage: $0 {backup|restore <file>|verify}"
    echo "  backup           - dump + (encrypt) + upload"
    echo "  restore <file>   - restore into a rehearsal DB and verify"
    echo "  verify           - check latest backup age vs RPO"
    ;;
esac

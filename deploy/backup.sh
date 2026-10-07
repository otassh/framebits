#!/bin/bash
# deploy/backup.sh — nightly compressed pg_dump with 7-day retention (Task 6).
# Run from cron/systemd on the VPS. Set OFFSITE_DEST (scp-style
# user@host:/path, or an rclone remote path when OFFSITE_TOOL=rclone) to copy
# the dump offsite after a successful local backup. Set BACKUP_SSH_KEY to the
# private key path used for the scp offsite copy.
#
# Restore procedure (also in deploy/README.md):
#   gunzip -c /var/backups/framebits/framebits-<ts>.sql.gz \
#     | docker compose -f <repo>/deploy/docker-compose.yml exec -T postgres \
#       psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -euo pipefail

# Dumps may contain sensitive data: new files are 600 from creation.
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framebits}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
OFFSITE_DEST="${OFFSITE_DEST:-}"
OFFSITE_TOOL="${OFFSITE_TOOL:-scp}"
BACKUP_SSH_KEY="${BACKUP_SSH_KEY:-}"

log() { echo "[backup] $*"; }
fail() { echo "[backup] ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is not installed"

POSTGRES_USER="${POSTGRES_USER:-framebits}"
POSTGRES_DB="${POSTGRES_DB:-framebits}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/framebits-$STAMP.sql.gz"
PARTIAL="$OUT.partial"
# Never leave a truncated dump behind on failure; only a complete .sql.gz
# is ever kept or copied offsite.
trap 'rm -f "$PARTIAL"' EXIT

log "dumping postgres to $OUT"
cd "$REPO_ROOT"
docker compose -f "deploy/docker-compose.yml" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9 > "$PARTIAL"
mv -f "$PARTIAL" "$OUT"
chmod 600 "$OUT"
trap - EXIT
log "wrote $(du -h "$OUT" | cut -f1)"

# Retention: `-mtime +N` matches files strictly older than N*24h (rounded
# down), so +7 keeps roughly the last 7-8 days of nightly dumps. This is the
# intended "7-day retention": at least 7 daily dumps are always kept.
log "pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name 'framebits-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete -print || true

if [ -n "$OFFSITE_DEST" ]; then
  log "copying offsite via $OFFSITE_TOOL to $OFFSITE_DEST"
  if [ "$OFFSITE_TOOL" = "rclone" ]; then
    rclone copyto "$OUT" "$OFFSITE_DEST/$(basename "$OUT")"
  else
    if [ -n "$BACKUP_SSH_KEY" ]; then
      scp -o BatchMode=yes -o StrictHostKeyChecking=yes -i "$BACKUP_SSH_KEY" "$OUT" "$OFFSITE_DEST/"
    else
      scp -o BatchMode=yes -o StrictHostKeyChecking=yes "$OUT" "$OFFSITE_DEST/"
    fi
  fi
  log "offsite copy complete"
else
  log "OFFSITE_DEST unset; keeping local-only backup (set it for offsite copies)"
fi

log "backup complete"

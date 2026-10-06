#!/bin/bash
# deploy/backup.sh — nightly compressed pg_dump with 7-day retention (Task 6).
# Run from cron/systemd on the VPS. Set OFFSITE_DEST (scp-style
# user@host:/path, or an rclone remote path when OFFSITE_TOOL=rclone) to copy
# the dump offsite after a successful local backup.
#
# Restore procedure (also in deploy/README.md):
#   gunzip -c /var/backups/framebits/framebits-<ts>.sql.gz \
#     | docker compose -f <repo>/deploy/docker-compose.yml exec -T postgres \
#       psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framebits}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
OFFSITE_DEST="${OFFSITE_DEST:-}"
OFFSITE_TOOL="${OFFSITE_TOOL:-scp}"

log() { echo "[backup] $*"; }
fail() { echo "[backup] ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is not installed"

POSTGRES_USER="${POSTGRES_USER:-framebits}"
POSTGRES_DB="${POSTGRES_DB:-framebits}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/framebits-$STAMP.sql.gz"

log "dumping postgres to $OUT"
cd "$REPO_ROOT"
docker compose -f deploy/docker-compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9 > "$OUT"
log "wrote $(du -h "$OUT" | cut -f1)"

log "pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name 'framebits-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete -print || true

if [ -n "$OFFSITE_DEST" ]; then
  log "copying offsite via $OFFSITE_TOOL to $OFFSITE_DEST"
  if [ "$OFFSITE_TOOL" = "rclone" ]; then
    rclone copyto "$OUT" "$OFFSITE_DEST/$(basename "$OUT")"
  else
    scp "$OUT" "$OFFSITE_DEST/"
  fi
  log "offsite copy complete"
else
  log "OFFSITE_DEST unset; keeping local-only backup (set it for offsite copies)"
fi

log "backup complete"

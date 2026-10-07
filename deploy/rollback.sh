#!/bin/bash
# deploy/rollback.sh — re-point /var/www/registry to the previous release and
# restart api+web on the previous image tags (Task 6). Called automatically by
# deploy.sh on failed health checks; can also be run by hand.
# DB is forward-only: migrations are never rolled back here (rows written by a
# newer release stay; the symlink + containers revert to the previous build).
set -euo pipefail

RELEASES_DIR="/var/www/releases"
CURRENT_LINK="/var/www/registry"
COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { echo "[rollback] $*"; }
fail() { echo "[rollback] ERROR: $*" >&2; exit 1; }

[ -L "$CURRENT_LINK" ] || fail "$CURRENT_LINK is not a symlink; nothing to roll back"
CURRENT_TARGET="$(readlink "$CURRENT_LINK")"
log "current target: $CURRENT_TARGET"

# Newest-first release list via mtime (no `ls -t` parsing); the previous
# release is the newest one that is not the current live target (covers both
# mid-deploy and steady-state cases). The live release is never selected.
PREV=""
PREV_SHA=""
while IFS= read -r candidate_dir; do
  [ -n "$candidate_dir" ] || continue
  name="$(basename "$candidate_dir")"
  candidate="$candidate_dir/registry"
  if [ "$candidate" != "$CURRENT_TARGET" ] && [ -d "$candidate" ]; then
    PREV="$candidate"
    PREV_SHA="$name"
    break
  fi
done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)

[ -n "${PREV:-}" ] || fail "no previous release found in $RELEASES_DIR"
log "rolling back to $PREV (sha $PREV_SHA)"

ln -sfn "$PREV" "$CURRENT_LINK.new"
mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"

cd "$COMPOSE_DIR"
GIT_SHA="$PREV_SHA" docker compose -f "deploy/docker-compose.yml" up -d --build api web

DOMAIN="${DOMAIN:-framebits.dev}"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/r/index.json" >/dev/null 2>&1; then
    log "registry is healthy on $PREV_SHA"
    exit 0
  fi
  sleep 1
done

fail "registry did not become healthy after rollback; manual intervention needed"

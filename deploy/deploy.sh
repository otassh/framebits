#!/bin/bash
# deploy/deploy.sh — idempotent production deploy for the single VPS (Task 6).
# Usage: bash deploy/deploy.sh [--allow-degraded] [<target-sha>]  (default: origin/main)
# Must be run from the repo root on the VPS. Steps:
# fetch -> build registry (temp dir, then move) -> rebuild/restart api+web ->
# db migrate+sync -> atomic symlink switch -> health checks (auto-rollback on
# failure) -> keep the last 5 releases.
#
# REQUIRE_API=1 (default) makes /api/health mandatory. Pass --allow-degraded
# (or REQUIRE_API=0 in the environment) to bypass the API gate when the API
# is intentionally down; the registry check is always mandatory.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ALLOW_DEGRADED="0"
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --allow-degraded) ALLOW_DEGRADED="1" ;;
    *) TARGET="$arg" ;;
  esac
done
if [ -z "$TARGET" ]; then
  TARGET="origin/main"
fi
RELEASES_DIR="/var/www/releases"
CURRENT_LINK="/var/www/registry"
if [ "$ALLOW_DEGRADED" = "1" ]; then
  REQUIRE_API="0"
else
  REQUIRE_API="${REQUIRE_API:-1}"
fi
COMPOSE_FILE="deploy/docker-compose.yml"

log() { echo "[deploy] $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

# Single-deploy guard: fail fast when another deploy holds the lock.
LOCK_FILE="/tmp/framebits-deploy.lock"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "another deploy is running (lock $LOCK_FILE)"

command -v docker >/dev/null || fail "docker is not installed"
command -v node >/dev/null || fail "node is not installed"
command -v pnpm >/dev/null || fail "pnpm is not installed"

log "fetching target $TARGET"
git fetch origin --prune
# Fail closed: --verify refuses ambiguous/short SHAs instead of guessing.
SHA="$(git rev-parse --verify "$TARGET^{commit}")"
[ -n "$SHA" ] || fail "could not resolve target $TARGET to a commit"
log "target sha: $SHA"
export GIT_SHA="$SHA"

RELEASE_DIR="$RELEASES_DIR/$SHA"
if [ -L "$CURRENT_LINK" ] && [ "$(readlink "$CURRENT_LINK")" = "$RELEASE_DIR/registry" ]; then
  log "release $SHA is already live; continuing (idempotent)"
fi

log "checking out $SHA (detached, deploy only)"
git checkout --detach "$SHA"

log "installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

log "building registry into a temp dir"
TMPDIR_OUT="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_OUT"' EXIT
GIT_SHA="$SHA" pnpm build:registry --out "$TMPDIR_OUT/registry"
test -f "$TMPDIR_OUT/registry/r/index.json" || fail "registry build produced no r/index.json"

log "moving registry to $RELEASE_DIR/registry"
mkdir -p "$RELEASE_DIR"
if [ -d "$RELEASE_DIR/registry" ]; then
  rm -rf "$RELEASE_DIR/registry"
fi
mv "$TMPDIR_OUT/registry" "$RELEASE_DIR/registry"
trap - EXIT

log "rebuilding and restarting api + web"
docker compose -f "$COMPOSE_FILE" up -d --build api web

# DB steps (Tasks 7/8): run when the package scripts exist, warn otherwise.
if node -e "const s=require('./packages/db/package.json').scripts||{};process.exit(s['db:migrate']?0:1)" 2>/dev/null; then
  log "running db migrations"
  pnpm db:migrate
else
  log "WARNING: @framebits/db has no db:migrate yet (Task 7 pending); skipping"
fi
if node -e "const s=require('./packages/db/package.json').scripts||{};process.exit(s['db:sync']?0:1)" 2>/dev/null; then
  log "syncing db from the new release"
  pnpm db:sync
else
  log "WARNING: @framebits/db has no db:sync yet (Task 7 pending); skipping"
fi

log "atomically switching $CURRENT_LINK -> $RELEASE_DIR/registry"
ln -sfn "$RELEASE_DIR/registry" "$CURRENT_LINK.new"
mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"

wait_for() {
  local url="$1" label="$2" i
  for i in $(seq 1 30); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      log "$label is healthy"
      return 0
    fi
    sleep 1
  done
  return 1
}

DOMAIN="${DOMAIN:-framebits.dev}"
if ! wait_for "https://$DOMAIN/r/index.json" "registry"; then
  log "registry health check failed; rolling back"
  bash "deploy/rollback.sh"
  fail "deploy failed health checks; rolled back"
fi

if [ "$REQUIRE_API" = "1" ]; then
  if ! wait_for "https://$DOMAIN/api/health" "api"; then
    log "api health check failed; rolling back"
    bash "deploy/rollback.sh"
    fail "deploy failed health checks; rolled back"
  fi
else
  if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    log "api is healthy (bonus; degraded mode allowed it to be optional)"
  else
    log "WARNING: /api/health not healthy (degraded mode via --allow-degraded or REQUIRE_API=0); registry is live"
  fi
fi

log "pruning old releases (keeping 5, never the live release)"
LIVE_TARGET=""
if [ -L "$CURRENT_LINK" ]; then
  LIVE_TARGET="$(readlink "$CURRENT_LINK")"
fi
# Newest-first via mtime (no `ls -t` parsing); the live symlink target is
# never deleted even when it is not among the newest 5.
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn \
  | cut -d' ' -f2- \
  | tail -n +6 \
  | while IFS= read -r old; do
    [ -n "$old" ] || continue
    if [ -n "$LIVE_TARGET" ] && [ "$old/registry" = "$LIVE_TARGET" ]; then
      log "keeping live release $old"
      continue
    fi
    rm -rf "$old" && log "removed $old"
  done

log "deploy of $SHA complete"

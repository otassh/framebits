#!/bin/bash
# deploy/deploy.sh — idempotent production deploy for the single VPS (Task 6).
# Usage: bash deploy/deploy.sh [<target-sha>]  (default: origin/main)
# Must be run from the repo root on the VPS. Steps per docs/MASTER_PROMPT.md:
# fetch -> build registry (temp dir, then move) -> rebuild/restart api+web ->
# db migrate+sync -> atomic symlink switch -> health checks (auto-rollback on
# failure) -> keep the last 5 releases.
#
# REQUIRE_API=1 makes /api/health mandatory (default 0 until Task 8 ships the
# real server; the registry check is always mandatory).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET="${1:-origin/main}"
RELEASES_DIR="/var/www/releases"
CURRENT_LINK="/var/www/registry"
REQUIRE_API="${REQUIRE_API:-0}"
COMPOSE="docker compose -f deploy/docker-compose.yml"

log() { echo "[deploy] $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is not installed"
command -v node >/dev/null || fail "node is not installed"
command -v pnpm >/dev/null || fail "pnpm is not installed"

log "fetching target $TARGET"
git fetch origin --prune
SHA="$(git rev-parse "$TARGET^{commit}")"
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
$COMPOSE up -d --build api web

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
  bash deploy/rollback.sh
  fail "deploy failed health checks; rolled back"
fi

if [ "$REQUIRE_API" = "1" ]; then
  if ! wait_for "https://$DOMAIN/api/health" "api"; then
    log "api health check failed; rolling back"
    bash deploy/rollback.sh
    fail "deploy failed health checks; rolled back"
  fi
else
  if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    log "api is healthy (bonus; not required until Task 8)"
  else
    log "WARNING: /api/health not healthy (expected until Task 8); registry is live"
  fi
fi

log "pruning old releases (keeping 5)"
# shellcheck disable=SC2012
ls -t "$RELEASES_DIR" | tail -n +6 | while read -r old; do
  [ -n "$old" ] && rm -rf "$RELEASES_DIR/$old" && log "removed $old"
done

log "deploy of $SHA complete"

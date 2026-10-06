#!/bin/bash
# scripts/verify-registry-headers.sh — Task 6 acceptance check.
# Verifies the Caddy registry headers against a running stack (local or prod):
#   bash scripts/verify-registry-headers.sh [base-url]   (default http://localhost:8080)
#
# Checks: mutable files (index.json, <slug>.json) carry the 300s policy,
# versioned files (<slug>@<version>.json) carry the immutable 1y policy, and
# every registry read is CORS-open JSON. Needs curl + node. Works in Git Bash.
set -euo pipefail

BASE="${1:-http://localhost:8080}"
BASE="${BASE%/}"

command -v curl >/dev/null || { echo "ERROR: curl is not installed" >&2; exit 2; }
command -v node >/dev/null || { echo "ERROR: node is not installed" >&2; exit 2; }

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS: $*"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $*" >&2; }

# Fetch headers (lowercased) + status into globals: STATUS + header map via file.
headers_of() {
  local url="$1"
  local tmp
  tmp="$(mktemp)"
  STATUS="$(curl -sS -o /dev/null -D "$tmp" -w "%{http_code}" --max-time 10 "$url")"
  HEADERS_FILE="$tmp"
}
header_val() {
  grep -i "^$1:" "$HEADERS_FILE" | tail -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//;s/ *$//' | tr '[:upper:]' '[:lower:]'
}

MUTABLE_CC="public, max-age=300, stale-while-revalidate=86400"
IMMUTABLE_CC="public, max-age=31536000, immutable"

check_registry_file() {
  local path="$1" expected_cc="$2" label="$3"
  headers_of "$BASE$path"
  if [ "$STATUS" != "200" ]; then bad "$label: HTTP $STATUS (want 200)"; rm -f "$HEADERS_FILE"; return; fi
  local cc ctype acao
  cc="$(header_val cache-control)"
  ctype="$(header_val content-type)"
  acao="$(header_val access-control-allow-origin)"
  if [ "$cc" = "$expected_cc" ]; then ok "$label cache-control"; else bad "$label cache-control: '$cc' (want '$expected_cc')"; fi
  case "$ctype" in
    application/json*charset=utf-8*) ok "$label content-type ($ctype)" ;;
    *) bad "$label content-type: '$ctype' (want application/json; charset=utf-8)" ;;
  esac
  if [ "$acao" = "*" ]; then ok "$label CORS open"; else bad "$label access-control-allow-origin: '$acao' (want *)"; fi
  rm -f "$HEADERS_FILE"
}

echo "== registry header check against $BASE =="

# Mutable: index.json
INDEX_BODY="$(curl -sS --max-time 10 "$BASE/r/index.json")" || { bad "GET /r/index.json failed"; }
check_registry_file "/r/index.json" "$MUTABLE_CC" "index.json"

# Pick the first item from the live index for slug + versioned checks.
SLUG="$(node -e "const i=JSON.parse(require('fs').readFileSync(0,'utf8'));const it=i.items&&i.items[0];if(!it)process.exit(1);console.log(it.slug)" <<<"$INDEX_BODY")" \
  || { bad "index.json has no items"; }
VERSION="$(node -e "const i=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(i.items[0].version)" <<<"$INDEX_BODY")"

if [ -n "${SLUG:-}" ]; then
  check_registry_file "/r/$SLUG.json" "$MUTABLE_CC" "$SLUG.json (mutable)"
  check_registry_file "/r/$SLUG@$VERSION.json" "$IMMUTABLE_CC" "$SLUG@$VERSION.json (immutable)"
fi

check_registry_file "/search-index.json" "$MUTABLE_CC" "search-index.json"
check_registry_file "/build-manifest.json" "$MUTABLE_CC" "build-manifest.json"
check_registry_file "/schema/meta.json" "$MUTABLE_CC" "schema/meta.json"

echo "== $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]

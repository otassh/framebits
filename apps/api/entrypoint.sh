#!/bin/sh
# apps/api entrypoint. Task 8 provides dist/server.js; until then the
# container parks (sleep infinity) instead of crash-looping, so
# `docker compose up` stays green for the registry + web while the API
# healthcheck honestly reports unhealthy.
# TODO(question): remove the park branch once Task 8 ships the real server.
set -eu

if [ -f ./dist/server.js ]; then
  exec node ./dist/server.js
fi

echo "framebits-api: dist/server.js not found (Task 8 pending); parking container." >&2
echo "framebits-api: /api/* will 502 until the real server is built." >&2
exec sleep infinity

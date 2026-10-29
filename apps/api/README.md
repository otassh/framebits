# @framebits/api

API foundations: validated runtime configuration and OAuth/session security helpers.
`pnpm --filter @framebits/api build` emits these modules into `dist/`.

HTTP routes and `src/server.ts` are not implemented yet. This package does not
start an HTTP server or provide a working GitHub sign-in flow. The existing Docker
entrypoint parks until a server is provided and its API healthcheck remains unhealthy.

Configuration requires `DATABASE_URL`. Development defaults to
`WEB_ORIGIN=http://localhost:5173`; production requires an HTTPS `WEB_ORIGIN`,
GitHub OAuth credentials (`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`), and a
`RATE_LIMIT_SECRET` of at least 32 characters. `TRUSTED_PROXY_COUNT` defaults to 0.

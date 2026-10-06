# apps/web Dockerfile (Task 6).
# Multi-stage: build the static SPA (prebuild generates the real registry
# into .registry/, which Vite serves as publicDir, so dist/ contains both
# the site and /r/*.json), then serve it read-only via nginx-unprivileged
# (already non-root: uid 101 `nginx`). SPA fallback is handled in nginx.conf.
FROM node:22.17.0-bookworm-slim AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages ./packages
COPY registry ./registry
COPY apps ./apps
# Full-workspace install: the builder type-checks inside packages/registry-env
# (pinned react + allowlisted packages), which a --filter install would omit.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @framebits/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

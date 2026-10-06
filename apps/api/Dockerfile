# apps/api Dockerfile (Task 6).
# Multi-stage: install the pnpm workspace, build @framebits/api (and its
# workspace deps), then ship a pruned production deployment.
# Runtime is the non-root `node` user. Until Task 8 lands a real server, the
# entrypoint parks the container (no restart loop) so Caddy + registry + web
# stay green; see entrypoint.sh and deploy/README.md.
FROM node:22.17.0-bookworm-slim AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
# Full-workspace install (keeps builder/registry-env typecheck inputs intact
# for future build steps); the deploy stage below still ships only the api.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @framebits/api... build
RUN pnpm --filter @framebits/api deploy /deploy --prod --legacy

FROM node:22.17.0-bookworm-slim

ENV NODE_ENV=production
WORKDIR /srv/api
COPY --from=builder /deploy ./
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Non-root where possible (base image provides the `node` user).
USER node
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]

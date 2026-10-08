# Deploy (Task 6): VPS, Docker Compose, Caddy

Single-VPS production setup. Git is the source of truth, Postgres is only an
index/stats store, and static files on disk are the delivery mechanism: the
registry is served by Caddy straight from `/var/www/registry` and never
touches Node or the database.

```
                    ┌─────────────────────────────────────────────┐
                    │ VPS (docker compose, deploy/docker-compose.yml)
  internet ──80/443─▶ caddy:2.10.2-alpine                         │
                    │   /r/*, /search-index.json, /schema/*,      │
                    │   /build-manifest.json ──► file_server      │
                    │                          /var/www/registry │
                    │                          (host bind, ro)   │
                    │   /api/* ──► reverse_proxy api:3001         │
                    │   /* ──────► reverse_proxy web:3000         │
                    │         │                    │              │
                    │         ▼                    ▼              │
                    │   api (node:22 slim)   web (nginx)          │
                    │         │                                   │
                    │         ▼                                   │
                    │   postgres:16.9 (internal net only)         │
                    └─────────────────────────────────────────────┘
  /var/www/releases/<git-sha>/registry/   builder output
  /var/www/registry -> releases/<live-sha>/registry   (atomic symlink)
  /var/backups/framebits/                 pg_dump archives
```

## 1. Local verification (Task 6 acceptance)

From the repo root (Docker + `bash` required; on Windows use Git Bash):

```sh
pnpm install --frozen-lockfile
pnpm build:registry
docker compose -f deploy/docker-compose.local.yml up -d --build
bash scripts/verify-registry-headers.sh http://localhost:8080
```

Expected: `http://localhost:8080/r/index.json` returns 200 with
`Cache-Control: public, max-age=300, stale-while-revalidate=86400`,
`<slug>@<version>.json` returns
`Cache-Control: public, max-age=31536000, immutable`, all registry reads
carry `Access-Control-Allow-Origin: *` and
`Content-Type: application/json; charset=utf-8`. The script prints
`PASS` per check and exits non-zero on any failure. Also try
`http://localhost:8080/` (web SPA) and `http://localhost:8080/healthz`.

Tear down: `docker compose -f deploy/docker-compose.local.yml down`
(add `-v` to drop the local pgdata volume).

## 2. First-time VPS setup (ordered, Ubuntu 24.04)

1. Create the VPS, add your SSH key, disable password login:
   `PasswordAuthentication no` in `/etc/ssh/sshd_config`, then
   `systemctl reload sshd`.
2. Firewall: `ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`.
3. Brute-force guard: `apt install fail2ban && systemctl enable --now fail2ban`
   (default sshd jail is enough to start).
4. Security updates: `apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.
5. Install Docker (official apt repo) + the compose plugin; enable log
   rotation in `/etc/docker/daemon.json`:
   `{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}`,
   then `systemctl restart docker`.
6. DNS: point `framebits.dev` (placeholder domain, still unconfirmed) at the
   VPS. Caddy obtains HTTPS certificates automatically on first request.
7. Layout + repo:
   ```sh
   sudo mkdir -p /var/www/releases /var/backups/framebits
   sudo chown "$USER:$USER" /var/www /var/backups/framebits
   git clone <repo-url> ~/framebits && cd ~/framebits
   cp .env.example .env   # then fill in section 3, chmod 600 .env
   ```
8. First deploy: `bash deploy/deploy.sh origin/main`.
9. Backups: `crontab -e` -> `17 3 * * * /bin/bash ~/framebits/deploy/backup.sh >> /var/log/framebits-backup.log 2>&1`.
10. Optional CI deploy (currently disabled): `.github/workflows/deploy.yml`
    is manual-only (`workflow_dispatch`), so pushes to `main` do not deploy.
    To use it, add the section-4 secrets and run it by hand from the Actions
    tab (environment `production`, approve the run if the environment has
    required reviewers).

## 3. Environment / secrets

`.env` on the VPS (mode 600, never committed; `.env.example` is the template):

| Key                                                                                             | Required           | Notes                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                                             | yes                | Strong random value; compose fails fast if unset (prod). Generate with `openssl rand -base64 32`.                                                                                                           |
| `POSTGRES_USER` / `POSTGRES_DB`                                                                 | no                 | Default `framebits`.                                                                                                                                                                                        |
| `DOMAIN`                                                                                        | no                 | Default `framebits.dev` (placeholder, unconfirmed).                                                                                                                                                         |
| `ADMIN_TOKEN`                                                                                   | Task 8/10          | Min 32 chars; unused until the API lands. Generate with `openssl rand -base64 48`.                                                                                                                          |
| `DATABASE_URL`                                                                                  | Task 7/8           | Compose builds it from the `POSTGRES_*` vars for `api`.                                                                                                                                                     |
| `LIKE_PEPPER`, `WEB_ORIGIN`, `TRUSTED_PROXY_COUNT`, `PORT`, `REGISTRY_URL`, `VITE_REGISTRY_URL` | see `.env.example` | API/web wiring for later tasks. `TRUSTED_PROXY_COUNT=1` direct on the VPS (Caddy -> api); `2` behind Cloudflare/CDN in front of Caddy (client -> CDN -> Caddy -> api). Never trust more hops than deployed. |
| `OFFSITE_DEST` / `OFFSITE_TOOL` / `BACKUP_SSH_KEY`                                              | no                 | `backup.sh` offsite copy (`scp` default, or `rclone`). `scp` always uses `-o BatchMode=yes -o StrictHostKeyChecking=yes`; set `BACKUP_SSH_KEY` for `-i <key>`.                                              |
| `REQUIRE_API=1`                                                                                 | no                 | `/api/health` deploy-blocking (default 1; pass `--allow-degraded` or `REQUIRE_API=0` to bypass).                                                                                                            |

Generate secrets with `openssl rand` (never reuse passwords across hosts);
`chmod 600 .env` and `chmod 600 /var/backups/framebits/*.sql.gz` (backup.sh
already creates dumps with `umask 077` + `chmod 600` and removes partial
dumps on failure).

## 4. GitHub secrets for `deploy.yml`

`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (private deploy key), optional
`VPS_REPO_DIR` (default `~/framebits`), `VPS_SSH_PORT` (default `22`),
`VPS_KNOWN_HOSTS` (output of `ssh-keyscan <host>`; pins host keys so CI uses
`StrictHostKeyChecking=yes`. Until set, the workflow warns and falls back to
`accept-new` TOFU).
<!-- TODO(question): owner to add VPS_KNOWN_HOSTS and confirm the accept-new fallback can be removed. -->

The workflow SSHes in and runs `bash deploy/deploy.sh $GITHUB_SHA` with all
secrets quoted; the private key is removed via `trap` even on failure.
Set required reviewers on the `production` environment so main never deploys
without approval.

## 5. Day-to-day operations

- Deploy: `bash deploy/deploy.sh [--allow-degraded] [<sha>]` (default `origin/main`). Idempotent:
  re-running a live sha is a no-op after the checkout; releases are
  content-built in a temp dir and moved, the symlink flips atomically
  (`ln -sfn` + `mv -T`), and the last 5 releases are kept (live release never
  pruned). A `flock` guard refuses concurrent deploys.
- Rollback: `bash deploy/rollback.sh` (previous release becomes live, api+web
  restart on its image tags with `--build`). Runs automatically if post-deploy health checks
  fail. DB is forward-only: migrations are never rolled back.
- Backup: `bash deploy/backup.sh`. Restore:
  ```sh
  gunzip -c /var/backups/framebits/framebits-<ts>.sql.gz \
    | docker compose -f ~/framebits/deploy/docker-compose.yml exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  ```

## 6. Hardening checklist

- [ ] UFW: only 22/80/443 (`ufw status verbose`).
- [ ] SSH key-only (`PasswordAuthentication no`), root login disabled.
- [ ] fail2ban running (`fail2ban-client status sshd`).
- [ ] Unattended security upgrades enabled.
- [ ] Docker log rotation configured (section 2.5) with retention sized for
      the VPS disk (access logs contain IPs + Referer/User-Agent; rotate
      locally only, never ship elsewhere; DB stores no raw IPs/emails/UAs).
- [ ] Postgres reachable only on the `backend` compose network
      (no `ports:` on the service; verify with `ss -ltn`).
- [ ] `.env` is 600 and never appears in `git status`, images, or CI logs.
- [ ] Nightly `backup.sh` in cron + at least one tested restore; dumps are
      600 (`umask 077`), partial dumps removed by `trap`.
- [ ] `DOMAIN` DNS + `curl -sSI https://$DOMAIN/r/index.json` shows HSTS.

## 7. Pinned images

| Service             | Image                                     | Why this one                                          |
| ------------------- | ----------------------------------------- | ----------------------------------------------------- |
| caddy               | `caddy:2.10.2-alpine`                     | Automatic HTTPS + `file_server` ETags.                |
| api builder/runtime | `node:22.17.0-bookworm-slim`              | Matches repo Node 22 LTS + pnpm 10.29.3 via corepack. |
| postgres            | `postgres:16.9-bookworm`                  | Project database (PG 16).                             |
| web runtime         | `nginxinc/nginx-unprivileged:1.29-alpine` | Non-root (uid 101) static server with SPA fallback.   |

Bump pins deliberately (rebuild + re-run section 1) and keep this table truthful.

## 8. Known gaps (owned by later tasks, not this one)

- `api` has no server yet (Task 8): the image builds, but the entrypoint
  parks the container and `/api/*` 502s until `dist/server.js` exists.
  The container stays up (no restart loop) and reports unhealthy honestly.
  `REQUIRE_API=1` is now the default; pass `--allow-degraded` until Task 8
  lands.
- `pnpm db:migrate` / `pnpm db:sync` (Task 7): `deploy.sh` runs them when the
  `@framebits/db` scripts exist and warns otherwise. The steps run before the
  symlink flip, so a future migration failure can never publish a half-deploy.
- `DOMAIN=framebits.dev` is still a placeholder.

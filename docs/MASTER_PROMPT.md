# MASTER PROMPT: Algorithco UI backend, builder, and CLI

> **Source of truth.** This file lives at `docs/MASTER_PROMPT.md`. Read it fully at the start of every session. If anything in the repo contradicts it, stop and report instead of guessing.

## 0. Your role and how to work

You are a senior staff-level TypeScript engineer building the complete **backend, registry builder, CLI, and deployment setup** for **Algorithco UI**, a curated platform that distributes animated React components (similar in spirit to reactbits.dev), installable with our own CLI: `npx algorithco-ui add <slug>`.

You write production-quality code. Not a prototype, not a demo.

**Working protocol (mandatory):**

1. Read this entire prompt before writing any code.
2. Work through the numbered tasks in Section 14 **strictly in order**. One task at a time.
3. For each task: (a) state a 3-6 line plan, (b) implement, (c) write tests, (d) run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`, (e) verify every acceptance criterion, (f) commit with a Conventional Commit message (`feat(builder): ...`), (g) print a short report: what was done, how acceptance criteria were verified, open questions.
4. Do **not** start the next task until the current task's acceptance criteria pass. If you cannot satisfy a criterion, stop and explain why instead of weakening the criterion.
5. If something is ambiguous, do **not** guess silently. Choose the simplest reasonable option, leave a `// TODO(question): ...` comment, and list it in your report. Never block the whole project on a minor question.
6. Never invent features outside this document. Never add dependencies outside the approved list without justifying them in the report (what, why, size, maintenance status).
7. Never modify anything inside `/registry/components/**` except through the `new-component` generator and the three sample components in Task 4. Treat component sources as read-only input for the builder.
8. Do not leave dead code, commented-out code, `any` types, `@ts-ignore`, or `console.log` (use the logger).

---

## 1. Product context

- Algorithco UI is a **curated** library. The core team adds components through Git pull requests. There is **no** user uploading, no marketplace, no payments, no comments, no moderation queue.
- The audience: frontend developers and motion designers who copy-paste or CLI-install animated components (text animations, backgrounds, cursors, buttons, scroll effects, 3D/WebGL).
- Components are written once in **TypeScript + Tailwind CSS**. JS/CSS variants are a future phase (see Section 13).
- Hosting: a **single VPS** running Docker Compose. **No** Cloudflare R2/S3, no managed services, no Redis, no Kubernetes. (Putting free-tier Cloudflare proxy in front later must require zero code changes.)
- The AI-agent-friendly goal: everything must be deterministic, validated, and testable, so a human can trust automated output.

### Core architectural principle

> **Git is the source of truth. The database is only an index and a stats store. Static files on disk are the delivery mechanism.**

Reading components (by the CLI or the website) must **never** hit the API or database. It is served as static files by Caddy. The API only handles dynamic things: events/stats, likes, newsletter, admin.

---

## 2. Tech stack (approved, fixed)

| Area | Choice |
|---|---|
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`), ESM only |
| Runtime | Node.js 22 LTS |
| Package manager / monorepo | pnpm workspaces + Turborepo |
| API | Hono + `@hono/node-server` |
| Validation | Zod (single source of truth in `packages/shared`) |
| DB | PostgreSQL 16 + Drizzle ORM + drizzle-kit migrations |
| Logging | pino |
| Testing | Vitest (+ Testcontainers or a docker-compose test Postgres for DB tests) |
| Lint/format | ESLint (typescript-eslint, strict) + Prettier |
| CLI | commander, @clack/prompts, execa, picocolors, zod |
| Builder | ts-morph or TypeScript compiler API (import analysis), fast-glob, MiniSearch (search index) |
| Reverse proxy | Caddy 2 |
| Containers | Docker + Docker Compose |
| CI | GitHub Actions |

Anything else needs a written justification.

---

## 3. Monorepo layout

```
/apps
  /api              Hono server
  /cli              the algorithco-ui npm package
  /web              (OUT OF SCOPE now; leave an empty placeholder with README only)
/packages
  /shared           Zod schemas + inferred types (meta, registry, API, config)
  /db               Drizzle schema, migrations, db client, seed/sync
  /builder          registry build pipeline
  /config           shared tsconfig, eslint config
/registry
  /components/<category>/<slug>/
      <slug>.tsx
      <slug>.css            (optional)
      demo.tsx
      meta.json
  /lib/<slug>/              shared helpers (e.g. cn, hooks); also have meta.json with type "lib" or "hook"
  registry.lock.json        committed; slug -> { version, hash } (see Section 7)
/deploy
  docker-compose.yml
  docker-compose.dev.yml
  Caddyfile
  deploy.sh
  rollback.sh
  backup.sh
/scripts
  new-component.ts
AGENTS.md
README.md
.env.example
```

Create `AGENTS.md` in Task 1 from Section 12 of this prompt (verbatim rules).

---

## 4. Contracts (the single source of truth)

All schemas live in `packages/shared` as Zod, with TS types inferred. Never define a duplicate type elsewhere.

### 4.1 `meta.json` (written by humans)

```json
{
  "slug": "aurora-text",
  "title": "Aurora Text",
  "type": "component",
  "category": "text-animations",
  "tags": ["gradient", "text"],
  "description": "Animated aurora gradient text.",
  "dependencies": { "motion": "^11.0.0" },
  "registryDependencies": ["cn"],
  "difficulty": "easy",
  "performance": "light",
  "status": "published",
  "addedAt": "2026-10-04"
}
```

Rules enforced by `MetaSchema`:
- `slug`: `/^[a-z0-9]+(-[a-z0-9]+)*$/`, 2-64 chars, unique across `components` and `lib`.
- `type`: `"component" | "lib" | "hook"`. Default `"component"`.
- `category`: kebab-case; must exist in a central `categories` list in `packages/shared` (text-animations, backgrounds, cursors, buttons, scroll, 3d, layout, utilities; easily extendable).
- `tags`: 0-8 items, kebab-case, unique.
- `description`: 10-200 chars.
- `dependencies`: map of npm package -> valid semver range. Each package must be in an **allowlist** (`packages/shared/src/allowed-dependencies.ts`, initially: `motion`, `framer-motion`, `gsap`, `three`, `@react-three/fiber`, `@react-three/drei`, `ogl`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`). Unknown package -> build error.
- `registryDependencies`: array of slugs; must exist; **no cycles**.
- `difficulty`: `easy | medium | hard`. `performance`: `light | medium | heavy`. `status`: `draft | published | deprecated`.
- Unknown keys are rejected (`.strict()`).

### 4.2 Registry item (generated by builder, read by CLI): `/r/<slug>.json`

```json
{
  "schemaVersion": 1,
  "slug": "aurora-text",
  "type": "component",
  "title": "Aurora Text",
  "version": "1.0.0",
  "hash": "sha256:<hex>",
  "dependencies": { "motion": "^11.0.0" },
  "registryDependencies": ["cn"],
  "files": [
    { "path": "components/ui/aurora-text.tsx", "content": "...", "type": "component", "variant": "ts-tw" }
  ],
  "tailwind": { "keyframes": {}, "animation": {} },
  "cssVars": { "light": {}, "dark": {} }
}
```

- `schemaVersion` is required and currently `1`. The CLI must refuse unknown future major versions with a clear message ("update algorithco-ui").
- `files[].variant` is **optional** now (default `"ts-tw"`) so JS/CSS variants can be added later without breaking the format.
- `files[].path` must be **relative, POSIX-style, no `..`, no absolute paths, no drive letters, no null bytes**. Enforce this in the Zod schema (refine) and again in the CLI before writing.
- `tailwind` and `cssVars` are optional. They describe what the CLI must merge into the user's Tailwind config / CSS (Tailwind v3 config keyframes and Tailwind v4 `@theme` CSS: the CLI must detect which one the project uses).

### 4.3 Index: `/r/index.json`

```json
{
  "schemaVersion": 1,
  "generatedAt": "ISO-8601",
  "items": [
    { "slug": "...", "type": "...", "title": "...", "category": "...", "tags": [], "description": "...", "version": "1.0.0", "hash": "sha256:...", "performance": "light", "difficulty": "easy", "addedAt": "..." }
  ]
}
```

Only `status: "published"` and `"deprecated"` items appear. Drafts never leave the builder. Items are sorted deterministically (`addedAt` desc, then `slug`).

### 4.4 Output files of the builder

- `/r/index.json`
- `/r/<slug>.json` (latest)
- `/r/<slug>@<version>.json` (immutable copy; never overwritten with different content)
- `/search-index.json` (serialized MiniSearch index + the minimal doc store)
- `/build-manifest.json` (git sha, build time, counts, per-item hashes)

### 4.5 CLI config: `algorithco-ui.json` (in user's project root)

```json
{
  "$schema": "https://algorithco.dev/schema/config.json",
  "schemaVersion": 1,
  "registry": "https://algorithco.dev/r",
  "framework": "next | vite | remix | other",
  "typescript": true,
  "tailwind": { "version": 3, "config": "tailwind.config.ts", "css": "src/app/globals.css" },
  "aliases": { "components": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "installed": { "aurora-text": { "version": "1.0.0", "hash": "sha256:..." } }
}
```

Also publish the JSON Schemas (generated from Zod via `zod-to-json-schema`) to `/schema/*.json` in the builder output.

---

## 5. Builder (`packages/builder`)

Entry: `pnpm build:registry [--out dist/registry] [--check]`. `--check` runs all validation and prints what would change but writes nothing (used in CI for PRs).

Pipeline (each stage is a separate, unit-tested function; a failure prints the **file path and a human-readable reason** and exits non-zero):

1. **Discover** all `meta.json` under `/registry`.
2. **Validate** each with `MetaSchema`. Collect *all* errors, then fail (do not stop at the first).
3. **Cross-validate**: duplicate slugs, missing `registryDependencies`, dependency cycles (report the cycle path), slug/folder name mismatch, missing source file `<slug>.tsx`, missing `demo.tsx` for `type: "component"`.
4. **Type-check** all sources (`tsc --noEmit` against a fixture tsconfig with React + Tailwind types available).
5. **Analyze imports** of each source with the TS compiler API:
   - Every external import must be declared in `meta.dependencies` (or be `react` / `react-dom`, which are peer assumptions). Undeclared -> error. Declared but unused -> warning.
   - Imports of other registry items must go through the alias form `@/lib/<name>`, `@/components/ui/<name>`, `@/hooks/<name>` and the target slug must be listed in `registryDependencies`. Otherwise error.
   - Relative imports escaping the component folder -> error.
6. **Normalize**: produce `files[]` with CLI-relative target paths (`components/ui/<slug>.tsx`, `lib/<slug>.ts`, `hooks/<slug>.ts`). Normalize line endings to `\n`, strip BOM, ensure trailing newline. Do **not** reformat code otherwise.
7. **Hash**: `sha256` of a **canonical JSON** serialization of `{ type, dependencies (keys sorted), registryDependencies (sorted), files (sorted by path: path+content+type+variant), tailwind, cssVars }`. Exclude `version`, `hash`, `title`, and timestamps. Key order must not affect the hash. Same input must always produce the same hash on every machine.
8. **Version** using `registry.lock.json`:
   - New slug -> `1.0.0`.
   - Hash unchanged -> keep version.
   - Hash changed -> bump **patch** automatically; a per-release minor/major bump is
     requested via the builder CLI argument `--bump <slug>=minor|major` (Task 4b) — it is
     NOT a `meta.json` field (amended by Task 4a decision D1) and is recorded only in the
     lock. Never decrease or reuse a version.
   - If `<slug>@<version>.json` already exists with a different hash -> hard error (immutability violation).
   - `--write-lock` updates and writes the lock file; in CI `--check` fails if the lock is out of date.
9. **Emit** files atomically: write to a temp dir, then rename into place. Output must be **byte-for-byte identical** between two runs on identical input (stable key order, no timestamps in item files; `generatedAt` appears only in `index.json` and `build-manifest.json`, and an env `SOURCE_DATE_EPOCH` override must make even those deterministic for tests).
10. **Search index**: MiniSearch over `title` (boost 3), `tags` (boost 2), `category`, `description`; prefix + fuzzy (0.2) enabled; serialized to `search-index.json`.
11. **Report**: counts (total / new / changed / unchanged / deprecated), warnings, total bytes, duration.

Quality gates to add later (Task 11), design the pipeline so they plug in as stages: SSR smoke test (render the component in a Node/`react-dom/server` context and fail on `window`/`document` access at import or first render), bundle-size budget per `performance` class (light < 15 KB, medium < 40 KB, heavy unbounded but flagged), and a `prefers-reduced-motion` check (static detection of `useReducedMotion`, `matchMedia('(prefers-reduced-motion`, or CSS `@media (prefers-reduced-motion`; warning first, error later).

---

## 6. Component generator

`pnpm new-component <slug> --category=<cat> [--title="..."] [--type=component|lib|hook]`

- Validates the slug and category with the same schemas.
- Creates the folder with `<slug>.tsx` (a minimal, valid, SSR-safe, reduced-motion-aware template using `motion`), `demo.tsx`, `meta.json` (with today's date, `status: "draft"`).
- Refuses to overwrite an existing folder.
- The generated component must pass `pnpm build:registry --check` immediately.

---

## 7. Database (`packages/db`, Drizzle + PostgreSQL)

Keep it minimal. Raw events are **never** stored, only daily aggregates.

| Table | Columns |
|---|---|
| `components` | `slug` PK, `type`, `title`, `category`, `status`, `meta` jsonb, `version`, `hash`, `published_at`, `updated_at` |
| `categories` | `slug` PK, `name`, `sort` |
| `install_daily` | `component_slug`, `date`, `source` (`cli`\|`copy`), `count`; PK(slug, date, source) |
| `view_daily` | `component_slug`, `date`, `count`; PK(slug, date) |
| `likes` | `component_slug`, `visitor_hash`, `created_at`; unique(slug, visitor_hash) |
| `newsletter_subscribers` | `id`, `email` unique (stored lowercase), `confirmed` bool, `confirm_token_hash`, `created_at`, `unsubscribed_at` |
| `admin_audit_log` | `id`, `action`, `meta` jsonb, `created_at` |
| `announcements` | `id`, `title`, `body`, `active`, `starts_at`, `ends_at` |

- Foreign keys `ON DELETE CASCADE` where they reference `components`.
- Index `install_daily(date)` and `view_daily(date)` for period queries.
- Upserts: `INSERT ... ON CONFLICT (...) DO UPDATE SET count = <table>.count + EXCLUDED.count`.
- **Sync command** `pnpm db:sync`: reads `build-manifest.json` / `index.json` and upserts `components` and `categories`; components that disappeared from the registry become `status = 'deprecated'`, never deleted (stats must survive).
- Migrations are generated by drizzle-kit, committed, and applied with `pnpm db:migrate`. No manual SQL against production.
- Privacy: **no raw IPs, no emails in logs, no user agents stored.**

`visitor_hash` rules:
- For **likes**: `HMAC-SHA256(LIKE_PEPPER, ip + "|" + userAgent)`. Stable pepper (env secret) so a visitor's toggle works across days.
- For **view/install de-duplication** (if you add any): use a **daily-rotating** salt, never persisted.

---

## 8. API (`apps/api`, Hono)

Structure: `src/app.ts` (builds the app, exportable for tests), `src/server.ts` (starts it), `src/routes/*`, `src/middleware/*`, `src/lib/*`. All handlers validate input with Zod (`@hono/zod-validator`) and return a consistent error shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

| Endpoint | Behavior |
|---|---|
| `GET /api/health` | `{ status, version, uptime, db: "ok"\|"down" }`. Does a cheap `SELECT 1`. 503 if DB down. |
| `GET /api/search?q=&category=&limit=` | Postgres full-text fallback (`tsvector` over title/description/tags via generated column or query-time `to_tsvector`). Primary search is client-side with the static index. `q` 1-100 chars, `limit` 1-50 (default 20). |
| `GET /api/stats/popular?period=day\|week\|month\|all&limit=` | Aggregates installs (+ views as tiebreaker) per slug. Response cached in memory 60 s. |
| `POST /api/events` | Body: `{ events: [{ type: "install"\|"view", slug, source?: "cli"\|"copy" }] }`, max 50 events per request, body size limit 8 KB. Slug must exist (checked against an in-memory slug set refreshed every 5 min; unknown slugs are silently dropped, not errors). Events are accumulated in an in-memory `Map` and **flushed to Postgres every 10 s** and on `SIGTERM`/`SIGINT` (graceful shutdown must flush). Hard cap on buffer size (e.g. 10k keys); if exceeded, flush early. Always respond `202` quickly. |
| `POST /api/components/:slug/like` | Anonymous toggle. Returns `{ liked, count }`. 404 for unknown slug. |
| `GET /api/components/:slug/likes` | `{ count }` (cached 30 s). |
| `POST /api/newsletter` | Body `{ email }`. Normalize, validate, store with double opt-in token (hash the token). Always respond with the same message whether or not the email already exists (no enumeration). Sending real email is out of scope: define an `EmailSender` interface with a console/no-op implementation. |
| `GET /api/newsletter/confirm?token=` | Confirms subscription. |
| `GET /api/changelog.rss` | RSS 2.0 of newly added/updated components (last 50), valid XML, proper escaping. |
| `/api/admin/*` | Bearer token auth (see below): `GET /admin/stats` (totals, top components, last 30 days), `POST /admin/announcements`, `PATCH /admin/announcements/:id`, `POST /admin/reindex` (re-runs db sync from the current release), `GET /admin/audit`. Every mutating call writes an audit-log row. |

Cross-cutting requirements:
- **Rate limiting**: in-memory sliding-window per client IP, per route group (events: 60/min, like: 30/min, newsletter: 5/min, default: 120/min). Return `429` with `Retry-After`. Client IP must come from `X-Forwarded-For` **only when the request comes from the trusted proxy** (configurable `TRUSTED_PROXY_COUNT`); otherwise use the socket address. Periodically evict stale entries (no memory leak).
- **CORS**: `/api/events` allows any origin (CLI and sites); everything else only `WEB_ORIGIN`. Never `*` with credentials.
- **Security headers** (`hono/secure-headers`), body size limits, request timeout, request-id on every log line.
- **Admin auth**: `ADMIN_TOKEN` env (min 32 chars) compared in **constant time** (`crypto.timingSafeEqual`, handle length mismatch safely). Failed attempts are rate-limited harder (10/15 min per IP).
- **Config**: one `env.ts` that parses `process.env` with Zod at startup and exits with a clear message if invalid. No `process.env` access elsewhere.
- **Logging**: pino JSON, redact `authorization`, emails, and IPs.
- **Graceful shutdown**: stop accepting, flush event buffer, close DB pool, then exit.
- Never return stack traces to clients.

---

## 9. CLI (`apps/cli`, package `algorithco-ui`)

Binary: `algorithco-ui`. Built to a single ESM bundle with `tsup`, `engines.node >= 20`, shebang, `bin` field set, small install size.

### Commands

**`init`** (interactive with @clack/prompts; flags `--yes`, `--cwd`):
- Detect: package manager (lockfile: pnpm/yarn/npm/bun), framework (Next app/pages router, Vite, Remix, other), TypeScript (tsconfig.json), Tailwind version (v3 via config file / v4 via `@import "tailwindcss"` in CSS), `src/` directory, existing import alias from tsconfig `paths`.
- Write `algorithco-ui.json`. Ensure the `cn` util dependency chain is satisfiable (install `clsx` + `tailwind-merge` if `cn` is requested).
- Idempotent: running twice must not corrupt anything.

**`add <slug...>`** (flags `--overwrite`, `--dry-run`, `--yes`, `--no-install`):
1. Load config (error with guidance if `init` not run).
2. Fetch `index.json` (or the individual item) from the registry; resolve `registryDependencies` **recursively**, de-duplicated, topologically ordered, cycle-safe.
3. For each item: fetch `<slug>.json`, validate with the shared Zod schema, **verify `hash`** by recomputing it with the same canonicalization function (import it from `packages/shared`/`builder`-shared code, never reimplement). Mismatch -> abort, write nothing.
4. Compute target paths using config aliases; **assert every resolved path stays inside the project root** (guard against path traversal and symlink escapes).
5. If a target file exists and differs: prompt (overwrite / skip / show diff) unless `--overwrite`. If identical: skip silently.
6. Rewrite import aliases in file contents to match the user's configured aliases.
7. Write files (atomically: temp file + rename). On failure mid-way, roll back files written during this run.
8. Merge `tailwind` keyframes/animation (v3: patch config safely using AST, never regex; v4: append to `@theme` block) and `cssVars`. If it cannot patch safely, **print exact manual instructions** instead of corrupting the file.
9. Install missing npm dependencies with the detected package manager (skip with `--no-install`; in `--dry-run` only print).
10. Update `installed` in the config.
11. Send telemetry (fire-and-forget, 1.5 s timeout, errors swallowed).

**`list [--category] [--json]`**, **`search <query> [--json]`** (uses `search-index.json` locally with MiniSearch, cached on disk for 1 h in the OS cache dir with ETag/If-None-Match support), **`diff <slug>`** (unified diff between local file and registry), **`update [slug...]`** (shows diff first, requires confirmation, respects `--yes`).

### Rules
- `--dry-run` never touches disk or network writes (telemetry included).
- Registry URL from, in order: `--registry` flag, `ALGORITHCO_UI_REGISTRY_URL` env, config file, default `https://algorithco.dev/r`. Must be `https://` (allow `http://localhost` and `127.0.0.1` for development).
- Network: timeouts (10 s), 2 retries with backoff on 5xx/network errors, clear messages (offline, 404 "component not found, did you mean X?" using fuzzy match, 429).
- **Telemetry**: anonymous, only `{ type: "install", slug, source: "cli" }` plus CLI version and OS in a header. First run prints a one-time notice. Disabled by `ALGORITHCO_UI_TELEMETRY=0` or `DO_NOT_TRACK=1` or `--no-telemetry`. Never send paths, project names, or package contents.
- Exit codes: `0` success, `1` generic failure, `2` invalid usage/config, `3` network error, `4` integrity (hash) failure.
- Output: concise, colored, no stack traces unless `--debug`. Non-TTY environments must work (no interactive prompts when `--yes` or CI detected; fail with a clear message if input is required).
- Never run arbitrary code from the registry. Registry content is **data**: only write files and merge config.
- Testing: unit tests for detection, path safety, alias rewriting, dependency resolution (including cycles), hash verification; an **e2e test** that spins up a local static server serving a builder output fixture and runs `init` + `add` in a temp Next.js-like fixture project.

---

## 10. Deployment (VPS, Docker Compose, Caddy)

### Services
`caddy`, `api`, `postgres` (and `web` later). Postgres is not exposed publicly. All containers: non-root user where possible, `restart: unless-stopped`, healthchecks, resource limits, pinned image versions, named volumes for Postgres and Caddy data.

### Directory layout on the VPS
```
/var/www/releases/<git-sha>/registry/   (builder output)
/var/www/registry -> /var/www/releases/<current-sha>/registry   (symlink)
/var/backups/algorithco-ui/                                   (pg_dump files)
```
Caddy mounts `/var/www` read-only.

### Caddyfile requirements
- Automatic HTTPS for `algorithco.dev`.
- `encode zstd gzip`.
- `/r/*`, `/search-index.json`, `/schema/*`, `/build-manifest.json` -> `file_server` from `/var/www/registry`.
  - `index.json` and `<slug>.json`: `Cache-Control: public, max-age=300, stale-while-revalidate=86400`.
  - `<slug>@<version>.json`: `Cache-Control: public, max-age=31536000, immutable`.
  - `Access-Control-Allow-Origin: *` for registry reads (it is public data; the CLI and websites need it).
  - Correct `Content-Type: application/json; charset=utf-8`, ETag enabled.
- `/api/*` -> `reverse_proxy api:3001` with sane timeouts, forwarding the real client IP.
- Everything else -> `reverse_proxy web:3000` (return a simple 404 until `web` exists).
- Security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`), access log in JSON.

### `deploy.sh` (idempotent, `set -euo pipefail`)
1. Fetch the target commit.
2. Install, run `pnpm build:registry --out /var/www/releases/<sha>/registry` (build in a temp dir, then move).
3. Build and (re)start `api` with `docker compose up -d --build api`.
4. Run `pnpm db:migrate` then `pnpm db:sync`.
5. **Atomically** switch the symlink: `ln -sfn` to a temp link then `mv -T`.
6. Health check: `GET /api/health` and `GET /r/index.json` (retry up to 30 s). On failure, run `rollback.sh` automatically and exit non-zero.
7. Keep the last 5 releases, delete older ones.

`rollback.sh` re-points the symlink to the previous release and restarts `api` with the previous image tag.

`backup.sh`: nightly `pg_dump` (compressed), 7-day retention, with a documented restore procedure and optional `rclone`/`scp` offsite copy hook.

### GitHub Actions
- `ci.yml` (PRs and main): install (frozen lockfile, cache), lint, typecheck, test, `pnpm build:registry --check`, build all packages.
- `deploy.yml` (main only, manual approval optional): SSH to VPS using a deploy key stored in secrets, run `deploy.sh`.
- Document required secrets in README.

### Hardening checklist (document in `deploy/README.md`)
UFW (22/80/443 only), SSH key-only login, fail2ban, unattended security upgrades, Docker log rotation, Postgres bound to the internal network only.

---

## 11. Quality bar (non-negotiable)

- **Tests**: Vitest. Meaningful unit tests for every schema (valid and invalid cases), canonical hashing (key order independence, determinism), version bumping, cycle detection, path-safety, rate limiter, event buffer flush (including shutdown flush), upsert aggregation, CLI detection and resolution. API route tests use `app.request()` against the real app with a test DB.
- **Determinism**: builder idempotency test (build twice -> identical output tree hash).
- **Types**: no `any`, no non-null assertions without a comment, no unchecked `as` casts across trust boundaries (parse with Zod instead).
- **Errors**: typed error classes, user-facing messages that say what happened and how to fix it.
- **Security**: all external input validated; path traversal impossible; constant-time secret comparison; no secrets in logs; dependency allowlist enforced; SQL only through Drizzle (parameterized).
- **Performance**: registry reads never touch Node/DB; API p95 < 50 ms for non-DB routes locally; event ingestion is O(1) per event and never blocks on DB.
- **Docs**: root `README.md` (setup, scripts, architecture diagram in ASCII/mermaid), per-package README, `deploy/README.md`, `CONTRIBUTING.md` (how to add a component: generator, rules, PR checklist).
- **Conventions**: Conventional Commits; small focused commits; every package exposes `build`, `typecheck`, `lint`, `test` scripts.

---

## 12. Rules to write into `AGENTS.md` (verbatim)

1. One task = one commit/PR. Do not start the next task before the current one's acceptance criteria pass.
2. Every task has acceptance criteria. A task is not done until all are verified and reported.
3. TypeScript strict, ESM, Node 22+, pnpm only.
4. All inputs and file formats are validated with Zod; schemas live only in `packages/shared`.
5. Do not add dependencies outside the approved list without written justification.
6. Every package has at least smoke tests (Vitest); core logic has real unit tests.
7. Secrets live only in `.env`; never in code, logs, or commits. Keep `.env.example` current.
8. Never edit files in `/registry/components/**` by hand except via the generator or when a task explicitly says so.
9. When uncertain, do not guess silently: leave `TODO(question):` and list it in the task report.
10. No `any`, no `@ts-ignore`, no `console.log`, no dead code.
11. Registry content is data. Never execute it.
12. Anything on the "out of scope" list (Section 13) must not be built.

---

## 13. Out of scope (do NOT build)

User accounts/OAuth, user uploads, moderation, payments, comments, Redis/BullMQ, Elasticsearch/Meilisearch/Typesense, Cloudflare R2/S3, Kubernetes, microservices, the frontend website (`apps/web`), Playwright previews (planned for Task 13), JS and plain-CSS variants (planned later; just keep `files[].variant` optional in the schema now), email delivery (interface + no-op only).

---

## 14. Task list (execute in order)

### Phase 1: Core

**Task 1. Monorepo skeleton**
pnpm workspace, Turborepo pipeline (`build`, `typecheck`, `lint`, `test`), shared tsconfig/ESLint/Prettier configs, Vitest setup, empty package stubs per Section 3, `AGENTS.md` (Section 12), `.env.example`, `.gitignore`, `.editorconfig`, `.nvmrc`, GitHub Actions `ci.yml`.
*Acceptance:* fresh clone -> `pnpm i && pnpm build && pnpm lint && pnpm typecheck && pnpm test` is green; CI workflow is valid.

**Task 2. `packages/shared`**
`MetaSchema`, `RegistryItemSchema`, `RegistryIndexSchema`, `CliConfigSchema`, API request/response schemas, categories list, dependency allowlist, canonical JSON + hashing utility (used by both builder and CLI), JSON Schema export script.
*Acceptance:* tests cover valid and invalid samples for every schema (including path-traversal paths, bad slugs, unknown deps, unknown keys); hashing is key-order-independent and stable; JSON Schemas are generated.

**Task 3. Component generator**
`pnpm new-component` per Section 6.
*Acceptance:* generating a component creates a valid folder; refuses overwrite; result passes builder validation (once Task 4 exists, add that assertion as a test).

**Task 4. `packages/builder`** (stages 1-11 of Section 5, except future gates)
Add 3 sample components (one with a `registryDependency` on `cn`, one with a Tailwind keyframe, one `lib`).
*Acceptance:* correct `r/*.json`, `index.json`, `search-index.json`, `build-manifest.json`; two consecutive builds produce a byte-identical tree; cycle/missing-dependency/undeclared-import/duplicate-slug cases produce clear errors with file paths; version bump logic verified through `registry.lock.json` tests; `--check` writes nothing.

**Task 5. CLI: `init` and `add`**
Per Section 9, including hash verification, path safety, alias rewriting, rollback on failure, Tailwind patching (v3 via AST, v4 via CSS), dependency install, `--dry-run`.
*Acceptance:* e2e test: local static server + temp fixture project; `init` then `add aurora-text` writes the correct files, resolves `cn` recursively, installs (mocked package manager call is asserted), updates config; tampered JSON -> exit code 4 and no files written; path traversal payload rejected; `--dry-run` changes nothing.

**Task 6. Docker, Caddy, deploy scripts**
Per Section 10.
*Acceptance:* `docker compose up` locally serves `http://localhost/r/index.json` with correct headers (verify `Cache-Control` for both mutable and `@version` files via a test script or curl-based check); atomic symlink switch works; `rollback.sh` restores the previous release; documented VPS setup steps are complete and ordered.

### Phase 2: Dynamic features

**Task 7. `packages/db`**: schema, migrations, client factory, `db:sync`, seed.
*Acceptance:* migrations apply to an empty DB; sync is idempotent; removed components become `deprecated` and keep their stats; upsert aggregation tested.

**Task 8. `apps/api`**: env parsing, health, events buffer, popular stats, like, newsletter (+confirm), RSS, rate limiting, CORS, security headers, graceful shutdown.
*Acceptance:* all routes have tests; events flush on interval and on shutdown (test with fake timers); unknown slugs dropped; 429 behavior and `Retry-After` verified; RSS validates as XML; no stack traces leak; spoofed `X-Forwarded-For` ignored when proxy not trusted.

**Task 9. CLI: telemetry + `list`, `search`, `diff`, `update`**
*Acceptance:* telemetry honors all opt-outs and never blocks or fails a command; `search` works offline from cached index; `update` shows diff and respects confirmation; tests for each command.

**Task 10. Admin endpoints**: constant-time token auth, stats, announcements CRUD, reindex, audit log.
*Acceptance:* unauthorized -> 401; brute-force limiting tested; every mutation writes an audit row.

### Phase 3: Quality

**Task 11. Builder quality gates**: SSR smoke test, bundle-size budgets by `performance` class, reduced-motion detection (warning mode with a flag to promote to error).
**Task 12. Props documentation**: `react-docgen-typescript` -> `props` field in registry items and a `docs` section (schema updated with `schemaVersion` handling).
**Task 13. Playwright previews**: render each demo, capture webp/short video into `/previews/<slug>.webp`; add `previews` to index; cache by hash so unchanged components are not re-rendered.
**Task 14. RSS polish, OG images, monitoring hooks (Sentry optional via env), k6 load test script for `/r/*` and `/api/events`, final README/CONTRIBUTING pass.**

Each of Tasks 11-14 must have its own acceptance criteria written by you at the start of the task, reviewed against this document's principles, and then verified.

---

## 15. Definition of done (whole project)

- A new component goes from `pnpm new-component` -> PR -> CI (`--check`) -> merge -> automatic deploy -> available via `npx algorithco-ui add <slug>` with no manual steps.
- `https://algorithco.dev/r/index.json` is served statically and fast, even if the API and database are down.
- The CLI refuses tampered or malicious registry data.
- All checks green; docs complete; no open `TODO(question)` without being listed in the final report.

**Start now with Task 1. Do not ask for confirmation for routine decisions; ask only if a decision would change the architecture.**

---

## 16. Decisions recorded so far (appendix, keep updated)

1. Brand values: PROJECT_NAME = "Algorithco UI", CLI = `algorithco-ui`, domain = `algorithco.dev` (**placeholder, not confirmed**). The domain and default registry URL are defined in exactly one place: `packages/shared/src/site.ts` (plus env override). `PROJECT_NAME` must live there too.
2. `apps/cli` intentionally declares `engines.node >= 20` (end users may run Node 20), while the repo itself requires Node >= 22 for development. This is NOT a bug.
3. Every package currently uses `tsc --noEmit` as `build`. The CLI must get a real bundled build (tsup -> `dist/cli.js`) in Task 5; until then `bin` is a known gap.
4. Root scripts `build:registry`, `db:sync`, `db:migrate`, `new-component` intentionally point to scripts that will be created in Tasks 3, 4, and 7.
5. The repo is private until launch; no LICENSE file yet (license choice is an open question).
6. Windows development: use WSL2 or Git Bash for shell scripts; keep `.gitattributes` forcing LF.
7. Task 4a binding decisions (D1-D9; where they conflict with Sections above, they win):
   D1. No `bump` field in MetaSchema/meta.json; bump level is a builder CLI argument in 4b.
   D2. Optional per-component `styles.json` (`ComponentStylesSchema` in shared, reusing RegistryItem sub-schemas).
   D3. Shared exports `normalizeContent` (LF/BOM/trailing-newline); goldens stay untouched.
   D4. Item layout/file table as implemented (component: tsx+demo+meta required, css+styles.json optional;
   lib/hook: ts+meta only); no symlinks; 200 KB max; UTF-8 + no NUL; `files[].type` always equals the item type.
   D5. Drafts fully validated but excluded from output; no deps on draft/missing items; cycles reported with full path.
   D6. Import analysis via the TS compiler API (parse only); peers react/react-dom; rules as in docs/BUILDER.md.
   D7. AST security scan (eval/cookie/network codes), errors, no escape hatch.
   D8. Builder never rewrites imports; content passes through normalizeContent only.
   D9. In-memory model per non-draft item with shared computeItemHash; `loadRegistry({registryRoot})`
   returns `{ items, diagnostics, summary }` (summary is an additive rollup).
8. Task 4b binding decisions (B1-B9; same precedence as D1-D9):
   B1. Security scan also flags bare `Function()` calls, `window.`/`globalThis.`/`self.`
   `fetch` (+ `const f = fetch` aliases), `window.`/`globalThis.eval`, string-arg timers
   (eval), `new Worker` (network); `dangerouslySetInnerHTML` and browser storage warn
   (INNER_HTML/STORAGE). The scan is a mistake-guard, not a boundary; PR human review
   is the control.
   B2. `packages/registry-env` pins react/react-dom/@types + every allowlisted package
   (incl. `@types/three`) at EXACT versions; the allowlist test fails CI on drift.
   B3. Type-check via the compiler API in a temp project inside registry-env (strict,
   exactOptionalPropertyTypes false, react-jsx/Bundler); demo `./<slug>` imports are
   rewritten to the materialized path for checking only; `--skip-typecheck` is local-only,
   loud, and refused for emit; env-range mismatches error (TYPECHECK_ENV_RANGE_MISMATCH).
   B4. `files[].type` always equals the item type (a css file belongs to a component item).
   B5. `loadRegistry` result carries an additive `summary` (counts + draft slugs).
   B6. Index items carry optional `deprecated: true`; `/search-index.json` validated by
   shared `SearchIndexSchema`.
   B7. Emit/versioning per the Part 2 decision table; `--bump`/`--prune` CLI args;
   atomic output swap + post-write self-verification; immutable archive with
   violation errors; `--out`/`--archive-dir` must live outside the registry root.
   B8. `minisearch` (builder dep, already approved) powers the search index.
   B9. Sample components: lib `cn`, `aurora-text` (motion + cn), `shimmer-button`
   (CSS keyframes via styles.json + cn); `motion@^14.0.0` researched 2026-10-05.
9. Task 5a binding decisions (C1-C15; same precedence as D1-D9/B1-B9):
   C1. tsup bundle: ESM, platform node, target node20, bundle everything into
   `dist/cli.js` with shebang, no sourcemap; all deps in devDependencies;
   `files: ["dist"]`, `bin`, `engines.node >= 20`, version injected at build
   time via `__ALGORITHCO_UI_VERSION__`; `build` is tsup, `typecheck` stays
   `tsc --noEmit`; `dist/` gitignored; bundle ~1.05 MB (budget < 1.5 MB).
   Separate `cli-compat (node 20)` CI job builds/packs/smoke-tests on Node 20;
   no Node 22-only APIs.
   C2. Deps (each justified in the 5a report): `commander` (arg parsing),
   `@clack/prompts` (interactive prompts), `picocolors` (NO_COLOR-aware
   color), `jsonc-parser` (JSONC tsconfig). Global `fetch`; hand-written
   Levenshtein (distance <= 2), no fuzzy dep.
   C3. All printing via `ui/output.ts` (`stdout`/`stderr.write`); NO_COLOR +
   non-TTY disable ANSI; `--debug` for stacks, else concise + `Hint:`;
   interactive = `stdin.isTTY && stdout.isTTY && !CI && !--yes`.
   C4. Exit codes 0/1/2/3/4 per Section 9 + go-ahead (2 = usage/config/
   detection, 3 = network, 4 = integrity/security); typed `CliError`
   hierarchy maps to codes.
   C5. Detection is pure over an injected snapshot (packageManager field then
   lockfiles; next app/pages via deps+files; TS = tsconfig present; src dir;
   Tailwind major from installed package else range, v4 via CSS import, v3 via
   config file; CSS from common locations + content scan). No package.json or
   no TS → exit 2; missing Tailwind warns.
   C6. Aliases via jsonc-parser: relative `extends` (depth ≤ 5), `baseUrl` +
   wildcard `paths`, `references` fallback (Vite); `@/*` (or any single-
   segment base like `~/*`) → defaults; absolute dirs asserted inside root; no
   alias → exit 2 with tsconfig (+ Vite) snippets; init never touches tsconfig.
   C7. `algorithco-ui.json` via `CliConfigSchema`; 2-space/LF/trailing-newline
   atomic write; `--yes/--cwd/--registry`; idempotent (keeps `installed`,
   interactive confirms changes, `--yes` keeps values); installs nothing.
   C8. Registry URL flag > env > config > default; https-only except
   localhost/127.0.0.1/[::1] (initial = exit 2, redirect = exit 4);
   `AbortSignal.timeout(10s)`, 2 retries w/ backoff on net/5xx/429
   (Retry-After ≤ 10s), `User-Agent: algorithco-ui/<version>`; JSON-ish
   content-type; 2 MB cap (header + stream); `slug@x.y.z` pinned URLs, deps
   latest; slugs validated first; 404 → exit 1 with index + Levenshtein
   suggestion; net failures → exit 3 (offline/DNS/timeout/429 distinct).
   C9. Verification before disk: schemaVersion future → update error;
   `RegistryItemSchema`, slug/version match, `verifyItemHash` (exit 4, nothing
   written), allowlist (exit 4; documented as the real anti-compromise
   defense), ≤ 50 files/item.
   C10. Recursive de-duped cycle-safe resolution (cycle path, exit 4),
   topological (deps first), explicit slugs in argument order, ≤ 100 items,
   one fetch per slug.
   C11. Plan-then-apply: complete plan first; prefix mapping
   (`components/ui`→components dir, `lib`→lib, `hooks`→hooks, else exit 4);
   duplicate targets → exit 4; create/unchanged (LF-normalized)/conflict
   (incl. case-collision); hash-matched + unchanged → already installed;
   `--dry-run` prints plan + manual steps, writes nothing, exit 0.
   C12. `--overwrite` replaces all; interactive per-file
   (overwrite/skip/abort, skips warn incomplete); non-interactive conflicts
   fail pre-write exit 1 with the flag; `--yes` ≠ overwrite.
   C13. Rewriting only when configured alias differs, statement-anchored
   (`import/export from`, side-effect, `import type`, dynamic `import()`,
   multi-line), never global; leftovers warn with lines; LF output; tricky
   cases tested.
   C14. Temp-file + rename, dirs as needed, journal + reverse rollback (config
   last, rolled back too); realpath containment + symlink refusal pre-write.
   C15. `init` + `add <slug...>` (+ `--overwrite/--dry-run/--yes/--cwd/
   --registry/--debug`, global `--version/--help` with examples); `add`
   before `init` → exit 2; one fetch per item.
10. Task 5b binding decisions (E1-E12; same precedence as C1-C15; E1
   explicitly REPLACES MASTER_PROMPT Section 9 step 8 — no AST patching of
   tailwind config, ever):
   E1. Styles without AST: blocks in the CSS entry between
   `/* algorithco-ui:begin <slug> */` markers; v3 = top-level @keyframes +
   `@layer utilities` animation classes + `@layer base` vars; v4 = `@theme`
   with `--animate-*` + nested keyframes (per v4 docs) + plain var blocks;
   verbatim property names (sample is kebab-case); deterministic (sorted,
   2-space, LF). Safety (exit 4): kebab names, from/to/0-100% selectors,
   constrained properties, value denylist + 200-char/50-declaration caps.
   E2. Append with one blank line; file EOL reused, rest byte-identical;
   identical → unchanged, different → conflict (C12, overwrite replaces only
   between markers); malformed markers → exit 1 + manual snippet; collisions
   (outside markers or different definitions, comments stripped) → skip +
   warn + snippet; `patch-css` in dry-run with the exact block.
   E3. No Tailwind / missing CSS / `--no-styles` → no patch, labeled manual
   snippet (v3+v4 forms as appropriate), exit 0; v3 `content` globs
   documented, never parsed.
   E4. `cross-spawn` (+ types) for Windows .cmd shims without shell:true
   (argv-only, never -D, `name@range`); allowlist + bounded-range checked
   immediately before running (exit 4); declared+satisfied (installed or
   subset) → skip, declared-unsatisfied → warn + manual, undeclared →
   install (first range wins, non-intersection warns); `--no-install`
   prints; interactive asks (default yes); `--yes` runs; non-interactive
   without `--yes` prints manual + warns (exit 0); `--dry-run` prints;
   cwd = project root, stdio inherit only interactive/debug else tail on
   failure, 10-minute timeout.
   E5. Journal order files → CSS → install → config (last); CSS/package.json/
   lockfile snapshots; installer failure restores snapshots, rolls back
   files+CSS, leaves config untouched, exit 1 with tail; rollback failures
   reported loudly; installer injected (fake in tests).
   E6. Codes per C4; installer failure = 1; invalid styles = 4.
   E7. Success summary: files created/unchanged, CSS blocks written,
   packages installed, warnings/manuals.
   E8. cross-spawn stays an external runtime dependency (single exception to
   bundling): its dynamic require("child_process") crashes the ESM bundle at
   startup (verified); everything else bundled; budget < 1.3 MB.
   E9. The 5a "Manual steps (automated in a later release)" output is removed;
   manual commands/snippets print only for skipped or impossible steps.
   E10. Default suite stays hermetic (node:http registry + fake installer, no
   external network); real network projects only in the e2e-real workflow.
   E11. e2e-real runs weekly + manually, never as a required check (keeps main
   CI fast and hermetic); failures there are reported honestly with run URLs.
   E12. Shared owns npm range algebra for install decisions
   (`isSemverSubset`, `doSemverRangesIntersect` on top of semver); schemas
   still live only in `packages/shared`.

# PROJECT STATE — generated from live repo facts

> Generated from repo state at acda20d0c1f668dd619b52b9927a68732bae55ad on 2026-10-06; regenerate before each release.

This report contains only statements verifiable from the repo at the commit above
plus the working-tree state recorded in Section 1. Anything not checked this
session is marked UNKNOWN / NOT VERIFIED. Source of truth for process and task
order: `docs/MASTER_PROMPT.md`.

## 1. Snapshot

- HEAD: `acda20d0c1f668dd619b52b9927a68732bae55ad` (`docs: redesign readme`, 2026-10-05).
- Commit count: 44 (`git rev-list --count HEAD`).
- Branch at generation time: `fix/project-state-refresh` (created from HEAD `acda20d`).
- Tracked files: 198 (`git ls-files` count).
- Working tree at generation time (from `git status --short`): NOT CLEAN.
  Modified (staged): `.env.example`, `apps/web/README.md`, `docs/MASTER_PROMPT.md`,
  `pnpm-lock.yaml`. Untracked: `FrameBits_Brand_Design_System.md`,
  `apps/web/eslint.config.js`, `apps/web/index.html`, `apps/web/package.json`,
  `apps/web/public/`, `apps/web/src/`, `apps/web/tsconfig.json`,
  `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`,
  `assets/framebits logo.png`, `assets/framebits.png`.
- Remote, CI status, Node/pnpm versions: NOT VERIFIED this session (no commands run).

## 2. Task progress (MASTER_PROMPT Section 14, Tasks 1–14)

Commit evidence is from `git log --oneline` on this repo.

| Task | Name (Section 14) | Status | Commit evidence |
|---|---|---|---|
| 1 | Monorepo skeleton | DONE | `d06c7e8` (+ `a0ae742` follow-up) |
| 2 | `packages/shared` | DONE | `9bcd33a`, merged via PR #1 (`4526c48`) / PR #2 (`dd91324`) |
| 3 | Component generator (`pnpm new-component`) | DONE | `7ac5fcf` (+ `46f3484`), merged via PR #3 (`0da2cff`) |
| 4 | `packages/builder` + 3 sample components | DONE | 4a: `193455c` (PR #4 `9303c4d`); 4b: `24e18b7` (PR #5 `165f2dd`) |
| 5a | CLI core (`init`, `add` file pipeline) | DONE | `46dc402`, merged via PR #6 (`2031a0e`) |
| 5b | CLI install + styles (npm install, Tailwind blocks, real e2e) | DONE | `8524054`, merged via PR #7 (`60ce023`) / PR #9 (`64ddcbc`) / merge #8 (`9b011c2`) |
| 6 | Docker, Caddy, deploy scripts | NOT STARTED | `deploy/` contains only `README.md` (one-line placeholder); no `Dockerfile`, `docker-compose*`, or `Caddyfile` in `git ls-files` |
| 7 | `packages/db` (schema, migrations, client, sync, seed) | NOT STARTED | `packages/db/src/index.ts` is a one-line name stub; no migrations dir in `git ls-files` |
| 8 | `apps/api` (env, health, events, stats, like, newsletter, RSS, limits, CORS, shutdown) | NOT STARTED | `apps/api/src/index.ts` is a one-line name stub |
| 9 | CLI telemetry + `list`, `search`, `diff`, `update` | NOT STARTED | `apps/cli/src/commands/` contains only `add.ts` and `init.ts` (per `git ls-files`) |
| 10 | Admin endpoints | NOT STARTED | API is a stub (see Task 8 evidence) |
| 11 | Builder quality gates | NOT STARTED | No gate code verified; criteria to be written at task start per Section 14 |
| 12 | Props documentation | NOT STARTED | No props code verified; criteria to be written at task start per Section 14 |
| 13 | Playwright previews | NOT STARTED | No previews code or output verified; criteria to be written at task start per Section 14 |
| 14 | RSS polish, OG images, monitoring, k6, docs pass | NOT STARTED | No evidence of this work in `git ls-files`; criteria to be written at task start per Section 14 |

Note (MASTER_PROMPT Section 16, decision 11): `apps/web` (Task 15) exists on disk but
is entirely UNTRACKED — no `apps/web/src/**`, `apps/web/package.json`,
`apps/web/vite.config.ts`, or `apps/web/tsconfig.json` appears in `git ls-files`
(they appear only in `git ls-files --others --exclude-standard`). Tracked for web:
`apps/web/README.md` only.

## 3. Tracked file tree (`git ls-files`, 198 files)

```text
.editorconfig
.env.example
.gitattributes
.github/FUNDING.yml
.github/workflows/ci.yml
.github/workflows/e2e-real.yml
.gitignore
.gitmessage
.nvmrc
AGENTS.md
CONTRIBUTING.md
README.md
apps/api/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts,
  src/index.ts, src/index.test.ts}
apps/cli/{README.md, eslint.config.js, package.json, tsconfig.json, tsup.config.ts,
  vitest.config.ts, scripts/e2e-real.mjs, scripts/pack-smoke.mjs, src/cli.ts, src/index.ts,
  src/index.test.ts, src/errors.ts, src/errors.test.ts, src/levenshtein.ts,
  src/levenshtein.test.ts, src/integration.test.ts, src/process.test.ts, src/version.ts,
  src/aliases/{index.ts, aliases.test.ts}, src/apply/{index.ts, apply.test.ts},
  src/commands/{add.ts, init.ts}, src/config/{index.ts, config.test.ts},
  src/detect/{index.ts, detect.test.ts}, src/fs/node.ts,
  src/install/{command.ts, command.test.ts, compute.ts, compute.test.ts, run.ts, run.test.ts},
  src/plan/{index.ts, plan.test.ts}, src/registry-client/{index.ts, client.test.ts},
  src/resolve/{index.ts, resolve.test.ts, verify.ts, verify.test.ts},
  src/rewrite/{index.ts, rewrite.test.ts},
  src/styles/{generate.ts, generate.test.ts, patch.ts, patch.test.ts, validate.ts, validate.test.ts},
  src/ui/{output.ts, output.test.ts, prompts.ts}}
apps/web/README.md
assets/framebits-logo.png
deploy/README.md
docs/{BUILDER.md, CLI.md, CONTRACTS.md, MASTER_PROMPT.md, PROJECT_STATE.md}
eslint.config.js
package.json
packages/builder/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts,
  src/cli.ts, src/index.ts, src/index.test.ts,
  src/registry/{index.ts, types.ts, model.ts, discover.ts, validate.ts, imports.ts,
    security.ts, typecheck.ts, versions.ts, emit.ts, test-helpers.ts, cli.test.ts,
    discover.test.ts, emit.test.ts, env.test.ts, imports.test.ts, integration.test.ts,
    load.test.ts, security.test.ts, typecheck.test.ts, validate.test.ts, versions.test.ts},
  src/scaffold/{files.ts, generate.test.ts, index.ts, names.ts, names.test.ts, request.ts,
    request.test.ts, scan.ts, scan.test.ts, types.ts, wrapper.test.ts}}
packages/config/{README.md, package.json, eslint.base.js, prettier.base.d.ts,
  prettier.base.js, tsconfig.base.json}
packages/db/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts,
  src/index.ts, src/index.test.ts}
packages/registry-env/{.prettierignore, README.md, package.json}
packages/shared/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts,
  scripts/build-schemas.ts, src/index.ts, src/index.test.ts, src/site.ts,
  src/allowed-dependencies.ts, src/allowed-dependencies.test.ts, src/api.ts, src/api.test.ts,
  src/canonical.ts, src/canonical.test.ts, src/categories.ts, src/categories.test.ts,
  src/cli-config.ts, src/cli-config.test.ts, src/hash.ts, src/hash.test.ts,
  src/hashable-json.ts, src/hashable-json.test.ts, src/json-schemas.ts,
  src/json-schemas.test.ts, src/lock.ts, src/lock.test.ts, src/meta.ts, src/meta.test.ts,
  src/paths.ts, src/paths.test.ts, src/registry-index.ts, src/registry-index.test.ts,
  src/registry-item.ts, src/registry-item.test.ts, src/search-index.ts,
  src/search-index.test.ts, src/semver.ts, src/semver.test.ts, src/styles.ts, src/styles.test.ts}
pnpm-lock.yaml
pnpm-workspace.yaml
prettier.config.js
registry/{README.md, registry.lock.json,
  components/buttons/shimmer-button/{demo.tsx, meta.json, shimmer-button.tsx, styles.json},
  components/text-animations/aurora-text/{aurora-text.tsx, demo.tsx, meta.json},
  lib/cn/{cn.ts, meta.json}}
scripts/new-component.ts
tsconfig.json
turbo.json
vitest.workspace.ts
```

## 4. Tests

### 4.1 `*.test.ts` file counts (counted from `git ls-files` output this session)

| Package | Test files |
|---|---|
| `packages/shared` | 17 |
| `packages/builder` | 17 (12 `src/registry` incl. `src/index.test.ts`; 5 `src/scaffold`) |
| `apps/cli` | 21 |
| `apps/api` | 1 |
| `packages/db` | 1 |
| `apps/web` | 5, all UNTRACKED (not in `git ls-files`; excluded from tracked total) |

Tracked total: 57 `*.test.ts` files.

### 4.2 Test-case counts

Per task baseline (NOT VERIFIED this session — `pnpm test` was not run):
shared 357, CLI 202, builder 156, api 1, db 1, web 26.

## 5. Registry items and versions

`registry/registry.lock.json` (`version: 1`) lists exactly 3 slugs, each `1.0.0`:

| Slug | Version | Hash (`sha256:…`, truncated) | Type / category / status (from `meta.json`) |
|---|---|---|---|
| `cn` | 1.0.0 | `c0cacc16…` | lib / utilities / published; deps `clsx ^2.0.0`, `tailwind-merge ^3.0.0` |
| `aurora-text` | 1.0.0 | `f24fa65c…` | component / text-animations / published; dep `motion ^14.0.0`; `registryDependencies: ["cn"]` |
| `shimmer-button` | 1.0.0 | `3b3b15d9…` | component / buttons / published; no npm deps; `registryDependencies: ["cn"]`; has `styles.json` |

(`meta.json` details: `aurora-text` title "Aurora Text", added 2026-10-05;
`shimmer-button` title "Shimmer Button", added 2026-10-05; `cn` title "Cn",
added 2026-10-05. Full hashes are in `registry/registry.lock.json`.)

## 6. CI workflows (read this session)

- `.github/workflows/ci.yml`: triggers `push` to `main` + `pull_request`; job `ci`
  (matrix Node 22/24) runs install (frozen lockfile), lint, typecheck, test,
  `build:registry --check`, build; job `cli-compat` (Node 20) builds/packs/smoke-tests
  `framebits` and runs its tests. Last-run outcome: NOT VERIFIED this session.
- `.github/workflows/e2e-real.yml`: triggers `workflow_dispatch` + weekly Monday
  03:00; matrix scenario `next`/`vite`; runs `node apps/cli/scripts/e2e-real.mjs
  <scenario>`. Last-run outcome: NOT VERIFIED this session.

## 7. Known gaps

- Deploy: placeholder only — `deploy/README.md` is one line ("VPS deploy docs land
  in Task 6"); no `Dockerfile`, `docker-compose*`, `Caddyfile`, or deploy scripts
  tracked (verified via `git ls-files`).
- API/DB are stubs: `apps/api/src/index.ts` and `packages/db/src/index.ts` each
  export only their package-name const (verified by reading both files).
- No `LICENSE` file tracked (verified: no `LICENSE`/`LICENSE.md` in `git ls-files`;
  `Test-Path` for both returned False).
- `apps/web` implementation is present on disk but untracked (see Section 2 note);
  `assets/framebits logo.png` and `assets/framebits.png` are untracked while
  `assets/framebits-logo.png` is tracked (verified via `git ls-files --others`).
- `pnpm test` / `pnpm lint` / `pnpm typecheck` were NOT run this session, so green
  status of the full suite is NOT VERIFIED (except `pnpm build:registry --check`,
  see Section 9).

## 8. Open `TODO(question)` list (from grep this session)

Code TODOs (actionable):

1. `packages/shared/src/site.ts:1` — confirm production DOMAIN (`framebits.dev` is a placeholder).
2. `apps/web/src/lib/auth.ts:3` — promote `MockSessionSchema` to `packages/shared` with the real auth task.
3. `apps/web/src/lib/billing.ts:3` — promote `MockBillingSchema` to `packages/shared` when the real billing task lands.
4. `apps/web/src/lib/search.ts:4` — promote `WebSearchQuerySchema` to `packages/shared` with the API search task.
5. `apps/web/README.md:31` — web-local zod parsers carry `TODO(question): promote to packages/shared` (umbrella note for items 2–4).

Convention mentions (not actionable questions): `AGENTS.md:10` and
`docs/MASTER_PROMPT.md:17,415,486` define the `TODO(question)` rule itself.
No `TODO(question)` remains in root `README.md` or `scripts/new-component.ts`
(verified: grep found none there).

## 9. Verification this session

| Command | Result |
|---|---|
| `git log -1 --format=%H` | `acda20d0c1f668dd619b52b9927a68732bae55ad` |
| `git rev-list --count HEAD` | `44` |
| `git status --short` / `git ls-files --others --exclude-standard` | NOT CLEAN — see Section 1 |
| `git ls-files` count | 198 tracked files |
| `*.test.ts` counts per package | counted from file listing — see Section 4.1 |
| Read `.github/workflows/ci.yml`, `e2e-real.yml` | summarized in Section 6 |
| Read `registry/**/meta.json` + `registry.lock.json` | summarized in Section 5 |
| Grep `TODO(question)` | 5 code hits listed in Section 8 |
| `pnpm build:registry --check` | PASS (exit 0) — run after rewriting this file, before commit |

## 10. Doc links referenced here

All resolve to tracked files: `docs/MASTER_PROMPT.md`, `docs/BUILDER.md`,
`docs/CLI.md`, `docs/CONTRACTS.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`,
`apps/web/README.md`, `deploy/README.md`, `registry/registry.lock.json`,
`registry/lib/cn/meta.json`,
`registry/components/text-animations/aurora-text/meta.json`,
`registry/components/buttons/shimmer-button/meta.json`.

# PROJECT STATE — verified read-only report

> This report contains facts only. Every statement is backed by the repo contents
> or by commands run on 2026-10-04/05. Anything not verifiable is marked UNKNOWN /
> NOT BUILT / NOT VERIFIED.
>
> Update 2026-10-05: Tasks 1–4a DONE (merged through PR #4). Task 4b (in progress):
> branch `task-4b-builder-emit`, draft PR otassh/algorithco-ui#5 (unmerged —
> awaiting owner review).

## 1. Snapshot

- Date/time: 2026-10-05 (commands run this session; repo timestamps are +0500).
- Current branch: `main`, tracking `origin/main`
  (1b: remote `origin` → `https://github.com/otassh/algorithco-ui.git`, private repo,
  created via `gh repo create otassh/algorithco-ui --private --source=. --remote=origin --push`).
- HEAD commit: `3c0dd1c` `chore: opt out of turbo AGENTS.md guidance rewrites`
  (1b: 8 commits at Task-1b push time; see below. This report update will be #9.)
- Number of commits: 8 (`d06c7e8` skeleton, `a0ae742` domain const, `65419b5` this report,
  `b4f2166` master prompt + AGENTS rule, `5c46663` PROJECT_NAME, `c5e55a9` CI hardening,
  `43222eb` esbuild approval, `3c0dd1c` turbo opt-out).
- Working tree: CLEAN.
- Remote: CONFIGURED (`origin`, GitHub `otassh/algorithco-ui`, private). Everything pushed.
  First CI run `37256803283` on push: GREEN — both matrix jobs (`ci (22)` 32s, `ci (24)` 44s),
  all steps pass (install, lint, typecheck, test, build). Only annotations (warnings, non-failing):
  Node.js-20-based actions deprecation notice; `ubuntu-latest` → Ubuntu 26 migration notice.
- Local path: `C:\Users\user\Desktop\design`. (1b: repo moved paths before this session;
  grepped all tracked files for `C:\` / `C:/` — the only hit is this report's own path line.
  Lockfile has no absolute paths; `.turbo` cache is gitignored. Nothing depends on an old path.)
- OS/shell: Windows (`win32`), PowerShell. `pnpm.ps1` is blocked by the machine's
  PowerShell execution policy (`PSSecurityException: UnauthorizedAccess`); all pnpm
  commands in this report were run via `pnpm.cmd`.
- Node: `v24.19.0` (repo requires `>=22` via root `engines` + `.nvmrc` = `22`).
- pnpm: `10.29.3` (matches root `packageManager: pnpm@10.29.3`).
- Turbo: `2.11.7` actually executed (root `package.json` declares `turbo: ^2.5.4`; spec range
  is satisfied but pinned/deviation note: resolved version is 2.11.7, not 2.5.x).
- Vitest: `3.2.7` actually executed (packages declare `vitest: ^3.2.4`; range satisfied).

Branding values (searched via grep for `PROJECT_NAME|DOMAIN|REGISTRY_URL|PLACEHOLDER_DOMAIN|DEFAULT_REGISTRY|algorithco`):

- `PROJECT_NAME`: (1b: RESOLVED) `"Algorithco UI"` — defined ONCE in
  `packages/shared/src/site.ts`, re-exported via `packages/shared/src/index.ts`,
  asserted in `packages/shared/src/index.test.ts`. Grep confirms no other source file
  duplicates the string (hits only: `site.ts`, the test assertion, `README.md` title
  heading, `MASTER_PROMPT.md`).
- CLI name: `algorithco-ui` — defined in `apps/cli/package.json` (`"name": "algorithco-ui"`,
  `"bin": { "algorithco-ui": "./dist/cli.js" }`) and mirrored as `CLI_PACKAGE_NAME` in
  `apps/cli/src/index.ts`. Two declarations of the same string (package.json + const) — minor duplication.
- DOMAIN: placeholder `algorithco.dev` — defined ONCE in code: `packages/shared/src/site.ts`
  (`export const PLACEHOLDER_DOMAIN = "algorithco.dev"`). Confirmed single definition;
  `DEFAULT_REGISTRY_URL` is derived from it in the same file. Re-exported (not redeclared)
  via `packages/shared/src/index.ts`. No duplicates in code.
- Default registry URL: `https://algorithco.dev/r` — derived in `packages/shared/src/site.ts`
  (`export const DEFAULT_REGISTRY_URL = \`https://${PLACEHOLDER_DOMAIN}/r\``). The same literal
  value also appears in `.env.example` as `REGISTRY_URL=https://algorithco.dev/r` (env example,
  not code — acceptable, but it is a second copy of the string an operator must keep in sync).
- Root package name `algorithco-ui-monorepo` (`package.json`), workspace packages
  `@algorithco-ui/{shared,db,builder,config,api}` + `apps/web` (placeholder, NOT a package —
  no `package.json`, so not a pnpm workspace member).

## 2. Task progress table

> (1b update): the master prompt is now committed at `docs/MASTER_PROMPT.md` and is the
> source of truth. Task names and acceptance criteria below are quoted/paraphrased from
> its Section 14. Phase mapping is now known.

| Task # | Name (MASTER_PROMPT §14) | Status | Commit hash | Acceptance criteria met |
|---|---|---|---|---|
| 1 | Monorepo skeleton | DONE | `d06c7e8` (+ `a0ae742` follow-up) | Fresh-clone green checks PASS (verified §7, incl. uncached `--force` run 2026-10-05); CI workflow valid PASS (first CI run green 2026-10-05, run `37256803283`) |
| 1b | Housekeeping (this report's session; not a master-prompt task) | DONE | `b4f2166`, `5c46663`, `c5e55a9`, `43222eb`, `3c0dd1c` | AGENTS.md rule added PASS; PROJECT_NAME added PASS; CI hardened PASS; esbuild warning resolved PASS; turbo opt-out verified PASS (tree stayed clean after run) |
| 2 | `packages/shared` (schemas, hashing, JSON Schema export) | DONE | `9bcd33a` on `task-2-shared`, PR #1 | All Task 2 acceptance criteria PASS — see mapping: (1) unknown-key rejection: every schema `.strict()` + tests PASS; path traversal: RelativePathSchema matrix (24 fail/pass cases) PASS; (2) key-order independence: property tests PASS; goldens match on Node 22+24 CI PASS (run `37260444537`); simple vector triple-verified (impl + hand-built node hash + certutil) PASS; (3) committed `registry.lock.json` validates against `RegistryLockSchema` (`lock.test.ts`) PASS; (4) `turbo run lint typecheck test build --force` 24/24 green, 0 `any`, 0 ts-ignore (18 lint errors found and fixed in-branch) PASS; (5) `docs/CONTRACTS.md` written, code/doc in sync PASS; (6) PR #1 open, CI green both versions PASS. NOT merged (owner reviews). 290 tests in shared (293 repo-wide), 0 skipped. New runtime deps: `zod@4.6.5` (approved list), `semver@7.8.5` (justified in CONTRACTS.md); `zod-to-json-schema` NOT added (native `z.toJSONSchema` verified); `@types/semver` + `@types/node` dev-only. |
| 3 | Component generator (`pnpm new-component`) | DONE (merged via PR #3) | `7ac5fcf`+`46f3484` on `main` | Core in `packages/builder/src/scaffold/` PASS; wrapper exit 0/1/2 PASS; determinism + LF-only PASS; live root run PASS; CI 22/24 green PASS. |
| 4 | `packages/builder` (validate 4a + emit 4b) + 3 samples | DONE (merged via PR #5) | `165f2dd` | All Task 4 acceptance PASS (reported on PR #5). |
| 5a | CLI core (packaging, detection, config, `init`, `add` file pipeline) | DONE (merged via PR #6) | `2031a0e` | All Task 5a acceptance PASS (reported on PR #6). |
| 5b | CLI install + styles (npm install, Tailwind CSS blocks, real e2e) | DONE (merged via PRs #7, #9, #8) | `9b011c2` | All Task 5b acceptance PASS: 717 tests green, bundle 1.08 MB, CI 22/24 + Node 20 green, e2e-real green on Linux (run `37315359376`) and Windows locally. |
| 6a | Static serving (Caddy + Compose + registry verifier + smoke tests) | IN PROGRESS (branch `task-6a-static-serving`, draft PR pending) | — | Work started. |
| 6b | VPS deploy (deploy.sh, rollback, backup, SSH hardening, deploy workflow) | NOT STARTED | — | Explicitly out of scope for 6a. |
| 6 | Docker, Caddy, deploy scripts (split: 6a static serving + smoke, 6b VPS deploy) | 6a IN PROGRESS (this branch); 6b NOT STARTED | — | Deploy placeholders only (`deploy.sh`/`rollback.sh`/`backup.sh`, deploy workflow, postgres/api services all land in 6b/7/8 — intentional). |
| 7 | `packages/db` (schema, migrations, client, sync, seed) | NOT STARTED | — | All FAIL (`db:sync`/`db:migrate` absent — intentional per §16 decision 4) |
| 8 | `apps/api` (env, health, events, stats, like, newsletter, RSS, limits, CORS, shutdown) | NOT STARTED | — | All FAIL (1-line stub) |
| 9 | CLI: telemetry + `list`, `search`, `diff`, `update` | NOT STARTED | — | NOT VERIFIED |
| 10 | Admin endpoints | NOT STARTED | — | NOT VERIFIED |
| 11 | Builder quality gates | NOT STARTED | — | NOT VERIFIED (criteria to be written at task start) |
| 12 | Props documentation | NOT STARTED | — | NOT VERIFIED (criteria to be written at task start) |
| 13 | Playwright previews | NOT STARTED | — | NOT VERIFIED (criteria to be written at task start) |
| 14 | RSS polish, OG images, monitoring, k6, docs pass | NOT STARTED | — | NOT VERIFIED (criteria to be written at task start) |

(1b corrections to the original report, per MASTER_PROMPT §16 recorded decisions:
`apps/cli` `engines >= 20` is INTENTIONAL (end users may run Node 20) — not a bug;
root scripts `build:registry`/`db:sync`/`db:migrate`/`new-component` INTENTIONALLY point
at scripts landing in Tasks 3/4/7; `tsc --noEmit` builds + unbuildable `bin` are a KNOWN
GAP until Task 5's tsup build.)

## 3. Repository tree

`git ls-files` (tracked files only; `node_modules` and `.turbo` exist on disk but are
untracked; no `dist/` output exists on disk — glob `*/dist/**` is empty, consistent with
`tsc --noEmit` builds):

```text
.
├── .editorconfig
├── .env.example
├── .gitattributes
├── .github/workflows/ci.yml
├── .gitignore
├── .gitmessage
├── .nvmrc
├── AGENTS.md
├── CONTRIBUTING.md
├── README.md
├── apps/
│   ├── api/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts, src/{index.ts, index.test.ts}}
│   ├── cli/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts, src/{index.ts, index.test.ts}}
│   └── web/{README.md}                      ← placeholder only, no package.json
├── deploy/{README.md}                       ← one-line placeholder ("VPS deploy docs land in Task 6")
├── eslint.config.js
├── package.json
├── packages/
│   ├── builder/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts, src/{index.ts, index.test.ts}}
│   ├── config/{README.md, package.json, eslint.base.js, prettier.base.js, tsconfig.base.json}
│   ├── db/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts, src/{index.ts, index.test.ts}}
│   └── shared/{README.md, eslint.config.js, package.json, tsconfig.json, vitest.config.ts, src/{index.ts, index.test.ts, site.ts}}
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.js
├── registry/{README.md, registry.lock.json} ← NO components/ dir, NO lib/ dir yet
├── scripts/{new-component.ts}               ← stub that throws
├── tsconfig.json
├── turbo.json
└── vitest.workspace.ts
```

Top-level purpose (one line each):

- `apps/api` — Hono server (planned; currently a 1-line stub).
- `apps/cli` — the `algorithco-ui` npm CLI package (planned; currently a 1-line stub).
- `apps/web` — placeholder; explicitly out of scope (website later).
- `packages/shared` — Zod schemas + inferred types (planned; currently only site constants, NO Zod yet).
- `packages/db` — Drizzle schema/migrations/client/seed (planned; currently a stub).
- `packages/builder` — registry build pipeline (planned; currently a stub).
- `packages/config` — shared tsconfig/eslint/prettier base configs (COMPLETE — the only finished package).
- `registry/` — component sources + lock index (only placeholder lock file + README; no content).
- `scripts/` — generator script (stub).
- `deploy/` — VPS/docker/Caddy docs + scripts (placeholder README only).
- `.github/workflows/` — CI workflow (present, never run — no remote).

## 4. Per-package detail

Conventions observed in every package/app: ESM (`"type": "module"`), `main`/`types` → `./src/index.ts`,
scripts `{build: tsc --noEmit, lint: eslint ., typecheck: tsc --noEmit, test: vitest run}`,
devDeps `{@algorithco-ui/config: workspace:*, eslint ^9.14.0, typescript ^5.6.3, vitest ^3.2.4}`.
NO runtime `dependencies` in ANY package (all `dependencies` objects are absent).
NO `zod`, `hono`, `drizzle-orm` in the lockfile (only transitive `cac@6.7.14` via
`vite-node` — i.e. the vitest toolchain — and root-devDep `tsx@4.23.15`, whose own deps are
`esbuild` + `fsevents`).

### packages/shared (`@algorithco-ui/shared`) — partial (constants only)

- Purpose: canonical contracts (Zod schemas + types) + site constants. Only the constants exist.
- Status: partial. Source LOC: 10 (`index.ts` 3 + `site.ts` 7); tests: 1 file, 2 tests (13 lines).
- Public exports: `SHARED_PACKAGE_NAME`, `DEFAULT_REGISTRY_URL`, `PLACEHOLDER_DOMAIN`
  (re-exported from `./site.js`).
- Runtime deps: none. devDeps: config/eslint/typescript/vitest (see convention above).
- Scripts: build/lint/typecheck/test (standard).
- Implemented vs stub: `site.ts` (domain + registry URL constants) implemented;
  `index.ts` re-export implemented. NO Zod schemas, NO types, NO hashing, NO allowlists —
  all NOT BUILT.

### packages/db (`@algorithco-ui/db`) — stub

- Purpose: Drizzle schema, migrations, db client, seed/sync.
- Status: stub. Source LOC: 1 (`index.ts` = `export const DB_PACKAGE_NAME = "@algorithco-ui/db"`).
  Tests: 1 file, 1 test (asserts the name string).
- Public exports: `DB_PACKAGE_NAME` only.
- Runtime deps: none (no `drizzle-orm`, no `postgres`/`pg` driver).
- Scripts: standard 4; root also declares `db:sync`/`db:migrate` which filter to this package,
  but those scripts DO NOT EXIST in this package.json → running them would FAIL.
- Implemented vs stub: everything is a stub; no schema, no migrations dir, no client, no seed/sync.

### packages/builder (`@algorithco-ui/builder`) — stub

- Purpose: registry build pipeline (validate → hash → emit static `/r/*.json`).
- Status: stub. Source LOC: 1 (`BUILDER_PACKAGE_NAME` const). Tests: 1 file, 1 test.
- Public exports: `BUILDER_PACKAGE_NAME` only.
- Runtime deps: none. Scripts: standard 4 (NO `build:registry` script here, although the ROOT
  package.json references `pnpm --filter @algorithco-ui/builder build:registry` → that
  root script would FAIL today).
- Implemented vs stub: all stub; no pipeline code.

### apps/api (`@algorithco-ui/api`) — stub

- Purpose: Hono server (events ingestion, stats, admin).
- Status: stub. Source LOC: 1 (`API_PACKAGE_NAME` const). Tests: 1 file, 1 test.
- Public exports: `API_PACKAGE_NAME` only.
- Runtime deps: none (no `hono`, no `zod`).
- Implemented vs stub: all stub; no routes, no env parsing (Task 8), no middleware.

### apps/cli (`algorithco-ui`) — stub

- Purpose: the published `algorithco-ui` CLI (`add <slug>` etc.), `bin: algorithco-ui → ./dist/cli.js`.
- Status: stub. Source LOC: 1 (`CLI_PACKAGE_NAME` const). Tests: 1 file, 1 test.
- Note: `engines: node >=20` here vs root `>=22` — INCONSISTENT (minor; CLI allows Node 20, repo says 22+).
- `bin` points at `./dist/cli.js` but there is NO build that emits `dist/` (build = `tsc --noEmit`);
  the published binary path does not exist. NOT BUILT.
- Runtime deps: none. Implemented vs stub: all stub; no commands, no registry fetching.

### apps/web — NOT a package

- Only `apps/web/README.md` ("Out of scope for now"). No package.json → not in the
  pnpm workspace, invisible to turbo. Correct per out-of-scope rule.

### packages/config (`@algorithco-ui/config`) — complete

- Purpose: shared build configs. The only complete package.
- Source LOC: 58 (`eslint.base.js` 26 + `prettier.base.js` 9 + `tsconfig.base.json` 23). Tests: 0
  (`test: vitest run --passWithNoTests`).
- Exports: `./tsconfig.base.json` only (eslint/prettier bases consumed by relative import, not
  package exports).
- Scripts: `build`/`typecheck` = echo no-ops; `lint` = `prettier --check .`; `test` = pass-with-no-tests.
- Implemented: all three base configs (see §6).

### scripts (root, not a package)

- `scripts/new-component.ts` (4 lines): stub — exports `stub()` that throws
  `not implemented (Task 3)`. Invoked via root `new-component: tsx scripts/new-component.ts`
  (would throw at runtime). `tsx` is a root devDep (satisfied).

## 5. Contracts as they exist in code

Zod schemas in `packages/shared`: NONE. `zod` is not in any package.json and not in
`pnpm-lock.yaml`. There is nothing to compare against master prompt Section 4 — every
schema (component meta, registry index, events, config) is NOT BUILT. Deviation list: N/A
(nothing exists to deviate); the gap itself is the finding.

- Canonical hashing algorithm: NOT IMPLEMENTED. Grepped `packages/`, `apps/`, `registry/`,
  `scripts/` for `hash|sha256|blake|canonical|stableStringify` — zero matches. No hash function,
  no serialization rules, no include/exclude lists exist anywhere in code.
- Dependency allowlist: NOT IMPLEMENTED. Category list: NOT IMPLEMENTED (no categories exist;
  `registry/registry.lock.json` = `{ "version": 1, "components": {} }` placeholder;
  no `registry/components/` or `registry/lib/` directories).
- Only contract-like facts on disk: `PLACEHOLDER_DOMAIN = "algorithco.dev"` and
  `DEFAULT_REGISTRY_URL = "https://algorithco.dev/r"` (`packages/shared/src/site.ts`).

## 6. Tooling and configuration

Root scripts (`package.json`): `build`/`lint`/`typecheck`/`test` → `turbo run <task>`;
`build:registry` → `pnpm --filter @algorithco-ui/builder build:registry` (BROKEN today —
target script absent); `new-component` → `tsx scripts/new-component.ts` (throws Task-3 stub);
`db:sync` / `db:migrate` → filter to `@algorithco-ui/db` scripts that DO NOT EXIST (BROKEN today);
`format` → `prettier --write .`. 3 of 9 root scripts reference non-existent targets.

Turborepo task graph (`turbo.json`): tasks `build` (dependsOn `^build`, outputs `dist/**`),
`typecheck` (dependsOn `^build`, outputs `[]`), `lint` (outputs `[]`), `test`
(dependsOn `^build`, outputs `[]`). No `cache`/`remoteCache` keys (remote caching disabled
by default — confirmed in run output: "Remote caching disabled"). `agentGuidance` key absent
(so the turbo agent-rules block is re-added; it is currently present at the end of `AGENTS.md`).
Note: `build` outputs `dist/**` but every build script is `tsc --noEmit` (emits nothing) —
outputs declaration is aspirational; harmless today.

TypeScript (`packages/config/tsconfig.base.json`, extended by all): `strict: true` PASS,
`noUncheckedIndexedAccess: true` PASS, `exactOptionalPropertyTypes: true` PASS (all three
required flags enabled). Also: `target ES2022`, `module/moduleResolution NodeNext`,
`noEmit`, `skipLibCheck`, `isolatedModules`, `noFallthroughCasesInSwitch`, `noImplicitOverride`,
`forceConsistentCasingInFileNames`, `declaration+declarationMap+sourceMap` (moot with noEmit).

ESLint (`packages/config/eslint.base.js`, re-exported by root + each package):
`@eslint/js` recommended + `typescript-eslint` `strictTypeChecked` for `**/*.ts`
(the strictest preset — notable), `disableTypeChecked` for `**/*.js`, custom
`"no-console": "error"` (AGENTS.md ban enforced), ignores `dist/**`, `node_modules/**`.

Prettier (`packages/config/prettier.base.js`): `semi: true`, `singleQuote: false`,
`trailingComma: "all"`, `printWidth: 100`.

Vitest: `vitest.workspace.ts` → projects `apps/*`, `packages/*`; each package has
`vitest.config.ts` with `include: ["src/**/*.test.ts"]`.

CI (`.github/workflows/ci.yml`): triggers `push: branches [main]` + `pull_request`;
one job `ci` on `ubuntu-latest`: checkout v4, pnpm/action-setup v4 (version 10),
setup-node v4 (node 22, pnpm cache), then `install --frozen-lockfile`, `lint`,
`typecheck`, `test`, `build`. NEVER RUN: no git remote exists, so no GitHub repo
receives pushes; `gh` run history cannot exist. (Not verifiable from here beyond the
no-remote fact — stated as inference from it.)

Files present/missing:

- PRESENT: `AGENTS.md` (12 rules + turbo agent block), `.env.example` (7 vars:
  `DATABASE_URL`, `ADMIN_TOKEN`, `WEB_ORIGIN`, `REGISTRY_URL`, `TRUSTED_PROXY_COUNT`,
  `LIKE_PEPPER`, `PORT`), `.gitignore` (node_modules, dist, .turbo, .env, coverage, …),
  `.gitattributes` (`* text=auto eol=lf`, `*.sh text eol=lf`), `.editorconfig`,
  `.nvmrc` (`22`), `README.md`, `CONTRIBUTING.md`, per-package READMEs (one-liners).
- MISSING: `LICENSE` (README carries a TODO to choose one; repo private until then),
  `docs/` (created by this report), any `Dockerfile`/`docker-compose*`/`Caddyfile`,
  any `drizzle/` migrations, any component sources, `CHANGELOG`.

## 7. Verification (run now and paste results)

Ran in the mandated order on 2026-10-05, Windows PowerShell, via `pnpm.cmd`
(`pnpm.ps1` blocked by execution policy — see §10, LOW). All turbo results below were
**cache hits** replaying the 2026-10-04 14:47 runs (turbo reported `FULL TURBO`, e.g.
`Time: 27ms`); exit codes are fresh from just now and authoritative for pass/fail.

1. `pnpm.cmd install --frozen-lockfile` — exit 0, ~1.1s ("Done in 1.1s using pnpm v10.29.3").
   Excerpt: `Scope: all 7 workspace projects / Lockfile is up to date, resolution step is skipped /
   Already up to date`. Warning: `Ignored build scripts: esbuild@0.28.2. Run "pnpm approve-builds"…`.
2. `pnpm.cmd lint` — exit 0. `Tasks: 6 successful, 6 total / Cached: 6 cached, 6 total /
   Time: 27ms >>> FULL TURBO`. Excerpt: config package `prettier --check .` →
   `All matched files use Prettier code style!`; the other 5 `eslint .` clean.
3. `pnpm.cmd typecheck` — exit 0. `Tasks: 7 successful, 7 total / Cached: 7 cached /
   Time: 20ms >>> FULL TURBO` (includes the config echo no-op package).
4. `pnpm.cmd test` — exit 0. `Tasks: 7 successful, 7 total / Cached: 7 cached /
   Time: 33ms >>> FULL TURBO`. Per-package (from replayed vitest output, v3.2.7):
   shared 2 passed, api 1 passed, cli 1 passed, db 1 passed, builder 1 passed,
   config 0 (no test files, `--passWithNoTests`). TOTAL: 6 tests, 6 passed, 0 failed,
   0 skipped / todo / flaky. Original uncached durations (2026-10-04): 2.1–3.4s per package.
5. `pnpm.cmd build` — exit 0. `Tasks: 6 successful, 6 total / Cached: 6 cached /
   Time: 34ms >>> FULL TURBO` (`tsc -p tsconfig.json --noEmit` everywhere; nothing emitted).

Warnings/notes: (a) pnpm `Ignored build scripts: esbuild@0.28.2` on install (LOW — supply-chain
hygiene: run `pnpm approve-builds`); (b) everything served from turbo cache — green but
stale-dated 2026-10-04, re-run with `--force` after any source change; (c) no `test`
coverage thresholds configured; (d) `vitest 3.2.7` and `turbo 2.11.7` resolved above their
declared `^3.2.4`/`^2.5.4` floors (ranges allow it; lockfile is the truth).

> (1b update, 2026-10-05, NO CACHE) Ran `pnpm.cmd install --frozen-lockfile` (exit 0, 1.6s;
> esbuild postinstall executed — the "Ignored build scripts" warning is GONE after the
> `onlyBuiltDependencies: [esbuild]` change) then
> `pnpm.cmd turbo run lint typecheck test build --force` — exit 0,
> `Tasks: 24 successful, 24 total / Cached: 0 cached, 24 total / Time: 13.082s`.
> Real per-package test durations: cli 1.23s, db 1.69s, api 1.10s, shared 0.90s, builder 0.85s.
> Test counts now: shared 3 passed (new PROJECT_NAME test green), api/cli/db/builder 1 each,
> config 0 → TOTAL 7 passed, 0 failed, 0 skipped/todo. Turbo printed `WARNING no output
> files found for task …#build` × 6 — expected (all builds are `tsc --noEmit`; known gap
> until Task 5). `git status --short` after the run: clean (turbo `agentGuidance: false`
> opt-out confirmed working — AGENTS.md untouched).
> CI run `37256803283` (first ever): GREEN, `ci (22)` 32s + `ci (24)` 44s, all 5 steps pass
> in both; annotations only (Node-20-actions deprecation + ubuntu-26 migration notices).

## 8. Decisions and deviations log

Decisions NOT dictated by the master prompt (inferred from commits/diffs; author = repo owner,
not this session — this session wrote no code):

1. pnpm 10 + Turbo 2 + NodeNext ESM monorepo — reproducible toolchain (matches AGENTS.md §3).
2. `tsc --noEmit` as every package's `build` — typecheck-as-build keeps the skeleton green
   with zero emit config; will need replacing once `dist/` artifacts (CLI bin) are required.
3. `typescript-eslint` `strictTypeChecked` preset — strongest default linting.
4. `no-console: error` — enforces AGENTS.md logging ban mechanically.
5. Branding placeholder `algorithco.dev` centralized in `packages/shared/src/site.ts` (HEAD commit).
6. `turbo.json` `outputs: ["dist/**"]` pre-declared for a `dist/` nothing emits yet — forward-looking.
7. `.gitattributes` `eol=lf` + README Windows/WSL2 note — cross-platform shell-script safety.
8. `registry.lock.json` `{version: 1, components: {}}` placeholder reserves the index shape.
9. `tsx` as root devDep for scripts — avoids a build step for tooling.
10. CI runs lint→typecheck→test→build on Node 22 + pnpm 10 (mirrors local workflow).

Deviations from the master prompt: UNKNOWN — the master prompt is not in the repo, so no
deviation can be established. Observable gaps that *may* be deviations or simply later tasks:
(a) `apps/cli` engines allow Node `>=20` while repo standard is 22+; (b) root scripts
`build:registry`, `db:sync`, `db:migrate` point at package scripts that don't exist;
(c) `bin → ./dist/cli.js` unbuildable with `noEmit`; (d) `turbo.json` lacks `"agentGuidance": false`
so turbo keeps rewriting the AGENTS.md footer. Reasons: (a)–(c) look like skeleton-stage
oversights, not deliberate choices; (d) is turbo-default behavior.

## 9. Open questions and TODOs

`TODO(question)` in code (grep; 4 hits, 3 unique):

1. `packages/shared/src/site.ts:1` — `// TODO(question): confirm production DOMAIN; algorithco.dev is a placeholder.`
2. `scripts/new-component.ts:1` — `// TODO(question): Task 3 — implement the new-component generator (scaffold registry/components/<category>/<slug>/ + update registry.lock.json).`
3. `README.md:54` — `<!-- TODO(question): confirm production DOMAIN (currently algorithco.dev placeholder, defined once in packages/shared/src/site.ts) and CLI default registry URL. -->`
4. `README.md:55` — `<!-- TODO(question): choose a license before public launch (repo is private until then; no LICENSE file yet). -->`
   (`AGENTS.md:9` is the rule defining the convention, not a question.)

Other TODO/FIXME/HACK: NONE (grep for `TODO|FIXME|HACK` returned only the above + the AGENTS.md rule).

Questions needing the owner:

1. What is the real production DOMAIN (replace `algorithco.dev`)? Also confirm the default registry URL.
2. Which license? (Needed before public launch; currently no LICENSE file.)
3. (1b: RESOLVED — master prompt committed at `docs/MASTER_PROMPT.md`; task names/criteria known.)
4. (1b: RESOLVED — `PROJECT_NAME = "Algorithco UI"` added to `packages/shared/src/site.ts`, commit `5c46663`.)
5. (1b: RESOLVED — CLI `engines >= 20` is intentional per MASTER_PROMPT §16 decision 2, not a bug.)
6. (1b: RESOLVED — esbuild allowed via `onlyBuiltDependencies` in `pnpm-workspace.yaml`, commit `43222eb`.)
7. (1b: RESOLVED — owner chose trailer-only) Agent commits carry
   `Co-Authored-By: opencode <noreply@opencode.ai>` (upstream OpenCode tool convention, verified in
   `sst/opencode` repo `packages/opencode/src/tool/bash.txt`). No bot footer line. NOTE (corrected
   2026-10-05): this is TOOL-level attribution, not a personal account — there is no GitHub user
   behind `noreply@opencode.ai` (it is not a registered GitHub noreply address, so no avatar,
   profile link, or contribution graph; the agent itself is the OpenCode harness running
   Muse Spark 1.3 via the OpenCode provider, with no login of its own — pushes/auth use the
   owner's credentials). Applies going forward; past pushed commits NOT rewritten. Git identity
   itself untouched (global `C:/Users/user/.gitconfig`, no local overrides).

## 10. Known issues and risks

- (1b: RESOLVED) Remote/push/CI — repo created as private `otassh/algorithco-ui`, all pushed,
  first CI run green (see §1). Remaining: branch protection NOT enabled yet (deliberate;
  recommendation for owner in §12 below).
- HIGH — `apps/cli` `bin` (`./dist/cli.js`) is unbuildable: `build` = `tsc --noEmit`, so the
  shippable CLI artifact does not and cannot exist. (1b: known gap, real build lands in Task 5
  per §16 decision 3.) Blocks any CLI testing/distribution.
- MEDIUM — 3 root scripts reference missing package scripts (`build:registry`, `db:sync`,
  `db:migrate`). (1b: INTENTIONAL per §16 decision 4 — targets land in Tasks 3/4/7. They still
  fail if invoked today; do not "fix" by stubbing.)
- MEDIUM — (Task 2 DONE) Contract code exists: all §4 schemas, hashing, allowlists in
  `packages/shared` (290 tests). Downstream (builder, API, CLI, DB) unblocked — Task 3 next.
- MEDIUM — Database: no driver, no schema, no migrations, no client; `.env.example` documents
  `DATABASE_URL` but nothing reads it. `ADMIN_TOKEN`/`LIKE_PEPPER` placeholders must be replaced
  before any deploy.
- LOW — `pnpm.ps1` blocked by Windows execution policy; `pnpm.cmd` works. New contributors on
  Windows will hit this; the README Windows note covers WSL2/Git Bash but not this case.
- (1b: RESOLVED) esbuild warning — fixed via `onlyBuiltDependencies`.
- (1b: RESOLVED) turbo AGENTS.md rewrites — `"agentGuidance": false` verified against installed
  Turbo 2.11.7 schema/docs and confirmed (tree clean after `--force` run).
- LOW — Resolved `turbo 2.11.7` / `vitest 3.2.7` float above declared floors; harmless (lockfile-pinned)
  but worth knowing when reading version-sensitive turbo docs.
- LOW — CI annotations (non-failing): actions still target Node 20 (deprecation notice); ubuntu-latest
  migrates to Ubuntu 26 on 2026-10-19 — will exercise the [22, 24] matrix on a new image; watch it.
- LOW — Turbo serves all-cached results; a green run today does not prove a clean-machine build.
  Periodically run with `--force` (and CI on a fresh runner once a remote exists).
  (1b: remote exists now; first CI run green on fresh runners.)

Security notes: no secrets in code (`.env` correctly gitignored — and no `.env` file exists on
disk; `git ls-files` shows only `.env.example` with placeholder values; full-history grep for
private-key/token patterns found only the English substring "sk-" inside "task-commit" —
false positives, zero real hits; scan clean 2026-10-05). No auth, no input validation, no
network code exists yet, so no auditable attack surface — but also no protection; do not deploy.

## 11. Not built yet

> (1b: phase mapping now known from MASTER_PROMPT §14 — Phase 1: Tasks 1–6, Phase 2: Tasks 7–10,
> Phase 3: Tasks 11–14.) Nothing below exists in code. "Stub" = name-only const + trivial test.

- Phase 1 — shared (Task 2): ALL Zod schemas + inferred types; canonical hash algorithm +
  dependency allowlist; category list; any validation helper. (Only site constants exist.)
- Phase 1 — builder (Task 4): entire pipeline — file discovery, schema validation, hashing,
  `/r/*.json` emission, `build:registry` script; 3 sample components.
- Phase 1 — CLI (Task 5): `init` + `add` per §9 (hash verify, path safety, alias rewrite, rollback,
  Tailwind patch, dep install, `--dry-run`); real tsup `dist/` build for `bin`.
- Phase 1 — deploy (Task 6): `docker-compose*`, `Caddyfile`, deploy/backup/rollback scripts,
  `deploy/README.md` hardening content.
- Phase 2 — DB (Task 7): driver, schema/tables, migrations, client, seed, `db:sync`/`db:migrate`.
- Phase 2 — API (Task 8): all routes (health, search, popular, events, like, newsletter+confirm, RSS),
  rate limiting, CORS, security headers, graceful shutdown.
- Phase 2 — CLI (Task 9): telemetry + `list`, `search`, `diff`, `update`.
- Phase 2 — admin (Task 10): token auth, stats, announcements, reindex, audit log.
- Phase 3 (Tasks 11–14): quality gates, props docs, Playwright previews, RSS/OG/monitoring/k6/final docs.
  (Criteria for 11–14 to be written at each task's start.)
- registry content: `registry/components/<category>/<slug>/` (dir absent); `registry/lib/`;
  real `registry.lock.json` entries; first real component (Tasks 3–4).
- scripts: `new-component` generator (Task 3 — stub throws).
- docs: component authoring guide content, API docs.
- web: entire website (explicitly OUT OF SCOPE — must NOT be built; MASTER_PROMPT §13).
- repo-level: `LICENSE` (open question); branch protection (recommended below, awaiting owner).

## 12. Next steps

Next 3 tasks in order (per MASTER_PROMPT §14 — no longer blocked on the plan doc):

1. **Task 2: `packages/shared`** — `MetaSchema`, `RegistryItemSchema`, `RegistryIndexSchema`,
   `CliConfigSchema`, API req/res schemas, categories list, dependency allowlist, canonical
   JSON + hashing utility, JSON Schema export. Unblocks builder/API/DB/CLI.
2. **Task 3: `new-component` generator** — per §6; generated output must pass
   `build:registry --check` (assertion added once Task 4 exists).
3. **Task 4: `packages/builder`** — pipeline stages 1–11 + 3 sample components.

Immediate next-task plan (Task 2, 5–8 lines): `zod` is on the approved list (§2 table:
validation = Zod; CLI also uses it) so no justification needed — add it as a dependency of
`packages/shared`; define one schema per §4 contract area with the exact rules (§4.1–§4.5:
regexes, limits, `.strict()`); categories + allowlist (`allowed-dependencies.ts`) as data;
canonical-JSON + sha256 hash util shared by builder/CLI; JSON Schema export;
Vitest valid/invalid cases incl. path traversal, bad slugs, unknown deps/keys; run all
checks uncached; commit as one task-commit.

Prerequisites from the owner: (a) go-ahead for Task 2 (STOP here until given);
(b) production DOMAIN decision (still placeholder); (c) license choice;
(d) co-author identity for agent commits (§9 Q7). Git identity unchanged (global, §9 Q7).
No remote/push/CI prerequisites remain — repo is live at `otassh/algorithco-ui`.

Branch protection — NOT enabled yet (per instruction). When CI has been green once
(it has: run `37256803283`), recommended exact settings for `main`:
`gh api repos/otassh/algorithco-ui/branches/main/protection -X PUT -f required_status_checks[strict]=true -f required_status_checks[checks][]['context']='ci (22)' -f required_status_checks[checks][]['context']='ci (24)' -f enforce_admins=true -f required_pull_request_reviews[required_approving_review_count]=1 -f required_pull_request_reviews[dismiss_stale_reviews]=true -f restrictions='null' -f required_linear_history=true -f allow_force_pushes=false -f allow_deletions=false`
(or the same via Settings → Branches → Add rule: require status checks `ci (22)` + `ci (24)`,
require PR review ×1, dismiss stale reviews, require linear history, block force pushes/deletions,
include administrators). Awaiting owner go-ahead.

## 13. Handoff context for a fresh AI session

1. Source of truth FIRST: read `docs/MASTER_PROMPT.md` fully at session start (§0 protocol:
   plan → implement → tests → 4 checks → verify criteria → commit → report; in order; one task at a time).
2. Architecture principle: Git is source of truth; DB is index+stats only; static files on disk
   are the delivery mechanism (`Git registry → builder → static /r/*.json → CLI`; reads never hit API/DB).
3. Conventions: TypeScript strict ESM, Node 22+ dev (CLI ships Node 20 compat — intentional),
   pnpm only (`pnpm.cmd` on Windows — `pnpm.ps1` execution-policy-blocked); Zod schemas live ONLY
   in `packages/shared`; never hand-edit `registry/components/**` (generator only); never execute
   registry content (it is data). Approved deps: MASTER_PROMPT §2 table (zod needs no justification).
4. Contracts live in `packages/shared/src/` — today: only `site.ts` (`PROJECT_NAME`,
   `PLACEHOLDER_DOMAIN`, `DEFAULT_REGISTRY_URL`) + re-exports. NO Zod yet → Task 2 is next.
5. Run/verify from root: `pnpm.cmd install --frozen-lockfile`,
   `pnpm.cmd turbo run lint typecheck test build --force` (24 tasks, ~13s; build warns
   "no output files" — expected, noEmit until Task 5). Remote: `origin` =
   `github.com/otassh/algorithco-ui` (private); CI matrix [22, 24], green on run 37256803283.
6. Current state: branch `task-6a-static-serving`, Task 5b DONE (merged via PRs
   #7, #9, #8 at `9b011c2`; 717 tests, bundle 1.08 MB, e2e-real green on Linux
   run `37315359376` + Windows locally). `deploy/` still placeholder (6a builds
   Caddy + Compose + verifier + smoke; `deploy.sh`/`rollback.sh`/`backup.sh`,
   deploy workflow, postgres/api services land in 6b/7/8 — intentional).
7. Exact next action: Task 6a (static serving) on this branch. Do NOT start 6b
   (VPS deploy) or API/DB work first. STOP after reporting.
8. Agent commit attribution (owner decision 2026-10-05): every agent-authored commit ends with
   trailer `Co-Authored-By: opencode <noreply@opencode.ai>` (upstream OpenCode TOOL convention —
   not a personal account; no GitHub user behind it). No bot footer line. Never rewrite pushed
   history to add it. Never touch git identity config.
8. Non-negotiable AGENTS.md rules (13 now; #1 = master prompt first): 1 task=1 commit; criteria
   verified before done; strict TS + ESM + Node22 + pnpm; Zod-only validation w/ schemas in
   `shared`; approved-deps only; smoke tests everywhere; secrets in `.env` only (+ keep
   `.env.example` current); generator-only registry edits; `TODO(question)` + report instead of
   silent guessing; no `any`/`@ts-ignore`/`console.log`/dead code; registry content never
   executed; out-of-scope list not built.

---
*Report written 2026-10-05 by read-and-verify task; updated same day for Task 1b housekeeping.
Evidence: repo files + `git log/status/remote/ls-files`, `node --version`, `pnpm.cmd --version`,
turbo/vitest outputs (cached + `--force`), `gh run watch` run 37256803283. Task names/criteria
now from `docs/MASTER_PROMPT.md §14.*

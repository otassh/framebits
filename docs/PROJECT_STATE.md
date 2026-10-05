# PROJECT STATE — verified read-only report

> This report contains facts only. Every statement is backed by the repo contents
> or by commands run on 2026-10-05 (UTC+5, machine local time). Anything not
> verifiable is marked UNKNOWN / NOT BUILT / NOT VERIFIED. No source code was
> changed to produce this report.

## 1. Snapshot

- Date/time: 2026-10-05 (commands run this session; repo timestamps are +0500).
- Current branch: `main` (`git rev-parse --abbrev-ref HEAD` → `main`).
- HEAD commit: `a0ae7423af867d8e2e5b36e2cb395a75b6cacb3a` —
  `chore(monorepo): single-place domain constant, turbo outputs, windows dev note`
  (2026-10-04 14:47:42 +0500, author hamroqulovotabek).
- Number of commits: 2 (`git rev-list --count HEAD` → `2`).
  1. `d06c7e8` feat(monorepo): initial workspace skeleton with turbo pipeline and package stubs
  2. `a0ae742` chore(monorepo): single-place domain constant, turbo outputs, windows dev note
- Working tree: CLEAN at report time (`git status --short` → empty output, `git diff HEAD --stat` → empty).
  Note: at the start of this session the tree was dirty (modified `.gitattributes`, `README.md`,
  `packages/shared/src/*`, `turbo.json`, untracked `.gitmessage`, `packages/shared/src/site.ts`);
  that dirty state is exactly what HEAD commit `a0ae742` contains, i.e. the session began
  before that commit existed and the commit landed during this session.
- Remote: NONE configured (`git remote -v` → empty). Nothing is pushed anywhere; CI has never run.
- Local path: `C:\Users\user\Desktop\design`.
- OS/shell: Windows (`win32`), PowerShell. `pnpm.ps1` is blocked by the machine's
  PowerShell execution policy (`PSSecurityException: UnauthorizedAccess`); all pnpm
  commands in this report were run via `pnpm.cmd`.
- Node: `v24.19.0` (repo requires `>=22` via root `engines` + `.nvmrc` = `22`).
- pnpm: `10.29.3` (matches root `packageManager: pnpm@10.29.3`).
- Turbo: `2.11.7` actually executed (root `package.json` declares `turbo: ^2.5.4`; spec range
  is satisfied but pinned/deviation note: resolved version is 2.11.7, not 2.5.x).
- Vitest: `3.2.7` actually executed (packages declare `vitest: ^3.2.4`; range satisfied).

Branding values (searched via grep for `PROJECT_NAME|DOMAIN|REGISTRY_URL|PLACEHOLDER_DOMAIN|DEFAULT_REGISTRY|algorithco`):

- `PROJECT_NAME`: NOT FOUND anywhere in code. There is no `PROJECT_NAME` constant. UNKNOWN where
  it should live.
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

> LIMITATION: the "master prompt" document is NOT present anywhere in the repo
> (grepped for `master prompt|Task [0-9]+|Phase [123]` — only passing references found:
> `scripts/new-component.ts` → "Task 3", `deploy/README.md` → "Task 6",
> `packages/shared/src/site.ts` comment → "Task 8", `README.md` → "Task 6+",
> `apps/web/README.md` → "master prompt Section 13"). Task names and acceptance criteria
> below for Tasks 2–14 are therefore UNKNOWN. Only what exists on disk is reported.
> Per the strict rule, no task is marked DONE on criteria grounds except where the only
> observable criterion (stub committed + checks green) holds — and even those are flagged
> NOT VERIFIED against the unseen master prompt.

| Task # | Name (from repo evidence, else UNKNOWN) | Status | Commit hash | Acceptance criteria met |
|---|---|---|---|---|
| 1 | Monorepo skeleton (turbo pipeline + package stubs) — inferred from commit message | DONE (skeleton only) | `d06c7e8` | Criteria UNKNOWN (no master prompt in repo): NOT VERIFIED. Observable: workspace layout exists PASS; `pnpm lint/typecheck/test/build` green PASS (see §7) |
| 2 | UNKNOWN (no reference in repo) | NOT STARTED | — | NOT VERIFIED |
| 3 | new-component generator — inferred from `scripts/new-component.ts` TODO | IN PROGRESS (stub) | `d06c7e8` (stub committed in skeleton) | Generator implemented: FAIL (file throws `not implemented (Task 3)`); scaffold output: FAIL; `registry.lock.json` still placeholder PASS-as-placeholder |
| 4 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| 5 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| 6 | Deploy docs / VPS (`deploy/README.md` = "VPS deploy docs land in Task 6"); component guide references "Task 6+" | NOT STARTED | — | Deploy docs: FAIL (one-line placeholder); docker-compose/Caddyfile/scripts: FAIL (absent) |
| 7 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| 8 | API env parsing / runtime config — inferred from `site.ts` comment "Runtime config (apps/api env parsing, Task 8)" | NOT STARTED | — | Env parsing: FAIL (`apps/api/src/index.ts` is a 1-line stub, no env code) |
| 9 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| 10 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| 11 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| 12 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| 13 | UNKNOWN (possibly the "out of scope" list — `apps/web/README.md` cites "master prompt Section 13") | NOT STARTED | — | NOT VERIFIED |
| 14 | UNKNOWN | NOT STARTED | — | NOT VERIFIED |
| — | Follow-up commit: single-place domain constant, turbo outputs, windows dev note | DONE | `a0ae742` | `site.ts` single-source constant PASS; `turbo.json` outputs PASS (by inspection); README windows note PASS |

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
3. Where is the master prompt / task plan? It is not in the repo — provide it or point to it,
   otherwise acceptance criteria for Tasks 2–14 cannot be verified.
4. `PROJECT_NAME` — is a central project-name constant wanted, and where should it live?
5. Should `apps/cli` engines stay `>=20` or align to repo `>=22`?
6. Approve or remove the `esbuild` build script (`pnpm approve-builds`)?

## 10. Known issues and risks

- HIGH — No git remote / nothing pushed / CI never run. Single-machine risk: all history
  (2 commits) lives only on this disk. Fix: `git remote add origin … && git push -u origin main`.
- HIGH — `apps/cli` `bin` (`./dist/cli.js`) is unbuildable: `build` = `tsc --noEmit`, so the
  shippable CLI artifact does not and cannot exist. Blocks any CLI testing/distribution.
- MEDIUM — 3 root scripts reference missing package scripts (`build:registry`, `db:sync`,
  `db:migrate`). They fail if invoked. Either add the package scripts or remove the root entries.
- MEDIUM — Zero contract code: no Zod, no schemas, no hashing, no allowlists. Per AGENTS.md §4
  schemas must live only in `packages/shared` — the home exists, the content doesn't. Everything
  downstream (builder, API, CLI, DB) is blocked on this.
- MEDIUM — Database: no driver, no schema, no migrations, no client; `.env.example` documents
  `DATABASE_URL` but nothing reads it. `ADMIN_TOKEN`/`LIKE_PEPPER` placeholders must be replaced
  before any deploy.
- LOW — `apps/cli` engines `>=20` vs repo `>=22` inconsistency.
- LOW — `pnpm.ps1` blocked by Windows execution policy; `pnpm.cmd` works. New contributors on
  Windows will hit this; the README Windows note covers WSL2/Git Bash but not this case.
- LOW — `Ignored build scripts: esbuild@0.28.2` warning on install; decide via `pnpm approve-builds`.
- LOW — Resolved `turbo 2.11.7` / `vitest 3.2.7` float above declared floors; harmless (lockfile-pinned)
  but worth knowing when reading version-sensitive turbo docs.
- LOW — Turbo serves all-cached results; a green run today does not prove a clean-machine build.
  Periodically run with `--force` (and CI on a fresh runner once a remote exists).

Security notes: no secrets in code (`.env` correctly gitignored; only `.env.example` with
placeholder values is tracked — verified via `git ls-files`). No auth, no input validation, no
network code exists yet, so no auditable attack surface — but also no protection; do not deploy.

## 11. Not built yet

> Phase mapping is UNKNOWN (master prompt absent). Grouped by area instead; nothing below exists
> in code. "Stub" = name-only const + trivial test.

- shared: ALL Zod schemas + inferred types; canonical hash algorithm + serialization rules;
  dependency allowlist; category list; any validation helper. (Only site constants exist.)
- builder: entire pipeline — file discovery, schema validation, hashing, `/r/*.json` emission,
  `build:registry` script.
- CLI: ALL commands (`add`, `list`, `search`? — names UNKNOWN); registry fetch; file writing;
  real `dist/` build for `bin`; Node engine alignment.
- API: ALL routes (events/stats/admin? — names UNKNOWN); Hono app; env parsing (Task 8);
  auth (`ADMIN_TOKEN`); rate limiting; `TRUSTED_PROXY_COUNT` handling; CORS (`WEB_ORIGIN`).
- DB: driver selection; schema/tables; migrations dir; client; seed; sync/migrate scripts
  (`db:sync`, `db:migrate` referenced but absent).
- registry content: `registry/components/<category>/<slug>/` (dir absent); `registry/lib/`;
  real `registry.lock.json` entries; first real component.
- scripts: `new-component` generator (Task 3 — stub throws).
- deploy: `docker-compose*`, `Caddyfile`, deploy/backup scripts, `deploy/README.md` content (Task 6).
- docs: component authoring guide content (CONTRIBUTING points at Task 6+), API docs,
  `docs/` site (this report is its first file).
- web: entire website (explicitly OUT OF SCOPE — must NOT be built; `apps/web/README.md`
  cites master prompt Section 13).
- repo-level: `LICENSE`; git remote; passing CI history; `PROJECT_NAME` constant (if wanted).

## 12. Next steps

Next 3 tasks in order (proposed; blocked on owner providing the master prompt — §9 Q3):

1. **Task 2 (assumed contracts): implement `packages/shared` Zod schemas** — component meta,
   registry index, event ingestion, with unit tests per schema. Unblocks builder/API/DB/CLI.
2. **Task 3: `new-component` generator** — scaffold `registry/components/<category>/<slug>/`,
   validate against schemas, update `registry.lock.json`; then author the first real component.
3. **Builder pipeline (`build:registry`)** — read registry sources, validate, hash, emit static
   `/r/*.json`; wire the missing `build:registry` package script.

Immediate next-task plan (Task 2, 5–8 lines): add `zod` as a dependency of
`packages/shared` (with written justification per AGENTS.md §5 if zod is not on the approved
list); define one schema per contract area in `src/*.ts` with strictness per the master prompt
(unknown-field handling, regexes, limits); export inferred types; write Vitest cases for
valid/invalid inputs incl. boundary limits; run `pnpm lint typecheck test build`; commit as one task-commit.

Prerequisites needed from the owner: (a) the master prompt / plan doc (names + acceptance
criteria for Tasks 2–14); (b) production DOMAIN decision; (c) license choice; (d) approved
dependency list (AGENTS.md §5 references one — it is not in the repo); (e) a git remote
(GitHub repo) + push so CI runs; (f) confirmation of Task 1's actual acceptance criteria.

## 13. Handoff context for a fresh AI session

1. Architecture principle: Git is source of truth; DB is index+stats only; static files on disk
   are the delivery mechanism (`Git registry → builder → static /r/*.json → CLI`; reads never hit API/DB).
2. Conventions: TypeScript strict ESM, Node 22+, pnpm only (`pnpm.cmd` on Windows — `pnpm.ps1`
   is execution-policy-blocked); Zod schemas live ONLY in `packages/shared`; never hand-edit
   `registry/components/**` (generator only); never execute registry content (it is data).
3. Contracts live in `packages/shared/src/` — today: only `site.ts` (`PLACEHOLDER_DOMAIN`,
   `DEFAULT_REGISTRY_URL`) + `index.ts` re-exports. NO Zod yet. Branding is single-sourced there.
4. Run/verify from root: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd lint`,
   `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build` (turbo; fully cached 2026-10-04 —
   use `--force` after changes). One task = one commit; every package needs smoke tests (Vitest).
5. Current state: 2 commits on `main`, tree clean, NO remote, CI never run. All packages except
   `config` are name-only stubs (6 tests total, all green). 3 root scripts are broken
   (`build:registry`, `db:sync`, `db:migrate` → missing targets). CLI `bin/dist` unbuildable (noEmit).
6. Exact next action: get the master prompt doc from the owner (§9 Q1–Q6), then implement
   `packages/shared` Zod schemas as one task-commit. Do NOT start builder/CLI/API/DB work first.
7. Non-negotiable AGENTS.md rules: 1 task=1 commit; acceptance criteria verified before done;
   strict TS + ESM + Node22 + pnpm; Zod-only validation w/ schemas in `shared`; approved-deps only;
   smoke tests everywhere; secrets in `.env` only (+ keep `.env.example` current); generator-only
   registry edits; `TODO(question)` + report instead of silent guessing; no `any`/`@ts-ignore`/
   `console.log`/dead code; registry content never executed; out-of-scope list not built.

---
*Report written 2026-10-05 by read-and-verify task. Evidence: repo files + `git log/status/remote/ls-files`,
`node --version`, `pnpm.cmd --version`, turbo/vitest run outputs, grep audits. Master prompt absent —
criteria-dependent statements marked NOT VERIFIED/UNKNOWN.*

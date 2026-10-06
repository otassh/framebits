# PROJECT STATE — generated from live repo facts

> Generated from repo state at 41f1d4895742aea82e4fd0e222fb4126f849ada8 on 2026-10-06; regenerate before each release.

This report contains only statements verifiable from the repo at the commit above
plus the working-tree state recorded in Section 1. Anything not checked this
session is marked UNKNOWN / NOT VERIFIED. Source of truth for process and task
order: `docs/MASTER_PROMPT.md`.

## 1. Snapshot

- HEAD: `41f1d4895742aea82e4fd0e222fb4126f849ada8` (`Merge pull request #15 from
otassh/docs/branch-per-task-workflow`, 2026-10-06).
- Commit count: 77 (`git rev-list --count HEAD`).
- Branch at generation time: `docs/project-state-final` (created this session
  from `main`, unpushed by design).
- Tracked files: 211 (`git ls-files` count).
- Working tree at generation time (from `git status`): CLEAN, nothing to commit.
- Remote: `origin/main` @ `41f1d48` (verified via `git rev-parse` + `gh`; repo
  visibility PUBLIC). CI last-run outcome: VERIFIED GREEN — PR #14 run
  37423956051 and PR #15 run 37428142177 both show `ci (22)`, `ci (24)`,
  `cli-compat` passing (`gh pr checks`). Local Node/pnpm versions:
  NOT VERIFIED this session.

## 2. Task progress (MASTER_PROMPT Section 14, Tasks 1–14)

Commit evidence is from `git log --oneline` run on this repo this session
(full history through HEAD `41f1d48`); every hash below was re-verified with
`git cat-file -t` this session.

| Task | Name (Section 14)                                                                      | Status      | Commit evidence                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Monorepo skeleton                                                                      | DONE        | `d06c7e8` (+ `a0ae742` follow-up)                                                                                                                   |
| 2    | `packages/shared`                                                                      | DONE        | `9bcd33a`, merged via PR #1 (`4526c48`) / PR #2 (`dd91324`)                                                                                         |
| 3    | Component generator (`pnpm new-component`)                                             | DONE        | `7ac5fcf` (+ `46f3484`), merged via PR #3 (`0da2cff`)                                                                                               |
| 4    | `packages/builder` + 3 sample components                                               | DONE        | 4a: `193455c` (PR #4 `9303c4d`); 4b: `24e18b7` (PR #5 `165f2dd`)                                                                                    |
| 5a   | CLI core (`init`, `add` file pipeline)                                                 | DONE        | `46dc402`, merged via PR #6 (`2031a0e`)                                                                                                             |
| 5b   | CLI install + styles (npm install, Tailwind blocks, real e2e)                          | DONE        | `8524054`, merged via PR #7 (`60ce023`) / PR #9 (`64ddcbc`) / merge #8 (`9b011c2`)                                                                  |
| 6    | Docker, Caddy, deploy scripts                                                          | NOT STARTED | `deploy/` contains only `README.md` (one-line placeholder, read this session); no `Dockerfile`, `docker-compose*`, or `Caddyfile` in `git ls-files` |
| 7    | `packages/db` (schema, migrations, client, sync, seed)                                 | NOT STARTED | `packages/db/src/index.ts` is a one-line name stub (read this session); no migrations dir in `git ls-files`                                         |
| 8    | `apps/api` (env, health, events, stats, like, newsletter, RSS, limits, CORS, shutdown) | NOT STARTED | `apps/api/src/index.ts` is a one-line name stub (read this session)                                                                                 |
| 9    | CLI telemetry + `list`, `search`, `diff`, `update`                                     | NOT STARTED | `apps/cli/src/commands/` contains only `add.ts` and `init.ts` (per `git ls-files`)                                                                  |
| 10   | Admin endpoints                                                                        | NOT STARTED | API is a stub (see Task 8 evidence)                                                                                                                 |
| 11   | Builder quality gates                                                                  | NOT STARTED | No gate code in `git ls-files`; criteria to be written at task start per Section 14                                                                 |
| 12   | Props documentation                                                                    | NOT STARTED | No props code in `git ls-files`; criteria to be written at task start per Section 14                                                                |
| 13   | Playwright previews                                                                    | NOT STARTED | No previews code or output in `git ls-files`; criteria to be written at task start per Section 14                                                   |
| 14   | RSS polish, OG images, monitoring, k6, docs pass                                       | NOT STARTED | No evidence of this work in `git ls-files`; criteria to be written at task start per Section 14                                                     |

## 3. Completed work outside Section 14 (with commit refs)

All commits below are reachable from `main` at HEAD `41f1d48`
(`git log --oneline` run this session), oldest first:

- 7 fix merges onto the rename branch: `afcbaaf` (fix/registry-8a-8b),
  `3f68996` (fix/config-8c-8d-8e), `2a5ad24` (fix/cli-publishability),
  `c547e4d` (chore/release-pipeline), `b52bcbb` (fix/registry-trust-model),
  `53deb12` (fix/readme-honesty), `455db7b` (fix/project-state-refresh).
- Release pipeline (secret-free OIDC, version guard, runbook): `71e53d1`
  (`chore(release): secret-free OIDC release pipeline + version guard + runbook`),
  merged via `c547e4d`. Workflow file `.github/workflows/release.yml` exists
  (verified in `git ls-files` and read this session; `environment: npm-publish`,
  `id-token: write`, no npm tokens).
- MIT license: `52e7fc9` (`chore: add MIT license`), merged via `33fc13c`.
  Root `LICENSE` exists (read this session: MIT, `Copyright (c) 2026 otassh`).
- Vitest per-package configs: `22fca7a`
  (`fix(vitest): local configs for config and registry-env packages`),
  merged via `1e32957`.
- First-publish prep: `303d392` (`chore(cli): first-publish prep for 0.1.0`),
  merged via `1a0acf9`. The package was subsequently corrected to the npm
  organization scope. `apps/cli/package.json`: name `@framebits/cli`, version
  `0.1.0`, no `private` field, `license` MIT,
  `publishConfig.access` `public`, `author` `otassh`, `prepack`
  (`copy-license.mjs`) and `prepublishOnly` (build + pack-smoke) present.
- Timeout units (seconds): `7898304`
  (`fix(cli): unify network timeout units to seconds`), merged via `82e93e8`.
- SHA-pinned workflows: `086c93b` (`ci: pin actions to commit SHAs`),
  merged via `034736d`.
- Rename branch integrated to `main` via PR #14 (`806762d`), including the
  intermediate state refresh `ba384bf`.
- Symlink-shim fix: `d16b308`
  (`fix(cli): run when invoked through a symlinked bin shim`),
  merged via `742aae6`.
- AGENTS.md rule 14 (one-branch-per-task workflow): `ca25fda`
  (`docs: codify one-branch-per-task PR workflow`), merged via HEAD `41f1d48`
  (PR #15). `AGENTS.md` has 14 numbered rules (counted this session).
- Registry versions are `aurora-text 1.0.1` / `shimmer-button 1.0.1`
  (`cn` stays `1.0.0`) — see Section 6.

## 4. Tracked file tree (`git ls-files`, 211 files)

```text
.editorconfig
.env.example
.gitattributes
.github/FUNDING.yml
.github/workflows/ci.yml
.github/workflows/e2e-real.yml
.github/workflows/release.yml
.gitignore
.gitmessage
.nvmrc
AGENTS.md
CHANGELOG.md
CONTRIBUTING.md
LICENSE
README.md
apps/api/{eslint.config.js, package.json, README.md, tsconfig.json, vitest.config.ts,
  src/index.ts, src/index.test.ts}
apps/cli/{eslint.config.js, package.json, README.md, tsconfig.json, tsup.config.ts,
  turbo.json, vitest.config.ts, scripts/copy-license.mjs, scripts/e2e-real.mjs,
  scripts/pack-smoke.mjs, src/cli.ts, src/index.ts, src/index.test.ts, src/errors.ts,
  src/errors.test.ts, src/levenshtein.ts, src/levenshtein.test.ts, src/integration.test.ts,
  src/process.test.ts, src/version.ts,
  src/aliases/{index.ts, aliases.test.ts}, src/apply/{index.ts, apply.test.ts},
  src/commands/{add.ts, init.ts}, src/config/{index.ts, config.test.ts},
  src/detect/{index.ts, detect.test.ts}, src/fs/node.ts,
  src/install/{command.ts, command.test.ts, compute.ts, compute.test.ts, run.ts, run.test.ts},
  src/plan/{index.ts, plan.test.ts}, src/registry-client/{index.ts, client.test.ts, timeout.test.ts},
  src/release/check-release-version.test.ts,
  src/resolve/{index.ts, resolve.test.ts, verify.ts, verify.test.ts},
  src/rewrite/{index.ts, rewrite.test.ts},
  src/styles/{generate.ts, generate.test.ts, patch.ts, patch.test.ts, validate.ts, validate.test.ts},
  src/ui/{output.ts, output.test.ts, prompts.ts}}
apps/web/README.md
assets/framebits-logo.png
deploy/README.md
docs/{BUILDER.md, CLI.md, CONTRACTS.md, MASTER_PROMPT.md, PROJECT_STATE.md, RELEASING.md, SECURITY.md}
eslint.config.js
package.json
packages/builder/{eslint.config.js, package.json, README.md, tsconfig.json, vitest.config.ts,
  src/cli.ts, src/index.ts, src/index.test.ts,
  src/registry/{index.ts, types.ts, model.ts, discover.ts, validate.ts, imports.ts,
    security.ts, typecheck.ts, versions.ts, emit.ts, test-helpers.ts, cli.test.ts,
    discover.test.ts, emit.test.ts, env.test.ts, imports.test.ts, integration.test.ts,
    load.test.ts, security.test.ts, typecheck.test.ts, validate.test.ts, versions.test.ts},
  src/scaffold/{files.ts, generate.test.ts, index.ts, names.ts, names.test.ts, request.ts,
    request.test.ts, scan.ts, scan.test.ts, types.ts, wrapper.test.ts}}
packages/config/{eslint.base.js, package.json, prettier.base.d.ts, prettier.base.js,
  tsconfig.base.json, vitest.config.ts, README.md}
packages/db/{eslint.config.js, package.json, README.md, tsconfig.json, vitest.config.ts,
  src/index.ts, src/index.test.ts}
packages/registry-env/{.prettierignore, package.json, vitest.config.ts, README.md}
packages/shared/{eslint.config.js, package.json, README.md, tsconfig.json, vitest.config.ts,
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
scripts/check-release-version.d.mts
scripts/check-release-version.mjs
scripts/new-component.ts
tsconfig.json
turbo.json
vitest.config.ts
```

## 5. Tests

There is no `apps/web` package: `apps/web` contains only `README.md`
(a placeholder per MASTER_PROMPT Section 3); no `apps/web/package.json` is
tracked, and `pnpm test` covers 7 packages (api, builder, config, db,
registry-env, shared, CLI `@framebits/cli`).

### 5.1 `*.test.ts` file counts (grouped from the `git ls-files` output this session)

| Package            | Test files                                                         |
| ------------------ | ------------------------------------------------------------------ |
| `packages/shared`  | 17                                                                 |
| `packages/builder` | 17 (12 `src/registry` incl. `src/index.test.ts`; 5 `src/scaffold`) |
| `apps/cli`         | 23                                                                 |
| `apps/api`         | 1                                                                  |
| `packages/db`      | 1                                                                  |

Tracked total: 59 `*.test.ts` files. (`packages/config` and
`packages/registry-env` have `vitest.config.ts` but no test files —
`pnpm test` reports "No test files found" for both, exit 0.)

### 5.2 Test-case counts (from a fresh full `pnpm test` run this session)

All 10 turbo tasks successful, 0 failures:

| Package                       | Tests passed | Test files passed |
| ----------------------------- | ------------ | ----------------- |
| `packages/shared`             | 389          | 17                |
| `packages/builder`            | 156          | 17                |
| `apps/cli` (`@framebits/cli`) | 246          | 23                |
| `apps/api`                    | 1            | 1                 |
| `packages/db`                 | 1            | 1                 |
| **Total**                     | **793**      | **59**            |

## 6. Registry items and versions

`registry/registry.lock.json` (`version: 1`, read this session) lists exactly
3 slugs:

| Slug             | Version | Hash (`sha256:…`)                                                         | Type / category / status (from `meta.json`, read this session)                                  |
| ---------------- | ------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cn`             | 1.0.0   | `sha256:c0cacc16e7e2e57e4e554a7dddfc714f9084c9ba4b53b24cfa9030c870920485` | lib / utilities / published; deps `clsx ^2.0.0`, `tailwind-merge ^3.0.0`                        |
| `aurora-text`    | 1.0.1   | `sha256:ff322ae5d8fc9843e1c310344df50e19e3bf3c4166044870fcc8c977a6e07284` | component / text-animations / published; dep `motion ^14.0.0`; `registryDependencies: ["cn"]`   |
| `shimmer-button` | 1.0.1   | `sha256:58da6596fe14c62d2688ead4c9a750e89f7b1a4ae7b83303b3edfd6e7ebf20de` | component / buttons / published; no npm deps; `registryDependencies: ["cn"]`; has `styles.json` |

(`meta.json` titles/added dates: `aurora-text` "Aurora Text", `shimmer-button`
"Shimmer Button", `cn` "Cn", each `addedAt` 2026-10-05.)

## 7. CI / release workflows (read this session)

- `.github/workflows/ci.yml`: present in `git ls-files`. Last-run outcome:
  VERIFIED GREEN — PR #15 run 37428142177 (`ci (22)`, `ci (24)`, `cli-compat`
  all pass).
- `.github/workflows/e2e-real.yml`: present in `git ls-files`. It runs only on
  `workflow_dispatch` + weekly schedule (not a required check); last manual run
  outcome NOT VERIFIED this session.
- `.github/workflows/release.yml`: present in `git ls-files` and read this
  session (secret-free OIDC trusted publishing for `@framebits/cli`, tag-gated on
  `v*.*.*`, `environment: npm-publish`, `id-token: write`, no npm tokens;
  version guard against `apps/cli/package.json`). Last-run outcome:
  The manual bootstrap target is `@framebits/cli@0.1.0`; the accidental
  unscoped `framebits` package is not a supported distribution channel.

## 8. Known gaps

- Deploy: placeholder only — `deploy/README.md` is one line ("VPS deploy docs
  land in Task 6", read this session); no `Dockerfile`, `docker-compose*`,
  `Caddyfile`, or deploy scripts tracked (verified via `git ls-files`).
- API/DB are stubs: `apps/api/src/index.ts` and `packages/db/src/index.ts` each
  export only their package-name const (both read this session).
- CLI commands beyond `init`/`add` (telemetry, `list`, `search`, `diff`,
  `update`) do not exist yet (see Task 9 evidence).
- `pnpm lint` / `pnpm typecheck` / `pnpm build` were NOT run this session, so
  their green status is NOT VERIFIED (only `pnpm test` and
  `pnpm build:registry --check`, see Section 10).

## 9. Open `TODO(question)` list (from `git grep` this session, tracked files only)

Actionable code/doc TODOs (8):

1. `packages/shared/src/site.ts:1` — confirm production DOMAIN
   (`framebits.dev` is a placeholder); the domain and default registry URL are
   defined only here.
2. `docs/RELEASING.md:33` — confirm the copyright holder name
   (`Copyright (c) 2026 otassh` in `LICENSE`).
3. `docs/RELEASING.md:38` — confirm the publish metadata placeholders
   (`"author": "otassh"`, `repository`, `homepage`, `bugs` URLs pointing at
   `github.com/otassh/framebits`, `keywords`).
4. `docs/RELEASING.md:41` — confirm the starting version (marked DONE in
   first-publish prep: `apps/cli` is `0.1.0` public; first CI-driven release
   is `0.1.1`).
5. `docs/RELEASING.md:44` + item 1 — confirm the production domain/registry URL
   if it changes any user-facing text.
6. `docs/RELEASING.md:47` — repo is PUBLIC (verified 2026-10-06 via
   `gh repo view --json visibility` → `"visibility":"PUBLIC"`); npm provenance
   is expected to work on the first CI release. Secret scanning + push
   protection enabled the same day.
7. `.github/workflows/release.yml:98` — TODO: drop the private-repo provenance
   fallback now that the repo is public (verify on the first CI release).
8. `docs/SECURITY.md:62` — owner to pick a trust-anchor option (recommendation:
   Option A, signed `index.json`); open sub-questions on key custody, public-key
   distribution, rotation/revocation, and `--insecure` opt-in for local dev.

Convention mentions (not actionable questions): `AGENTS.md:10` and
`docs/MASTER_PROMPT.md:17,415,486` define the `TODO(question)` rule itself.

## 10. Verification this session

| Command                                                                  | Result                                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git log -1 --format=%H`                                                 | `41f1d4895742aea82e4fd0e222fb4126f849ada8`                                                                                                                 |
| `git rev-list --count HEAD`                                              | `77`                                                                                                                                                       |
| `git status` / `git branch --show-current`                               | CLEAN tree on `docs/project-state-final` (created from `main` this session, unpushed)                                                                      |
| `git ls-files` count                                                     | 211 tracked files                                                                                                                                          |
| `*.test.ts` counts per package                                           | grouped from file listing — see Section 5.1                                                                                                                |
| Fresh full `pnpm test`                                                   | PASS — 10/10 turbo tasks, 792 tests total (shared 389, CLI 245, builder 156, api 1, db 1)                                                                  |
| Read `registry/**/meta.json` + `registry.lock.json`                      | summarized in Section 6                                                                                                                                    |
| Read `LICENSE`, `apps/cli/package.json`, `.github/workflows/release.yml` | summarized in Sections 3/7; CLI is `0.1.0` public (no `private` field), MIT, `publishConfig.access` `public`; release uses `environment: npm-publish` OIDC |
| Counted numbered rules in `AGENTS.md`                                    | 14                                                                                                                                                         |
| `git grep -n "TODO(question)"` (tracked files)                           | 8 actionable hits listed in Section 9                                                                                                                      |
| `pnpm build:registry --check`                                            | PASS (exit 0) — run after rewriting this file, before commit                                                                                               |

## 11. Doc links referenced here

All resolve to tracked files (verified in `git ls-files` this session):
`docs/MASTER_PROMPT.md`, `docs/BUILDER.md`, `docs/CLI.md`, `docs/CONTRACTS.md`,
`docs/RELEASING.md`, `docs/SECURITY.md`, `AGENTS.md`, `CONTRIBUTING.md`,
`README.md`, `CHANGELOG.md`, `LICENSE`, `apps/cli/package.json`,
`deploy/README.md`, `registry/registry.lock.json`,
`registry/lib/cn/meta.json`,
`registry/components/text-animations/aurora-text/meta.json`,
`registry/components/buttons/shimmer-button/meta.json`,
`packages/shared/src/site.ts`, `.github/workflows/ci.yml`,
`.github/workflows/e2e-real.yml`, `.github/workflows/release.yml`.

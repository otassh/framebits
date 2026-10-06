# RELEASING the `framebits` CLI — OWNER ONLY

> **Owner-only.** All steps below are performed by the repo owner.
> Routine releases are published by the `release` GitHub Actions workflow
> (`.github/workflows/release.yml`) via npm OIDC trusted publishing —
> no npm tokens anywhere. Only the one-time bootstrap publish (§1) is done
> by hand from the owner machine. Never publish from a feature branch, never
> from a fork. The package is currently `private: true` at version `0.0.0`
> and **NOT published**. `npm publish` refuses while `private` is set — that
> is the guard against accidents. Keep it until the launch decision is made.

Tag convention (reconciled): **`vX.Y.Z`** everywhere (e.g. `v0.1.0`).
The `release` workflow only runs on `v*.*.*` tags and the version guard
(`scripts/check-release-version.mjs`) requires the tag to equal
`apps/cli/package.json` `version` exactly. There is no `framebits-vX.Y.Z`
form — do not use it.

## Blockers before the FIRST publish (do not publish until all are resolved)

- License is **MIT**: root `LICENSE` file added and `"license": "MIT"` set in
  `apps/cli/package.json` (and every other workspace `package.json` for
  consistency). The field is intentionally present now; publishing an
  unlicensed package is not acceptable.
- TODO(question): confirm the copyright holder name (`Copyright (c) 2026
  otassh` in `LICENSE` — the login `otassh` is used because `gh api user`
  returned only the single-letter placeholder name "O", so "O" must not be
  used) and the `"author": "otassh"` value in `apps/cli/package.json`
  (plain name, no email — no public email exists in the repo).
- TODO(question): confirm the publish metadata added as placeholders:
  `"author": "otassh"` (name/org/email?), `repository`, `homepage`, `bugs`
  URLs (currently point at `github.com/otassh/framebits`), and `keywords`.
- TODO(question): confirm the starting version (`0.1.0` below).
- TODO(question): confirm the production domain/registry URL if it changes
  any user-facing text (currently a placeholder, see
  `packages/shared/src/site.ts`).
- TODO(question): **make the repo public before the first automated
  release.** npm provenance requires a public package in a public repo on a
  GitHub-hosted runner. OIDC publish itself works while the repo is private,
  but the workflow skips `--provenance` with a warning until the repo is
  public (see the `PROVENANCE` fallback in `release.yml`). Confirm dropping
  that fallback once the repo goes public at launch.

## 0. Preconditions (every release)

- On `main`, clean tree: `git status --porcelain` prints nothing.
- `pnpm install --frozen-lockfile` succeeds.
- Network access to `registry.npmjs.org` (provenance needs it). If the
  network is blocked, stop and report NOT VERIFIED — do not work around it.

## 1. One-time bootstrap — manual first publish (owner machine only)

**Why manual:** npm can only attach a GitHub Actions trusted publisher to a
package that already exists on the registry. The package must therefore be
created once by hand before the OIDC flow can take over. After §1, the owner
never publishes from a laptop again — all later releases go through §5.

1. Choose/verify the name (do not rename an existing package):
   ```sh
   npm view framebits version dist-tags
   ```
   - If the name is free, `npm view` answers 404 (`E404`) — proceed.
   - If the name is **taken, STOP**. Do not rename, do not squat a variant.
     Propose alternatives to the owner (e.g. `@otassh/framebits`,
     `framebits-cli`) and wait for a decision. Name claim is an owner
     decision, not part of this guide.
2. Log in as the owner (2FA on): `npm login`, then verify with `npm whoami`.
3. Prepare `apps/cli/package.json`: `"version": "0.0.0"` → `"0.1.0"`,
   delete the `"private": true` line, add the decided
   `"license": "MIT"`. Keep `.env.example` current if any new env var is
   introduced (none expected for a CLI-only release).
4. Add a changelog entry in `CHANGELOG.md` (root) under a new `## [0.1.0]`
   section. Per-release notes live in GitHub Releases (auto-generated, see
   §5); the changelog holds the curated highlights.
5. Verify publishability (from the repo root, must all be green):
   ```sh
   pnpm --filter framebits build
   pnpm --filter framebits lint
   pnpm --filter framebits typecheck
   pnpm --filter framebits test
   node apps/cli/scripts/pack-smoke.mjs
   ```
   `pack-smoke` fails if the packed tarball ships anything outside
   `package.json`/`README`/`dist`, or if `dist/cli.js` references
   `@framebits/*` at runtime. Do not proceed on red.
6. Dry-run the publish (from `apps/cli`, shows the file list, uploads
   nothing):
   ```sh
   cd apps/cli
   npm publish --dry-run
   ```
   Confirm the file list is `package.json`, `README.md`, `dist/cli.js` only.
7. Publish 0.1.0 from the owner machine (2FA challenge in the terminal):
   ```sh
   npm publish --access public
   ```
   (`publishConfig` already sets `access: public` and `provenance: true`;
   local first publish does not use `--provenance` — provenance comes from
   the workflow in §5.)
8. Tag and push with the reconciled convention:
   ```sh
   git add apps/cli/package.json CHANGELOG.md
   git commit -m "chore(cli): release framebits v0.1.0"
   git tag v0.1.0
   git push origin main
   git push origin v0.1.0
   ```
9. Verify (clean temp dir, NOT the repo):
   ```sh
   npm view framebits version dist-tags
   npx -y framebits@0.1.0 --version
   ```
   If `npm view` is unreachable (network blocked), report NOT VERIFIED.

## 2. Connect npm to GitHub — trusted publisher (owner, npmjs.com)

On npmjs.com, open the `framebits` package → **Settings → Trusted
Publisher → Manage Trusted Publishers → GitHub Actions**, and enter exactly:

| Field                | Value         |
| -------------------- | ------------- |
| Organization / owner | `otassh`      |
| Repository           | `framebits`   |
| Workflow filename    | `release.yml` |
| Environment          | `npm-publish` |

All four values are **case-sensitive and must match exactly**: the workflow
file is the bare filename `release.yml` (no path, no `./`, no
`.github/workflows/` prefix), and the environment must read `npm-publish`
with a hyphen. A mismatch fails at publish time with `ENEEDAUTH`/`403` —
see §7. Save, then confirm the publisher appears as GitHub Actions
(`otassh/framebits`, `release.yml`, `npm-publish`).

## 3. Harden npm publishing access (owner, npmjs.com)

Still on the package Settings page:

1. Set publishing to **require two-factor authentication** (2FA) — the owner
   account itself must have 2FA enabled; the bootstrap publish in §1 already
   exercised it.
2. **Disallow / do not create tokens for releases.** Do not create a Classic
   or Granular Access Token for CI, and do not add `NODE_AUTH_TOKEN` /
   `NPM_TOKEN` to any GitHub secret or workflow. The `release` workflow
   authenticates with the ambient OIDC token only (`id-token: write`,
   exchanged by npm CLI ≥ 11.5.1). If a legacy automation token exists from
   before the OIDC setup, revoke it now.

## 4. GitHub side — environment, reviewers, tag protection (owner)

1. Repo **Settings → Environments → New environment**, name it exactly
   `npm-publish` (must equal the npm trusted-publisher environment in §2 —
   case-sensitive).
2. Add **Required reviewers** (the owner). Every `v*.*.*` tag push then waits
   for a human approval before the publish step runs.
3. Optionally restrict the environment to tags: under Deployment branches
   and tags, limit to protected tags matching `v*.*.*`.
4. If available on the plan, add tag protection for `v*` (Settings → Tag
   protection, or a ruleset targeting `v*.*.*`) so tags cannot be moved or
   deleted by accident. If tag protection is unavailable, skip — the
   required-reviewer gate in step 2 is the binding control.

## 5. Routine release — bump, tag, approve (owner)

1. In a PR, bump `"version"` in `apps/cli/package.json` (semver; CLI-only
   changes bump patch/minor, never rewrite a published version) and add the
   matching section to root `CHANGELOG.md`. Merge to `main` via the normal
   CI (`ci.yml`).
2. From a clean `main`, tag and push (exact convention, no prefix variants):
   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
   Pushing the tag (or manually dispatching the workflow with `dry_run`
   from a `v*.*.*` tag) starts the `release` workflow: full checks
   (install, lint, typecheck, test, `build:registry --check`, build), the
   version guard (`scripts/check-release-version.mjs`: tag must equal the
   `apps/cli` version and the package must not be `private`), pack-smoke,
   then SECRET-FREE `npm publish <tarball> --provenance --access public`
   via OIDC (registry configured with `npm config set registry`, never via
   setup-node `registry-url`), then a GitHub Release with auto-generated
   notes (`gh release create --generate-notes`).
3. **Approve the pending `npm-publish` environment** in the Actions run
   (required reviewers from §4). The run publishes with provenance and
   creates the GitHub Release from the tag.
4. Verify as in §1 step 9 (`npm view framebits version dist-tags` and
   `npx -y framebits@X.Y.Z --version` from a clean temp dir).

## 6. Rollback — deprecate first, unpublish almost never

- **Deprecate (preferred, always available):**
  ```sh
  npm deprecate framebits@<ver> "<reason>"
  ```
  Keeps installs working while steering users away. The tag stays; the fix
  goes out as a new version.
- **Unpublish (last resort):** `npm unpublish framebits@<ver>` is possible
  only within **72 hours** of publishing (and only while the version has
  seen very few downloads) — after that npm refuses and support must
  intervene. It breaks anyone depending on that version, so prefer
  `deprecate`. Never reuse a version number afterwards.
- **Cut off the pipeline:** if credentials or the workflow are suspect,
  remove the trusted publisher on npmjs.com (package Settings → Trusted
  Publisher → Remove) and revoke the `npm-publish` environment approvals on
  GitHub before investigating. Re-add per §2–§4 when clean.

## 7. Troubleshooting

Read the failing `release` run top-down: checks → version guard →
pack-smoke → publish → GitHub Release. The step name tells you which row
below applies. Re-run with `dry_run` from the same tag to reproduce safely
(publishes nothing, creates no release).

| Symptom                                          | Likely cause                                                                                                                                              | Fix                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENEEDAUTH` / `403` at `npm publish`             | Trusted-publisher mismatch: owner, repository, workflow filename, or environment differs in case/spelling from §2                                         | Re-enter the four values exactly (`otassh`, `framebits`, `release.yml`, `npm-publish`); bare filename, hyphenated env                                    |
| `ENEEDAUTH` / `404` at `npm publish`             | `NODE_AUTH_TOKEN` / `NPM_TOKEN` placeholder present (e.g. via setup-node `registry-url`) — npm sends the literal placeholder and the registry answers 404 | Remove every token env and `registry-url`; configure the registry with `npm config set registry https://registry.npmjs.org` only (as `release.yml` does) |
| `npm` too old error / OIDC exchange fails        | npm CLI `< 11.5.1` (the OIDC floor)                                                                                                                       | Upgrade: the workflow self-heals once (`npm install -g "npm@^11.5.1"`); locally run the same command                                                     |
| `id-token: write` / OIDC permission error        | Workflow job lost the `id-token: write` permission                                                                                                        | Restore `permissions: id-token: write` on the publish job; do not scope it away                                                                          |
| `::warning::Private repo: skipping --provenance` | Repo (or package visibility) is still private — npm issues provenance only for a public package in a public repo on a GitHub-hosted runner                | Expected until launch (see blocker above): OIDC publish still works, provenance is skipped. Make the repo public, then drop the fallback                 |
| Provenance / sigstore verification fails         | `repository.url` in `apps/cli/package.json` does not match the GitHub repo                                                                                | Keep `repository.url` as `git+https://github.com/otassh/framebits.git` (+ `directory: apps/cli`); never point it at a fork or placeholder                |
| Version guard fails: tag/version mismatch        | Tag is not exactly `vX.Y.Z` or differs from `apps/cli` `version`                                                                                          | Set the package version to the tag version (or retag); manual dry-runs must be dispatched from a `v*.*.*` tag, not a branch                              |
| Version guard fails: `private: true`             | Package still marked private                                                                                                                              | Remove `"private"` per §1 — only at launch, as an owner decision                                                                                         |
| `gh release create` fails / release missing      | Tag ref mismatch or `contents: write` missing                                                                                                             | Push the exact tag first; keep `permissions: contents: write` on the publish job                                                                         |

## After the first release

- Subsequent releases repeat §5 with the next version (semver; CLI-only
  changes bump patch/minor, never rewrite a published version).
- Never unpublish (possible only within 72 h and breaks installs); deprecate
  instead: `npm deprecate framebits@<ver> "<reason>"`.
- Re-lock the repo state if a release is ever yanked: the tag stays, the fix
  goes out as a new version.

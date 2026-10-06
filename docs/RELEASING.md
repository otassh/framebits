# RELEASING the `@framebits/cli` CLI — OWNER ONLY

> **Owner-only.** All steps below are performed by the repo owner.
> Routine releases are published by the `release` GitHub Actions workflow
> (`.github/workflows/release.yml`) via npm OIDC trusted publishing —
> no npm tokens anywhere. Only the one-time bootstrap publish (§1) is done
> by hand from the owner machine. Never publish from a feature branch, never
> from a fork. Since first-publish prep, `apps/cli/package.json` is **public**
> at version **`0.1.0`** (MIT, `publishConfig.access: "public"`) and is named
> **`@framebits/cli`**, so npm publishes it under the `framebits` organization.
> Never change it back to the accidental unscoped `framebits` package name.
>
> **Tag discipline:** `0.1.0` is published exactly once, by hand (§1). The
> `v0.1.0` tag must NEVER be pushed — npm refuses to publish the same version
> twice, so a CI run on that tag would fail at `npm publish`. The FIRST
> CI-driven release is **`0.1.1`** (tag `v0.1.1`, §5). There is no GitHub
> Release for 0.1.0 (its notes live in `CHANGELOG.md`); GitHub Releases
> start at 0.1.1.

Tag convention (reconciled): **`vX.Y.Z`** everywhere (e.g. `v0.1.1`).
The `release` workflow only runs on `v*.*.*` tags and the version guard
(`scripts/check-release-version.mjs`) requires the tag to equal
`apps/cli/package.json` `version` exactly. There is no `framebits-vX.Y.Z`
form — do not use it.

## Blockers before the FIRST publish (do not publish until all are resolved)

- License is **MIT**: root `LICENSE` file added and `"license": "MIT"` set in
  `apps/cli/package.json` (and every other workspace `package.json` for
  consistency). DONE since first-publish prep. The packed tarball ships the
  license via the `prepack` step (`apps/cli/scripts/copy-license.mjs` stages
  the root `LICENSE` into `apps/cli/LICENSE`, gitignored so the copy cannot
  drift; npm auto-includes `LICENSE` in the tarball despite `files: ["dist"]`).
- TODO(question): confirm the copyright holder name (`Copyright (c) 2026
otassh` in `LICENSE` — the login `otassh` is used because `gh api user`
  returned only the single-letter placeholder name "O", so "O" must not be
  used) and the `"author": "otassh"` value in `apps/cli/package.json`
  (plain name, no email — no public email exists in the repo).
- TODO(question): confirm the publish metadata added as placeholders:
  `"author": "otassh"` (name/org/email?), `repository`, `homepage`, `bugs`
  URLs (currently point at `github.com/otassh/framebits`), and `keywords`.
- TODO(question): confirm the starting version (DONE in first-publish prep:
  `apps/cli/package.json` is `"0.1.0"`, public; the bootstrap publishes
  exactly this version, and the first CI-driven release is `0.1.1`).
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

**Why 0.1.0 by hand, 0.1.1 via CI:** the hand publish below creates
`@framebits/cli@0.1.0` on the registry, and npm refuses to publish the same
version twice. Pushing tag `v0.1.0` afterwards would start a `release` run
that fails at `npm publish` — so NEVER push `v0.1.0`, and let the first
CI-driven release be `0.1.1` (§5).

### Local checklist (copy-paste, clean `main`, clean tree)

```sh
git status --porcelain               # must print nothing
pnpm install --frozen-lockfile
pnpm --filter @framebits/cli build
pnpm --filter @framebits/cli lint
pnpm --filter @framebits/cli typecheck
pnpm --filter @framebits/cli test
node apps/cli/scripts/pack-smoke.mjs
node scripts/check-release-version.mjs v0.1.0   # must print OK
```

All green required — do not proceed on red. `pack-smoke` fails if the packed
tarball ships anything outside `package.json`/`README`/`LICENSE`/`dist`, or
if `dist/cli.js` references `@framebits/*` at runtime. The guard passes only
for tag `v0.1.0` against the public `0.1.0` package (CI must never run it —
the tag is never pushed).

### Dry-run the publish (from `apps/cli`, shows the file list, uploads nothing)

```sh
cd apps/cli
npm publish --dry-run
```

This runs `prepublishOnly` (build + pack-smoke, no publish inside) and
`prepack` (stages the root `LICENSE`) first, exactly as the real publish
will. Confirm the file list is `package.json`, `README.md`, `LICENSE`,
`dist/cli.js` only, and that the log shows the copy-license line.
`--dry-run` never uploads. (The smoke strips the inherited
`npm_config_dry_run` for its inner `pnpm`/`npm` calls so it still performs
its real local pack + clean-room install; only the final upload is skipped.)

### Publish 0.1.0 from the owner machine

1. Choose/verify the name (do not rename an existing package):
   ```sh
   npm view @framebits/cli version dist-tags
   ```
   - If the name is free, `npm view` answers 404 (`E404`) — proceed.
   - If the name is **taken by another publisher, STOP**. Do not rename or
     publish a variant. Confirm `npm org ls framebits` shows the logged-in
     user as an organization owner before continuing.
2. Log in as the owner (2FA on): `npm login`, then verify with `npm whoami`.
3. Verify `apps/cli/package.json` (prepared by first-publish prep, already
   committed): `"version": "0.1.0"`, no `"private"` field,
   `"license": "MIT"`, `publishConfig` is `{ "access": "public" }` with NO
   `provenance` key — local publish with provenance fails outside CI; the
   workflow in §5 passes `--provenance` explicitly on its own command line.
   `prepublishOnly` is `npm run build && node scripts/pack-smoke.mjs`
   (tsup build + local smoke; neither calls publish, so no recursion under
   `npm publish`), and `prepack` is `node scripts/copy-license.mjs`.
4. Verify the `## [0.1.0]` entry in root `CHANGELOG.md`.
5. Run the local checklist and the dry-run above (both green required).
6. Publish 0.1.0 from the owner machine (2FA challenge in the terminal):
   ```sh
   cd apps/cli
   npm publish --access public
   ```
   (`publishConfig` already sets `access: public`; the flag restates it.
   No `--provenance` locally — provenance attestations come from the
   workflow in §5.)
7. Verify (clean temp dir, NOT the repo):
   ```sh
   npm view @framebits/cli version dist-tags
   npx -y @framebits/cli@0.1.0 --version
   ```
   If `npm view` is unreachable (network blocked), report NOT VERIFIED.
8. Do NOT tag, do NOT push any tag:
   ```sh
   # NEVER run these for 0.1.0 (republish refused; the workflow would fail):
   #   git tag v0.1.0
   #   git push origin v0.1.0
   git status --porcelain   # apps/cli/LICENSE must NOT appear (gitignored copy)
   ```

### Post-publish (still owner, before any CI release)

1. Connect npm → GitHub trusted publisher per §2 with exactly:
   owner `otassh`, repository `framebits`, workflow file `release.yml`,
   environment `npm-publish`.
2. Harden per §3: owner account 2FA on (already exercised above); NO tokens —
   do not create any Classic or Granular Access Token, add no
   `NODE_AUTH_TOKEN`/`NPM_TOKEN` anywhere, revoke any legacy automation token.
3. GitHub side per §4: create the `npm-publish` environment with required
   reviewers (the owner); optionally restrict deployment branches/tags to
   `v*.*.*` and add tag protection for `v*`.
4. Cut the first CI-driven release as **0.1.1** per §5 (bump version +
   changelog, merge, push tag `v0.1.1`, approve the `npm-publish` run).

## 2. Connect npm to GitHub — trusted publisher (owner, npmjs.com)

On npmjs.com, open the `@framebits/cli` package → **Settings → Trusted
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

> The first routine release after the §1 bootstrap MUST be **0.1.1**
> (never re-tag or re-push `v0.1.0`).

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
4. Verify as in §1 step 7 (`npm view @framebits/cli version dist-tags` and
   `npx -y @framebits/cli@X.Y.Z --version` from a clean temp dir).

## 6. Rollback — deprecate first, unpublish almost never

- **Deprecate (preferred, always available):**
  ```sh
  npm deprecate @framebits/cli@<ver> "<reason>"
  ```
  Keeps installs working while steering users away. The tag stays; the fix
  goes out as a new version.
- **Unpublish (last resort):** `npm unpublish @framebits/cli@<ver>` is possible
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
| `npm publish` refuses: version already published | Pushed tag `v0.1.0` after the hand publish, or reused any published version                                                                               | NEVER push `v0.1.0`; never reuse a version number — cut a new version per §5 (§6 for the fallout)                                                        |
| `gh release create` fails / release missing      | Tag ref mismatch or `contents: write` missing                                                                                                             | Push the exact tag first; keep `permissions: contents: write` on the publish job                                                                         |

## After the first release

- Subsequent releases repeat §5 with the next version (semver; CLI-only
  changes bump patch/minor, never rewrite a published version).
- Never unpublish (possible only within 72 h and breaks installs); deprecate
  instead: `npm deprecate @framebits/cli@<ver> "<reason>"`.
- Re-lock the repo state if a release is ever yanked: the tag stays, the fix
  goes out as a new version.

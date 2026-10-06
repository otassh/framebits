# RELEASING the `framebits` CLI — OWNER ONLY

> **Owner-only.** Publishing is done by the repo owner from `main`, never from
> a feature branch, never from a fork, never by CI automatically. The package
> is currently `private: true` at version `0.0.0` and **NOT published**.
> `npm publish` refuses while `private` is set — that is the guard against
> accidents. Keep it until the launch decision is made.

## Blockers before the FIRST publish (do not publish until all are resolved)

- TODO(question): **license is undecided** (MASTER_PROMPT §16 decision 5 —
  repo is private until launch, no LICENSE file yet). Choose a license, add a
  root `LICENSE` file, and set `"license": "<SPDX>"` in
  `apps/cli/package.json`. The field is intentionally absent right now;
  publishing an unlicensed package is not acceptable.
- TODO(question): confirm the publish metadata added as placeholders:
  `"author": "Framebits"` (name/org/email?), `repository`, `homepage`, `bugs`
  URLs (currently point at `github.com/otassh/framebits`), and `keywords`.
- TODO(question): confirm the starting version (`0.1.0` below) and the tag
  convention (`framebits-vX.Y.Z` below).
- TODO(question): confirm the production domain/registry URL if it changes
  any user-facing text (currently a placeholder, see
  `packages/shared/src/site.ts`).

## Preconditions

- On `main`, clean tree: `git status --porcelain` prints nothing.
- `pnpm install --frozen-lockfile` succeeds.
- You are logged in to npm as the owner with publish rights for `framebits`:
  `npm whoami`. If the name is taken, the release stops here (name claim is
  an owner decision, not part of this guide).
- Network access to `registry.npmjs.org` (provenance needs it). If the
  network is blocked, stop and report NOT VERIFIED — do not work around it.

## Steps (exact)

1. Bump the version, open the package, add the license (all in
   `apps/cli/package.json`):
   - `"version": "0.0.0"` → `"0.1.0"` (first public release).
   - Delete the `"private": true` line.
   - Add `"license": "<SPDX-from-decision-above>"` (e.g. `"MIT"` — only if
     that is the decided license).
2. Add a changelog entry: create `apps/cli/CHANGELOG.md` (if absent) with a
   `## 0.1.0` section listing what ships. Keep `.env.example` current if any
   new env var is introduced (none expected for a CLI-only release).
3. Verify publishability (from the repo root, must all be green):
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
4. Dry-run the publish (from `apps/cli`, shows the file list, uploads
   nothing):
   ```sh
   cd apps/cli
   npm publish --dry-run
   ```
   Confirm the file list is `package.json`, `README.md`, `dist/cli.js` only.
5. Publish with provenance (from `apps/cli`):
   ```sh
   npm publish --provenance --access public
   ```
   `publishConfig` already sets `access: public` and `provenance: true`; the
   flags make it explicit. Do not publish without `--provenance`.
6. Tag and push:
   ```sh
   git add apps/cli/package.json apps/cli/CHANGELOG.md
   git commit -m "chore(cli): release framebits v0.1.0"
   git tag framebits-v0.1.0
   git push origin main
   git push origin framebits-v0.1.0
   ```
   Then create the GitHub Release from that tag with the changelog section.
7. Verify the release (clean temp dir, NOT the repo):
   ```sh
   npm view framebits version dist-tags
   npx -y framebits@0.1.0 --version
   ```
   If `npm view` is unreachable (network blocked), report NOT VERIFIED.

## After the first release

- Subsequent releases repeat these steps with the next version (semver;
  CLI-only changes bump patch/minor, never rewrite a published version).
- Never unpublish (possible only within 72 h and breaks installs); deprecate
  instead: `npm deprecate framebits@<ver> "<reason>"`.
- Re-lock the repo state if a release is ever yanked: the tag stays, the fix
  goes out as a new version.

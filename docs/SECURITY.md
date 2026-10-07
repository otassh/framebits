# Registry trust model (`framebits`)

> See also: `docs/CLI.md` (Security model section) for the CLI-side enforcement
> summary. This file is the precise threat model.

## What is protected

- **Corruption in transit or on disk** is detected: every registry item carries
  a `hash` (`sha256:<hex>` over the canonical JSON of `{ type, dependencies,
registryDependencies, files, tailwind, cssVars }`). The CLI recomputes it
  with the same `computeItemHash` implementation from `packages/shared` before
  writing anything. Mismatch aborts with exit code 4 and writes nothing.
- **Unknown packages** are blocked: every `dependencies` key must be in the
  allowlist (`packages/shared/src/allowed-dependencies.ts`: `motion`,
  `framer-motion`, `gsap`, `three`, `@react-three/fiber`, `@react-three/drei`,
  `ogl`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`).
  Unknown keys fail the builder (`MetaSchema`) and the CLI (`verifyItem` +
  `assertInstallable`, exit 4). Human review of registry PRs remains the
  upstream control.
- **Dependency spec confusion** is blocked: ranges must be bounded semver
  (`SemverRangeSchema` in `packages/shared/src/semver.ts`). Bare `*`, `x`,
  `latest` (and any dist-tag), empty/whitespace-only strings, `git:`/`github:`/
  `git+https:` specs, `http(s)://` URLs, `file:`/`link:`/`portal:` paths,
  `workspace:` ranges, and `npm:` aliases are all rejected — `semver.validRange`
  returns `null` for them (first refine), and unbounded ranges (`>=1`,
  `>=0.0.0`, `>0`, open `||` branches) are rejected by the boundedness check
  (every `||` branch must contain `<`, `<=`, or an exact pin). Verified by
  `semver.test.ts`, `meta.test.ts`, `command.test.ts`, and `verify.test.ts`.
- **Code execution from registry content is impossible by construction**:
  registry items are data only. The CLI only writes files and merges CSS
  marker blocks; it never `eval`s, imports, or spawns registry content.
  Package installs run via `cross-spawn` with `program` + `args[]` only (no
  `shell: true`, no string concatenation) — see
  `apps/cli/src/install/run.ts` and `apps/cli/src/install/command.ts`.
- **Path traversal** is blocked twice: `RelativePathSchema` (relative, POSIX,
  no `..`, no drive letters, no NUL) plus plan-time prefix mapping and
  write-time realpath containment with symlink refusal.

Current registry ranges are all bounded (verified 2026-10-06): `motion`
`^14.0.0`, `clsx` `^2.0.0`, `tailwind-merge` `^3.0.0`.

## What is NOT protected

- **A compromised host rewriting item + hash together.** The hash lives in the
  same JSON it verifies, so a host (or MITM with a trusted cert) that rewrites
  both the content and the hash is undetectable by the CLI. The hash catches
  corruption, not malice.
- **A malicious new version of an allowed package within the accepted range.**
  `motion@^14.0.0` permits any `14.x` release the package manager resolves.
  If `motion@14.9.9` were malicious, the allowlist and the hash would not stop
  the install — the package manager trusts the npm registry. Pinning exact
  versions per item would narrow but not remove this (the tarball itself is
  still trusted).
- **A compromised builder or registry signing key** (for any future signing
  scheme below) — key management and rotation are out of scope here.

## Trust-anchor options (proposal, not implemented)

No crypto dependencies were added and no signing is implemented in this
change. The following options are for the owner to choose from.

<!-- TODO(question): owner to pick a trust-anchor option (recommendation: Option A, signed index.json). Open sub-questions: who holds the signing key, where is the public key shipped (bundled in CLI vs fetched), rotation/revocation story, and whether `--insecure` opt-in is acceptable for local dev. -->

### Option A — Signed `index.json` via `node:crypto` ed25519 (recommended)

- How: builder signs the canonical bytes of `index.json` (which already binds
  every item hash) with an ed25519 private key using only `node:crypto`
  (no new dependency). CLI verifies with a bundled public key before trusting
  any item; failure is exit 4.
- Pros: offline-verifiable; one signature covers the whole registry; stdlib
  only; key rotation via CLI release.
- Cons: needs key custody + rotation runbook; versioned-archive (`<slug>@<version>.json`)
  verification story must be defined (sign each archive or chain to the index).

### Option B — Lock hashes pinned in the CLI release (+ `--insecure` opt-in)

- How: ship a snapshot of known-good `{ slug, version, hash }` with each CLI
  release; installing an item whose hash is not in the snapshot warns or fails
  unless `--insecure` (or `--allow-unpinned`) is passed.
- Pros: no crypto at all; trivial to implement; makes compromise visible
  (new/changed items require a CLI release or explicit opt-in).
- Cons: friction for every registry update (CLI release per component change
  or a separate versioned pin file); `--insecure` will be abused in scripts;
  does not scale to many items.

### Option C — Registry as an npm package or GitHub Release asset + out-of-band compare

- How: publish the builder output as a versioned npm package
  (e.g. `@framebits/registry`) or attach it to a GitHub Release; the CLI
  resolves a pinned registry version and compares hashes against the
  downloaded tarball/asset (npm's own integrity + Sigstore provenance apply).
- Pros: reuses npm/GitHub integrity infrastructure; version pinning is natural.
- Cons: ties registry updates to npm publish/release cadence; CLI needs a
  resolver for registry versions; still trusts npm/GitHub as the anchor.

**Recommendation:** Option A. It is the only option that makes a compromised
host detectable without freezing the registry update cadence, and it needs no
new runtime dependency (`node:crypto` is stdlib). Options B/C are documented
as fallbacks if key management is deemed too heavy.

## Web frontend trust notes (`apps/web`)

- `VITE_REGISTRY_URL` is a build-time trust decision (baked into the static
  bundle): same-origin `/r` by default, otherwise `https://` only.
  `http://` is accepted only for `localhost`/`127.0.0.1`/`::1`;
  `javascript:`/`data:`, credentials in the URL, whitespace/backslashes, and
  `//host` paths are rejected. Failures redact userinfo (`redactUrl`); error
  UI never echoes secrets.
- Every item loaded via `loadItem` is hash-verified in the browser (WebCrypto
  SHA-256 over the same canonical form as shared `computeItemHash`, including
  the legacy pre-`schemaVersion` payload and the 1 MiB/file + 5 MiB/total
  fail-closed caps) before rendering. Mismatch renders nothing (integrity
  error). The shared `verifyItemHash` itself is not imported because
  `packages/shared/src/hash.ts` pulls in `node:crypto`/`Buffer`, which cannot
  ship in the SPA bundle — parity is pinned by `registry.test.ts`.
- Payloads are capped at 2 MB (`MAX_JSON_BYTES`: `content-length` header plus
  streamed-byte and decoded-text length checks before `JSON.parse`) with a
  10 s per-request timeout (`AbortSignal.timeout`).
- Registry content renders only as React text nodes (never `innerHTML`);
  files over 500 KB render truncated with a "use the CLI" notice and are
  never fully mounted in the DOM nor copied to the clipboard.
- Static hardening: `Content-Security-Policy` is served as an nginx header
  (`apps/web/nginx.conf`) plus a `<meta http-equiv>` fallback in
  `apps/web/index.html`; the outer Caddy layer sends the same policy.

## Deploy trust notes

- TLS is terminated by Caddy with automatic HTTPS; `upgrade-insecure-requests`
  is part of the CSP. `TRUSTED_PROXY_COUNT=1` direct on the VPS (Caddy ->
  api, one hop); set `TRUSTED_PROXY_COUNT=2` when a CDN (e.g. Cloudflare) sits
  in front of Caddy (client -> CDN -> Caddy -> api). Never trust more hops
  than the deployment actually has. Caddy sends an explicit
  `X-Forwarded-For` and trusts only private ranges (`trusted_proxies static
  private_ranges`).
- Access logs contain client IPs + Referer/User-Agent: retain via Docker log
  rotation only (`deploy/README.md`), never ship or store elsewhere. The DB
  stores no raw IPs, emails, or user agents.
- `deploy.sh` is fail-closed (`git rev-parse --verify`, `flock` single-deploy
  guard, `REQUIRE_API=1` by default with `--allow-degraded` bypass) and never
  deletes the live release (prune excludes the `readlink` target, newest-first
  via `find -printf` mtime sort). `rollback.sh` is code-only: the DB is
  forward-only and migrations are never rolled back.
- `backup.sh` creates dumps with `umask 077` + `chmod 600`, removes partial
  dumps on failure (`trap`), and copies offsite only with `scp -o
  BatchMode=yes -o StrictHostKeyChecking=yes -i <key>` (or `rclone`).
- CI deploy (`deploy.yml`) pins host keys via `VPS_KNOWN_HOSTS`
  (`StrictHostKeyChecking=yes`); without the secret it falls back to
  `accept-new` with a warning.
  <!-- TODO(question): owner to add VPS_KNOWN_HOSTS secret and confirm whether the accept-new fallback should be removed entirely once pinned. -->

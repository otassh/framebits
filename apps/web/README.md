# @framebits/web

The production Framebits frontend. It is a static React + Vite application
that reads the builder's validated registry JSON; it does not contain mock
components, invented statistics, or duplicated registry data.

Component previews render the **real live demos** (`registry/.../demo.tsx`)
bundled at site-build time via `import.meta.glob` (see
`src/lib/live-demos.tsx`), each as its own lazily-loaded chunk. The generated
WebP (`previews.image`) remains as the loading poster and error fallback, so a
broken demo degrades to a static image instead of breaking the catalog.

## Commands

```sh
pnpm --filter @framebits/web dev
pnpm --filter @framebits/web build
pnpm --filter @framebits/web preview
pnpm --filter @framebits/web lint
pnpm --filter @framebits/web typecheck
pnpm --filter @framebits/web test
```

`predev` and `prebuild` generate the real registry into the ignored
`.registry/` directory. Vite uses that directory as `publicDir`, so the
production output contains `/r/index.json`, `/r/<slug>.json`, search data,
schemas, and the build manifest from the same source as the CLI.

Set `VITE_REGISTRY_URL` only when the registry is hosted separately. The
default is the same-origin `/r` path used in production.

## Security note

- `VITE_REGISTRY_URL` is a **build-time trust decision**: it is baked into the
  static bundle. Production must use the same-origin `/r` default or an
  explicit `https://` URL. `http://` is accepted only for
  `localhost`/`127.0.0.1`/`::1` development; `javascript:`/`data:` URLs,
  credentials in the URL, and cross-scheme redirects are rejected. Error UI
  never echoes credentials (see `redactUrl` in `src/lib/registry.ts`).
- Every `loadItem` response is hash-verified in the browser (WebCrypto
  SHA-256 over the same canonical form as shared `computeItemHash`, including
  the legacy pre-`schemaVersion` payload) before rendering. Mismatch aborts
  with an integrity error and renders nothing.
- Registry JSON payloads are capped at 2 MB (`MAX_JSON_BYTES`: `content-length`
  header plus streamed byte and decoded-text length checks before
  `JSON.parse`) with a 10 s per-request timeout (`AbortSignal.timeout`).
- Code previews render only as React text nodes (never `innerHTML`); files
  over 500 KB (`MAX_RENDER_CHARS`, mirroring shared `MAX_FILE_CONTENT_CHARS`)
  render truncated with a "use the CLI" notice and are never fully mounted in
  the DOM nor copied to the clipboard.
- The build manifest hash (`build-manifest.json`) is intentional: it binds
  the exact registry snapshot the site was built against. A manifest/content
  mismatch means the deployment — not the browser — must be re-built.
- Live demos execute reviewed in-repo `registry/` sources only (the same
  sources the builder validates and screenshots; no remote code is ever
  loaded). Demos import the `@/lib|@/hooks|@/components/ui` aliases, which
  `vite.config.ts` derives from the registry tree itself, plus bare
  third-party deps rewritten to their ESM-resolved files. A demo whose
  dependency is missing fails the build with the exact `pnpm add` hint —
  that dependency must already be on the shared allowlist.
  `vite dev` serves the sibling `registry/` dir via `server.fs.allow`.

## Dependency justification

- `react` and `react-dom`: the approved UI runtime, pinned to the same versions
  as `packages/registry-env`.
- `motion`: purposeful route, reveal, hover, and ambient animations with
  reduced-motion support; already on the registry dependency allowlist.
- `lucide-react`: accessible SVG interface icons; already on the allowlist.
- `clsx` + `tailwind-merge`: runtime of the shared `cn` lib helper that live
  demos import via `@/lib/cn`; pinned to the `registry-env` versions.
- `three` + `@react-three/fiber`: runtime of the 3D component demos. They
  ship only inside the lazily-loaded 3D demo chunk (the main bundle is
  unaffected); pinned to the `registry-env` versions.
- `zod`: validates every downloaded registry payload through schemas owned by
  `packages/shared`; already used across the workspace.
- `vite`: static application bundler and development server. It already exists
  in the lockfile through Vitest; declaring it directly makes the web build
  explicit and reproducible. No framework router or state library is added.

# @framebits/web

The production Framebits frontend. It is a static React + Vite application
that reads the builder's validated registry JSON; it does not contain mock
components, invented statistics, or duplicated registry data.

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

## Dependency justification

- `react` and `react-dom`: the approved UI runtime, pinned to the same versions
  as `packages/registry-env`.
- `motion`: purposeful route, reveal, hover, and ambient animations with
  reduced-motion support; already on the registry dependency allowlist.
- `lucide-react`: accessible SVG interface icons; already on the allowlist.
- `zod`: validates every downloaded registry payload through schemas owned by
  `packages/shared`; already used across the workspace.
- `vite`: static application bundler and development server. It already exists
  in the lockfile through Vitest; declaring it directly makes the web build
  explicit and reproducible. No framework router or state library is added.

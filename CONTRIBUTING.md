# Contributing

## Checks

Run from the repo root:

- `pnpm i`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Commits

Use conventional commits (e.g. `feat:`, `fix:`, `chore:`). One task = one commit/PR.

## Registry

Never edit files in `registry/components/**` by hand — use the generator (`pnpm new-component`).

## Add a component

Generate the scaffold (never create the folder by hand):

```sh
pnpm new-component <slug> --category=<category> [--title="..."] [--description="..."] [--type=component|lib|hook]
```

- `<slug>`: kebab-case, 2–64 chars, unique across the whole registry (components, lib, hooks).
- `--category`: required for components (valid: `text-animations`, `backgrounds`, `cursors`,
  `buttons`, `scroll`, `3d`, `layout`, `utilities`); defaults to `utilities` for lib/hook.
- New components start as `status: "draft"` with today's date, an empty tag list, and a
  placeholder description you must replace (10–200 chars).
- Component sources must be SSR-safe (no `window`/`document` at module scope or during
  render) and honor reduced motion (`useReducedMotion` from `motion/react`).
- Only allowlisted npm dependencies may be declared (see `packages/shared`).
- The generator never overwrites: an existing folder is an error, not a merge.

PR checklist:

- [ ] Scaffold created only via `pnpm new-component` (no hand-made folders).
- [ ] Placeholder description replaced; tags added where useful.
- [ ] `pnpm build:registry --check` passes (registry validation).
- [ ] Checks green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

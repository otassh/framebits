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
- [ ] Reviewer read the full source of every new/changed component file (the security
  scan is a mistake-guard, not a boundary).

## Releasing

Releasing is owner-only, see [`docs/RELEASING.md`](docs/RELEASING.md).

## Versions and the lock

- `registry/registry.lock.json` maps slug → `{ version, hash }`. Never edit it by hand.
- After changing a component, run `pnpm build:registry --write-lock` and commit the
  lock with your PR. New slugs start at `1.0.0`; changed content bumps patch unless
  you pass `--bump <slug>=minor|major`.
- Never delete a component: set `status: "deprecated"` instead (stats must survive).
- [ ] Checks green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## CLI (`framebits`, Task 5a + 5b)

- `apps/cli` bundles to a single `dist/cli.js` with tsup (ESM, Node 20, shebang,
  no sourcemap). All deps are devDependencies and bundled, except `cross-spawn`
  (the single runtime dependency: its dynamic `require("child_process")` cannot
  be bundled to ESM). Never add another runtime dependency without justification
  (approved set: `commander`, `@clack/prompts`, `picocolors`, `jsonc-parser`,
  `cross-spawn`).
- All printing goes through `src/ui/output.ts` (no `console`). Respect
  `NO_COLOR`/non-TTY. `--debug` for stacks.
- `init` never modifies `tsconfig` or any file besides `framebits.json`.
- Component styles: declare `tailwind` keyframes/animation and `cssVars` in
  `styles.json` (validated by `ComponentStylesSchema`). Allowed: kebab-case
  names, `from`/`to`/percentage selectors, plain property/value declarations —
  no `url()`, no at-rules, no inline comments tricks (see `docs/CLI.md` safety
  rules; violations fail the build/CLI with exit 4).
- `add` writes files, patches CSS markers, installs deps, updates config — in
  that order, atomically with rollback. After `add`, manual output appears
  only for skipped steps.

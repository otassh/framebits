# CLI (`algorithco-ui`)

Task 5a: packaging, detection, config, `init`, `add` file pipeline. Out of
scope for 5a: npm dependency installation, Tailwind keyframes/cssVars merging
(Task 5b), telemetry, `list`/`search`/`diff`/`update` (Task 9).

## Commands

### `init [--yes] [--cwd <dir>] [--registry <url>]`

Detects the project and writes `algorithco-ui.json` (2-space indent, LF,
trailing newline, atomic temp+rename). Idempotent: re-running preserves
`installed` and unrelated fields; with an existing config, interactive init
asks before changing values, `--yes` keeps existing values and fills missing
ones. `init` installs nothing and never modifies `tsconfig` or any project
file besides the CLI config.

Detection:

- `package.json` missing → exit 2 ("run inside the app directory; monorepo
  roots are not supported").
- `tsconfig.json` missing → exit 2 (components are TypeScript-only).
- Package manager: `packageManager` field, then `pnpm-lock.yaml` /
  `yarn.lock` / `package-lock.json` / `bun.lockb`/`bun.lock`, else `npm`.
- Framework: `next` (with `app` vs `pages` router from `app/`/`src/app/` vs
  `pages/`/`src/pages/`), `vite`, `remix`, `other`.
- Tailwind: installed major from `node_modules/tailwindcss/package.json`,
  else the declared range; v4 if the CSS entry contains
  `@import "tailwindcss"`, v3 if a `tailwind.config.*` exists. CSS entry from
  common locations plus a content scan for `@tailwind base` /
  `@import "tailwindcss"`. Missing Tailwind → warn, continue.
- Aliases from `tsconfig.json`/`jsconfig.json` (JSONC): follows `extends`
  (relative only, depth ≤ 5), honors `baseUrl` + wildcard `paths`, falls back
  to `references` (Vite `tsconfig.app.json`). `@/*` → `./src/*` or `./*`
  gives `components: "@/components/ui"`, `lib: "@/lib"`, `hooks: "@/hooks"`;
  custom bases (e.g. `~/*`) give `~/components/ui`, `~/lib`, `~/hooks`. No
  usable alias → exit 2 with a `tsconfig.json` `paths` snippet (plus a Vite
  `resolve.alias` snippet when Vite is detected).

### `add <slug...> [--overwrite] [--dry-run] [--yes] [--cwd <dir>] [--registry <url>] [--debug]`

`add` before `init` → exit 2 ("run `algorithco-ui init` first"). Slug args
(`slug` or `slug@1.2.3`) are validated before any request. Exactly one network
fetch per item.

1. Resolve the registry URL (flag > env > config > default; must be `https`,
   except `http://localhost`, `127.0.0.1`, `[::1]`).
2. Fetch each explicit slug (`<registry>/<slug>.json`, or
   `<slug>@<version>.json` when pinned; dependencies always resolve latest),
   verify (schemaVersion, slug/version match, hash, allowlist, ≤ 50 files),
   resolve `registryDependencies` recursively (de-duplicated, cycle-safe with
   the full path, deterministic topological order, ≤ 100 items).
3. Plan-then-apply: build the COMPLETE plan before writing anything.
   `--dry-run` prints the plan and manual steps and writes nothing (exit 0,
   conflicts listed, exit 0).
4. Conflicts: `--overwrite` replaces all; interactive prompts per file
   (overwrite / skip / abort, skips warn "may be incomplete"); non-interactive
   without `--overwrite` fails BEFORE any write (exit 1) listing every file.
   `--yes` does NOT imply `--overwrite`.
5. Rewrite `@/lib/`, `@/hooks/`, `@/components/ui/` prefixes to the
   configured aliases (statement-anchored, multi-line safe; comments/strings/
   JSX text untouched; leftovers warn with line numbers). Output is LF.
6. Apply atomically (temp file + rename, dirs created as needed, journal +
   rollback, symlink/escape refusal, config `installed` update last).
7. Print manual steps (5a; automated in 5b).

## Target mapping

`files[].path` → project file:

- `components/ui/...` → `<aliases.components>/...`
- `lib/...` → `<aliases.lib>/...`
- `hooks/...` → `<aliases.hooks>/...`
- Any other prefix → exit 4. Two items targeting the same path → exit 4.

Per file: `create` (absent), `unchanged` (bytes equal after LF
normalization), `conflict` (exists and differs, or case-collision). Items
recorded in `installed` with the same hash and all files unchanged report
`already installed`.

## Exit codes

`0` success · `1` failure/conflict · `2` usage/config/project-detection ·
`3` network (offline/DNS/timeout/429, each with a distinct message) ·
`4` integrity/security (hash mismatch, disallowed dependency, unsafe path,
bad schema, redirect to non-https, cycle).

`--debug` prints stacks; otherwise one line plus `Hint:`. Interactive iff
`stdin.isTTY && stdout.isTTY && !CI && !--yes`. `NO_COLOR` and piped output
disable color/spinners.

## Security model (honest)

Registry content is data, never executed. Every item is schema-validated and
hash-verified before anything touches disk (mismatch → exit 4, nothing
written). The hash lives in the same JSON it verifies, so it only detects
corruption, not malice: the real defense against a compromised registry is
the dependency allowlist (every `dependencies` key must be in shared's
`ALLOWED_DEPENDENCIES`, else exit 4 — "not on this CLI's allowlist; update
the CLI or report the registry"). Paths are schema-constrained (relative,
POSIX, no `..`) and re-checked at plan time (unknown prefixes, duplicate
targets → exit 4) and at write time (realpath containment, symlink refusal).
Size limits (2 MB responses, 50 files/item, 100 items/closure) bound abuse.
Human review of registry PRs remains the upstream control.

## Rewriting rules

Shipped files use `@/lib/`, `@/hooks/`, `@/components/ui/`. Only when the
configured alias differs is a specifier rewritten, and only in
`import ... from "..."`, `export ... from "..."`, side-effect
`import "..."`, `import type`, or dynamic `import("...")` positions
(multi-line included). A bare `@/lib` (no trailing path) maps to the bare
configured alias. Anything else — comments, plain strings, JSX text — is left
byte-identical. After rewriting, remaining shipped-alias occurrences are
reported with line numbers (warning, not failure).

# Builder — registry validation pipeline (Task 4a)

> Task 4a covers discovery, validation, import analysis, security scan, and hashing,
> exposed as an in-memory model. No emit, no lock handling, no type-check yet
> (those are Task 4b). Entry point for humans: `pnpm build:registry --check`;
> entry point for code: `loadRegistry({ registryRoot })` in
> `packages/builder/src/registry/index.ts`.

## Pipeline stages

1. **Discover** (`registry/discover.ts`): walk the registry root for directories
   containing `meta.json`. Never follows symlinks (`SYMLINK_NOT_ALLOWED`).
   Files over 200 KB (`FILE_TOO_LARGE`), undecodable UTF-8 (`ENCODING_INVALID`),
   and NUL bytes (`NUL_BYTE`) are reported; their content is excluded downstream.
   A missing root is a valid empty registry.
2. **Parse** (`registry/validate.ts`): `meta.json` → `MetaSchema` (`META_INVALID`);
   `styles.json` → `ComponentStylesSchema` (`STYLES_INVALID`). Drafts are fully
   validated but excluded from the output model.
3. **Layout** (`registry/validate.ts`, decision D4): folder == slug
   (`SLUG_FOLDER_MISMATCH`); parent == category for components
   (`CATEGORY_FOLDER_MISMATCH`); `meta.type` matches the location
   (`LAYOUT_INVALID`); required files present (`MISSING_SOURCE`, `MISSING_DEMO`
   for components); anything else is `UNEXPECTED_FILE`. Component dirs accept
   `<slug>.tsx`, `demo.tsx`, `meta.json`, `<slug>.css`, `styles.json`. Lib/hook
   dirs accept `<slug>.ts`, `meta.json` only.
4. **Cross-item** (`registry/validate.ts`): unique slugs (`DUPLICATE_SLUG`);
   no missing/draft registry dependencies (`REGISTRY_DEP_MISSING`,
   `REGISTRY_DEP_DRAFT`); no cycles, reported with the full path
   (`REGISTRY_DEP_CYCLE`, e.g. `a -> b -> c -> a`).
5. **Imports** (`registry/imports.ts`, decision D6): TypeScript compiler API,
   parse only — sources are read as text and never executed or imported (no
   `import()`, no `require()`, no `eval()` of registry code anywhere in the
   builder; verify with `grep -rn "import(" packages/builder/src/registry/`).
   Rules: undeclared packages (`IMPORT_UNDECLARED_PACKAGE`), declared-but-unused
   (`DEP_UNUSED`, warning), Node builtins (`IMPORT_NODE_BUILTIN`), URL/data
   imports (`IMPORT_URL_FORBIDDEN`), alias targets missing/wrong-type
   (`IMPORT_ALIAS_TARGET_MISSING`) or unlisted (`IMPORT_ALIAS_NOT_DECLARED`),
   unknown `@/` scopes (`IMPORT_UNKNOWN_ALIAS`), escaping relatives
   (`IMPORT_RELATIVE_FORBIDDEN`), non-literal dynamic imports
   (`IMPORT_DYNAMIC_NONLITERAL`), any `require` (`IMPORT_REQUIRE_FORBIDDEN`),
   syntax errors (`PARSE_ERROR`), demo without default export
   (`DEMO_NO_DEFAULT_EXPORT`). Unused registry deps warn
   (`REGISTRY_DEP_UNUSED`). Peers (`react`, `react-dom` + subpaths) are implicit.
6. **Security** (`registry/security.ts`, decision D7): AST scan — `eval`/`new Function`/
   bare `Function()` calls, `window.eval`/`globalThis.eval`, string-arg `setTimeout`/
   `setInterval` (`SECURITY_EVAL`); `document.cookie` (`SECURITY_COOKIE`); `fetch`
   (incl. `window.`/`globalThis.`/`self.` prefixes and `const f = fetch` aliases),
   `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `importScripts`,
   `new Worker` (`SECURITY_NETWORK`); `dangerouslySetInnerHTML`
   (`SECURITY_INNER_HTML`, warning); `localStorage`/`sessionStorage`/`indexedDB`
   (`SECURITY_STORAGE`, warning). Errors have no escape hatch. This scan is a guard
   against mistakes, NOT a security boundary — human review of every component PR
   is the control.
7. **Model** (`registry/model.ts`, decisions D8/D9): per non-draft, error-free item —
   `{ meta, files[] (POSIX target path, normalized content, type, variant "ts-tw"),
   dependencies, registryDependencies, tailwind?, cssVars?, hash }`.
   `files[].type` always equals the item type (a css file belongs to a component
   item; the RegistryItem enum expresses exactly this). Content is source text
   through shared `normalizeContent` only — imports are never rewritten here.
   `hash` is shared `computeItemHash` (which takes no version, so no placeholder
   is needed). Sorted by slug; `loadRegistry` returns `{ items, diagnostics,
   summary }` (`summary` is an additive rollup: discovered/modeled counts plus
   by-type/by-status over all parsed metas).
8. **Preview assets** (`registry/previews.ts`, Task 13): every non-draft component
    has a hash-keyed cache entry at `registry/previews/<slug>@<hash>.webp`.
    `--generate-previews` materializes validated model files and trusted demos in
    a temporary Vite/Tailwind host, captures them with Playwright Chromium, then
    deletes the host. Normal builds only validate/copy committed image bytes to
    `r/previews/<slug>.webp`. Catalog and home cards render these static images
    and execute no registry code; live execution happens only inside the
    sandboxed preview iframe on the component detail page, built at site-build
    time from the same validated in-repo `registry/` tree (see
    `docs/MASTER_PROMPT.md` §16.13 and `docs/SECURITY.md`).

All diagnostics are collected (never stop at the first) and sorted by
(file, line, column, code). Diagnostic paths are POSIX, relative to the registry
root. Shipped target paths: component tsx → `components/ui/<slug>.tsx`, css →
`components/ui/<slug>.css`; lib → `lib/<slug>.ts`; hook → `hooks/<slug>.ts`.
`demo.tsx` and `styles.json` are never shipped as files.

## Diagnostic codes

| Code | Severity | Meaning |
|---|---|---|
| META_INVALID | error | meta.json unreadable or failing MetaSchema |
| STYLES_INVALID | error | styles.json unreadable or failing ComponentStylesSchema |
| DUPLICATE_SLUG | error | slug defined in more than one directory |
| SLUG_FOLDER_MISMATCH | error | folder name != slug |
| CATEGORY_FOLDER_MISMATCH | error | parent folder != category (components) |
| LAYOUT_INVALID | error | wrong location for the type, or misplaced item dir |
| MISSING_SOURCE | error | required `<slug>.tsx` / `<slug>.ts` absent |
| MISSING_DEMO | error | component without `demo.tsx` |
| UNEXPECTED_FILE | error | file outside the D4 table |
| SYMLINK_NOT_ALLOWED | error | symlink entry (never followed) |
| FILE_TOO_LARGE | error | file over 200 KB |
| ENCODING_INVALID | error | not valid UTF-8 |
| NUL_BYTE | error | NUL byte in file |
| PARSE_ERROR | error | TypeScript syntax error |
| IMPORT_UNDECLARED_PACKAGE | error | package not in meta.dependencies |
| IMPORT_NODE_BUILTIN | error | Node builtin import |
| IMPORT_URL_FORBIDDEN | error | URL/data: import |
| IMPORT_ALIAS_TARGET_MISSING | error | alias target missing or wrong type |
| IMPORT_ALIAS_NOT_DECLARED | error | alias target not in registryDependencies |
| IMPORT_UNKNOWN_ALIAS | error | unknown `@/` scope |
| IMPORT_RELATIVE_FORBIDDEN | error | relative import outside own files |
| IMPORT_DYNAMIC_NONLITERAL | error | dynamic import() with non-literal argument |
| IMPORT_REQUIRE_FORBIDDEN | error | any `require()` call |
| DEMO_NO_DEFAULT_EXPORT | error | demo.tsx without a default export |
| REGISTRY_DEP_MISSING | error | registryDependency slug does not exist |
| REGISTRY_DEP_DRAFT | error | published/deprecated item depends on a draft |
| REGISTRY_DEP_CYCLE | error | dependency cycle (`a -> b -> c -> a`) |
| TYPECHECK_ERROR | error | TypeScript error mapped to the registry file:line |
| TYPECHECK_ENV_RANGE_MISMATCH | error | declared range not satisfied by the pinned env version |
| LOCK_ENTRY_REMOVED | error | lock entry without a registry item (use `deprecated`, or `--prune`) |
| PUBLISHED_TO_DRAFT | error | locked slug is now a draft |
| BUMP_NOT_APPLICABLE | error | `--bump` for unchanged/unknown/draft slug, or bad level |
| LOCK_INVALID | error | lock unreadable, off-schema, or non-increasing version |
| LOCK_OUT_OF_DATE | error | lock would change; re-run with `--write-lock` |
| IMMUTABILITY_VIOLATION | error | archived `<slug>@<version>.json` differs |
| EMIT_VERIFY_FAILED | error | emitted file missing/different/invalid after write |
| PREVIEW_MISSING | error | hash-keyed preview cache is absent; generate and commit it |
| PREVIEW_INVALID | error | cached preview is not structurally valid WebP |
| PREVIEW_GENERATION_FAILED | error | isolated Vite/Playwright capture failed |
| ARCHIVE_MISSING_VERSION | warning | previous lock version absent from the archive |
| SECURITY_EVAL | error | `eval`, `new Function`, string-arg timers |
| SECURITY_COOKIE | error | `document.cookie` access |
| SECURITY_NETWORK | error | network primitives (`fetch`, XHR, Beacon, WebSocket, EventSource, importScripts, Worker) |
| SECURITY_INNER_HTML | warning | `dangerouslySetInnerHTML` (needs reviewer approval) |
| SECURITY_STORAGE | warning | browser storage should be avoided |
| DEP_UNUSED | warning | declared dependency never imported |
| REGISTRY_DEP_UNUSED | warning | listed registryDependency never imported |

Human format example:

```text
error[IMPORT_UNDECLARED_PACKAGE] components/text-animations/foo/foo.tsx:3:20 imports "gsap" but it is not in meta.dependencies. Hint: add it to meta.json (it must be on the allowlist).
```

## CLI

`pnpm build:registry --check [--registry-root <dir>] [--json] [--strict]
[--skip-typecheck] [--bump slug=level] [--prune slug]` validates everything in
memory/temp and writes nothing. Emit mode (no `--check`) additionally takes
`[--out <dir>] [--archive-dir <dir>] [--preview-cache-dir <dir>]
[--generate-previews] [--write-lock] [--git-sha <sha>]`: it builds
the tree, syncs the archive, swaps output atomically, and writes the lock file
when asked. `--out`/`--archive-dir`/`--write-lock` cannot be combined with
`--check`; emitting with `--skip-typecheck` is refused. `--out` and
`--archive-dir` must live outside `--registry-root` (refused otherwise): emitted
`schema/meta.json` files would be discovered as registry items.

Run `pnpm preview:install` once to install the pinned Chromium build, then
`pnpm generate:previews` after adding or changing component content. Generation
only recaptures missing hash keys. Commit the resulting `registry/previews/*.webp`
files so CI and production builds stay browser-free and deterministic.

Exit 0 = ok (warnings allowed), 1 = errors (or warnings with `--strict`),
2 = usage error. Empty registry is valid (exit 0, `items: 0`). `--json` prints
the machine-readable report (counts, item summaries, full diagnostics) on stdout.
`--skip-typecheck` prints a loud `TYPECHECK SKIPPED` line and sets
`typecheckSkipped` in JSON; CI never uses it.

## Versioning (`registry.lock.json`)

Lock = `{ version: 1, components: { slug: { version, hash } } }`, written only
with `--write-lock`, atomically (temp file + rename), keys sorted, 2 spaces, LF,
trailing newline. Decision table (each row tested in `versions.test.ts`):

1. slug published/deprecated, not in lock → `1.0.0`, record hash.
2. In lock, hash equal → keep version.
3. In lock, hash differs → `--bump <slug>=minor|major`, else patch.
4. In lock, item missing from registry → `LOCK_ENTRY_REMOVED` (deprecate instead);
   `--prune <slug>` drops the entry and is reported loudly.
5. Locked slug now draft → `PUBLISHED_TO_DRAFT`.
6. Drafts never enter the lock and are never emitted.
7. `--bump` for unchanged/unknown/draft slugs or bad levels → `BUMP_NOT_APPLICABLE`.
8. Invalid lock, non-semver or non-increasing versions → `LOCK_INVALID`.
9. `--check` with an out-of-date lock → `LOCK_OUT_OF_DATE` (slugs + fix command).
10. Emit without `--write-lock` on an out-of-date lock → same error (never emit
    unreleased state).

`--bump` for a slug whose hash is unchanged, unknown, draft, or new is never
applicable (bumps only redirect the automatic patch of a *changed* locked item).
The emitted item `version` comes from the lock; the version is NOT part of the
hash. A change to a lib (e.g. `cn`) does not change dependents' hashes; users
pick it up via `update`.

## Emit and archive

Output tree under `<out>/` (`r/index.json` published+deprecated sorted
`addedAt` desc then slug, `r/<slug>.json`, `r/<slug>@<version>.json`,
`search-index.json`, `build-manifest.json`, `schema/*.json`, and
`previews/<slug>.webp`): canonical
serialization (sorted keys, compact, LF, trailing newline). Every emitted item is
parsed and hash-verified before writing and re-read and re-verified after the
final rename; any failure aborts leaving the previous output untouched. Output is
built in a sibling temp dir and swapped in (old aside, new in, old deleted).
Two runs on the same input (same `SOURCE_DATE_EPOCH`, git sha) produce a
byte-identical tree (tested via tree hash).

Archive (`--archive-dir`, persistent): `<slug>@<version>.json` per item version.
Existing bytes that differ → `IMMUTABILITY_VIOLATION`; missing current versions
are written (temp+rename) after the tree verifies, before the swap; previous
lock versions absent from the archive warn (`ARCHIVE_MISSING_VERSION`, cannot be
regenerated). Archive files are never deleted. `--check` compares read-only and
writes nothing to `<out>`, the archive, or the lock.

## Versioning note

`schemaVersion` is excluded from item hashes by design (see
docs/CONTRACTS.md "Hash algorithm versioning"): any change to normalization or
canonicalization MUST bump `schemaVersion` and keep the old verifier available.

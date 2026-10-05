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
6. **Security** (`registry/security.ts`, decision D7): AST scan, errors, no escape
   hatch — `eval`/`new Function` (`SECURITY_EVAL`), `document.cookie`
   (`SECURITY_COOKIE`), `fetch`/`XMLHttpRequest`/`sendBeacon`/`WebSocket`/
   `EventSource`/`importScripts` (`SECURITY_NETWORK`).
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
| DEP_UNUSED | warning | declared dependency never imported |
| REGISTRY_DEP_UNUSED | warning | listed registryDependency never imported |

Human format example:

```text
error[IMPORT_UNDECLARED_PACKAGE] components/text-animations/foo/foo.tsx:3:20 imports "gsap" but it is not in meta.dependencies. Hint: add it to meta.json (it must be on the allowlist).
```

## CLI

`pnpm build:registry --check [--registry-root <dir>] [--json] [--strict]`
(root script forwards args to `packages/builder`). Without `--check`: exit 2
("emit is implemented in Task 4b"). Exit 0 = ok (warnings allowed),
1 = errors (or warnings with `--strict`), 2 = usage error. Empty registry is
valid (exit 0, `items: 0`). `--json` prints the machine-readable report
(counts, item summaries, full diagnostics) on stdout.

## Versioning note

`schemaVersion` is excluded from item hashes by design (see
docs/CONTRACTS.md "Hash algorithm versioning"): any change to normalization or
canonicalization MUST bump `schemaVersion` and keep the old verifier available.

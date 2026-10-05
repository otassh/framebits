# Contracts — `packages/shared`

> Source of truth for validation: Zod schemas in `packages/shared/src/`
> (MASTER_PROMPT Section 4). This document mirrors the code; if they ever disagree,
> the code wins and this doc must be fixed. All schemas are `.strict()`
> (unknown keys rejected) with inferred `z.infer` types. Brand constants live in
> `src/site.ts` (`PROJECT_NAME`, `PLACEHOLDER_DOMAIN`, `DEFAULT_REGISTRY_URL`).

## Schemas

| Area | Schema | File | Key rules |
|---|---|---|---|
| Component meta (`meta.json`) | `MetaSchema` (+ `Meta`) | `meta.ts` | slug `/^[a-z0-9]+(-[a-z0-9]+)*$/` 2–64; `type` default `"component"`; category from `CATEGORIES`; tags 0–8, kebab, unique, ≤48 chars; description 10–200; `dependencies` keys must be in `ALLOWED_DEPENDENCIES`, values valid semver ranges; `registryDependencies` valid slugs, no self-reference, unique; difficulty/performance/status enums; `addedAt` ISO date; optional `bump: minor\|major` |
| Registry item (`/r/<slug>.json`) | `RegistryItemSchema` (+ `RegistryItem`) | `registry-item.ts` | `schemaVersion` literal `1`; semver version; `sha256:<hex>` hash; ≥1 file, unique paths; `files[].variant` default `"ts-tw"`; `tailwind`/`cssVars` optional; `files[].type` always equals the item type (css belongs to a component item) |
| Registry index (`/r/index.json`) | `RegistryIndexSchema` (+ `RegistryIndex`) | `registry-index.ts` | literal `1`; `generatedAt` ISO datetime; items reuse meta field schemas |
| CLI config (`algorithco-ui.json`) | `CliConfigSchema` (+ `CliConfig`) | `cli-config.ts` | registry must be `https://` (or `http://localhost`/`127.0.0.1`); framework enum; tailwind 3\|4; aliases required; `installed` defaults `{}` |
| Lock file (`registry.lock.json`) | `RegistryLockSchema` (+ `RegistryLock`) | `lock.ts` | `version` literal `1`; keys valid slugs; entries `{version, hash}` |
| Per-component styles (`styles.json`) | `ComponentStylesSchema` (+ `ComponentStyles`) | `registry-item.ts` | optional `{ tailwind?, cssVars? }`, reusing the exact RegistryItem sub-schemas |
| Events | `EventsRequestSchema` | `api.ts` | ≤50 events; `type: install\|view`; slug regex; optional `source: cli\|copy` |
| Like | `LikeResponseSchema`, `LikesCountSchema` | `api.ts` | `{liked, count≥0}` / `{count≥0}` |
| Newsletter | `NewsletterRequestSchema` | `api.ts` | email trimmed + lowercased, ≤254 chars |
| Popular stats | `PopularQuerySchema` | `api.ts` | period default `week`; limit 1–50 default 20 (coerced) |
| Search | `SearchQuerySchema` | `api.ts` | `q` 1–100; optional category; limit 1–50 default 20 (coerced) |
| Errors | `ErrorResponseSchema` | `api.ts` | `{error: {code, message, details[]}}`, details default `[]` |
| Paths | `RelativePathSchema` | `paths.ts` | see Path rules below (shared by registry files and CLI targets) |
| Hash-safe JSON | `HashableJsonValueSchema` | `hashable-json.ts` | string leaves only (no numbers/booleans/null); no `undefined` |

Supporting: `CATEGORIES` (`categories.ts`), `ALLOWED_DEPENDENCIES`
(`allowed-dependencies.ts`), `SemverRangeSchema`/`SemverVersionSchema` (`semver.ts`,
backed by the `semver` package — see justification below; ranges must additionally be
BOUNDED: every `||` branch needs an upper bound, so `*`, `x`, `latest`, `>=0.0.0`,
`>0` are rejected), `SCHEMA_VERSION = 1` and `DEFAULT_VARIANT = "ts-tw"`
(`registry-item.ts`). Duplicate file paths are rejected case-insensitively after NFC
normalization (comparison only; stored content is never NFC-normalized).

JSON Schemas for publication under `/schema/*.json` are generated with native
Zod 4 `z.toJSONSchema` (`json-schemas.ts`, script `build:schemas`).

## Canonical hash spec

- Serialization: JCS (RFC 8785) principles — UTF-8, no whitespace, object keys sorted
  by UTF-16 code unit order (recursive), arrays keep order.
- `canonicalize()` (`canonical.ts`) throws `CanonicalizeError` on `undefined`,
  non-integer numbers (incl. NaN/Infinity), bigints, functions, symbols.
- Normalization (exported `normalizeItemForHash` and `normalizeContent`, `hash.ts`): dependency keys sorted,
  `registryDependencies` sorted, files sorted by path; file content → strip BOM,
  CRLF/CR→LF, trailing newline ensured (empty stays empty); `variant` materialized
  (`?? "ts-tw"`) so explicit-default ≡ absent; absent optionals omitted (never null).
- No Unicode normalization (NFC) is applied to content. Line-ending normalization
  happens on the raw string before UTF-8 encoding.
- Digest: `sha256:<64 lowercase hex>` (`computeItemHash`); verification recomputes
  and compares with `timingSafeEqual` (`verifyItemHash`).
- Included: `type`, `dependencies`, `registryDependencies`, `files` (path, content,
  type, variant), `tailwind`, `cssVars`.
- Excluded: `version`, `hash`, `title`, timestamps, and everything else — including
  `schemaVersion`. Consequence (deliberate): a registry-format change does NOT change
  item hashes; format migrations must be handled outside the hash (builder Task 4).
- Golden vectors (locked in `hash.test.ts`; every vector's canonical string is
  embedded next to it and each hash was confirmed with Windows certutil on exact bytes):
  - simple → `sha256:d0881b…af45d7`
  - unicode content → `sha256:257aa2…22322`
  - tailwind+cssVars → `sha256:65c0b9…e8f12`
  - astral key (`U+FF5E`) + astral content → `sha256:4d9488…57424`

## Hash algorithm versioning

Any change to normalization (`normalizeFileContent`, `normalizeItemForHash`) or
canonicalization (`canonicalize`) MUST bump `schemaVersion` and keep the old verifier
available: old registry blobs stay verifiable, and the golden vectors above pin the
current algorithm — changing them without a `schemaVersion` bump is a bug, not a fix.

## Path rules (`RelativePathSchema`)

Reject: empty; length > 200; leading `/`; drive letters (`C:`); backslashes;
`..`/`.` segments; empty segments (`//`, trailing `/`); null bytes/control chars;
leading/trailing spaces (whole path and per segment); segments ending with `.`;
`< > " : | ? *` in any segment; more than 10 segments;
Windows reserved device names (`CON PRN AUX NUL COM1–9 LPT1–9`, case-insensitive,
with or without extension) in any segment. Everything else — including uppercase —
is accepted.

## Dependency justification (`semver`)

`semver@7` (runtime dep of `@algorithco-ui/shared`): implements the reference
"valid semver range" grammar (carets, tildes, hyphen ranges, comparators,
prereleases, `*`, `||`) that MASTER_PROMPT Section 4.1 requires. Hand-rolling it
would be incomplete and would drift from npm semantics. Tiny, dependency-free,
same implementation family npm ships; `@types/semver` is dev-only. No other new
runtime dependency was added (`zod@4` covers validation + JSON Schema export via
native `z.toJSONSchema`, so `zod-to-json-schema` was NOT added; hashing uses only
`node:crypto`).

## Generated component dependency (`motion`)

Researched 2026-10-05 via the npm registry: `motion@14.0.0` is the current stable
latest and its `exports` map contains `./react` (`./dist/es/react.mjs`, types
`./dist/react.d.ts`). Generated components therefore declare
`{ "motion": "^14.0.0" }` (constant `MOTION_RANGE` in
`packages/builder/src/scaffold/request.ts`) and import from `motion/react`.
Re-check at Task 4+ if a new major appears; the constant is the single place to change.

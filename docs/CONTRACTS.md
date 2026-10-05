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
| Registry item (`/r/<slug>.json`) | `RegistryItemSchema` (+ `RegistryItem`) | `registry-item.ts` | `schemaVersion` literal `1`; semver version; `sha256:<hex>` hash; ≥1 file, unique paths; `files[].variant` default `"ts-tw"`; `tailwind`/`cssVars` optional |
| Registry index (`/r/index.json`) | `RegistryIndexSchema` (+ `RegistryIndex`) | `registry-index.ts` | literal `1`; `generatedAt` ISO datetime; items reuse meta field schemas |
| CLI config (`algorithco-ui.json`) | `CliConfigSchema` (+ `CliConfig`) | `cli-config.ts` | registry must be `https://` (or `http://localhost`/`127.0.0.1`); framework enum; tailwind 3\|4; aliases required; `installed` defaults `{}` |
| Lock file (`registry.lock.json`) | `RegistryLockSchema` (+ `RegistryLock`) | `lock.ts` | `version` literal `1`; keys valid slugs; entries `{version, hash}` |
| Events | `EventsRequestSchema` | `api.ts` | ≤50 events; `type: install\|view`; slug regex; optional `source: cli\|copy` |
| Like | `LikeResponseSchema`, `LikesCountSchema` | `api.ts` | `{liked, count≥0}` / `{count≥0}` |
| Newsletter | `NewsletterRequestSchema` | `api.ts` | email trimmed + lowercased, ≤254 chars |
| Popular stats | `PopularQuerySchema` | `api.ts` | period default `week`; limit 1–50 default 20 (coerced) |
| Search | `SearchQuerySchema` | `api.ts` | `q` 1–100; optional category; limit 1–50 default 20 (coerced) |
| Errors | `ErrorResponseSchema` | `api.ts` | `{error: {code, message, details[]}}`, details default `[]` |
| Paths | `RelativePathSchema` | `paths.ts` | see Path rules below (shared by registry files and CLI targets) |
| Hash-safe JSON | `HashableJsonValueSchema` | `hashable-json.ts` | integers only (floats rejected at parse); no `undefined` |

Supporting: `CATEGORIES` (`categories.ts`), `ALLOWED_DEPENDENCIES`
(`allowed-dependencies.ts`), `SemverRangeSchema`/`SemverVersionSchema` (`semver.ts`,
backed by the `semver` package — see justification below), `SCHEMA_VERSION = 1` and
`DEFAULT_VARIANT = "ts-tw"` (`registry-item.ts`).

JSON Schemas for publication under `/schema/*.json` are generated with native
Zod 4 `z.toJSONSchema` (`json-schemas.ts`, script `build:schemas`).

## Canonical hash spec

- Serialization: JCS (RFC 8785) principles — UTF-8, no whitespace, object keys sorted
  by UTF-16 code unit order (recursive), arrays keep order.
- `canonicalize()` (`canonical.ts`) throws `CanonicalizeError` on `undefined`,
  non-integer numbers (incl. NaN/Infinity), bigints, functions, symbols.
- Normalization (`normalizeItemForHash`, `hash.ts`): dependency keys sorted,
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
- Golden vectors (locked in `hash.test.ts`; the `simple` vector additionally verified
  with a hand-built canonical string via node:crypto and Windows certutil):
  - simple → `sha256:d0881b…af45d7`
  - unicode content → `sha256:257aa2…22322`
  - tailwind+cssVars → `sha256:65c0b9…e8f12`

## Path rules (`RelativePathSchema`)

Reject: empty; length > 200; leading `/`; drive letters (`C:`); backslashes;
`..`/`.` segments; empty segments (`//`, trailing `/`); null bytes/control chars;
leading/trailing spaces (whole path and per segment); more than 10 segments;
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

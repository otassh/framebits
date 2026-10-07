import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalize } from "./canonical.js";
import { SCHEMA_VERSION } from "./registry-item.js";
import type { CssVars, TailwindFragment } from "./registry-item.js";
import type { ItemType } from "./meta.js";

/**
 * Canonical hashing (MASTER_PROMPT Section 5.7 + Task 2 clarifications).
 *
 * Included: schemaVersion (payload version, see PAYLOAD_VERSION), type,
 * dependencies (keys sorted), registryDependencies (sorted), files sorted by
 * path (path + LF/BOM/trailing-newline-normalized content + type + variant),
 * tailwind, cssVars. Excluded: version, hash, title, timestamps — and anything
 * else.
 *
 * Normalization runs inside the hash function so that a field explicitly set to its
 * default hashes identically to an absent one (e.g. `variant: "ts-tw"` vs omitted).
 * Absent optional fields are omitted, never serialized as null.
 */

/**
 * Version of the canonical hash payload. Bumping this changes every hash, so a
 * bump MUST ship with a legacy verifier (see `verifyItemHash`, which still
 * accepts the pre-`schemaVersion` payload) and a migration note — never silently.
 */
export const PAYLOAD_VERSION = SCHEMA_VERSION;

/**
 * Hash-input size guard: at most 1 MiB of UTF-8 per file and 5 MiB total.
 * `verifyItemHash` returns false past these caps BEFORE hashing (untrusted
 * registry blobs must not force unbounded hashing work).
 */
export const MAX_FILE_CONTENT_BYTES = 1_048_576;
export const MAX_TOTAL_CONTENT_BYTES = 5_242_880;

export interface ItemHashInputFile {
  path: string;
  content: string;
  type: ItemType;
  variant?: string | undefined;
}

export interface ItemHashInput {
  type: ItemType;
  dependencies?: Record<string, string> | undefined;
  registryDependencies?: readonly string[] | undefined;
  files: readonly ItemHashInputFile[];
  tailwind?: TailwindFragment | undefined;
  cssVars?: CssVars | undefined;
}

interface NormalizedFile {
  path: string;
  content: string;
  type: ItemType;
  variant: string;
}

interface NormalizedPayload {
  schemaVersion: number;
  type: ItemType;
  dependencies: Record<string, string>;
  registryDependencies: string[];
  files: NormalizedFile[];
  tailwind?: TailwindFragment | undefined;
  cssVars?: CssVars | undefined;
}

/**
 * Strip ALL leading BOMs, normalize exotic line breaks (NEL U+0085, LS U+2028,
 * PS U+2029) plus CRLF/CR to LF, ensure a trailing newline (unless empty).
 */
export function normalizeContent(content: string): string {
  let withoutBom = content;
  while (withoutBom.startsWith("\uFEFF")) withoutBom = withoutBom.slice(1);
  const unified = withoutBom.replace(/\u0085|\u2028|\u2029/g, "\n");
  const lf = unified.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (lf !== "" && !lf.endsWith("\n")) return `${lf}\n`;
  return lf;
}

function sortedRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    const value: string | undefined = record[key];
    if (value === undefined) continue;
    // defineProperty (not `out[key] =`) so a "__proto__" key becomes an own data
    // property instead of triggering the prototype setter.
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return out;
}

/** Exported so tests (and the builder) can assert normalization independently. */
export function normalizeItemForHash(item: ItemHashInput): NormalizedPayload {
  const files: NormalizedFile[] = item.files.map((file) => ({
    path: file.path,
    content: normalizeContent(file.content),
    type: file.type,
    variant: file.variant ?? "ts-tw",
  }));
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const payload: NormalizedPayload = {
    schemaVersion: PAYLOAD_VERSION,
    type: item.type,
    dependencies: sortedRecord(item.dependencies ?? {}),
    registryDependencies: [...(item.registryDependencies ?? [])].sort(),
    files,
  };
  if (item.tailwind !== undefined) payload.tailwind = item.tailwind;
  if (item.cssVars !== undefined) payload.cssVars = item.cssVars;
  return payload;
}

/** Canonical form WITHOUT `schemaVersion` (pre-hardening payload). */
function normalizeItemForHashLegacy(item: ItemHashInput): Omit<NormalizedPayload, "schemaVersion"> {
  const normalized = normalizeItemForHash(item);
  const legacy: Omit<NormalizedPayload, "schemaVersion"> = {
    type: normalized.type,
    dependencies: normalized.dependencies,
    registryDependencies: normalized.registryDependencies,
    files: normalized.files,
  };
  if (normalized.tailwind !== undefined) legacy.tailwind = normalized.tailwind;
  if (normalized.cssVars !== undefined) legacy.cssVars = normalized.cssVars;
  return legacy;
}

/** True when the item's content exceeds the hash-input size caps. */
export function exceedsContentLimits(item: ItemHashInput): boolean {
  let total = 0;
  for (const file of item.files) {
    const bytes = Buffer.byteLength(file.content, "utf8");
    if (bytes > MAX_FILE_CONTENT_BYTES) return true;
    total += bytes;
    if (total > MAX_TOTAL_CONTENT_BYTES) return true;
  }
  return false;
}

/** `sha256:<64 lowercase hex>` of the canonical form. */
export function computeItemHash(item: ItemHashInput): string {
  const digest = createHash("sha256")
    .update(canonicalize(normalizeItemForHash(item)), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

/**
 * Recompute and compare in constant time (never `===` on secrets/hashes).
 *
 * Returns false (without hashing) when the input exceeds
 * `MAX_FILE_CONTENT_BYTES`/`MAX_TOTAL_CONTENT_BYTES`. Accepts both the current
 * payload (with `schemaVersion`) and the legacy payload (without it) so blobs
 * hashed before the `schemaVersion` inclusion keep verifying.
 */
export function verifyItemHash(item: ItemHashInput, expectedHash: string): boolean {
  if (exceedsContentLimits(item)) return false;
  const expected = Buffer.from(expectedHash, "utf8");
  const current = Buffer.from(computeItemHash(item), "utf8");
  if (current.length === expected.length && timingSafeEqual(current, expected)) return true;
  const legacyDigest = createHash("sha256")
    .update(canonicalize(normalizeItemForHashLegacy(item)), "utf8")
    .digest("hex");
  const legacy = Buffer.from(`sha256:${legacyDigest}`, "utf8");
  if (legacy.length !== expected.length) return false;
  return timingSafeEqual(legacy, expected);
}

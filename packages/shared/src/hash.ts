import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalize } from "./canonical.js";
import type { CssVars, TailwindFragment } from "./registry-item.js";
import type { ItemType } from "./meta.js";

/**
 * Canonical hashing (MASTER_PROMPT Section 5.7 + Task 2 clarifications).
 *
 * Included: type, dependencies (keys sorted), registryDependencies (sorted),
 * files sorted by path (path + LF/BOM/trailing-newline-normalized content + type + variant),
 * tailwind, cssVars. Excluded: version, hash, title, timestamps — and anything else,
 * notably `schemaVersion` (a format change therefore needs handling outside the hash;
 * see docs/CONTRACTS.md).
 *
 * Normalization runs inside the hash function so that a field explicitly set to its
 * default hashes identically to an absent one (e.g. `variant: "ts-tw"` vs omitted).
 * Absent optional fields are omitted, never serialized as null.
 */

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
  type: ItemType;
  dependencies: Record<string, string>;
  registryDependencies: string[];
  files: NormalizedFile[];
  tailwind?: TailwindFragment | undefined;
  cssVars?: CssVars | undefined;
}

/** Strip BOM, normalize CRLF/CR to LF, ensure a trailing newline (unless empty). */
export function normalizeContent(content: string): string {
  const withoutBom = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const lf = withoutBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (lf !== "" && !lf.endsWith("\n")) return `${lf}\n`;
  return lf;
}

function sortedRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key] as string;
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
    type: item.type,
    dependencies: sortedRecord(item.dependencies ?? {}),
    registryDependencies: [...(item.registryDependencies ?? [])].sort(),
    files,
  };
  if (item.tailwind !== undefined) payload.tailwind = item.tailwind;
  if (item.cssVars !== undefined) payload.cssVars = item.cssVars;
  return payload;
}

/** `sha256:<64 lowercase hex>` of the canonical form. */
export function computeItemHash(item: ItemHashInput): string {
  const digest = createHash("sha256")
    .update(canonicalize(normalizeItemForHash(item)), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

/** Recompute and compare in constant time (never `===` on secrets/hashes). */
export function verifyItemHash(item: ItemHashInput, expectedHash: string): boolean {
  const actual = Buffer.from(computeItemHash(item), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

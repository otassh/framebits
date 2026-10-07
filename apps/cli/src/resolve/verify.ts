/**
 * Registry item verification (C9). Runs BEFORE anything touches disk.
 * Security model: the hash lives in the same JSON and only detects
 * corruption; the dependency allowlist is the real defense against a
 * compromised registry.
 */
import {
  ALLOWED_DEPENDENCIES,
  MAX_FILES_PER_ITEM as SHARED_MAX_FILES_PER_ITEM,
  RegistryItemSchema,
  SCHEMA_VERSION,
  verifyItemHash,
  type RegistryItem,
} from "@framebits/shared";
import { integrityError } from "../errors.js";
import { parseJsonGuarded } from "../registry-client/index.js";

export const MAX_FILES_PER_ITEM = SHARED_MAX_FILES_PER_ITEM;
/** Closure-wide pre-disk caps (exit 4): bound abuse across many items. */
export const MAX_TOTAL_FILES = 500;
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

const TRUST_GAP_HINT =
  "the hash lives in the same JSON it verifies (corruption check, not malice); " +
  "the allowlist is the real defense — see docs/SECURITY.md";

export function verifyItem(
  rawText: string,
  requestedSlug: string,
  requestedVersion?: string,
): RegistryItem {
  const raw: unknown = parseJsonGuarded(rawText, `"${requestedSlug}"`);
  // schemaVersion: handle string/invalid/future with an update hint. The Zod
  // literal below would also reject, but with a generic message — this gives
  // the actionable "update framebits" guidance for any version skew.
  if (typeof raw === "object" && raw !== null && "schemaVersion" in raw) {
    const version: unknown = raw.schemaVersion;
    if (version !== SCHEMA_VERSION) {
      const seen = typeof version === "string" ? version : String(version);
      throw integrityError(
        `registry item "${requestedSlug}" needs schemaVersion ${seen} (this CLI supports ${String(SCHEMA_VERSION)})`,
        "update framebits to the latest version",
      );
    }
  } else {
    throw integrityError(
      `registry item "${requestedSlug}" is missing schemaVersion (this CLI supports ${String(SCHEMA_VERSION)})`,
      "update framebits to the latest version",
    );
  }
  const parsed = RegistryItemSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw integrityError(
      `registry item "${requestedSlug}" failed schema validation: ${details}`,
      "the registry response is malformed; report it if it persists",
    );
  }
  const item = parsed.data;
  if (item.slug !== requestedSlug) {
    throw integrityError(
      `registry returned slug "${item.slug}" for requested "${requestedSlug}"`,
      "the registry response is inconsistent; report it",
    );
  }
  if (requestedVersion !== undefined && item.version !== requestedVersion) {
    throw integrityError(
      `registry returned version "${item.version}" for requested "${requestedSlug}@${requestedVersion}"`,
      "the registry response is inconsistent; report it",
    );
  }
  if (item.files.length > MAX_FILES_PER_ITEM) {
    throw integrityError(
      `registry item "${requestedSlug}" contains ${String(item.files.length)} files (max ${String(MAX_FILES_PER_ITEM)})`,
      "the registry response is too large; report it",
    );
  }
  // Pre-disk total-bytes guard for a single item (closure cap lives in
  // assertClosureLimits below and runs before any write).
  let itemBytes = 0;
  for (const file of item.files) {
    itemBytes += Buffer.byteLength(file.content, "utf8");
    if (itemBytes > MAX_TOTAL_BYTES) {
      throw integrityError(
        `registry item "${requestedSlug}" exceeds ${String(MAX_TOTAL_BYTES)} bytes total`,
        "the registry response is too large; report it",
      );
    }
  }
  if (!verifyItemHash(item, item.hash)) {
    throw integrityError(
      `hash mismatch for "${requestedSlug}@${item.version}" (content does not match its hash)`,
      `the download may be corrupted; retry, and report it if it persists. ${TRUST_GAP_HINT}`,
    );
  }
  for (const name of Object.keys(item.dependencies)) {
    if (!(ALLOWED_DEPENDENCIES as readonly string[]).includes(name)) {
      throw integrityError(
        `registry item "${requestedSlug}" depends on "${name}", which is not on this CLI's allowlist`,
        `update the CLI or report the registry. ${TRUST_GAP_HINT}`,
      );
    }
  }
  return item;
}

/**
 * Closure-wide pre-disk caps: total files ≤ 500 and total bytes ≤ 5 MB.
 * Call after resolution, before planning/writing (exit 4).
 */
export function assertClosureLimits(items: readonly RegistryItem[]): void {
  let files = 0;
  let bytes = 0;
  for (const item of items) {
    files += item.files.length;
    if (files > MAX_TOTAL_FILES) {
      throw integrityError(
        `resolution closure exceeds ${String(MAX_TOTAL_FILES)} files total`,
        "the dependency graph is too large; report it",
      );
    }
    for (const file of item.files) {
      bytes += Buffer.byteLength(file.content, "utf8");
      if (bytes > MAX_TOTAL_BYTES) {
        throw integrityError(
          `resolution closure exceeds ${String(MAX_TOTAL_BYTES)} bytes total`,
          "the registry response is too large; report it",
        );
      }
    }
  }
}

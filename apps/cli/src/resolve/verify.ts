/**
 * Registry item verification (C9). Runs BEFORE anything touches disk.
 * Security model: the hash lives in the same JSON and only detects
 * corruption; the dependency allowlist is the real defense against a
 * compromised registry.
 */
import {
  ALLOWED_DEPENDENCIES,
  RegistryItemSchema,
  SCHEMA_VERSION,
  verifyItemHash,
  type RegistryItem,
} from "@framebits/shared";
import { integrityError } from "../errors.js";

export const MAX_FILES_PER_ITEM = 50;

export function verifyItem(
  rawText: string,
  requestedSlug: string,
  requestedVersion?: string  ,
): RegistryItem {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch (error) {
    throw integrityError(
      `registry returned invalid JSON for "${requestedSlug}"`,
      error instanceof Error ? error.message : "the registry response is not valid JSON",
    );
  }
  if (
    typeof raw === "object" && raw !== null && "schemaVersion" in raw &&
    typeof raw.schemaVersion === "number" && raw.schemaVersion > SCHEMA_VERSION
  ) {
    throw integrityError(
      `registry item "${requestedSlug}" needs schemaVersion ${String(raw.schemaVersion)} (this CLI supports ${String(SCHEMA_VERSION)})`,
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
  if (!verifyItemHash(item, item.hash)) {
    throw integrityError(
      `hash mismatch for "${requestedSlug}@${item.version}" (content does not match its hash)`,
      "the download may be corrupted; retry, and report it if it persists",
    );
  }
  for (const name of Object.keys(item.dependencies)) {
    if (!(ALLOWED_DEPENDENCIES as readonly string[]).includes(name)) {
      throw integrityError(
        `registry item "${requestedSlug}" depends on "${name}", which is not on this CLI's allowlist`,
        "update the CLI or report the registry",
      );
    }
  }
  return item;
}

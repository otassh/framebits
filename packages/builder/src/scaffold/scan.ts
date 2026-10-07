import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { TextDecoder } from "node:util";
import { MetaSchema } from "@framebits/shared";
import { ScaffoldError } from "./types.js";

/** Meta files over this size are skipped (same 200 KB cap as discovery). */
export const MAX_SCAN_BYTES = 200 * 1024;

/** Recursively list every `meta.json` path under the registry root. */
export async function listMetaFiles(registryRoot: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      throw new ScaffoldError(
        "validation",
        `cannot read the registry at ${registryRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name === "meta.json") {
        found.push(full);
      }
    }
  }
  await walk(registryRoot);
  return found.sort();
}

/**
 * Fail if `slug` already exists in any meta.json under the registry root.
 *
 * Unreadable, oversized, undecodable, NUL-containing, unparseable, or
 * schema-invalid existing files are SKIPPED WITH A WARNING (returned, never
 * thrown): a broken neighbor must not block scaffolding, and the warning names
 * the path so it is never silently ignored.
 */
export async function assertSlugUnique(registryRoot: string, slug: string): Promise<string[]> {
  const warnings: string[] = [];
  try {
    await stat(registryRoot);
  } catch (error) {
    // A missing root contains no items: vacuously unique. Anything else is a real error.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return warnings;
    throw new ScaffoldError(
      "validation",
      `cannot read the registry at ${registryRoot}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const files = await listMetaFiles(registryRoot);
  for (const file of files) {
    const existing = await readExistingSlug(file);
    if (existing === undefined) {
      warnings.push(`skipped unreadable existing meta.json at ${file}`);
      continue;
    }
    if (existing === null) {
      warnings.push(`skipped invalid existing meta.json at ${file}`);
      continue;
    }
    if (existing === slug) {
      throw new ScaffoldError("conflict", `slug "${slug}" already exists at ${file}`);
    }
  }
  return warnings;
}

/**
 * Read the slug from an existing meta.json: the path string on success, null
 * when the file is present but unusable (oversized, undecodable, NUL bytes,
 * bad JSON, schema-invalid), undefined when it cannot be read at all.
 */
async function readExistingSlug(file: string): Promise<string | null | undefined> {
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return undefined;
  }
  if (size > MAX_SCAN_BYTES) return null;
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return undefined;
  }
  if (bytes.length > MAX_SCAN_BYTES) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (text.includes("\0")) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const parsed = MetaSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.slug;
}

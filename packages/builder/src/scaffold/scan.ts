import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { MetaSchema } from "@framebits/shared";
import { ScaffoldError } from "./types.js";

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
 * Existing files are parsed with MetaSchema; an unreadable or invalid one is a
 * hard error naming the path (never silently ignored).
 */
export async function assertSlugUnique(registryRoot: string, slug: string): Promise<void> {
  try {
    await stat(registryRoot);
  } catch (error) {
    // A missing root contains no items: vacuously unique. Anything else is a real error.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw new ScaffoldError(
      "validation",
      `cannot read the registry at ${registryRoot}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const files = await listMetaFiles(registryRoot);
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      throw new ScaffoldError(
        "validation",
        `cannot parse existing meta.json at ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const parsed = MetaSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ScaffoldError(
        "validation",
        `existing meta.json at ${file} is invalid: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    if (parsed.data.slug === slug) {
      throw new ScaffoldError("conflict", `slug "${slug}" already exists at ${file}`);
    }
  }
}

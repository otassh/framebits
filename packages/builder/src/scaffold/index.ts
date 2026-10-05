import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildMeta, resolveScaffoldRequest } from "./request.js";
import { renderFiles } from "./files.js";
import { resolveTargetDir, ScaffoldError, type ScaffoldRequest, type ScaffoldResult } from "./types.js";
import { assertSlugUnique } from "./scan.js";

export { MOTION_RANGE } from "./request.js";
export { toCamelCase, toPascalCase, toTitleCase } from "./names.js";
export { resolveScaffoldRequest, buildMeta, serializeMeta, defaultDescription } from "./request.js";
export { renderComponentTsx, renderDemoTsx, renderHookTs, renderLibTs, renderFiles } from "./files.js";
export { resolveTargetDir, ScaffoldError } from "./types.js";
export type { GeneratedFile, ScaffoldItemType, ScaffoldRequest, ScaffoldResult, ScaffoldErrorCode } from "./types.js";
export { listMetaFiles, assertSlugUnique } from "./scan.js";
export type { ResolvedScaffold } from "./request.js";

/** `YYYY-MM-DD` in UTC. */
export function toAddedAt(now: Date): string {
  const iso = now.toISOString();
  return iso.slice(0, "YYYY-MM-DD".length);
}

/**
 * Scaffold one item. Pure orchestration over explicit inputs (`registryRoot`, `now`):
 * no `process.cwd()`, no `process.argv`, no `Date.now()` inside.
 */
export async function scaffold(
  request: ScaffoldRequest,
  registryRoot: string,
  now: Date,
): Promise<ScaffoldResult> {
  const resolved = resolveScaffoldRequest(request);
  const meta = buildMeta(resolved, toAddedAt(now));
  await assertSlugUnique(registryRoot, resolved.slug);

  const segments =
    resolved.type === "component"
      ? ["components", resolved.category, resolved.slug]
      : ["lib", resolved.slug];
  const dir = resolveTargetDir(registryRoot, ...segments);
  const files = renderFiles(resolved, meta);

  await writeAtomically(dir, files);
  return { dir, files: files.map((file) => file.path) };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write into a temp sibling directory, then rename into place. Refuses when the
 * target exists. On any failure the temp directory is removed: no partial output.
 * Uniqueness comes from `mkdtemp` (no clock, no Date.now() in the core).
 */
async function writeAtomically(
  dir: string,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  let staging: string | undefined;
  try {
    if (await exists(dir)) {
      throw new ScaffoldError(
        "conflict",
        `target folder already exists (refusing to overwrite): ${dir}`,
      );
    }
    // Parent chain (e.g. a brand-new category) may not exist yet; the item dir
    // itself is only ever created by the rename below.
    await mkdir(dirname(dir), { recursive: true });
    staging = await mkdtemp(join(dirname(dir), ".scaffold-"));
    for (const file of files) {
      await writeFile(join(staging, file.path), file.content, "utf8");
    }
    await rename(staging, dir);
    staging = undefined;
  } catch (error) {
    if (staging !== undefined) {
      await rm(staging, { recursive: true, force: true });
    }
    if (error instanceof ScaffoldError) throw error;
    throw new ScaffoldError(
      "validation",
      `failed to write scaffold to ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

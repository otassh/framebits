import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildMeta, resolveScaffoldRequest } from "./request.js";
import { renderFiles } from "./files.js";
import { resolveTargetDir, ScaffoldError, type ScaffoldRequest, type ScaffoldResult } from "./types.js";
import { assertSlugUnique, listMetaFiles } from "./scan.js";

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
 *
 * The registry-root guard refuses a root that already holds meta.json files but
 * no registry.lock.json (a typo'd path scattering files into the wrong tree),
 * unless `allowMissingLock` is set. Fresh (meta-free) roots always pass: that is
 * how a brand-new registry is bootstrapped.
 */
export async function scaffold(
  request: ScaffoldRequest,
  registryRoot: string,
  now: Date,
  options: { allowMissingLock?: boolean | undefined } = {},
): Promise<ScaffoldResult> {
  const resolved = resolveScaffoldRequest(request);
  const meta = buildMeta(resolved, toAddedAt(now));
  const warnings = await assertSlugUnique(registryRoot, resolved.slug);
  warnings.push(...(await assertRegistryRoot(registryRoot, options.allowMissingLock === true)));

  const segments =
    resolved.type === "component"
      ? ["components", resolved.category, resolved.slug]
      : ["lib", resolved.slug];
  const dir = resolveTargetDir(registryRoot, ...segments);
  const files = renderFiles(resolved, meta);

  await writeAtomically(dir, files);
  return { dir, files: files.map((file) => file.path), warnings };
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
 * Registry-root guard: a root holding meta.json files but no registry.lock.json
 * is not a registry (most likely a typo'd --registry-root). Fresh roots (no
 * metas yet) and lock-bearing roots pass; `allowMissingLock` bypasses the
 * check. Returns warnings (empty when the root is clean).
 */
async function assertRegistryRoot(registryRoot: string, allowMissingLock: boolean): Promise<string[]> {
  if (allowMissingLock) return [];
  if (await exists(join(registryRoot, "registry.lock.json"))) return [];
  // A missing/unreadable root is fresh (assertSlugUnique already passed): allow.
  const metas = await listMetaFiles(registryRoot).catch(() => [] as string[]);
  if (metas.length === 0) return [];
  throw new ScaffoldError(
    "validation",
    `refusing to scaffold into ${registryRoot}: it holds ${String(metas.length)} meta.json file(s) but no registry.lock.json (not a registry root). Check --registry-root, or pass --allow-no-lock to proceed anyway.`,
  );
}

/**
 * Claim the target directory EXCLUSIVELY (`mkdir` without `recursive` fails
 * with EEXIST when anything is already there — no check-then-act race), then
 * write the files into it. On any failure the claimed directory is removed: no
 * partial output. The previous temp-sibling + rename scheme could replace an
 * existing directory on some platforms; exclusive creation cannot.
 */
async function writeAtomically(
  dir: string,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  // Parent chain (e.g. a brand-new category) may not exist yet; the item dir
  // itself is only ever created by the exclusive mkdir below.
  await mkdir(dirname(dir), { recursive: true });
  try {
    await mkdir(dir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new ScaffoldError(
        "conflict",
        `target folder already exists (refusing to overwrite): ${dir}`,
      );
    }
    throw new ScaffoldError(
      "validation",
      `failed to create scaffold directory ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    for (const file of files) {
      await writeFile(join(dir, file.path), file.content, "utf8");
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw new ScaffoldError(
      "validation",
      `failed to write scaffold to ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

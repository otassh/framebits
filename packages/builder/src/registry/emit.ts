import { mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  RegistryIndexSchema,
  RegistryItemSchema,
  SearchIndexSchema,
  jsonSchemaFor,
  verifyItemHash,
  type RegistryIndex,
  type RegistryItem,
  type RegistryLock,
} from "@framebits/shared";
import MiniSearch from "minisearch";
import { plannedLock, planVersions, serializeLock, type VersionPlan } from "./versions.js";
import type { Diagnostic, RegistryItemModel } from "./types.js";

/**
 * Emit stage (Task 4b Part 3): versioned JSON tree, search index, manifest,
 * JSON schemas, archive, and lock handling. In-memory planning/serialization is
 * pure; all filesystem writes funnel through `writeBuild` (atomic) — except in
 * `--check` mode, which writes nothing.
 */

export interface EmitInput {
  items: RegistryItemModel[];
  draftSlugs: ReadonlySet<string>;
  /** Current lock (empty when the file is missing — a missing lock with items is out of date). */
  lock: RegistryLock;
  bumps: ReadonlyMap<string, string>;
  prune: ReadonlySet<string>;
  gitSha: string;
  generatedAt: string;
}

export interface EmitPlan {
  plans: VersionPlan[];
  newLock: RegistryLock;
  newLockText: string;
  /** Slugs whose lock state would change (empty when up to date). */
  outOfDate: string[];
  pruned: string[];
  diagnostics: Diagnostic[];
}

/** Canonical emit serialization: sorted keys, compact, LF, trailing newline. */
export function serializeCanonical(value: unknown): string {
  return `${JSON.stringify(sortKeys(value))}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** sha256 hex over sorted `path + "\n" + content` pairs (tree identity for tests). */
export async function hashTree(files: Map<string, string>): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  for (const path of [...files.keys()].sort()) {
    hash.update(path, "utf8");
    hash.update("\n", "utf8");
    hash.update(files.get(path) as string, "utf8");
  }
  return hash.digest("hex");
}

function itemJson(item: RegistryItemModel, version: string): RegistryItem {
  const files = item.files.map((file) => ({
    path: file.path,
    content: file.content,
    type: file.type,
    variant: file.variant,
  }));
  const base = {
    schemaVersion: 1 as const,
    slug: item.slug,
    type: item.meta.type,
    title: item.meta.title,
    version,
    hash: item.hash,
    dependencies: item.dependencies,
    registryDependencies: item.registryDependencies,
    files,
  };
  return {
    ...base,
    ...(item.tailwind !== undefined ? { tailwind: item.tailwind } : {}),
    ...(item.cssVars !== undefined ? { cssVars: item.cssVars } : {}),
  };
}

function indexJson(
  items: RegistryItemModel[],
  plans: ReadonlyMap<string, VersionPlan>,
  generatedAt: string,
): RegistryIndex {
  const entries = items.map((item) => {
    const plan = plans.get(item.slug);
    const entry = {
      slug: item.slug,
      type: item.meta.type,
      title: item.meta.title,
      category: item.meta.category,
      tags: [...item.meta.tags],
      description: item.meta.description,
      version: plan?.version ?? "0.0.0",
      hash: item.hash,
      performance: item.meta.performance,
      difficulty: item.meta.difficulty,
      addedAt: item.meta.addedAt,
      ...(item.meta.type === "component"
        ? { previews: { image: `/previews/${item.slug}.webp` } }
        : {}),
    };
    return item.meta.status === "deprecated" ? { ...entry, deprecated: true as const } : entry;
  });
  entries.sort((a, b) =>
    a.addedAt !== b.addedAt ? (a.addedAt < b.addedAt ? 1 : -1) : a.slug < b.slug ? -1 : 1,
  );
  return { schemaVersion: 1, generatedAt, items: entries };
}

function searchJson(items: RegistryItemModel[]): { text: string; count: number } {
  const docs = items
    .filter((item) => item.meta.type === "component" && item.meta.status === "published")
    .sort((a, b) => (a.slug < b.slug ? -1 : 1))
    .map((item) => ({
      id: item.slug,
      title: item.meta.title,
      tags: [...item.meta.tags],
      category: item.meta.category,
      description: item.meta.description,
    }));
  const mini = new MiniSearch({
    fields: ["title", "tags", "category", "description"],
    storeFields: ["title"],
    searchOptions: { boost: { title: 3, tags: 2 }, prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(docs);
  const blob: unknown = JSON.parse(JSON.stringify(mini.toJSON()));
  if (typeof blob !== "object" || blob === null || Array.isArray(blob)) {
    throw new Error("MiniSearch serialization did not produce an object");
  }
  const file = {
    schemaVersion: 1 as const,
    index: blob as Record<string, unknown>,
    docs: Object.fromEntries(
      docs.map((doc) => [doc.id, { title: doc.title, category: doc.category, description: doc.description }]),
    ),
  };
  const parsed = SearchIndexSchema.safeParse(file);
  if (!parsed.success) {
    throw new Error(`generated search index is invalid: ${parsed.error.message}`);
  }
  return { text: serializeCanonical(file), count: docs.length };
}

const SCHEMA_FILES = [
  "meta",
  "registry-item",
  "registry-index",
  "cli-config",
  "registry-lock",
  "events-request",
  "like-response",
  "likes-count",
  "newsletter-request",
  "popular-query",
  "search-query",
  "error-response",
  "search-index",
] as const;

function schemaFiles(): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of SCHEMA_FILES) {
    out.set(`schema/${name}.json`, serializeCanonical(jsonSchemaFor(name)));
  }
  return out;
}

export interface BuiltTree {
  files: Map<string, string>;
  bytes: number;
}

/** Build the full output tree in memory (no I/O). Throws on self-check failure. */
export function buildTree(
  items: RegistryItemModel[],
  plans: VersionPlan[],
  gitSha: string,
  generatedAt: string,
  builderVersion: string,
): BuiltTree {
  const bySlug = new Map(plans.map((plan) => [plan.slug, plan]));
  const files = new Map<string, string>();

  for (const item of [...items].sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    const plan = bySlug.get(item.slug);
    if (plan === undefined) continue;
    const obj = itemJson(item, plan.version);
    const parsed = RegistryItemSchema.safeParse(obj);
    if (!parsed.success) {
      throw new Error(`generated item ${item.slug} is invalid: ${parsed.error.message}`);
    }
    if (!verifyItemHash(obj, obj.hash)) {
      throw new Error(`generated item ${item.slug} failed hash self-verification`);
    }
    const text = serializeCanonical(obj);
    files.set(`r/${item.slug}.json`, text);
    files.set(`r/${item.slug}@${plan.version}.json`, text);
  }

  const index = indexJson(items, bySlug, generatedAt);
  const indexParsed = RegistryIndexSchema.safeParse(index);
  if (!indexParsed.success) {
    throw new Error(`generated index is invalid: ${indexParsed.error.message}`);
  }
  files.set("r/index.json", serializeCanonical(index));

  const search = searchJson(items);
  files.set("search-index.json", search.text);

  const counts = { total: plans.length, new: 0, changed: 0, unchanged: 0, deprecated: 0 };
  for (const plan of plans) {
    if (plan.change === "new") counts.new += 1;
    else if (plan.change === "unchanged") counts.unchanged += 1;
    else counts.changed += 1;
  }
  for (const item of items) {
    if (item.meta.status === "deprecated") counts.deprecated += 1;
  }
  const manifest = {
    schemaVersion: 1,
    builderVersion,
    gitSha,
    generatedAt,
    counts,
    items: plans.map((plan) => ({ slug: plan.slug, version: plan.version, hash: plan.hash })),
  };
  files.set("build-manifest.json", serializeCanonical(manifest));

  for (const [path, content] of schemaFiles()) files.set(path, content);

  let bytes = 0;
  for (const content of files.values()) bytes += Buffer.byteLength(content, "utf8");
  return { files, bytes };
}

/** Version planning + out-of-date detection (pure; rows 9-10 compare here). */
export function planBuild(input: EmitInput): EmitPlan {
  const { plans, diagnostics } = planVersions({
    items: input.items,
    lock: input.lock,
    bumps: input.bumps,
    draftSlugs: input.draftSlugs,
    prune: input.prune,
  });
  const newLock = plannedLock(input.lock, plans, input.prune);
  const newLockText = serializeLock(newLock);

  const outOfDate: string[] = [];
  const current = input.lock.components;
  const planned = newLock.components;
  for (const slug of new Set([...Object.keys(current), ...Object.keys(planned)]).values()) {
    const a = current[slug];
    const b = planned[slug];
    if (a?.version !== b?.version || a?.hash !== b?.hash) outOfDate.push(slug);
  }
  outOfDate.sort();

  const pruned = [...input.prune].filter((slug) => current[slug] !== undefined).sort();
  return { plans, newLock, newLockText, outOfDate, pruned, diagnostics };
}

export interface ArchiveSync {
  stats: { written: string[]; reused: string[]; missing: string[] };
  diagnostics: Diagnostic[];
  /** Files the emit phase must write (check mode only compares). */
  pending: Array<{ name: string; content: string }>;
}

/**
 * Compare the archive (read-only part runs in --check too): every planned version
 * must exist byte-identical (IMMUTABILITY_VIOLATION otherwise); previous lock
 * versions absent from the archive warn (ARCHIVE_MISSING_VERSION).
 */
export async function planArchive(
  archiveDir: string,
  plans: VersionPlan[],
  tree: BuiltTree,
): Promise<ArchiveSync> {
  const stats = { written: [], reused: [], missing: [] } as {
    written: string[];
    reused: string[];
    missing: string[];
  };
  const diagnostics: Diagnostic[] = [];
  const pending: Array<{ name: string; content: string }> = [];

  for (const plan of [...plans].sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    const name = `${plan.slug}@${plan.version}.json`;
    const content = tree.files.get(`r/${name}`);
    if (content === undefined) continue;
    let existing: string | undefined;
    try {
      existing = await readFile(join(archiveDir, name), "utf8");
    } catch {
      existing = undefined;
    }
    if (existing === undefined) {
      pending.push({ name, content });
    } else if (existing !== content) {
      diagnostics.push({
        severity: "error",
        code: "IMMUTABILITY_VIOLATION",
        file: `archive/${name}`,
        message: `archived ${name} differs from the rebuilt content (immutable files must never change)`,
      });
    } else {
      stats.reused.push(name);
    }
    if (plan.previousVersion !== undefined && plan.previousVersion !== plan.version) {
      const prevName = `${plan.slug}@${plan.previousVersion}.json`;
      try {
        await readFile(join(archiveDir, prevName), "utf8");
      } catch {
        stats.missing.push(prevName);
        diagnostics.push({
          severity: "warning",
          code: "ARCHIVE_MISSING_VERSION",
          file: `archive/${prevName}`,
          message: `previous version "${prevName}" is absent from the archive (cannot be regenerated)`,
        });
      }
    }
  }
  stats.written = pending.map((entry) => entry.name).sort();
  stats.reused.sort();
  stats.missing.sort();
  return { stats, diagnostics, pending };
}

/** Re-read a directory tree and verify it matches the in-memory tree exactly. */
export async function verifyWrittenTree(
  dirAbs: string,
  tree: BuiltTree,
  binaryFiles: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const [rel, content] of [...tree.files].sort()) {
    let actual: string;
    try {
      actual = await readFile(join(dirAbs, ...rel.split("/")), "utf8");
    } catch {
      diagnostics.push({
        severity: "error",
        code: "EMIT_VERIFY_FAILED",
        file: rel,
        message: `emitted file ${rel} is missing after write`,
      });
      continue;
    }
    if (actual !== content) {
      diagnostics.push({
        severity: "error",
        code: "EMIT_VERIFY_FAILED",
        file: rel,
        message: `emitted file ${rel} differs from the verified content`,
      });
    }
  }
  for (const [rel, expected] of [...binaryFiles].sort(([a], [b]) => (a < b ? -1 : 1))) {
    let actual: Uint8Array;
    try {
      actual = await readFile(join(dirAbs, ...rel.split("/")));
    } catch {
      diagnostics.push({
        severity: "error",
        code: "EMIT_VERIFY_FAILED",
        file: rel,
        message: `emitted binary file ${rel} is missing after write`,
      });
      continue;
    }
    if (!Buffer.from(actual).equals(Buffer.from(expected))) {
      diagnostics.push({
        severity: "error",
        code: "EMIT_VERIFY_FAILED",
        file: rel,
        message: `emitted binary file ${rel} differs from the verified content`,
      });
    }
  }
  // Schema + hash self-check on the round-tripped item files.
  for (const [rel, content] of [...tree.files].sort()) {
    if (!rel.startsWith("r/") || rel === "r/index.json" || rel.includes("@")) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(content) as unknown;
    } catch {
      diagnostics.push({
        severity: "error",
        code: "EMIT_VERIFY_FAILED",
        file: rel,
        message: `emitted file ${rel} is not valid JSON`,
      });
      continue;
    }
    const parsed = RegistryItemSchema.safeParse(raw);
    if (!parsed.success || !verifyItemHash(parsed.data, parsed.data.hash)) {
      diagnostics.push({
        severity: "error",
        code: "EMIT_VERIFY_FAILED",
        file: rel,
        message: `emitted file ${rel} failed schema/hash self-verification`,
      });
    }
  }
  return diagnostics;
}

async function writeFileAtomic(absPath: string, content: string): Promise<void> {
  const staging = `${absPath}.tmp-${String(Date.now())}-${String(Math.floor(Math.random() * 1_000_000))}`;
  await writeFile(staging, content, "utf8");
  await rename(staging, absPath);
}

/**
 * Write the tree atomically: build in a sibling temp dir, verify, swap into place
 * (old aside, new in, old deleted), verify again. Never leaves a half-written <out>.
 */
export async function writeBuildTree(
  outDirAbs: string,
  tree: BuiltTree,
  binaryFiles: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<Diagnostic[]> {
  const staging = await mkdtemp(join(resolve(outDirAbs, ".."), ".registry-out-"));
  try {
    for (const [rel, content] of tree.files) {
      const abs = join(staging, ...rel.split("/"));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
    }
    for (const [rel, content] of binaryFiles) {
      const abs = join(staging, ...rel.split("/"));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
    const pre = await verifyWrittenTree(staging, tree, binaryFiles);
    if (pre.some((diagnostic) => diagnostic.severity === "error")) {
      return pre;
    }
    let outExists = false;
    try {
      await stat(outDirAbs);
      outExists = true;
    } catch {
      outExists = false;
    }
    let backup: string | undefined;
    try {
      if (outExists) {
        backup = join(resolve(outDirAbs, ".."), `.registry-old-${String(Date.now())}`);
        await rename(outDirAbs, backup);
      }
      await rename(staging, outDirAbs);
      if (backup !== undefined) {
        await rm(backup, { recursive: true, force: true });
      }
    } catch (error) {
      if (backup !== undefined) {
        try {
          await rename(backup, outDirAbs);
        } catch {
          // Best effort restore; the original error below is what matters.
        }
      }
      throw new Error(
        `atomic swap failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return await verifyWrittenTree(outDirAbs, tree, binaryFiles);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Write one archive version atomically (temp + rename). */
export async function writeArchiveFile(archiveDir: string, name: string, content: string): Promise<void> {
  await mkdir(archiveDir, { recursive: true });
  await writeFileAtomic(join(archiveDir, name), content);
}

/** Write the lock file atomically (temp + rename). */
export async function writeLockFile(registryRootAbs: string, text: string): Promise<void> {
  await writeFileAtomic(join(registryRootAbs, "registry.lock.json"), text);
}

/**
 * Atomic apply with journal + rollback (C14).
 * Writes via temp file in the same directory + rename; creates dirs as needed.
 * Before writing, realpaths the nearest existing ancestor and asserts it is
 * inside realpath(projectRoot); refuses to write through an existing symlink.
 */
import type { CliConfig } from "@algorithco-ui/shared";
import type { PlannedFile } from "../plan/index.js";

export interface ApplyFs {
  lstat(path: string): Promise<{ isSymbolicLink: boolean; isDirectory: boolean } | undefined>;
  realpath(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readFile(path: string): Promise<string | undefined>;
  rm(path: string): Promise<void>;
  rmdirIfEmpty(path: string): Promise<boolean>;
  copyForBackup(from: string, to: string): Promise<void>;
}

export interface ApplyInput {
  projectRoot: string;
  files: readonly PlannedFile[];
  config: CliConfig;
  versions: ReadonlyMap<string, { version: string; hash: string }>;
  writeConfig: (next: CliConfig) => Promise<void>;
  overwrite: boolean;
  skipSlugs: ReadonlySet<string>;
}

export interface ApplyResult {
  written: string[];
  skipped: string[];
}

function posixDirname(path: string): string {
  const forward = path.replace(/\\/g, "/");
  const index = forward.lastIndexOf("/");
  if (index === -1) return ".";
  if (index === 0) return "/";
  return forward.slice(0, index);
}

function normalizeForCompare(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

function isInside(root: string, candidate: string): boolean {
  const cleanRoot = normalizeForCompare(root);
  const cleanCandidate = normalizeForCompare(candidate);
  if (cleanCandidate === cleanRoot) return true;
  if (process.platform === "win32") {
    return cleanCandidate.toLowerCase().startsWith(`${cleanRoot.toLowerCase()}/`);
  }
  return cleanCandidate.startsWith(`${cleanRoot}/`);
}

async function nearestExistingAncestor(fs: ApplyFs, target: string): Promise<string> {
  let cursor = posixDirname(target);
  for (;;) {
    const stat = await fs.lstat(cursor);
    if (stat !== undefined) return cursor;
    const parent = posixDirname(cursor);
    if (parent === cursor) return cursor;
    cursor = parent;
  }
}

export async function assertSafeTarget(
  fs: ApplyFs,
  _projectRoot: string,
  projectRootReal: string,
  targetAbs: string,
): Promise<void> {
  const targetStat = await fs.lstat(targetAbs);
  if (targetStat !== undefined && targetStat.isSymbolicLink) {
    throw new Error(`refusing to write through symlink: ${targetAbs}`);
  }
  const ancestor = await nearestExistingAncestor(fs, targetAbs);
  const ancestorReal = await fs.realpath(ancestor);
  if (!isInside(projectRootReal, ancestorReal)) {
    throw new Error(`refusing to write outside the project root: ${targetAbs}`);
  }
}

export interface JournalEntry {
  target: string;
  backup: string | undefined;
  created: boolean;
  createdDirs: string[];
}

export async function applyPlan(
  fs: ApplyFs,
  input: ApplyInput,
  journalDir: string,
): Promise<ApplyResult> {
  const projectRootReal = await fs.realpath(input.projectRoot);
  const written: string[] = [];
  const skipped: string[] = [];
  const journal: JournalEntry[] = [];
  const previousConfig: CliConfig = JSON.parse(JSON.stringify(input.config)) as CliConfig;

  async function rollback(): Promise<string[]> {
    const failures: string[] = [];
    for (let i = journal.length - 1; i >= 0; i--) {
      const entry = journal[i] as JournalEntry;
      try {
        if (entry.created) {
          await fs.rm(entry.target);
        } else if (entry.backup !== undefined) {
          await fs.copyForBackup(entry.backup, entry.target);
        }
        for (let d = entry.createdDirs.length - 1; d >= 0; d--) {
          await fs.rmdirIfEmpty(entry.createdDirs[d] as string).catch(() => false);
        }
      } catch (error) {
        failures.push(
          `${entry.target}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    try {
      await input.writeConfig(previousConfig);
    } catch (error) {
      failures.push(
        `config rollback failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return failures;
  }

  try {
    for (const file of input.files) {
      if (input.skipSlugs.has(file.itemSlug)) {
        skipped.push(file.targetAbs);
        continue;
      }
      if (file.action === "unchanged") {
        continue;
      }
      if (file.action === "conflict" && !input.overwrite) {
        throw new Error(`conflict at ${file.targetRel} (use --overwrite)`);
      }
      await assertSafeTarget(fs, input.projectRoot, projectRootReal, file.targetAbs);
      const dir = posixDirname(file.targetAbs.replace(/\\/g, "/"));
      const createdDirs: string[] = [];
      let cursor = dir;
      const rootClean = normalizeForCompare(input.projectRoot);
      while (
        normalizeForCompare(cursor) !== rootClean &&
        normalizeForCompare(cursor).startsWith(`${rootClean}/`)
      ) {
        const stat = await fs.lstat(cursor);
        if (stat === undefined) {
          await fs.mkdir(cursor);
          createdDirs.unshift(cursor);
        }
        const parent = posixDirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
      }
      const existing = await fs.readFile(file.targetAbs);
      let backup: string | undefined;
      if (existing !== undefined) {
        backup = `${journalDir}/backup-${String(journal.length)}`;
        await fs.copyForBackup(file.targetAbs, backup);
      }
      const staging = `${file.targetAbs}.tmp-${String(Date.now())}-${String(journal.length)}`;
      await fs.writeFile(staging, file.content);
      await fs.rename(staging, file.targetAbs);
      journal.push({
        target: file.targetAbs,
        backup,
        created: existing === undefined,
        createdDirs,
      });
      written.push(file.targetAbs);
    }

    const next: CliConfig = JSON.parse(JSON.stringify(input.config)) as CliConfig;
    for (const [slug, entry] of input.versions) {
      if (input.skipSlugs.has(slug)) continue;
      next.installed[slug] = { version: entry.version, hash: entry.hash };
    }
    await input.writeConfig(next);
    return { written, skipped };
  } catch (error) {
    const failures = await rollback();
    const base = error instanceof Error ? error.message : String(error);
    if (failures.length > 0) {
      throw new Error(`${base} (rollback failures: ${failures.join("; ")})`);
    }
    throw error instanceof Error ? error : new Error(base);
  }
}

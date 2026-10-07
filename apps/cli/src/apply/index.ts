/**
 * Atomic apply with journal + rollback (C14, E5).
 * Writes via temp file in the same directory + rename; creates dirs as needed.
 * Before writing, realpaths the nearest existing ancestor and asserts it is
 * inside realpath(projectRoot); refuses to write through an existing symlink.
 *
 * Journal order: files -> CSS patches -> installer -> config (last). The
 * installer runs after files+CSS so a failed install rolls everything back
 * while leaving the config untouched.
 */
import type { CliConfig } from "@framebits/shared";
import { randomUUID } from "node:crypto";
import type { PlannedFile } from "../plan/index.js";
import { computePatched } from "../styles/patch.js";
import { tailLines, INSTALL_TAIL_LINES, type InstallOutcome } from "../install/run.js";

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
  /** Best-effort durability + mode preservation (optional in tests). */
  statMode?(path: string): Promise<number | undefined>;
  chmod?(path: string, mode: number): Promise<void>;
  fsyncFile?(path: string): Promise<void>;
  fsyncDir?(path: string): Promise<void>;
}

export interface CssApplyPatch {
  absPath: string;
  rel: string;
  slug: string;
  blockInner: string;
  /** True when the block already differs (conflict resolved to overwrite). */
  overwrite: boolean;
}

export interface InstallerCommand {
  program: string;
  args: string[];
  cwd: string;
  display: string;
  /** Package names being installed (for the summary; scope-aware). */
  packages: string[];
}

export interface ApplyInput {
  projectRoot: string;
  files: readonly PlannedFile[];
  css: readonly CssApplyPatch[];
  /** Absolute paths to snapshot before install (package.json, lockfile). */
  snapshotFiles: readonly string[];
  installer: { command: InstallerCommand; run: () => Promise<InstallOutcome> } | undefined;
  config: CliConfig;
  versions: ReadonlyMap<string, { version: string; hash: string }>;
  writeConfig: (next: CliConfig) => Promise<void>;
  overwrite: boolean;
  skipSlugs: ReadonlySet<string>;
}

export interface ApplyResult {
  written: string[];
  skipped: string[];
  cssPatched: string[];
  installed: string[];
  installSkipped: boolean;
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
  // Refuse symlink directories in any intermediate component (lstat, no
  // follow): writing through a symlinked dir would escape the project.
  let cursor = posixDirname(targetAbs.replace(/\\/g, "/"));
  const rootClean = normalizeForCompare(_projectRoot);
  while (
    normalizeForCompare(cursor) !== rootClean &&
    normalizeForCompare(cursor).startsWith(`${rootClean}/`)
  ) {
    const stat = await fs.lstat(cursor);
    if (stat !== undefined && stat.isSymbolicLink) {
      throw new Error(`refusing to write through symlinked directory: ${cursor}`);
    }
    const parent = posixDirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
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
  const cssPatched: string[] = [];
  const journal: JournalEntry[] = [];
  const previousConfig: CliConfig = JSON.parse(JSON.stringify(input.config)) as CliConfig;

  async function rollback(restoreConfig: boolean): Promise<string[]> {
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
    if (restoreConfig) {
      try {
        await input.writeConfig(previousConfig);
      } catch (error) {
        failures.push(
          `config rollback failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return failures;
  }

  async function writeThroughJournal(target: string, content: string): Promise<void> {
    await assertSafeTarget(fs, input.projectRoot, projectRootReal, target);
    const dir = posixDirname(target.replace(/\\/g, "/"));
    const createdDirs: string[] = [];
    let cursor = dir;
    const rootClean = normalizeForCompare(input.projectRoot);
    while (
      normalizeForCompare(cursor) !== rootClean &&
      normalizeForCompare(cursor).startsWith(`${rootClean}/`)
    ) {
      const stat = await fs.lstat(cursor);
      if (stat !== undefined && stat.isSymbolicLink) {
        throw new Error(`refusing to write through symlinked directory: ${cursor}`);
      }
      if (stat === undefined) {
        await fs.mkdir(cursor);
        createdDirs.unshift(cursor);
      }
      const parent = posixDirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    // Re-assert realpath after mkdir (TOCTOU): intermediates may have changed.
    const reAncestor = await nearestExistingAncestor(fs, target);
    const reAncestorReal = await fs.realpath(reAncestor);
    if (!isInside(projectRootReal, reAncestorReal)) {
      throw new Error(`refusing to write outside the project root: ${target}`);
    }
    const existing = await fs.readFile(target);
    let backup: string | undefined;
    let existingMode: number | undefined;
    if (existing !== undefined) {
      backup = `${journalDir}/backup-${randomUUID()}`;
      await fs.copyForBackup(target, backup);
      try {
        existingMode = await fs.statMode?.(target);
      } catch {
        existingMode = undefined;
      }
    }
    const staging = `${target}.tmp-${randomUUID()}`;
    await fs.writeFile(staging, content);
    if (existingMode !== undefined) {
      try {
        await fs.chmod?.(staging, existingMode);
      } catch {
        // Best-effort: mode preservation must not fail the install.
      }
    }
    // Best-effort durability: flush the staging file before rename.
    try {
      await fs.fsyncFile?.(staging);
    } catch {
      // Best-effort.
    }
    // Re-assert immediately before rename (final TOCTOU check).
    await assertSafeTarget(fs, input.projectRoot, projectRootReal, target);
    await fs.rename(staging, target);
    try {
      await fs.fsyncDir?.(posixDirname(target.replace(/\\/g, "/")));
    } catch {
      // Best-effort.
    }
    journal.push({ target, backup, created: existing === undefined, createdDirs });
  }

  try {
    for (const file of input.files) {
      if (input.skipSlugs.has(file.itemSlug)) {
        skipped.push(file.targetAbs);
        continue;
      }
      // Snapshot freshness + conflict recheck (plan was built from a
      // point-in-time snapshot; disk may have drifted — abort, don't clobber).
      if (file.action === "unchanged") {
        const current = await fs.readFile(file.targetAbs);
        const normalized = (current ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (current === undefined || normalized !== file.content) {
          throw new Error(
            `conflict at ${file.targetRel} (snapshot changed since planning; re-run)`,
          );
        }
        continue;
      }
      if (file.action === "create") {
        const current = await fs.readFile(file.targetAbs);
        if (current !== undefined) {
          throw new Error(
            `conflict at ${file.targetRel} (file appeared since planning; re-run)`,
          );
        }
      }
      if (file.action === "conflict" && !input.overwrite) {
        throw new Error(`conflict at ${file.targetRel} (use --overwrite)`);
      }
      await writeThroughJournal(file.targetAbs, file.content);
      written.push(file.targetAbs);
    }

    for (const patch of input.css) {
      if (input.skipSlugs.has(patch.slug)) {
        skipped.push(patch.absPath);
        continue;
      }
      const current = await fs.readFile(patch.absPath);
      if (current === undefined) {
        throw new Error(`CSS entry disappeared: ${patch.rel}`);
      }
      const computed = computePatched({
        current,
        slug: patch.slug,
        blockInner: patch.blockInner,
        overwrite: patch.overwrite || input.overwrite,
      });
      if (computed.action === "unchanged") continue;
      if (computed.action === "conflict") {
        throw new Error(`conflict at ${patch.rel} (use --overwrite)`);
      }
      await writeThroughJournal(patch.absPath, computed.next);
      cssPatched.push(patch.absPath);
    }

    let installed: string[] = [];
    if (input.installer !== undefined) {
      const snapshots = new Map<string, string | undefined>();
      for (const path of input.snapshotFiles) {
        snapshots.set(path, await fs.readFile(path));
      }
      const outcome = await input.installer.run();
      if (outcome.timedOut || (outcome.exitCode ?? 1) !== 0) {
        for (const [path, before] of snapshots) {
          const after = await fs.readFile(path);
          if (after !== before) {
            if (before === undefined) {
              await fs.rm(path);
            } else {
              await fs.writeFile(path, before);
            }
          }
        }
        const failures = await rollback(false);
        const tail = tailLines(`${outcome.stdout}\n${outcome.stderr}`, INSTALL_TAIL_LINES).trim();
        const base = outcome.timedOut
          ? `package install timed out: ${input.installer.command.display}`
          : `package install failed: ${input.installer.command.display}${tail === "" ? "" : `\n${tail}`}`;
        if (failures.length > 0) {
          throw new Error(`${base} (rollback failures: ${failures.join("; ")})`);
        }
        throw new Error(base);
      }
      installed = input.installer.command.packages;
    }

    const next: CliConfig = JSON.parse(JSON.stringify(input.config)) as CliConfig;
    for (const [slug, entry] of input.versions) {
      if (input.skipSlugs.has(slug)) continue;
      next.installed[slug] = { version: entry.version, hash: entry.hash };
    }
    await input.writeConfig(next);
    return { written, skipped, cssPatched, installed, installSkipped: input.installer === undefined };
  } catch (error) {
    // Config was never written on this path (it is the last step), so there
    // is nothing to restore — pass false to leave it untouched.
    const failures = await rollback(false);
    const base = error instanceof Error ? error.message : String(error);
    if (failures.length > 0) {
      throw new Error(`${base} (rollback failures: ${failures.join("; ")})`);
    }
    throw error instanceof Error ? error : new Error(base);
  }
}

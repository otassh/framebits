import { lstat, readdir, readFile } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { join, sep } from "node:path";
import type { Diagnostic } from "./types.js";

export const MAX_FILE_BYTES = 200 * 1024;
/** Total budget across all discovered files (fail-closed traversal guard). */
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
/** Max files read during discovery (fail-closed traversal guard). */
export const MAX_DISCOVERED_FILES = 500;
/** Max directory depth below the registry root (fail-closed traversal guard). */
export const MAX_DISCOVERY_DEPTH = 10;

export interface DiscoveredFile {
  /** POSIX path relative to the registry root. */
  relPath: string;
  absPath: string;
  size: number;
  /** Decoded text; undefined when the file is unreadable (error already recorded). */
  text: string | undefined;
}

export interface DiscoveredItem {
  /** POSIX dir relative to the registry root, e.g. "components/buttons/ok". */
  dirRel: string;
  dirAbs: string;
  /** All files directly inside the dir, sorted by relPath (meta.json included). */
  files: DiscoveredFile[];
}

export interface Discovery {
  items: DiscoveredItem[];
  diagnostics: Diagnostic[];
}

function toPosix(abs: string, root: string): string {
  const rel = abs.slice(root.length).replace(/^[/\\]+/, "");
  return rel.split(sep).join("/");
}

/**
 * Walk the registry root and collect candidate item directories (any directory
 * containing a `meta.json`). Never follows symlinks (`SYMLINK_NOT_ALLOWED`):
 * every entry is `lstat`-ed (O_NOFOLLOW-style) before reading, and every file
 * is re-`lstat`-ed after reading so a symlink swapped in mid-read cannot escape
 * the check. A missing root is a valid empty registry (warning
 * `REGISTRY_ROOT_MISSING`). Traversal is fail-closed: total bytes
 * (`MAX_TOTAL_BYTES`), file count (`MAX_DISCOVERED_FILES`), and depth
 * (`MAX_DISCOVERY_DEPTH`) are bounded.
 */
export async function discoverRegistry(registryRoot: string): Promise<Discovery> {
  const diagnostics: Diagnostic[] = [];
  const items: DiscoveredItem[] = [];

  try {
    await lstat(registryRoot);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      diagnostics.push({
        severity: "warning",
        code: "REGISTRY_ROOT_MISSING",
        file: "",
        message: `registry root does not exist: ${registryRoot} (treating as an empty registry)`,
      });
      return { items, diagnostics };
    }
    throw error;
  }

  const budget = { totalBytes: 0, fileCount: 0 };

  async function walk(dirAbs: string, depth: number): Promise<void> {
    if (depth > MAX_DISCOVERY_DEPTH) {
      diagnostics.push({
        severity: "error",
        code: "DISCOVERY_MAX_DEPTH",
        file: toPosix(dirAbs, registryRoot),
        message: `directory depth exceeds ${String(MAX_DISCOVERY_DEPTH)} (refusing to descend further)`,
      });
      return;
    }
    const entries = await readdir(dirAbs, { withFileTypes: true });
    let hasMeta = false;
    for (const entry of entries) {
      const abs = join(dirAbs, entry.name);
      if (entry.isSymbolicLink()) {
        diagnostics.push({
          severity: "error",
          code: "SYMLINK_NOT_ALLOWED",
          file: toPosix(abs, registryRoot),
          message: `symlink entries are not allowed: ${entry.name}`,
          hint: "Replace the symlink with a real file or directory.",
        });
        continue;
      }
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (entry.isFile() && entry.name === "meta.json") {
        hasMeta = true;
      }
    }
    if (hasMeta) {
      items.push(await readItemDir(dirAbs, registryRoot, diagnostics, budget));
    }
  }

  await walk(registryRoot, 0);
  items.sort((a, b) => (a.dirRel < b.dirRel ? -1 : a.dirRel > b.dirRel ? 1 : 0));
  detectCaseCollisions(items, diagnostics);
  return { items, diagnostics };
}

/**
 * Flag item directories that collide after NFC + lowercase normalization
 * (e.g. `components/buttons/OK` vs `components/buttons/ok`): such trees break
 * on case-insensitive filesystems. Emits `CASE_COLLISION` (error). Exported for
 * unit tests (synthetic items): real colliding directories cannot be created
 * on case-insensitive filesystems.
 */
export function detectCaseCollisions(items: DiscoveredItem[], diagnostics: Diagnostic[]): void {
  const byFolded = new Map<string, string[]>();
  for (const item of items) {
    const folded = item.dirRel.normalize("NFC").toLowerCase();
    const dirs = byFolded.get(folded) ?? [];
    dirs.push(item.dirRel);
    byFolded.set(folded, dirs);
  }
  for (const dirs of [...byFolded.values()].sort()) {
    const unique = [...new Set(dirs)].sort();
    if (unique.length > 1) {
      for (const dir of unique) {
        diagnostics.push({
          severity: "error",
          code: "CASE_COLLISION",
          file: `${dir}/meta.json`,
          message: `item directory collides (case/NFC-insensitive) with: ${unique.filter((other) => other !== dir).join(", ")}`,
          hint: "Rename the directories so they differ beyond case or Unicode normalization.",
        });
      }
    }
  }
}

async function readItemDir(
  dirAbs: string,
  registryRoot: string,
  diagnostics: Diagnostic[],
  budget: { totalBytes: number; fileCount: number },
): Promise<DiscoveredItem> {
  const dirRel = toPosix(dirAbs, registryRoot);
  const files: DiscoveredFile[] = [];
  const entries = await readdir(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dirAbs, entry.name);
    const relPath = `${dirRel}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      diagnostics.push({
        severity: "error",
        code: "SYMLINK_NOT_ALLOWED",
        file: relPath,
        message: `symlink entries are not allowed: ${entry.name}`,
        hint: "Replace the symlink with a real file or directory.",
      });
      continue;
    }
    if (!entry.isFile()) continue;
    if (budget.fileCount >= MAX_DISCOVERED_FILES) {
      diagnostics.push({
        severity: "error",
        code: "DISCOVERY_FILE_LIMIT",
        file: relPath,
        message: `refusing to read more than ${String(MAX_DISCOVERED_FILES)} files (fail-closed traversal guard)`,
      });
      continue;
    }
    const file = await readDiscoveredFile(abs, relPath, diagnostics, budget);
    if (file !== undefined) files.push(file);
  }
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  detectFileCaseCollisions(dirRel, files, diagnostics);
  return { dirRel, dirAbs, files };
}

/**
 * Flag files inside one item directory that collide after NFC + lowercase
 * normalization (e.g. `Ok.tsx` vs `ok.tsx`): such trees break on
 * case-insensitive filesystems. Emits `CASE_COLLISION` (error). Exported for
 * unit tests (synthetic files): real colliding files cannot be created on
 * case-insensitive filesystems.
 */
export function detectFileCaseCollisions(
  dirRel: string,
  files: DiscoveredFile[],
  diagnostics: Diagnostic[],
): void {
  const byFolded = new Map<string, string[]>();
  for (const file of files) {
    const name = file.relPath.slice(dirRel.length + 1);
    const folded = name.normalize("NFC").toLowerCase();
    const seen = byFolded.get(folded) ?? [];
    seen.push(file.relPath);
    byFolded.set(folded, seen);
  }
  for (const paths of [...byFolded.values()].sort()) {
    const unique = [...new Set(paths)].sort();
    if (unique.length > 1) {
      for (const path of unique) {
        diagnostics.push({
          severity: "error",
          code: "CASE_COLLISION",
          file: path,
          message: `file collides (case/NFC-insensitive) with: ${unique.filter((other) => other !== path).join(", ")}`,
          hint: "Rename the files so they differ beyond case or Unicode normalization.",
        });
      }
    }
  }
}

/** A file that was skipped: content excluded downstream, callers must not model it. */
function skipped(absPath: string, relPath: string, size: number): DiscoveredFile {
  return { relPath, absPath: absPath, size, text: undefined };
}

/**
 * Read one file with TOCTOU hardening: `lstat` before reading (symlink check +
 * pre-read size check, no unbounded reads), then `readFile`, then `lstat`
 * again (a symlink swapped in mid-read, or a concurrent size change, fails
 * closed). Oversized/unreadable files keep their error code and additionally
 * emit a `SKIPPED_SCAN` warning so the exclusion is never silent downstream.
 */
async function readDiscoveredFile(
  absPath: string,
  relPath: string,
  diagnostics: Diagnostic[],
  budget: { totalBytes: number; fileCount: number },
): Promise<DiscoveredFile | undefined> {
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(absPath);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "SKIPPED_SCAN",
      file: relPath,
      message: `cannot stat file: ${error instanceof Error ? error.message : String(error)} (content excluded)`,
    });
    return undefined;
  }
  if (before.isSymbolicLink()) {
    diagnostics.push({
      severity: "error",
      code: "SYMLINK_NOT_ALLOWED",
      file: relPath,
      message: "symlink entries are not allowed",
      hint: "Replace the symlink with a real file or directory.",
    });
    return undefined;
  }
  if (!before.isFile()) return undefined;
  if (before.size > MAX_FILE_BYTES) {
    diagnostics.push({
      severity: "error",
      code: "FILE_TOO_LARGE",
      file: relPath,
      message: `file is ${String(before.size)} bytes (max ${String(MAX_FILE_BYTES)})`,
    });
    warnSkipped(relPath, "over the per-file size limit", diagnostics);
    return skipped(absPath, relPath, before.size);
  }
  if (budget.totalBytes + before.size > MAX_TOTAL_BYTES) {
    diagnostics.push({
      severity: "error",
      code: "DISCOVERY_BUDGET_EXCEEDED",
      file: relPath,
      message: `refusing to read ${relPath}: total budget ${String(MAX_TOTAL_BYTES)} bytes would be exceeded (fail-closed traversal guard)`,
    });
    return undefined;
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(absPath);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "SKIPPED_SCAN",
      file: relPath,
      message: `cannot read file: ${error instanceof Error ? error.message : String(error)} (content excluded)`,
    });
    return undefined;
  }
  let after: Awaited<ReturnType<typeof lstat>>;
  try {
    after = await lstat(absPath);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "SKIPPED_SCAN",
      file: relPath,
      message: `cannot re-stat file after reading: ${error instanceof Error ? error.message : String(error)} (content excluded)`,
    });
    return undefined;
  }
  if (after.isSymbolicLink() || !after.isFile() || after.size !== bytes.length) {
    diagnostics.push({
      severity: "error",
      code: "SYMLINK_NOT_ALLOWED",
      file: relPath,
      message: "file changed during reading (possible symlink swap): refusing to trust the bytes",
      hint: "Replace the symlink with a real file or directory.",
    });
    return undefined;
  }
  budget.totalBytes += bytes.length;
  budget.fileCount += 1;
  const size = bytes.length;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    diagnostics.push({
      severity: "error",
      code: "ENCODING_INVALID",
      file: relPath,
      message: "file is not valid UTF-8",
    });
    warnSkipped(relPath, "undecodable bytes", diagnostics);
    return skipped(absPath, relPath, size);
  }
  if (text.includes("\0")) {
    diagnostics.push({
      severity: "error",
      code: "NUL_BYTE",
      file: relPath,
      message: "file contains NUL bytes",
    });
    warnSkipped(relPath, "NUL bytes", diagnostics);
    return skipped(absPath, relPath, size);
  }
  return { relPath, absPath, size, text };
}

function warnSkipped(relPath: string, reason: string, diagnostics: Diagnostic[]): void {
  diagnostics.push({
    severity: "warning",
    code: "SKIPPED_SCAN",
    file: relPath,
    message: `file content excluded downstream (${reason})`,
  });
}

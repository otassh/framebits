import { readdir, readFile, stat } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { join, sep } from "node:path";
import type { Diagnostic } from "./types.js";

export const MAX_FILE_BYTES = 200 * 1024;

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
 * containing a `meta.json`). Never follows symlinks: symlinked entries are reported
 * with SYMLINK_NOT_ALLOWED and skipped. A missing root is a valid empty registry.
 */
export async function discoverRegistry(registryRoot: string): Promise<Discovery> {
  const diagnostics: Diagnostic[] = [];
  const items: DiscoveredItem[] = [];

  try {
    await stat(registryRoot);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { items, diagnostics };
    }
    throw error;
  }

  async function walk(dirAbs: string): Promise<void> {
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
        await walk(abs);
      } else if (entry.isFile() && entry.name === "meta.json") {
        hasMeta = true;
      }
    }
    if (hasMeta) {
      items.push(await readItemDir(dirAbs, registryRoot, diagnostics));
    }
  }

  await walk(registryRoot);
  items.sort((a, b) => (a.dirRel < b.dirRel ? -1 : a.dirRel > b.dirRel ? 1 : 0));
  return { items, diagnostics };
}

async function readItemDir(
  dirAbs: string,
  registryRoot: string,
  diagnostics: Diagnostic[],
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
    files.push(await readDiscoveredFile(abs, relPath, diagnostics));
  }
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return { dirRel, dirAbs, files };
}

async function readDiscoveredFile(
  absPath: string,
  relPath: string,
  diagnostics: Diagnostic[],
): Promise<DiscoveredFile> {
  const bytes = await readFile(absPath);
  const size = bytes.length;
  if (size > MAX_FILE_BYTES) {
    diagnostics.push({
      severity: "error",
      code: "FILE_TOO_LARGE",
      file: relPath,
      message: `file is ${String(size)} bytes (max ${String(MAX_FILE_BYTES)})`,
    });
    return { relPath, absPath, size, text: undefined };
  }
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
    return { relPath, absPath, size, text: undefined };
  }
  if (text.includes("\0")) {
    diagnostics.push({
      severity: "error",
      code: "NUL_BYTE",
      file: relPath,
      message: "file contains NUL bytes",
    });
    return { relPath, absPath, size, text: undefined };
  }
  return { relPath, absPath, size, text };
}

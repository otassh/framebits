import { resolve, sep } from "node:path";

export type ScaffoldItemType = "component" | "lib" | "hook";

export interface ScaffoldRequest {
  slug: string;
  category?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  /** Raw string; validated against the item-type enum during resolution. */
  type?: string | undefined;
}

/** One file to write, path relative to the item directory, LF content. */
export interface GeneratedFile {
  path: string;
  content: string;
}

export interface ScaffoldResult {
  /** Absolute path of the created item directory. */
  dir: string;
  /** Paths relative to the item directory, in write order. */
  files: string[];
  /** Non-fatal notes (e.g. skipped unreadable neighbor metas). */
  warnings: string[];
}

export type ScaffoldErrorCode = "usage" | "validation" | "conflict";

export class ScaffoldError extends Error {
  readonly code: ScaffoldErrorCode;

  constructor(code: ScaffoldErrorCode, message: string) {
    super(message);
    this.name = "ScaffoldError";
    this.code = code;
  }
}

/**
 * Join path segments onto the registry root, refusing to escape it.
 * Segments come from validated slugs/categories, so this is defense in depth.
 */
export function resolveTargetDir(registryRoot: string, ...segments: string[]): string {
  const root = resolve(registryRoot);
  const target = resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new ScaffoldError("validation", `refusing to write outside the registry root: ${target}`);
  }
  return target;
}

/**
 * Marker-delimited CSS patching (E2). The CLI never parses tailwind.config;
 * styles live between `begin/end <slug>` markers in the CSS entry.
 */
import { beginMarker, endMarker } from "./generate.js";
import type { ValidatedStyles } from "./validate.js";

export type CssAction = "create" | "unchanged" | "conflict";

export interface CssBlockPlan {
  slug: string;
  cssAbs: string;
  cssRel: string;
  action: CssAction;
  /** Full marker block with LF endings (converted to file EOL at write time). */
  block: string;
  collision: string | undefined;
  malformed: string | undefined;
}

export type Eol = "\n" | "\r\n";

export function detectEol(text: string): Eol {
  if (text === "") return "\n";
  const crlf = text.split("\r\n").length - 1;
  const lf = text.split("\n").length - 1 - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

const MARKER_PATTERN = /\/\*\s*framebits:(begin|end)\s+([A-Za-z0-9-]+)\s*\*\//g;

export interface FoundBlock {
  slug: string;
  start: number;
  end: number;
  inner: string;
}

export interface MarkerScan {
  blocks: FoundBlock[];
  malformed: string | undefined;
}

export function scanMarkers(text: string): MarkerScan {
  const events: Array<{ kind: "begin" | "end"; slug: string; index: number; length: number }> = [];
  MARKER_PATTERN.lastIndex = 0;
  for (;;) {
    const match = MARKER_PATTERN.exec(text);
    if (match === null) break;
    const kind = match[1] === "begin" ? "begin" as const : "end" as const;
    events.push({ kind, slug: match[2] ?? "", index: match.index, length: match[0].length });
  }
  const blocks: FoundBlock[] = [];
  const open = new Map<string, { index: number; length: number }>();
  const depth: string[] = [];
  for (const event of events) {
    if (event.kind === "begin") {
      if (open.has(event.slug)) {
        return { blocks, malformed: `duplicate begin marker for "${event.slug}"` };
      }
      if (depth.length > 0) {
        return { blocks, malformed: `nested begin marker for "${event.slug}"` };
      }
      open.set(event.slug, { index: event.index, length: event.length });
      depth.push(event.slug);
    } else {
      const begin = open.get(event.slug);
      if (begin === undefined || depth[depth.length - 1] !== event.slug) {
        return { blocks, malformed: `end marker without begin for "${event.slug}"` };
      }
      open.delete(event.slug);
      depth.pop();
      blocks.push({
        slug: event.slug,
        start: begin.index,
        end: event.index + event.length,
        inner: text.slice(begin.index + begin.length, event.index),
      });
    }
  }
  if (open.size > 0) {
    const firstSlug = [...open.keys()][0] ?? "?";
    return { blocks, malformed: `begin marker without end for "${firstSlug}"` };
  }
  return { blocks, malformed: undefined };
}

export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boundaryPattern(name: string): string {
  return `${escapeRegExp(name)}(?![a-zA-Z0-9_-])`;
}

export function outsideBlocks(text: string, blocks: FoundBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const block of sorted) {
    out += text.slice(cursor, block.start);
    cursor = block.end;
  }
  out += text.slice(cursor);
  return out;
}

export interface CollisionNames {
  keyframes: string[];
  animations: string[];
}

/**
 * E2 name collision: a keyframe / --animate-<name> / .animate-<name> already
 * exists outside our markers, or inside ANY other slug's block with a
 * different definition (all blocks are searched, comments stripped first).
 * Returns a human-readable reason or undefined.
 */
export function detectCollision(
  current: string,
  blocks: FoundBlock[],
  slug: string,
  names: CollisionNames,
  definitionPresent: (haystack: string, kind: "keyframe" | "animate-var" | "animate-class", name: string) => boolean,
): string | undefined {
  const stripped = stripComments(outsideBlocks(current, blocks));
  for (const name of names.keyframes) {
    if (new RegExp(`@keyframes\\s+${boundaryPattern(name)}`).test(stripped)) {
      return `keyframe "${name}" already exists outside the managed blocks`;
    }
  }
  for (const name of names.animations) {
    if (
      new RegExp(`--animate-${boundaryPattern(name)}`).test(stripped) ||
      new RegExp(`\\.animate-${boundaryPattern(name)}`).test(stripped)
    ) {
      return `animation "${name}" already exists outside the managed blocks`;
    }
  }
  for (const block of blocks) {
    if (block.slug === slug) continue;
    const inner = stripComments(block.inner);
    for (const name of names.keyframes) {
      if (
        new RegExp(`@keyframes\\s+${boundaryPattern(name)}`).test(inner) &&
        !definitionPresent(inner, "keyframe", name)
      ) {
        return `keyframe "${name}" is defined differently in "${block.slug}" block`;
      }
    }
    for (const name of names.animations) {
      const mentioned = new RegExp(`--animate-${boundaryPattern(name)}`).test(inner) ||
        new RegExp(`\\.animate-${boundaryPattern(name)}`).test(inner);
      if (mentioned && !definitionPresent(inner, "animate-var", name) && !definitionPresent(inner, "animate-class", name)) {
        return `animation "${name}" is defined differently in "${block.slug}" block`;
      }
    }
  }
  return undefined;
}

function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export interface PatchInput {
  current: string;
  slug: string;
  /** Inner block content (between markers) with LF endings. */
  blockInner: string;
  overwrite: boolean;
}

/**
 * Compute the next CSS content. Returns the action taken; conflicts must be
 * resolved by the caller (C12) before writing.
 * Malformed markers are an error (never append blindly): throws instead of
 * producing output so the caller can fail without touching the file.
 */
export function computePatched(input: PatchInput): { next: string; action: CssAction; eol: Eol } {
  const eol = detectEol(input.current);
  const toEol = (text: string): string => text.split("\n").join(eol);
  const begin = beginMarker(input.slug);
  const end = endMarker(input.slug);
  const scan = scanMarkers(input.current);
  if (scan.malformed !== undefined) {
    throw new Error(`refusing to patch CSS with malformed markers: ${scan.malformed}`);
  }
  const existing = scan.blocks.find((block) => block.slug === input.slug);
  if (existing !== undefined) {
    if (normalizeEol(existing.inner) === `\n${normalizeEol(input.blockInner)}\n`) {
      return { next: input.current, action: "unchanged", eol };
    }
    if (!input.overwrite) {
      return { next: input.current, action: "conflict", eol };
    }
    const next = `${input.current.slice(0, existing.start + begin.length)}\n${toEol(input.blockInner)}\n${input.current.slice(existing.end - end.length)}`;
    return { next, action: "conflict", eol };
  }
  const full = `${begin}\n${input.blockInner}\n${end}`;
  return { next: appendBlock(input.current, full, eol), action: "create", eol };
}

export function appendBlock(current: string, block: string, eol: Eol): string {
  const blockEol = block.split("\n").join(eol);
  if (current === "") return `${blockEol}${eol}`;
  if (current.endsWith("\r\n")) return `${current}${eol}${blockEol}${eol}`;
  if (current.endsWith("\n")) return `${current}${eol}${blockEol}${eol}`;
  return `${current}${eol}${eol}${blockEol}${eol}`;
}

export function validatedNames(validated: ValidatedStyles): CollisionNames {
  return {
    keyframes: validated.keyframes.map((frame) => frame.name),
    animations: validated.animations.map((anim) => anim.name),
  };
}

/**
 * Alias rewriting (C13): files ship with default aliases
 * (`@/lib/`, `@/hooks/`, `@/components/ui/`). Only when the user's
 * configured alias differs, rewrite import specifiers with
 * statement-anchored matching (never a blind global replace).
 */
export interface AliasPrefixes {
  components: string;
  lib: string;
  hooks: string;
}

export const SHIPPED_PREFIXES = ["@/components/ui/", "@/lib/", "@/hooks/"] as const;

export type ShippedPrefix = (typeof SHIPPED_PREFIXES)[number];

export interface RewriteResult {
  content: string;
  /** Line numbers (1-based) where a shipped alias string still occurs. */
  remaining: number[];
}

function shippedPrefixFor(specifier: string): ShippedPrefix | undefined {
  for (const prefix of SHIPPED_PREFIXES) {
    if (specifier === prefix.slice(0, -1) || specifier.startsWith(prefix)) return prefix;
  }
  return undefined;
}

function configuredFor(
  prefix: ShippedPrefix,
  configured: AliasPrefixes,
): string {
  if (prefix === "@/components/ui/") return withSlash(configured.components);
  if (prefix === "@/lib/") return withSlash(configured.lib);
  return withSlash(configured.hooks);
}

function withSlash(alias: string): string {
  return alias.endsWith("/") ? alias : `${alias}/`;
}

function needsRewrite(configured: AliasPrefixes): boolean {
  return configured.components !== "@/components/ui" ||
    configured.lib !== "@/lib" ||
    configured.hooks !== "@/hooks";
}

/**
 * Rewrite only specifiers in import/export/dynamic-import positions.
 * Comments, plain strings and JSX text are left untouched by construction.
 */
export function rewriteImports(raw: string, configured: AliasPrefixes): RewriteResult {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!needsRewrite(configured)) {
    return { content: normalized, remaining: findRemaining(normalized) };
  }
  const rewritten = rewriteStatements(normalized, configured);
  return { content: rewritten, remaining: findRemaining(rewritten) };
}

const STATEMENT_PATTERN =
  /(from\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s)*["']([^"']+)["'])|(import\s*(?:type\s+)?(?:\/\*[\s\S]*?\*\/|\s)*(["']([^"']+)["']))|(export\s+[^;]*?\sfrom\s*(?:\/\*[\s\S]*?\*\/|\s)*["']([^"']+)["'])|(import\s*\(\s*(?:\/\*[\s\S]*?\*\/|\s)*["']([^"']+)["']\s*\))/g;

interface CommentRange {
  start: number;
  end: number;
}

function findCommentRanges(content: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  while (i < content.length) {
    const two = content.slice(i, i + 2);
    if (!inSingle && !inDouble && !inTemplate) {
      if (two === "//") {
        const end = content.indexOf("\n", i);
        ranges.push({ start: i, end: end === -1 ? content.length : end });
        i = end === -1 ? content.length : end + 1;
        continue;
      }
      if (two === "/*") {
        const end = content.indexOf("*/", i + 2);
        ranges.push({ start: i, end: end === -1 ? content.length : end + 2 });
        i = end === -1 ? content.length : end + 2;
        continue;
      }
      const char = content[i];
      if (char === "'") inSingle = true;
      else if (char === '"') inDouble = true;
      else if (char === "`") inTemplate = true;
      i += 1;
      continue;
    }
    const char = content[i];
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (inSingle && char === "'") inSingle = false;
    else if (inDouble && char === '"') inDouble = false;
    else if (inTemplate && char === "`") inTemplate = false;
    i += 1;
  }
  return ranges;
}

function inRanges(index: number, ranges: CommentRange[]): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function rewriteStatements(content: string, configured: AliasPrefixes): string {
  const comments = findCommentRanges(content);
  let result = "";
  let cursor = 0;
  STATEMENT_PATTERN.lastIndex = 0;
  for (;;) {
    const match = STATEMENT_PATTERN.exec(content);
    if (match === null) break;
    const index = match.index;
    const full = match[0];
    const fromSpecifier: string | undefined = match[2];
    const sideSpecifier: string | undefined = match[5];
    const exportSpecifier: string | undefined = match[7];
    const dynamicSpecifier: string | undefined = match[9];
    const specifier = fromSpecifier ?? sideSpecifier ?? exportSpecifier ?? dynamicSpecifier;
    result += content.slice(cursor, index);
    if (specifier === undefined || inRanges(index, comments)) {
      result += full;
    } else {
      const prefix = shippedPrefixFor(specifier);
      if (prefix === undefined) {
        result += full;
      } else {
        const replacement = configuredFor(prefix, configured);
        const bare = prefix.slice(0, -1);
        let next: string;
        if (specifier === bare) {
          next = replacement.slice(0, -1);
        } else {
          next = `${replacement}${specifier.slice(prefix.length)}`;
        }
        const at = full.lastIndexOf(specifier);
        result += at === -1 ? full : `${full.slice(0, at)}${next}${full.slice(at + specifier.length)}`;
      }
    }
    cursor = index + full.length;
  }
  result += content.slice(cursor);
  return result;
}

function findRemaining(content: string): number[] {
  const lines = content.split("\n");
  const remaining: number[] = [];
  lines.forEach((line, index) => {
    for (const prefix of SHIPPED_PREFIXES) {
      if (line.includes(prefix) || line.includes(prefix.slice(0, -1))) {
        const bare = prefix.slice(0, -1);
        if (line.includes(prefix) || includesBareAlias(line, bare)) {
          remaining.push(index + 1);
          break;
        }
      }
    }
  });
  return remaining;
}

function includesBareAlias(line: string, bare: string): boolean {
  let cursor = line.indexOf(bare);
  while (cursor !== -1) {
    const after = line[cursor + bare.length];
    if (after === undefined || after === '"' || after === "'" || after === "`" || after === " " ||
      after === ";" || after === ",") {
      return true;
    }
    cursor = line.indexOf(bare, cursor + 1);
  }
  return false;
}

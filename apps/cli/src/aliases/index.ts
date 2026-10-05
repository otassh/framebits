/**
 * Alias resolution from tsconfig/jsconfig (C6) with jsonc-parser.
 * Follows `extends` (relative only, depth <= 5), honors baseUrl + wildcard
 * `paths`, and falls back to referenced configs when `references` exist.
 */
import { parse, type ParseError } from "jsonc-parser";
import { posix, win32 } from "node:path";
import { configError } from "../errors.js";

export interface AliasFileSystem {
  readFile(path: string): string | undefined;
}

export interface ResolvedAliases {
  /** Alias prefixes as written in code, e.g. "@/components/ui". */
  components: string;
  lib: string;
  hooks: string;
  /** Absolute directories those aliases point to. */
  dirs: {
    components: string;
    lib: string;
    hooks: string;
  };
}

interface TsconfigJson {
  extends?: string | string[] | undefined;
  compilerOptions?: {
    baseUrl?: string | undefined;
    paths?: Record<string, string[]> | undefined;
  } | undefined;
  references?: Array<{ path: string }> | undefined;
}

const MAX_EXTENDS_DEPTH = 5;

function toPosix(input: string): string {
  return input.split(win32.sep).join(posix.sep);
}

function normalizeAbsolute(root: string, target: string): string {
  const posixRoot = toPosix(root).replace(/\/+$/, "");
  const posixTarget = toPosix(target);
  if (posixTarget.startsWith("/")) return posixTarget;
  const stacked = `${posixRoot}/${posixTarget}`;
  const parts = stacked.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      if (out.length === 0) out.push("");
      continue;
    }
    if (part === "..") {
      if (out.length > 1) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/") || "/";
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeAbsolute("/", root);
  const normalizedCandidate = normalizeAbsolute("/", candidate);
  return normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function parseConfigText(text: string, file: string): TsconfigJson {
  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0 || typeof parsed !== "object" || parsed === null) {
    throw configError(`could not parse ${file}`, "fix the JSON syntax and re-run init");
  }
  return parsed;
}

function mergeConfigs(base: TsconfigJson, child: TsconfigJson): TsconfigJson {
  const mergedPaths: Record<string, string[]> = {
    ...(base.compilerOptions?.paths ?? {}),
    ...(child.compilerOptions?.paths ?? {}),
  };
  return {
    extends: child.extends,
    compilerOptions: {
      baseUrl: child.compilerOptions?.baseUrl ?? base.compilerOptions?.baseUrl,
      paths: Object.keys(mergedPaths).length > 0 ? mergedPaths : undefined,
    },
    references: child.references ?? base.references,
  };
}

function resolveExtendsChain(
  startFile: string,
  startDir: string,
  fs: AliasFileSystem,
): TsconfigJson {
  let current = parseConfigText(fs.readFile(startFile) ?? "", startFile);
  const chain: TsconfigJson[] = [current];
  let dir = startDir;
  const seen = new Set<string>([startFile]);
  for (let depth = 0; depth < MAX_EXTENDS_DEPTH; depth++) {
    const ext = current.extends;
    const first = Array.isArray(ext) ? ext[0] : ext;
    if (typeof first !== "string" || first === "") break;
    if (!first.startsWith(".")) break;
    const withJson = first.endsWith(".json") ? first : `${first}.json`;
    const nextFile = normalizeAbsolute(dir, withJson);
    if (seen.has(nextFile)) break;
    seen.add(nextFile);
    const text = fs.readFile(nextFile);
    if (text === undefined) break;
    current = parseConfigText(text, nextFile);
    chain.push(current);
    const lastSlash = nextFile.lastIndexOf("/");
    dir = lastSlash === -1 ? "." : nextFile.slice(0, lastSlash);
  }
  let merged: TsconfigJson = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    merged = mergeConfigs(merged, chain[i] as TsconfigJson);
  }
  return merged;
}

function stripWildcard(pattern: string): { prefix: string; hasWildcard: boolean } {
  if (pattern.endsWith("/*")) return { prefix: pattern.slice(0, -2), hasWildcard: true };
  if (pattern.endsWith("*")) return { prefix: pattern.slice(0, -1), hasWildcard: true };
  return { prefix: pattern, hasWildcard: false };
}

function targetToDir(
  projectRoot: string,
  configDir: string,
  baseUrl: string | undefined,
  target: string,
): string | undefined {
  const clean = target.replace(/\/\*$/, "").replace(/\*$/, "");
  const base = baseUrl !== undefined ? normalizeAbsolute(configDir, baseUrl) : configDir;
  const absolute = normalizeAbsolute(base, clean === "" ? "." : clean);
  if (!isInside(projectRoot, absolute)) return undefined;
  return absolute;
}

export interface AliasResolutionInput {
  projectRoot: string;
  configDir: string;
  configFile: string;
  fs: AliasFileSystem;
  isVite: boolean;
}

export function resolveAliasesFromConfig(input: AliasResolutionInput): ResolvedAliases {
  const { projectRoot, configDir, configFile, fs, isVite } = input;
  const startFile = normalizeAbsolute(configDir, configFile);
  const rawText = fs.readFile(startFile);
  if (rawText === undefined) {
    throw configError(
      `could not read ${configFile}`,
      "re-run init inside the project directory",
    );
  }
  let merged = resolveExtendsChain(startFile, configDir, fs);
  if (
    (merged.compilerOptions?.paths === undefined ||
      Object.keys(merged.compilerOptions.paths).length === 0) &&
    merged.references !== undefined &&
    merged.references.length > 0
  ) {
    for (const ref of merged.references) {
      const refFile = normalizeAbsolute(configDir, `${ref.path.replace(/\/+$/, "")}.json`);
      const refAlt = normalizeAbsolute(configDir, ref.path);
      const text = fs.readFile(refFile) ?? fs.readFile(refAlt);
      if (text === undefined) continue;
      const parsed = parseConfigText(text, refFile);
      const paths = parsed.compilerOptions?.paths;
      if (paths !== undefined && Object.keys(paths).length > 0) {
        merged = {
          ...merged,
          compilerOptions: {
            ...merged.compilerOptions,
            baseUrl: parsed.compilerOptions?.baseUrl ?? merged.compilerOptions?.baseUrl,
            paths,
          },
        };
        break;
      }
    }
  }

  const paths = merged.compilerOptions?.paths ?? {};
  const baseUrl = merged.compilerOptions?.baseUrl;
  const found = new Map<string, string>();

  for (const [pattern, targets] of Object.entries(paths)) {
    const { prefix, hasWildcard } = stripWildcard(pattern);
    if (prefix === "") continue;
    const first = targets[0];
    if (first === undefined) continue;
    const dir = targetToDir(projectRoot, configDir, baseUrl, hasWildcard ? first : first);
    if (dir === undefined) continue;
    if (!found.has(prefix)) found.set(prefix, dir);
  }

  if (baseUrl !== undefined && found.size === 0) {
    const base = normalizeAbsolute(configDir, baseUrl);
    if (isInside(projectRoot, base)) {
      return {
        components: "@/components/ui",
        lib: "@/lib",
        hooks: "@/hooks",
        dirs: {
          components: normalizeAbsolute(base, "components/ui"),
          lib: normalizeAbsolute(base, "lib"),
          hooks: normalizeAbsolute(base, "hooks"),
        },
      };
    }
  }

  const atStar = found.get("@");
  if (atStar !== undefined) {
    return {
      components: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
      dirs: {
        components: normalizeAbsolute(atStar, "components/ui"),
        lib: normalizeAbsolute(atStar, "lib"),
        hooks: normalizeAbsolute(atStar, "hooks"),
      },
    };
  }

  // Custom base prefix (e.g. "~/*" -> "./src/*"): derive ~/components/ui, ~/lib, ~/hooks.
  for (const [prefix, dir] of found) {
    if (!prefix.startsWith("@") && !prefix.startsWith("~") && !prefix.startsWith("#")) continue;
    if (prefix.includes("/")) continue;
    return {
      components: `${prefix}/components/ui`,
      lib: `${prefix}/lib`,
      hooks: `${prefix}/hooks`,
      dirs: {
        components: normalizeAbsolute(dir, "components/ui"),
        lib: normalizeAbsolute(dir, "lib"),
        hooks: normalizeAbsolute(dir, "hooks"),
      },
    };
  }

  const components = found.get("@/components/ui") ?? found.get("~/components/ui");
  const lib = found.get("@/lib") ?? found.get("~/lib");
  const hooks = found.get("@/hooks") ?? found.get("~/hooks");
  if (components !== undefined && lib !== undefined && hooks !== undefined) {
    const basePrefix = components.startsWith("~/") ? "~" : "@";
    return {
      components: `${basePrefix}/components/ui`,
      lib: `${basePrefix}/lib`,
      hooks: `${basePrefix}/hooks`,
      dirs: { components, lib, hooks },
    };
  }

  throw configError(
    "no usable import alias found (expected @/* -> ./src/* or ./*)",
    viteHint(isVite),
  );
}

function tsconfigSnippet(): string {
  return [
    "{",
    '  "compilerOptions": {',
    '    "baseUrl": ".",',
    '    "paths": { "@/*": ["./src/*"] }',
    "  }",
    "}",
  ].join("\n");
}

function viteSnippet(): string {
  return [
    "import { defineConfig } from \"vite\";",
    "",
    "export default defineConfig({",
    "  resolve: { alias: { \"@\": \"/src\" } },",
    "});",
  ].join("\n");
}

export function viteHint(isVite: boolean): string {
  const base =
    `add paths to tsconfig.json: ${tsconfigSnippet()}`;
  if (isVite) return `${base} and mirror it in vite.config.ts: ${viteSnippet()}`;
  return base;
}

export function aliasInstructions(isVite: boolean): string {
  return viteHint(isVite);
}

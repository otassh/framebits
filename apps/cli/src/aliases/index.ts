/**
 * Alias resolution from tsconfig/jsconfig (C6) with jsonc-parser.
 * Follows `extends` (relative only, depth <= 5), honors baseUrl + wildcard
 * `paths`, and falls back to referenced configs when `references` exist.
 */
import { parse, type ParseError } from "jsonc-parser";
import { MAX_TSCONFIG_DEPTH, TsconfigSchema, type Tsconfig } from "@framebits/shared";
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

interface TsconfigJson extends Tsconfig {
  /** Directory of the config that declared paths (which may be inherited). */
  pathsDir?: string | undefined;
}

function toPosix(input: string): string {
  return input.split(win32.sep).join(posix.sep);
}

function normalizeAbsolute(root: string, target: string): string {
  const posixTarget = toPosix(target);
  if (posixTarget.startsWith("/") || /^[A-Za-z]:\//.test(posixTarget)) {
    return posix.normalize(posixTarget);
  }
  return posix.normalize(`${toPosix(root)}/${posixTarget}`);
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeAbsolute("/", root);
  const normalizedCandidate = normalizeAbsolute("/", candidate);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

function parseConfigText(text: string, file: string): TsconfigJson {
  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0 || typeof parsed !== "object" || parsed === null) {
    throw configError(`could not parse ${file}`, "fix the JSON syntax and re-run init");
  }
  const result = TsconfigSchema.safeParse(parsed);
  if (!result.success) {
    throw configError(
      `invalid TypeScript configuration in ${file}`,
      "check extends, references, baseUrl, and paths",
    );
  }
  return result.data;
}

function mergeConfigs(base: TsconfigJson, child: TsconfigJson): TsconfigJson {
  return {
    extends: child.extends,
    compilerOptions: {
      baseUrl: child.compilerOptions?.baseUrl ?? base.compilerOptions?.baseUrl,
      paths: child.compilerOptions?.paths ?? base.compilerOptions?.paths,
    },
    references: child.references,
    pathsDir: child.pathsDir ?? base.pathsDir,
  };
}

function resolveExtendsChain(
  startFile: string,
  startDir: string,
  fs: AliasFileSystem,
): TsconfigJson {
  const visiting = new Set<string>();
  function load(file: string, dir: string, depth: number): TsconfigJson {
    if (depth > MAX_TSCONFIG_DEPTH || visiting.has(file)) {
      throw configError(
        "cyclic or too-deep TypeScript extends chain",
        "keep relative extends acyclic and at most 5 levels deep",
      );
    }
    visiting.add(file);
    const current = parseConfigText(fs.readFile(file) ?? "", file);
    let inherited: TsconfigJson = {};
    const bases =
      current.extends === undefined
        ? []
        : Array.isArray(current.extends)
          ? current.extends
          : [current.extends];
    for (const base of bases) {
      if (!base.startsWith(".")) continue;
      const nextFile = normalizeAbsolute(dir, base.endsWith(".json") ? base : `${base}.json`);
      const loaded = load(nextFile, posix.dirname(nextFile), depth + 1);
      inherited = mergeConfigs(inherited, loaded);
    }
    const normalized: TsconfigJson = {
      ...current,
      compilerOptions: {
        ...current.compilerOptions,
        baseUrl:
          current.compilerOptions?.baseUrl === undefined
            ? undefined
            : normalizeAbsolute(dir, current.compilerOptions.baseUrl),
      },
      pathsDir: current.compilerOptions?.paths === undefined ? undefined : dir,
      references: current.references?.map((ref) => ({ path: normalizeAbsolute(dir, ref.path) })),
    };
    visiting.delete(file);
    return mergeConfigs(inherited, normalized);
  }
  return load(startFile, startDir, 0);
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
    throw configError(`could not read ${configFile}`, "re-run init inside the project directory");
  }
  let merged = resolveExtendsChain(startFile, configDir, fs);
  if (
    (merged.compilerOptions?.paths === undefined ||
      Object.keys(merged.compilerOptions.paths).length === 0) &&
    merged.references !== undefined &&
    merged.references.length > 0
  ) {
    for (const ref of merged.references) {
      const refPath = normalizeAbsolute(configDir, ref.path.replace(/\/+$/, ""));
      const actualFile = [refPath, `${refPath}.json`, `${refPath}/tsconfig.json`].find(
        (path) => fs.readFile(path) !== undefined,
      );
      if (actualFile === undefined) continue;
      const parsed = resolveExtendsChain(actualFile, posix.dirname(actualFile), fs);
      const paths = parsed.compilerOptions?.paths;
      if (paths !== undefined && Object.keys(paths).length > 0) {
        merged = mergeConfigs(merged, parsed);
        break;
      }
    }
  }

  const paths = merged.compilerOptions?.paths ?? {};
  const baseUrl = merged.compilerOptions?.baseUrl;
  const found = new Map<string, string>();

  for (const [pattern, targets] of Object.entries(paths)) {
    const { prefix } = stripWildcard(pattern);
    if (prefix === "") continue;
    const first = targets[0];
    if (first === undefined) continue;
    const dir = targetToDir(projectRoot, merged.pathsDir ?? configDir, baseUrl, first);
    if (dir === undefined) continue;
    if (!found.has(prefix)) found.set(prefix, dir);
  }

  const atStar = found.get("@");
  if (atStar !== undefined) {
    return {
      components: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
      dirs: {
        components: found.get("@/components/ui") ?? normalizeAbsolute(atStar, "components/ui"),
        lib: found.get("@/lib") ?? normalizeAbsolute(atStar, "lib"),
        hooks: found.get("@/hooks") ?? normalizeAbsolute(atStar, "hooks"),
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
        components: found.get(`${prefix}/components/ui`) ?? normalizeAbsolute(dir, "components/ui"),
        lib: found.get(`${prefix}/lib`) ?? normalizeAbsolute(dir, "lib"),
        hooks: found.get(`${prefix}/hooks`) ?? normalizeAbsolute(dir, "hooks"),
      },
    };
  }

  const components = found.get("@/components/ui") ?? found.get("~/components/ui");
  const lib = found.get("@/lib") ?? found.get("~/lib");
  const hooks = found.get("@/hooks") ?? found.get("~/hooks");
  if (components !== undefined && lib !== undefined && hooks !== undefined) {
    const basePrefix = found.has("~/components/ui") ? "~" : "@";
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
  return ["{", '  "compilerOptions": {', '    "paths": { "@/*": ["./src/*"] }', "  }", "}"].join(
    "\n",
  );
}

function viteSnippet(): string {
  return [
    'import { defineConfig } from "vite";',
    'import { fileURLToPath } from "node:url";',
    "",
    "export default defineConfig({",
    '  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },',
    "});",
  ].join("\n");
}

export function viteHint(isVite: boolean): string {
  const base = `add paths to tsconfig.json: ${tsconfigSnippet()}`;
  if (isVite) return `${base} and mirror it in vite.config.ts: ${viteSnippet()}`;
  return base;
}

export function aliasInstructions(isVite: boolean): string {
  return viteHint(isVite);
}

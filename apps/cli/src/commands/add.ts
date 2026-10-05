/**
 * `add` command (C8-C15). Plan-then-apply with verification before disk,
 * conflict policy, alias rewriting, atomic apply with rollback, and clearly
 * labeled manual steps (npm install + Tailwind snippet; automated in 5b).
 */
import type { CliConfig, RegistryItem } from "@algorithco-ui/shared";
import { resolveAliasesFromConfig } from "../aliases/index.js";
import { loadConfig, writeConfigAtomic, type ConfigFs } from "../config/index.js";
import { detectPackageManager, installCommand } from "../detect/index.js";
import {
  conflictError,
  configError,
  integrityError,
} from "../errors.js";
import { applyPlan, type ApplyFs } from "../apply/index.js";
import { buildPlan } from "../plan/index.js";
import {
  fetchIndexSlugs,
  fetchJsonText,
  indexUrl,
  itemUrl,
  parseSlugArg,
  resolveRegistryUrl,
  type FetchFn,
} from "../registry-client/index.js";
import { resolveClosure } from "../resolve/index.js";
import type { Output } from "../ui/output.js";
import { printHint, printLine, printSuccess, printWarning } from "../ui/output.js";
import type { Prompts } from "../ui/prompts.js";

export interface AddOptions {
  cwd: string;
  slugs: string[];
  overwrite: boolean;
  dryRun: boolean;
  yes: boolean;
  registryFlag: string | undefined;
  debug: boolean;
}

export interface AddDeps {
  configFs: ConfigFs;
  applyFs: ApplyFs;
  output: Output;
  prompts: Prompts;
  interactive: boolean;
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  snapshot: {
    files: ReadonlySet<string>;
    dirs: ReadonlySet<string>;
    contents: ReadonlyMap<string, string>;
    packageJson:
      | {
        dependencies?: Record<string, string> | undefined;
        devDependencies?: Record<string, string> | undefined;
        packageManager?: string | undefined;
      }
      | undefined;
    tsconfigText: string | undefined;
    jsconfigText: string | undefined;
    isVite: boolean;
  };
  readExistingFile: (abs: string) => Promise<string | undefined>;
  listExistingPaths: () => Promise<string[]>;
  journalDir: string;
}

export interface AddResult {
  installed: string[];
  alreadyInstalled: string[];
  dryRun: boolean;
}

export async function runAdd(options: AddOptions, deps: AddDeps): Promise<AddResult> {
  const projectRoot = options.cwd;
  if (options.slugs.length === 0) {
    throw configError("no slugs given", "usage: algorithco-ui add <slug...> (e.g. add aurora-text)");
  }
  const loaded = await loadConfig(projectRoot, deps.configFs);
  if (loaded === undefined) {
    throw configError(
      "no algorithco-ui.json found (run init first)",
      "run `algorithco-ui init` inside the app directory, then retry add",
    );
  }
  const config = loaded.config;

  const explicit = options.slugs.map((arg) => parseSlugArg(arg));
  const registry = resolveRegistryUrl({
    flag: options.registryFlag,
    env: process.env["ALGORITHCO_UI_REGISTRY_URL"],
    config: config.registry,
  });

  const fetchOptions = {
    fetchFn: deps.fetchFn,
    sleep: deps.sleep,
  };
  const indexCache: { slugs: readonly string[] | undefined } = { slugs: undefined };
  const indexSlugs = (): Promise<readonly string[]> => {
    if (indexCache.slugs !== undefined) return Promise.resolve(indexCache.slugs);
    return fetchJsonText(indexUrl(registry), fetchOptions).then(
      ({ text }) => {
        const raw: unknown = JSON.parse(text);
        if (isIndexPayload(raw)) {
          const slugs: string[] = [];
          for (const entry of raw.items) {
            if (isSlugEntry(entry)) slugs.push(entry.slug);
          }
          indexCache.slugs = slugs;
          return slugs;
        }
        indexCache.slugs = [];
        return [];
      },
      () => {
        indexCache.slugs = [];
        return [];
      },
    );
  };

  const closure = await resolveClosure(explicit, {
    registry,
    fetchFn: deps.fetchFn,
    sleep: deps.sleep,
    indexSlugs,
  });
  const items: RegistryItem[] = closure.items;

  const aliasFs = {
    readFile: (path: string): string | undefined => {
      const rel = toRel(projectRoot, path);
      if (rel === undefined) return undefined;
      if (rel === "tsconfig.json") return deps.snapshot.tsconfigText;
      if (rel === "jsconfig.json") return deps.snapshot.jsconfigText;
      return deps.snapshot.contents.get(rel);
    },
  };
  const hasTsconfig = deps.snapshot.files.has("tsconfig.json");
  const hasJsconfig = deps.snapshot.files.has("jsconfig.json");
  const resolved = resolveAliasesFromConfig({
    projectRoot,
    configDir: projectRoot,
    configFile: hasTsconfig ? "tsconfig.json" : hasJsconfig ? "jsconfig.json" : "tsconfig.json",
    fs: aliasFs,
    isVite: deps.snapshot.isVite,
  });
  const aliasPrefixes = {
    components: config.aliases.components,
    lib: config.aliases.lib,
    hooks: config.aliases.hooks,
  };

  const existingPaths = await deps.listExistingPaths();
  const existing = new Map<string, string>();
  // Read existing contents lazily for planned targets only (after mapping).
  // First map to discover targets, then read.
  const prelimTargets = new Set<string>();
  for (const item of items) {
    for (const file of item.files) {
      const target = mapTarget(file.path, resolved.dirs);
      prelimTargets.add(target);
    }
  }
  for (const target of prelimTargets) {
    const content = await deps.readExistingFile(target);
    if (content !== undefined) existing.set(target, content);
  }

  const packageManager = deps.snapshot.packageJson !== undefined
    ? detectPackageManager(
      { root: projectRoot, files: deps.snapshot.files, dirs: deps.snapshot.dirs, contents: deps.snapshot.contents },
      deps.snapshot.packageJson,
    )
    : "npm";

  const plan = buildPlan({
    items,
    aliases: aliasPrefixes,
    aliasDirs: resolved.dirs,
    projectRoot,
    existing,
    existingPaths,
    installed: config.installed,
    installCommandFor: (names) => installCommand(packageManager, names),
  });

  const alreadyInstalled = plan.statuses
    .filter((status) => status.status === "already-installed")
    .map((status) => status.slug);

  if (options.dryRun) {
    printPlan(deps.output, plan.files, alreadyInstalled);
    printManualSteps(deps.output, plan.manual);
    return { installed: [], alreadyInstalled, dryRun: true };
  }

  const conflicts = plan.conflicts;
  const skipSlugs = new Set<string>();
  if (conflicts.length > 0 && !options.overwrite) {
    if (deps.interactive) {
      const decisions = new Map<string, "overwrite" | "skip" | "abort">();
      for (const file of conflicts) {
        if (decisions.has(file.itemSlug)) continue;
        const decision = await deps.prompts.selectFileAction(file.targetRel);
        if (decision === "abort") {
          throw conflictError("aborted by user", "re-run with --overwrite to overwrite all conflicts");
        }
        decisions.set(file.itemSlug, decision);
      }
      for (const file of conflicts) {
        if (decisions.get(file.itemSlug) === "skip") skipSlugs.add(file.itemSlug);
      }
      if (skipSlugs.size > 0) {
        printWarning(
          deps.output,
          `skipping ${[...skipSlugs].join(", ")}: the item may be incomplete`,
        );
      }
    } else {
      const lines = conflicts.map((file) => `  ${file.targetRel} (${file.itemSlug})`);
      throw conflictError(
        `conflicting files exist (use --overwrite to replace them):\n${lines.join("\n")}`,
        "re-run with --overwrite, or resolve the conflicts manually",
      );
    }
  }
  const overwriteAll = options.overwrite;
  const effectiveSkip = new Set<string>([...skipSlugs]);

  const versions = new Map<string, { version: string; hash: string }>();
  for (const item of items) {
    versions.set(item.slug, { version: item.version, hash: item.hash });
  }

  const writeConfig = async (next: CliConfig): Promise<void> => {
    await writeConfigAtomic(projectRoot, next, deps.configFs);
  };

  await applyPlan(deps.applyFs, {
    projectRoot,
    files: plan.files,
    config,
    versions,
    writeConfig,
    overwrite: overwriteAll || deps.interactive,
    skipSlugs: effectiveSkip,
  }, deps.journalDir);

  const installed = items
    .map((item) => item.slug)
    .filter((slug) => !alreadyInstalled.includes(slug) && !effectiveSkip.has(slug));

  for (const slug of alreadyInstalled) {
    printLine(deps.output, `already installed: ${slug}`);
  }
  for (const slug of installed) {
    const item = items.find((entry) => entry.slug === slug);
    printSuccess(deps.output, `added ${slug}@${item?.version ?? "?"}`);
  }
  if (effectiveSkip.size > 0) {
    printWarning(deps.output, `skipped: ${[...effectiveSkip].join(", ")}`);
  }
  printManualSteps(deps.output, plan.manual);
  return { installed, alreadyInstalled, dryRun: false };
}

function mapTarget(
  registryPath: string,
  aliasDirs: { components: string; lib: string; hooks: string },
): string {
  if (registryPath.startsWith("components/ui/")) {
    return `${aliasDirs.components.replace(/\/+$/, "")}/${registryPath.slice("components/ui/".length)}`;
  }
  if (registryPath.startsWith("lib/")) {
    return `${aliasDirs.lib.replace(/\/+$/, "")}/${registryPath.slice("lib/".length)}`;
  }
  if (registryPath.startsWith("hooks/")) {
    return `${aliasDirs.hooks.replace(/\/+$/, "")}/${registryPath.slice("hooks/".length)}`;
  }
  throw integrityError(`unknown registry path prefix: ${registryPath}`, "report the registry content");
}

function printPlan(
  output: Output,
  files: Array<{ targetRel: string; action: string; itemSlug: string }>,
  alreadyInstalled: string[],
): void {
  printLine(output, "plan (dry-run; nothing written):");
  for (const file of files) {
    printLine(output, `  ${file.action}: ${file.targetRel} (${file.itemSlug})`);
  }
  for (const slug of alreadyInstalled) {
    printLine(output, `already installed: ${slug}`);
  }
}

function printManualSteps(
  output: Output,
  manual: { installCommand: string; missingDeps: string[]; tailwindSnippet: string },
): void {
  printLine(output, "Manual steps (automated in a later release):");
  if (manual.installCommand !== "") {
    printLine(output, `  install missing npm deps: ${manual.installCommand}`);
  } else {
    printLine(output, "  install missing npm deps: none");
  }
  if (manual.tailwindSnippet !== "") {
    printLine(output, "  Tailwind keyframes/animation/cssVars to merge manually:");
    for (const line of manual.tailwindSnippet.split("\n")) {
      printLine(output, `    ${line}`);
    }
  } else {
    printLine(output, "  Tailwind keyframes/animation/cssVars: none");
  }
  if (manual.missingDeps.length > 0) {
    printHint(output, "Tailwind merging and npm install are manual in 5a (automated in 5b)");
  }
}

function toRel(root: string, abs: string): string | undefined {
  const cleanRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const cleanAbs = abs.replace(/\\/g, "/");
  if (cleanAbs === cleanRoot) return ".";
  if (cleanAbs.startsWith(`${cleanRoot}/`)) return cleanAbs.slice(cleanRoot.length + 1);
  if (!cleanAbs.includes("/") && !cleanAbs.includes(":")) return cleanAbs;
  return undefined;
}

function isIndexPayload(raw: unknown): raw is { items: unknown[] } {
  return typeof raw === "object" && raw !== null && "items" in raw &&
    Array.isArray(raw.items);
}

function isSlugEntry(entry: unknown): entry is { slug: string } {
  return typeof entry === "object" && entry !== null && "slug" in entry &&
    typeof entry.slug === "string";
}

export { fetchIndexSlugs, itemUrl };

/**
 * `add` command (C8-C15, E1-E7). Plan-then-apply with verification before
 * disk, conflict policy, alias rewriting, CSS patching, dependency
 * installation, atomic apply with rollback, and a short success summary.
 * Manual output appears only for skipped/impossible steps.
 */
import type { CliConfig, RegistryItem } from "@framebits/shared";
import { resolveAliasesFromConfig } from "../aliases/index.js";
import { loadConfig, writeConfigAtomic, type ConfigFs } from "../config/index.js";
import { detectPackageManager, type PackageManager } from "../detect/index.js";
import {
  conflictError,
  configError,
  integrityError,
} from "../errors.js";
import { applyPlan, type ApplyFs } from "../apply/index.js";
import {
  IGNORE_SCRIPTS_HINT,
  buildInstallCommand,
  pmBinaryCaution,
  renderCommand,
} from "../install/command.js";
import { computeMissing } from "../install/compute.js";
import type { Installer } from "../install/run.js";
import { buildPlan, type CssBlockPlan } from "../plan/index.js";
import {
  describeRegistrySource,
  fetchJsonText,
  indexUrl,
  parseJsonGuarded,
  parseSlugArg,
  redactUrl,
  resolveRegistryUrlWithSource,
  resolveTimeoutMs,
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
  noInstall: boolean;
  noStyles: boolean;
  registryFlag: string | undefined;
  /** Raw `--timeout <seconds>` value; validated by resolveTimeoutMs. */
  timeoutFlag: string | undefined;
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
  installer: Installer;
  snapshot: {
    files: ReadonlySet<string>;
    dirs: ReadonlySet<string>;
    contents: ReadonlyMap<string, string>;
    packageJson:
    | {
      dependencies?: Record<string, string> | undefined;
      devDependencies?: Record<string, string> | undefined;
      peerDependencies?: Record<string, string> | undefined;
      packageManager?: string | undefined;
    }
    | undefined;
    tsconfigText: string | undefined;
    jsconfigText: string | undefined;
    isVite: boolean;
  };
  readExistingFile: (abs: string) => Promise<string | undefined>;
  readNodeModuleVersion: (name: string) => Promise<string | undefined>;
  listExistingPaths: () => Promise<string[]>;
  journalDir: string;
}

export interface AddResult {
  installed: string[];
  alreadyInstalled: string[];
  dryRun: boolean;
}

function lockfileCandidates(manager: PackageManager): string[] {
  switch (manager) {
    case "pnpm":
      return ["pnpm-lock.yaml"];
    case "yarn":
      return ["yarn.lock"];
    case "npm":
      return ["package-lock.json"];
    case "bun":
      return ["bun.lockb", "bun.lock"];
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

function joinAbs(dir: string, rel: string): string {
  return `${dir.replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const cleanRoot = root.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  const cleanCandidate = candidate.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  if (cleanCandidate === cleanRoot) return true;
  if (process.platform === "win32") {
    return cleanCandidate.toLowerCase().startsWith(`${cleanRoot.toLowerCase()}/`);
  }
  return cleanCandidate.startsWith(`${cleanRoot}/`);
}

export async function runAdd(options: AddOptions, deps: AddDeps): Promise<AddResult> {
  const projectRoot = options.cwd;
  if (options.slugs.length === 0) {
    throw configError("no slugs given", "usage: framebits add <slug...> (e.g. add aurora-text)");
  }
  const loaded = await loadConfig(projectRoot, deps.configFs);
  if (loaded === undefined) {
    throw configError(
      "no framebits.json found (run init first)",
      "run `framebits init` inside the app directory, then retry add",
    );
  }
  const config = loaded.config;

  const explicit = options.slugs.map((arg) => parseSlugArg(arg));
  const resolvedRegistry = resolveRegistryUrlWithSource({
    flag: options.registryFlag,
    env: process.env["FRAMEBITS_REGISTRY_URL"],
    config: config.registry,
  });
  const registry = resolvedRegistry.url;
  if (options.debug) {
    // Debug-only source label (no URL value, no secret echo).
    printLine(deps.output, describeRegistrySource(resolvedRegistry.source));
  }
  const timeoutMs = resolveTimeoutMs({
    flag: options.timeoutFlag,
    env: process.env["FRAMEBITS_TIMEOUT"],
    configSeconds: config.timeoutSeconds,
  });

  const fetchOptions = { fetchFn: deps.fetchFn, sleep: deps.sleep, timeoutMs };
  const indexCache: { slugs: readonly string[] | undefined } = { slugs: undefined };
  const indexSlugs = (): Promise<readonly string[]> => {
    if (indexCache.slugs !== undefined) return Promise.resolve(indexCache.slugs);
    return fetchJsonText(indexUrl(registry), fetchOptions).then(
      ({ text }) => {
        const raw: unknown = parseJsonGuarded(text, "index.json");
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
    timeoutMs,
    indexSlugs,
  });
  for (const warning of closure.warnings) printWarning(deps.output, warning);
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
  // Alias inside-root enforcement (defense in depth): resolved alias dirs
  // must stay inside the project root even if tsconfig contains absolute
  // paths — otherwise plan targets could escape via mapping.
  for (const [label, dir] of Object.entries(resolved.dirs)) {
    if (!isInsideRoot(projectRoot, dir)) {
      throw configError(
        `resolved alias "${label}" escapes the project root (${redactUrl(dir)})`,
        "fix tsconfig paths so aliases point inside the project",
      );
    }
  }
  const aliasPrefixes = {
    components: config.aliases.components,
    lib: config.aliases.lib,
    hooks: config.aliases.hooks,
  };

  const existingPaths = await deps.listExistingPaths();
  const existing = new Map<string, string>();
  const prelimTargets = new Set<string>();
  for (const item of items) {
    for (const file of item.files) {
      prelimTargets.add(mapTarget(file.path, resolved.dirs));
    }
  }
  // The CSS entry is also read up front (plan-then-apply: complete plan first).
  const cssAbs = config.tailwind.css === undefined ? undefined : joinAbs(projectRoot, config.tailwind.css);
  const cssRel = config.tailwind.css;
  if (cssAbs !== undefined) prelimTargets.add(cssAbs);
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
    installCommandFor: (specs) => {
      const command = buildInstallCommand(packageManager, specs);
      return command === undefined ? "" : renderCommand(command);
    },
    styles: {
      tailwindVersion: config.tailwind.version,
      cssAbs,
      cssRel,
      cssContent: cssAbs === undefined ? undefined : existing.get(cssAbs),
      noStyles: options.noStyles,
    },
  });

  if (plan.malformedCss.length > 0) {
    for (const malformed of plan.malformedCss) {
      printWarning(deps.output, `refusing to touch ${malformed.cssRel}: ${malformed.reason}`);
      printLine(deps.output, `manual CSS for "${malformed.slug}":`);
      printLine(deps.output, malformed.manualSnippet);
    }
    throw conflictError(
      `malformed style markers in ${plan.malformedCss[0]?.cssRel ?? "the CSS entry"} (fix or remove them first)`,
      "re-run with --overwrite after fixing the markers, or apply the printed snippet by hand",
    );
  }

  const alreadyInstalled = plan.statuses
    .filter((status) => status.status === "already-installed")
    .map((status) => status.slug);

  // Install computation (pure; needs node_modules versions).
  const needed = items.flatMap((item) =>
    Object.entries(item.dependencies).map(([name, range]) => ({ name, range }))
  );
  const declared = {
    dependencies: deps.snapshot.packageJson?.dependencies ?? {},
    devDependencies: deps.snapshot.packageJson?.devDependencies ?? {},
    peerDependencies: deps.snapshot.packageJson?.peerDependencies ?? {},
  };
  const installedVersions = new Map<string, string>();
  for (const { name } of needed) {
    if (installedVersions.has(name)) continue;
    const version = await deps.readNodeModuleVersion(name);
    if (version !== undefined) installedVersions.set(name, version);
  }
  const { decisions, warnings } = computeMissing({ needed, declared, installed: installedVersions });
  const neededByName = new Map(needed.map((spec) => [spec.name, spec.range]));
  const toInstall = decisions.flatMap((decision) =>
    decision.action === "install" ? [{ name: decision.name, range: decision.range }] : []
  );
  const warnManuals: WarnManual[] = decisions.flatMap((decision) =>
    decision.action === "warn-manual"
      ? [{ name: decision.name, range: neededByName.get(decision.name) ?? "", detail: decision.detail }]
      : []
  );

  if (options.dryRun) {
    printDryRun(deps.output, plan, alreadyInstalled, toInstall, packageManager, warnManuals, warnings);
    return { installed: [], alreadyInstalled, dryRun: true };
  }

  // Conflict policy (C12) across files and CSS blocks.
  const cssConflicts = plan.cssConflicts;
  const skipSlugs = new Set<string>();
  const totalConflicts = plan.conflicts.length + cssConflicts.length;
  if (totalConflicts > 0 && !options.overwrite) {
    if (deps.interactive) {
      const decisionsBySlug = new Map<string, "overwrite" | "skip" | "abort">();
      const ask = async (slug: string, label: string): Promise<void> => {
        if (decisionsBySlug.has(slug)) return;
        const decision = await deps.prompts.selectFileAction(label);
        if (decision === "abort") {
          throw conflictError("aborted by user", "re-run with --overwrite to overwrite all conflicts");
        }
        decisionsBySlug.set(slug, decision);
      };
      for (const file of plan.conflicts) {
        await ask(file.itemSlug, file.targetRel);
      }
      for (const entry of cssConflicts) {
        await ask(entry.slug, `${entry.cssRel} [${entry.slug} styles]`);
      }
      for (const [slug, decision] of decisionsBySlug) {
        if (decision === "skip") skipSlugs.add(slug);
      }
      if (skipSlugs.size > 0) {
        printWarning(deps.output, `skipping ${[...skipSlugs].join(", ")}: the item may be incomplete`);
      }
    } else {
      const lines = [
        ...plan.conflicts.map((file) => `  ${file.targetRel} (${file.itemSlug})`),
        ...cssConflicts.map((entry) => `  ${entry.cssRel} [${entry.slug} styles]`),
      ];
      throw conflictError(
        `conflicting files exist (use --overwrite to replace them):\n${lines.join("\n")}`,
        "re-run with --overwrite, or resolve the conflicts manually",
      );
    }
  }

  // Decide whether the installer runs (E4 policy) — before any write.
  let installCommandBuilt: { program: string; args: string[]; display: string } | undefined;
  let installSkippedReason: string | undefined;
  if (toInstall.length > 0) {
    const built = buildInstallCommand(packageManager, toInstall);
    if (built !== undefined) {
      const display = renderCommand(built);
      // PATH caution + lifecycle-scripts review hint on every install path.
      printWarning(deps.output, pmBinaryCaution(built.program));
      printHint(deps.output, IGNORE_SCRIPTS_HINT);
      if (options.noInstall) {
        installSkippedReason = "--no-install: not running the installer";
        printInstallManual(deps.output, display, installSkippedReason);
      } else if (deps.interactive) {
        const confirmed = await deps.prompts.confirm(`run ${display}?`, true);
        if (confirmed) {
          installCommandBuilt = { ...built, display };
        } else {
          installSkippedReason = "installer declined";
          printInstallManual(deps.output, display, installSkippedReason);
        }
      } else if (options.yes) {
        installCommandBuilt = { ...built, display };
      } else {
        installSkippedReason = "non-interactive without --yes: not running the installer";
        printWarning(deps.output, installSkippedReason);
        printInstallManual(deps.output, display, installSkippedReason);
      }
    }
  }

  const versions = new Map<string, { version: string; hash: string }>();
  for (const item of items) {
    versions.set(item.slug, { version: item.version, hash: item.hash });
  }
  const writeConfig = async (next: CliConfig): Promise<void> => {
    await writeConfigAtomic(projectRoot, next, deps.configFs);
  };

  const cssPatches = plan.css
    .filter((entry) => entry.action === "create" || entry.action === "conflict")
    .map((entry) => ({
      absPath: entry.cssAbs,
      rel: entry.cssRel,
      slug: entry.slug,
      blockInner: splitBlockInner(entry.block, entry.slug),
      overwrite: entry.action === "conflict",
    }));

  const packageJsonAbs = joinAbs(projectRoot, "package.json");
  const snapshotFiles = [packageJsonAbs];
  for (const candidate of lockfileCandidates(packageManager)) {
    const abs = joinAbs(projectRoot, candidate);
    if (existingPaths.some((path) => normalizePath(path) === normalizePath(abs))) {
      snapshotFiles.push(abs);
    }
  }

  const installer = installCommandBuilt === undefined
    ? undefined
    : {
      command: {
        program: installCommandBuilt.program,
        args: installCommandBuilt.args,
        cwd: projectRoot,
        display: installCommandBuilt.display,
        packages: toInstall.map((spec) => spec.name),
      },
      run: (): Promise<{ exitCode: number | undefined; timedOut: boolean; stdout: string; stderr: string }> =>
        deps.installer.run(
          {
            program: installCommandBuilt.program,
            args: installCommandBuilt.args,
            cwd: projectRoot,
          },
          deps.interactive,
          options.debug,
        ),
    };

  const applied = await applyPlan(deps.applyFs, {
    projectRoot,
    files: plan.files,
    css: cssPatches,
    snapshotFiles,
    installer,
    config,
    versions,
    writeConfig,
    overwrite: options.overwrite || deps.interactive,
    skipSlugs,
  }, deps.journalDir);

  const installed = items
    .map((item) => item.slug)
    .filter((slug) => !alreadyInstalled.includes(slug) && !skipSlugs.has(slug));

  printSummary(deps.output, {
    files: plan.files.filter((file) => !skipSlugs.has(file.itemSlug)),
    css: plan.css,
    installedPackages: applied.installed,
    alreadyInstalled,
    skipped: [...skipSlugs],
    warnings,
    warnManuals,
    installSkipped: installSkippedReason,
    installCommand: installCommandBuilt?.display,
  });
  return { installed, alreadyInstalled, dryRun: false };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Extract the inner content from a generated full marker block. */
export function splitBlockInner(block: string, slug: string): string {
  const lines = block.split("\n");
  const first = lines[0] ?? "";
  const last = lines[lines.length - 1] ?? "";
  if (first !== `/* framebits:begin ${slug} */` || last !== `/* framebits:end ${slug} */`) {
    throw integrityError(
      `internal error: malformed generated block for "${slug}"`,
      "report this as a CLI bug",
    );
  }
  return lines.slice(1, -1).join("\n");
}

type WarnManual = { name: string; range: string; detail: string };

function printDryRun(
  output: Output,
  plan: ReturnType<typeof buildPlan>,
  alreadyInstalled: string[],
  toInstall: Array<{ name: string; range: string }>,
  manager: PackageManager,
  warnManuals: WarnManual[],
  warnings: string[],
): void {
  printLine(output, "plan (dry-run; nothing written):");
  for (const file of plan.files) {
    printLine(output, `  ${file.action}: ${file.targetRel} (${file.itemSlug})`);
  }
  for (const entry of plan.css) {
    printLine(output, `  patch-css ${entry.action}: ${entry.cssRel} (${entry.slug})`);
  }
  for (const slug of alreadyInstalled) {
    printLine(output, `already installed: ${slug}`);
  }
  if (toInstall.length > 0) {
    const command = buildInstallCommand(manager, toInstall);
    if (command !== undefined) {
      printLine(output, `install command (dry-run; not run): ${renderCommand(command)}`);
    }
  } else {
    printLine(output, "install command: none (all dependencies satisfied)");
  }
  for (const entry of plan.css) {
    if (entry.action === "create" || entry.action === "conflict") {
      printLine(output, `CSS block for "${entry.slug}":`);
      printLine(output, entry.block);
    }
    if (entry.action === "skip" && entry.manualSnippet !== undefined) {
      printLine(output, `CSS manual snippet for "${entry.slug}" (${entry.skipReason ?? "skipped"}):`);
      printLine(output, entry.manualSnippet);
    }
  }
  for (const warning of warnings) printWarning(output, warning);
  for (const entry of warnManuals) {
    printWarning(output, entry.detail);
    const single = buildInstallCommand(manager, [{ name: entry.name, range: entry.range }]);
    if (single !== undefined) printLine(output, `manual: ${renderCommand(single)}`);
  }
}

function printInstallManual(output: Output, display: string, reason: string): void {
  printLine(output, "Manual steps:");
  printLine(output, `  install missing npm deps (${reason}): ${display}`);
}

function printSummary(
  output: Output,
  summary: {
    files: Array<{ action: string }>;
    css: readonly CssBlockPlan[];
    installedPackages: string[];
    alreadyInstalled: string[];
    skipped: string[];
    warnings: string[];
    warnManuals: WarnManual[];
    installSkipped: string | undefined;
    installCommand: string | undefined;
  },
): void {
  const created = summary.files.filter((file) => file.action === "create").length;
  const unchanged = summary.files.filter((file) => file.action === "unchanged").length;
  const cssWritten = summary.css.filter((entry) => entry.action === "create" || entry.action === "conflict").length;
  printSuccess(output, `done: ${String(created)} file(s) created, ${String(unchanged)} unchanged`);
  if (cssWritten > 0) {
    printLine(output, `CSS blocks written: ${String(cssWritten)}`);
  }
  if (summary.installedPackages.length > 0) {
    printLine(output, `packages installed: ${summary.installedPackages.join(", ")}`);
  }
  for (const slug of summary.alreadyInstalled) {
    printLine(output, `already installed: ${slug}`);
  }
  if (summary.skipped.length > 0) {
    printWarning(output, `skipped: ${summary.skipped.join(", ")}`);
  }
  for (const warning of summary.warnings) printWarning(output, warning);
  for (const entry of summary.warnManuals) {
    printWarning(output, entry.detail);
    printHint(output, `manual: install ${entry.name} yourself if needed`);
  }
  if (summary.installSkipped !== undefined && summary.installCommand !== undefined) {
    printLine(output, "Manual steps:");
    printLine(output, `  install missing npm deps (${summary.installSkipped}): ${summary.installCommand}`);
  }
  for (const entry of summary.css) {
    if (entry.action === "skip" && entry.manualSnippet !== undefined) {
      printLine(output, "Manual steps:");
      printLine(output, `  styles for "${entry.slug}" (${entry.skipReason ?? "skipped"}), apply by hand:`);
      printLine(output, entry.manualSnippet);
    }
  }
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

function isIndexPayload(raw: unknown): raw is { items: unknown[] } {
  return typeof raw === "object" && raw !== null && "items" in raw &&
    Array.isArray(raw.items);
}

function isSlugEntry(entry: unknown): entry is { slug: string } {
  return typeof entry === "object" && entry !== null && "slug" in entry &&
    typeof entry.slug === "string";
}

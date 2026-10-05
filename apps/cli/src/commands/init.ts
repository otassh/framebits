/**
 * `init` command (C5-C7). Detects the project, resolves aliases, writes
 * framebits.json idempotently. Never modifies tsconfig or other files.
 */
import type { CliConfig } from "@framebits/shared";
import { resolveAliasesFromConfig } from "../aliases/index.js";
import { loadConfig, mergeInitConfig, writeConfigAtomic, type ConfigFs } from "../config/index.js";
import { detectProject, type PackageJson } from "../detect/index.js";
import { configError } from "../errors.js";
import type { Output } from "../ui/output.js";
import { printLine, printSuccess, printWarning } from "../ui/output.js";
import type { Prompts } from "../ui/prompts.js";

export interface InitDeps {
  fs: ConfigFs & {
    readSnapshotFile(path: string): Promise<string | undefined>;
  };
  output: Output;
  prompts: Prompts;
  interactive: boolean;
}

export interface InitOptions {
  cwd: string;
  yes: boolean;
  registryFlag: string | undefined;
}

export interface SnapshotReader {
  snapshot: {
    root: string;
    files: ReadonlySet<string>;
    dirs: ReadonlySet<string>;
    contents: ReadonlyMap<string, string>;
  };
  packageJson: PackageJson | undefined;
  tsconfigText: string | undefined;
  jsconfigText: string | undefined;
}

export async function runInit(
  options: InitOptions,
  snapshot: SnapshotReader,
  deps: InitDeps,
): Promise<{ config: CliConfig; path: string; created: boolean }> {
  const projectRoot = options.cwd;
  const detection = detectProject(
    {
      root: snapshot.snapshot.root,
      files: snapshot.snapshot.files,
      dirs: snapshot.snapshot.dirs,
      contents: snapshot.snapshot.contents,
    },
    snapshot.packageJson,
  );

  if (detection.tailwind.version === undefined) {
    printWarning(deps.output, "Tailwind CSS not detected; continuing without Tailwind integration");
  }

  const isVite = detection.framework === "vite";
  const configDir = projectRoot;
  const hasTsconfig = snapshot.snapshot.files.has("tsconfig.json");
  const hasJsconfig = snapshot.snapshot.files.has("jsconfig.json");
  const configFile = hasTsconfig ? "tsconfig.json" : hasJsconfig ? "jsconfig.json" : "tsconfig.json";

  const aliasFs = {
    readFile: (path: string): string | undefined => {
      const rel = toRel(projectRoot, path);
      if (rel === undefined) return undefined;
      if (rel === "tsconfig.json") return snapshot.tsconfigText;
      if (rel === "jsconfig.json") return snapshot.jsconfigText;
      return snapshot.snapshot.contents.get(rel);
    },
  };

  let resolved: { components: string; lib: string; hooks: string };
  try {
    resolved = resolveAliasesFromConfig({
      projectRoot,
      configDir,
      configFile,
      fs: aliasFs,
      isVite,
    });
  } catch (error) {
    if (error instanceof Error && "exitCode" in error && "errorCode" in error) {
      throw error;
    }
    throw configError("no usable import alias found", "add paths to tsconfig.json and re-run init");
  }

  const existing = await loadConfig(projectRoot, deps.fs);
  const registryEnv = process.env["FRAMEBITS_REGISTRY_URL"];
  const detectedRegistry = options.registryFlag ??
    registryEnv ??
    existing?.config.registry ??
    "https://framebits.dev/r";

  const tailwind = detection.tailwind.version === undefined
    ? { version: 3 as const, config: undefined as string | undefined, css: undefined as string | undefined }
    : {
      version: detection.tailwind.version,
      config: detection.tailwind.config,
      css: detection.tailwind.css,
    };

  let next: CliConfig = mergeInitConfig(
    existing?.config,
    {
      registry: detectedRegistry,
      framework: detection.framework,
      typescript: true,
      tailwind,
      aliases: { components: resolved.components, lib: resolved.lib, hooks: resolved.hooks },
    },
    { yes: options.yes, registryFlag: options.registryFlag },
  );

  if (existing !== undefined && !options.yes && deps.interactive) {
    const changed: Array<{ field: string; from: string; to: string }> = [];
    if (existing.config.registry !== next.registry) {
      changed.push({
        field: "registry",
        from: existing.config.registry,
        to: next.registry,
      });
    }
    if (existing.config.framework !== next.framework) {
      changed.push({
        field: "framework",
        from: existing.config.framework,
        to: next.framework,
      });
    }
    if (JSON.stringify(existing.config.aliases) !== JSON.stringify(next.aliases)) {
      changed.push({
        field: "aliases",
        from: JSON.stringify(existing.config.aliases),
        to: JSON.stringify(next.aliases),
      });
    }
    for (const change of changed) {
      const confirmed = await deps.prompts.confirm(
        `change ${change.field} from ${change.from} to ${change.to}?`,
        false,
      );
      if (!confirmed) {
        if (change.field === "registry") next = { ...next, registry: existing.config.registry };
        if (change.field === "framework") next = { ...next, framework: existing.config.framework };
        if (change.field === "aliases") next = { ...next, aliases: existing.config.aliases };
      }
    }
    next = { ...next, installed: existing.config.installed };
  } else if (existing !== undefined) {
    next = { ...next, installed: existing.config.installed };
  }

  const path = await writeConfigAtomic(projectRoot, next, deps.fs);
  if (existing === undefined) {
    printSuccess(deps.output, `initialized framebits in ${path}`);
  } else {
    printSuccess(deps.output, `updated ${path} (installed entries preserved)`);
  }
  printLine(
    deps.output,
    `detected: ${detection.framework}${detection.nextRouter !== undefined ? ` (${detection.nextRouter})` : ""}, ${detection.packageManager}, tailwind ${detection.tailwind.version === undefined ? "missing" : `v${String(detection.tailwind.version)}`}`,
  );
  return { config: next, path, created: existing === undefined };
}

function toRel(root: string, abs: string): string | undefined {
  const cleanRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const cleanAbs = abs.replace(/\\/g, "/");
  if (cleanAbs === cleanRoot) return ".";
  if (cleanAbs.startsWith(`${cleanRoot}/`)) return cleanAbs.slice(cleanRoot.length + 1);
  if (!cleanAbs.includes("/") && !cleanAbs.includes(":")) return cleanAbs;
  return undefined;
}

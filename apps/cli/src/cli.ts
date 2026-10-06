/**
 * framebits CLI entry (C15). Thin: parses args with commander,
 * delegates to commands/init and commands/add.
 */
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAdd } from "./commands/add.js";
import { runInit } from "./commands/init.js";
import { nodeApplyFs, nodeConfigFs, readProjectSnapshot } from "./fs/node.js";
import { withTemporaryJournal } from "./fs/temporary-journal.js";
import { exitCodeFor, formatError } from "./errors.js";
import { createInstaller, nodeSpawn } from "./install/run.js";
import { createNodeOutput, isInteractiveProcess, printError, printHint } from "./ui/output.js";
import { nodePrompts } from "./ui/prompts.js";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "./version.js";

const EXAMPLES = [
  "examples:",
  "  framebits init",
  "  framebits init --yes --cwd ./my-app",
  "  framebits add aurora-text",
  "  framebits add aurora-text shimmer-button --overwrite",
  "  framebits add cn@1.0.0 --dry-run",
  "  framebits add shimmer-button --no-install --no-styles",
  "  framebits add aurora-text --timeout 30",
].join("\n");

interface SnapshotPackageJson {
  dependencies?: Record<string, string> | undefined;
  devDependencies?: Record<string, string> | undefined;
  peerDependencies?: Record<string, string> | undefined;
  packageManager?: string | undefined;
}

async function readSnapshotFor(root: string): Promise<{
  files: ReadonlySet<string>;
  dirs: ReadonlySet<string>;
  contents: ReadonlyMap<string, string>;
  packageJson: SnapshotPackageJson | undefined;
  tsconfigText: string | undefined;
  jsconfigText: string | undefined;
  isVite: boolean;
}> {
  const snapshot = await readProjectSnapshot(root);
  let packageJson: SnapshotPackageJson | undefined;
  const pkgText = snapshot.contents.get("package.json");
  if (pkgText !== undefined) {
    try {
      const raw: unknown = JSON.parse(pkgText) as unknown;
      if (typeof raw === "object" && raw !== null) {
        const record = raw as Record<string, unknown>;
        const pick = (key: string): Record<string, string> | undefined => {
          const value = record[key];
          if (typeof value !== "object" || value === null) return undefined;
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (typeof v === "string") out[k] = v;
          }
          return out;
        };
        packageJson = {
          dependencies: pick("dependencies"),
          devDependencies: pick("devDependencies"),
          peerDependencies: pick("peerDependencies"),
          packageManager: typeof record["packageManager"] === "string"
            ? record["packageManager"]
            : undefined,
        };
      }
    } catch {
      packageJson = undefined;
    }
  }
  const viteFiles = ["vite.config.ts", "vite.config.js", "vite.config.mjs"];
  const hasViteDep = packageJson?.dependencies?.["vite"] !== undefined ||
    packageJson?.devDependencies?.["vite"] !== undefined;
  const isVite = hasViteDep || viteFiles.some((file) => snapshot.files.has(file));
  return {
    files: snapshot.files,
    dirs: snapshot.dirs,
    contents: snapshot.contents,
    packageJson,
    tsconfigText: snapshot.contents.get("tsconfig.json"),
    jsconfigText: snapshot.contents.get("jsconfig.json"),
    isVite,
  };
}

async function listExistingPaths(root: string): Promise<string[]> {
  const { readdir, lstat } = await import("node:fs/promises");
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (entry === "node_modules" || entry === ".git") continue;
      const abs = join(dir, entry);
      try {
        const stat = await lstat(abs);
        if (stat.isSymbolicLink()) {
          out.push(abs.replace(/\\/g, "/"));
        } else if (stat.isDirectory()) {
          await walk(abs);
        } else {
          out.push(abs.replace(/\\/g, "/"));
        }
      } catch {
        // Ignore unreadable entries.
      }
    }
  }
  await walk(resolve(root));
  return out;
}

export async function main(argv: readonly string[]): Promise<number> {
  const output = createNodeOutput();
  const program = new Command();
  program
    .name(CLI_PACKAGE_NAME)
    .description("Add curated animated React components to your project")
    .version(CLI_VERSION, "--version", "print the version")
    .helpOption("--help", "print help")
    .addHelpText("after", `\n${EXAMPLES}`)
    .option("--debug", "show stack traces")
    .option("--cwd <dir>", "project directory (default: current directory)")
    .option("--registry <url>", "registry base URL (overrides config and env)")
    .option("--timeout <seconds>", "network timeout 1-300s (overrides env and config)")
    .option("--yes", "non-interactive: accept defaults (does not imply --overwrite)");

  program
    .command("init")
    .description("detect the project and write framebits.json")
    .option("--yes", "non-interactive: keep existing values, fill missing ones")
    .option("--cwd <dir>", "project directory")
    .option("--registry <url>", "registry base URL")
    .action(async (cmdOptions: { yes?: boolean; cwd?: string; registry?: string }) => {
      const globalOptions = program.opts<{ debug?: boolean; cwd?: string; registry?: string; yes?: boolean }>();
      const debug = globalOptions.debug === true;
      try {
        const cwd = resolve(cmdOptions.cwd ?? globalOptions.cwd ?? process.cwd());
        const snapshot = await readSnapshotFor(cwd);
        const configFs = nodeConfigFs();
        await runInit(
          {
            cwd,
            yes: cmdOptions.yes === true || globalOptions.yes === true,
            registryFlag: cmdOptions.registry ?? globalOptions.registry,
          },
          {
            snapshot: { root: cwd, files: snapshot.files, dirs: snapshot.dirs, contents: snapshot.contents },
            packageJson: snapshot.packageJson,
            tsconfigText: snapshot.tsconfigText,
            jsconfigText: snapshot.jsconfigText,
          },
          {
            fs: {
              ...configFs,
              readSnapshotFile: async (path: string) => {
                try {
                  return await readFile(path, "utf8");
                } catch {
                  return undefined;
                }
              },
            },
            output,
            prompts: nodePrompts(),
            interactive: isInteractiveProcess(cmdOptions.yes === true || globalOptions.yes === true),
          },
        );
        process.exitCode = 0;
      } catch (error) {
        const formatted = formatError(error, debug);
        printError(output, formatted.message);
        if (formatted.hint !== undefined) printHint(output, formatted.hint);
        if (formatted.stack !== undefined) output.stderr(`${formatted.stack}\n`);
        process.exitCode = exitCodeFor(error);
      }
    });

  program
    .command("add <slugs...>")
    .description("add components (resolves registryDependencies, writes files)")
    .option("--overwrite", "overwrite conflicting files")
    .option("--dry-run", "print the plan and manual steps; write nothing")
    .option("--yes", "non-interactive: accept defaults (does not imply --overwrite)")
    .option("--no-install", "print the install command instead of running it")
    .option("--no-styles", "skip Tailwind CSS patching (print the snippet instead)")
    .option("--cwd <dir>", "project directory")
    .option("--registry <url>", "registry base URL")
    .option("--timeout <seconds>", "network timeout 1-300s (overrides env and config)")
    .action(async (
      slugs: string[],
      cmdOptions: { overwrite?: boolean; dryRun?: boolean; yes?: boolean; noInstall?: boolean; noStyles?: boolean; cwd?: string; registry?: string; timeout?: string },
    ) => {
      const globalOptions = program.opts<{ debug?: boolean; cwd?: string; registry?: string; timeout?: string; yes?: boolean }>();
      const debug = globalOptions.debug === true;
      try {
        const cwd = resolve(cmdOptions.cwd ?? globalOptions.cwd ?? process.cwd());
        const yes = cmdOptions.yes === true || globalOptions.yes === true;
        const snapshot = await readSnapshotFor(cwd);
        const configFs = nodeConfigFs();
        const applyFs = nodeApplyFs();
        await withTemporaryJournal((journalDir) => runAdd(
          {
            cwd,
            slugs,
            overwrite: cmdOptions.overwrite === true,
            dryRun: cmdOptions.dryRun === true,
            yes,
            noInstall: cmdOptions.noInstall === true,
            noStyles: cmdOptions.noStyles === true,
            registryFlag: cmdOptions.registry ?? globalOptions.registry,
            timeoutFlag: cmdOptions.timeout ?? globalOptions.timeout,
            debug,
          },
          {
            configFs,
            applyFs,
            output,
            prompts: nodePrompts(),
            interactive: isInteractiveProcess(yes) && cmdOptions.dryRun !== true,
            fetchFn: globalThis.fetch,
            sleep: (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
            installer: createInstaller(nodeSpawn),
            snapshot: {
              files: snapshot.files,
              dirs: snapshot.dirs,
              contents: snapshot.contents,
              packageJson: snapshot.packageJson,
              tsconfigText: snapshot.tsconfigText,
              jsconfigText: snapshot.jsconfigText,
              isVite: snapshot.isVite,
            },
            readExistingFile: async (abs: string) => {
              try {
                return await readFile(abs, "utf8");
              } catch {
                return undefined;
              }
            },
            readNodeModuleVersion: async (name: string) => {
              try {
                const text = await readFile(join(cwd, "node_modules", ...name.split("/"), "package.json"), "utf8");
                const raw: unknown = JSON.parse(text);
                if (typeof raw === "object" && raw !== null && "version" in raw) {
                  const version = raw.version;
                  return typeof version === "string" ? version : undefined;
                }
                return undefined;
              } catch {
                return undefined;
              }
            },
            listExistingPaths: () => listExistingPaths(cwd),
            journalDir,
          },
        ));
        process.exitCode = 0;
      } catch (error) {
        const formatted = formatError(error, debug);
        printError(output, formatted.message);
        if (formatted.hint !== undefined) printHint(output, formatted.hint);
        if (formatted.stack !== undefined) output.stderr(`${formatted.stack}\n`);
        process.exitCode = exitCodeFor(error);
      }
    });

  try {
    await program.parseAsync([...argv], { from: "user" });
    const code = process.exitCode;
    return typeof code === "number" ? code : 0;
  } catch (error) {
    const globalOptions: { debug?: boolean } = {};
    try {
      Object.assign(globalOptions, program.opts());
    } catch {
      // Ignore.
    }
    const formatted = formatError(error, globalOptions.debug === true);
    printError(output, formatted.message);
    if (formatted.hint !== undefined) printHint(output, formatted.hint);
    return exitCodeFor(error);
  }
}

function invokedEntryPath(): string | undefined {
  const raw = process.argv[1];
  if (raw === undefined) return undefined;
  // npm/npx bin shims are symlinks: resolve() is purely lexical and keeps the
  // shim path, while import.meta.url is the real path. Compare real paths so
  // an installed `framebits` actually runs instead of exiting 0 silently.
  try {
    return realpathSync(raw);
  } catch {
    return resolve(raw);
  }
}

const invokedPath = invokedEntryPath();
const invokedAsScript = invokedPath !== undefined &&
  resolve(invokedPath) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`unexpected error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}

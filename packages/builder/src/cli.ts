/**
 * `pnpm build:registry [--check] [--registry-root <dir>] [--out <dir>]
 * [--archive-dir <dir>] [--write-lock] [--bump slug=level] [--prune slug]
 * [--git-sha <sha>] [--json] [--strict] [--skip-typecheck]` (Tasks 4a + 4b).
 *
 * --check validates everything in memory/temp and writes nothing. Emit mode
 * (no --check) builds the tree, syncs the archive, swaps output atomically,
 * and writes the lock with --write-lock. Emitting with --skip-typecheck or
 * combining --check with --write-lock/--out/--archive-dir is refused (exit 2).
 *
 * Exit codes: 0 ok (warnings allowed), 1 diagnostics with errors (or warnings
 * with --strict), 2 usage error.
 */
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  buildTree,
  hashTree,
  planArchive,
  planBuild,
  writeArchiveFile,
  writeBuildTree,
  writeLockFile,
} from "./registry/emit.js";
import { loadRegistry } from "./registry/index.js";
import { parseLockFile } from "./registry/versions.js";
import { generatePreviewAssets, planPreviewAssets } from "./registry/previews.js";
import { readFile } from "node:fs/promises";
import type { Diagnostic } from "./registry/types.js";

const USAGE = `usage: build:registry --check [--registry-root <dir>] [--json] [--strict] [--skip-typecheck] [--bump slug=level] [--prune slug]
   or: build:registry [--registry-root <dir>] [--out <dir>] [--archive-dir <dir>] [--preview-cache-dir <dir>] [--generate-previews] [--write-lock] [--bump slug=level] [--prune slug] [--git-sha <sha>] [--json] [--strict]

  --check            validate only; writes nothing (no --write-lock/--out/--archive-dir)
  --registry-root    registry directory (default: <repo>/registry)
  --out              output dir for emit (default: <repo>/dist/registry)
  --archive-dir      persistent archive dir (default: <repo>/dist/archive)
  --preview-cache-dir hash-keyed WebP cache (default: <registry-root>/previews)
  --generate-previews capture missing previews into the cache (emit only)
  --write-lock       write registry.lock.json (emit only)  --bump             version bump override, repeatable: --bump <slug>=minor|major
  --prune            drop a lock entry, repeatable: --prune <slug>
  --git-sha          release sha for the manifest (default: $GIT_SHA, git HEAD, "unknown")
  --json             machine-readable report on stdout
  --strict           warnings fail (exit 1)
  --skip-typecheck   skip the type-check stage (local speed only; never in CI; emit refused)

  --out and --archive-dir must live outside --registry-root (emitted
  schema/meta.json files would otherwise be discovered as registry items).
`;

function defaultRegistryRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "registry");
}

function defaultOutDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "dist", "registry");
}

function defaultArchiveDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "dist", "archive");
}

function readGitSha(explicit: string | undefined): string {
  if (explicit !== undefined && explicit !== "") return explicit;
  const env = process.env["GIT_SHA"];
  if (env !== undefined && env !== "") return env;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function readGeneratedAt(): string {
  const epoch = process.env["SOURCE_DATE_EPOCH"];
  if (epoch !== undefined && epoch !== "") {
    const seconds = Number(epoch);
    if (!Number.isInteger(seconds) || seconds < 0) {
      throw new Error(`invalid SOURCE_DATE_EPOCH: ${epoch}`);
    }
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function parseMulti(values: unknown): string[] {
  if (typeof values === "string") return [values];
  if (Array.isArray(values)) {
    return values.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

export async function run(argv: readonly string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: false,
      options: {
        check: { type: "boolean", default: false },
        "registry-root": { type: "string" },
        out: { type: "string" },
        "archive-dir": { type: "string" },
        "preview-cache-dir": { type: "string" },
        "generate-previews": { type: "boolean", default: false },
        "write-lock": { type: "boolean", default: false },
        bump: { type: "string", multiple: true },
        prune: { type: "string", multiple: true },
        "git-sha": { type: "string" },
        json: { type: "boolean", default: false },
        strict: { type: "boolean", default: false },
        "skip-typecheck": { type: "boolean", default: false },
      },
    });
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }
  const get = (name: "registry-root" | "out" | "archive-dir" | "preview-cache-dir" | "git-sha"): string | undefined => {
    const value = parsed.values[name];
    return typeof value === "string" ? value : undefined;
  };

  const check = parsed.values["check"] === true;
  const writeLock = parsed.values["write-lock"] === true;
  const strict = parsed.values["strict"] === true;
  const asJson = parsed.values["json"] === true;
  const skipTypecheck = parsed.values["skip-typecheck"] === true;
  const generatePreviews = parsed.values["generate-previews"] === true;

  if (check && (writeLock || get("out") !== undefined || get("archive-dir") !== undefined)) {
    process.stderr.write("error: --write-lock/--out/--archive-dir cannot be combined with --check\n" + USAGE);
    return 2;
  }
  if (!check && skipTypecheck) {
    process.stderr.write("error: emitting with --skip-typecheck is refused\n" + USAGE);
    return 2;
  }
  if (check && generatePreviews) {
    process.stderr.write("error: --generate-previews cannot be combined with --check\n" + USAGE);
    return 2;
  }

  const bumps = new Map<string, string>();
  for (const entry of parseMulti(parsed.values["bump"])) {
    const equals = entry.indexOf("=");
    if (equals === -1) {
      process.stderr.write(`error: malformed --bump ${JSON.stringify(entry)} (expected slug=minor|major)\n${USAGE}`);
      return 2;
    }
    bumps.set(entry.slice(0, equals), entry.slice(equals + 1));
  }
  const prune = new Set(parseMulti(parsed.values["prune"]));

  const registryRoot = resolve(get("registry-root") ?? defaultRegistryRoot());
  const outDir = resolve(get("out") ?? defaultOutDir());
  const archiveDir = resolve(get("archive-dir") ?? defaultArchiveDir());
  const previewCacheDir = resolve(get("preview-cache-dir") ?? join(registryRoot, "previews"));

  if (!check) {
    // Emitted trees contain schema/meta.json files that discovery would mistake
    // for registry items: out and archive must live outside the registry root.
    const inside = (child: string, parent: string): boolean =>
      child === parent || child.startsWith(parent + sep);
    if (inside(outDir, registryRoot) || inside(archiveDir, registryRoot)) {
      process.stderr.write(
        "error: --out and --archive-dir must be outside --registry-root\n" + USAGE,
      );
      return 2;
    }
  }

  let generatedAt: string;
  try {
    generatedAt = readGeneratedAt();
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }
  const gitSha = readGitSha(get("git-sha"));

  const started = Date.now();
  const loaded = await loadRegistry({ registryRoot, skipTypecheck });
  const diagnostics: Diagnostic[] = [...loaded.diagnostics];

  let lockText: string | undefined;
  try {
    lockText = await readFile(join(registryRoot, "registry.lock.json"), "utf8");
  } catch {
    lockText = undefined;
  }
  if (lockText !== undefined) {
    const parsedLock = parseLockFile(lockText);
    if (!parsedLock.ok) {
      diagnostics.push(parsedLock.diagnostic);
    }
  }
  const currentLock = lockText === undefined ? { version: 1 as const, components: {} } : (() => {
    const parsedLock = parseLockFile(lockText);
    return parsedLock.ok ? parsedLock.lock : { version: 1 as const, components: {} };
  })();

  const planned = planBuild({
    items: loaded.items,
    draftSlugs: new Set(loaded.summary.draftSlugs),
    lock: currentLock,
    bumps,
    prune,
    gitSha,
    generatedAt,
  });
  diagnostics.push(...planned.diagnostics);

  const outOfDateError =
    planned.outOfDate.length > 0
      ? {
          severity: "error" as const,
          code: "LOCK_OUT_OF_DATE",
          file: "registry.lock.json",
          message: `lock is out of date (slugs: ${planned.outOfDate.join(", ")}). Run \`pnpm build:registry --write-lock\` to update it.`,
        }
      : undefined;

  // Builder version for the manifest (falls back when unreadable).
  let builderVersion = "0.0.0";
  try {
    const pkg: unknown = JSON.parse(
      await readFile(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
    );
    if (typeof pkg === "object" && pkg !== null && "version" in pkg && typeof pkg.version === "string") {
      builderVersion = pkg.version;
    }
  } catch {
    builderVersion = "0.0.0";
  }

  const tree = buildTree(loaded.items, planned.plans, gitSha, generatedAt, builderVersion);
  const treeHash = await hashTree(tree.files);
  const archive = await planArchive(archiveDir, planned.plans, tree);
  diagnostics.push(...archive.diagnostics);

  let previews = await planPreviewAssets(registryRoot, previewCacheDir, loaded.items);
  diagnostics.push(...previews.diagnostics);
  let generatedPreviewCount = 0;
  if (
    generatePreviews &&
    previews.missing.length > 0 &&
    !diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    try {
      generatedPreviewCount = previews.missing.length;
      await generatePreviewAssets(registryRoot, previewCacheDir, loaded.items, previews.missing);
      previews = await planPreviewAssets(registryRoot, previewCacheDir, loaded.items);
      diagnostics.push(...previews.diagnostics);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "PREVIEW_GENERATION_FAILED",
        file: "previews",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const target of previews.missing) {
    diagnostics.push({
      severity: "error",
      code: "PREVIEW_MISSING",
      file: target.outputPath,
      message: `preview cache is missing for ${target.slug}@${target.hash}`,
      hint: "run `pnpm build:registry --generate-previews` and commit registry/previews",
    });
  }

  const archiveNoun = check ? "pending" : "written";
  const report = {
    registryRoot,
    durationMs: 0,
    mode: check ? "check" : "emit",
    counts: {
      items: loaded.summary.modeled,
      discovered: loaded.summary.discovered,
      byType: loaded.summary.byType,
      byStatus: loaded.summary.byStatus,
      new: planned.plans.filter((p) => p.change === "new").length,
      changed: planned.plans.filter((p) => p.change !== "new" && p.change !== "unchanged").length,
      unchanged: planned.plans.filter((p) => p.change === "unchanged").length,
      deprecated: loaded.items.filter((i) => i.meta.status === "deprecated").length,
      bumped: planned.plans
        .filter((p) => p.change === "minor" || p.change === "major")
        .map((p) => `${p.slug}@${p.version}`),
      pruned: planned.pruned,
      errors: 0,
      warnings: 0,
      bytes:
        tree.bytes +
        [...previews.assets.values()].reduce((total, bytes) => total + bytes.byteLength, 0),
      treeHash,
      archive: {
        written: archive.stats.written,
        reused: archive.stats.reused,
        missing: archive.stats.missing,
      },
      previews: {
        generated: generatedPreviewCount,
        reused: previews.reused.length,
        missing: previews.missing.length,
      },
      typecheckSkipped: skipTypecheck,
    },
  };

  const finish = (code: number): number => {
    report.durationMs = Date.now() - started;
    report.counts.errors = diagnostics.filter((d) => d.severity === "error").length;
    report.counts.warnings = diagnostics.length - report.counts.errors;
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ ...report, diagnostics }, null, 2)}\n`);
    } else {
      if (skipTypecheck) {
        process.stdout.write("TYPECHECK SKIPPED (--skip-typecheck; never use in CI)\n");
      }
      process.stdout.write(`registry: ${registryRoot}\n`);
      process.stdout.write(
        `items: ${String(report.counts.items)} (component: ${String(loaded.summary.byType.component)}, lib: ${String(loaded.summary.byType.lib)}, hook: ${String(loaded.summary.byType.hook)}; published: ${String(loaded.summary.byStatus.published)}, deprecated: ${String(loaded.summary.byStatus.deprecated)}, draft: ${String(loaded.summary.byStatus.draft)})\n`,
      );
      process.stdout.write(
        `versions: new ${String(report.counts.new)}, changed ${String(report.counts.changed)}, unchanged ${String(report.counts.unchanged)}, deprecated ${String(report.counts.deprecated)}\n`,
      );
      if (report.counts.bumped.length > 0) {
        process.stdout.write(`bumped: ${report.counts.bumped.join(", ")}\n`);
      }
      if (planned.pruned.length > 0) {
        process.stdout.write(`pruned lock entries: ${planned.pruned.join(", ")}\n`);
      }
      process.stdout.write(
        `lock: ${lockText === undefined ? "missing" : planned.outOfDate.length === 0 ? "up-to-date" : `out-of-date (${planned.outOfDate.join(", ")})`}\n`,
      );
      process.stdout.write(
        `archive: ${archiveNoun} ${String(archive.stats.written.length)}, reused ${String(archive.stats.reused.length)}, missing ${String(archive.stats.missing.length)}\n`,
      );
      process.stdout.write(
        `previews: generated ${String(report.counts.previews.generated)}, reused ${String(report.counts.previews.reused)}, missing ${String(report.counts.previews.missing)}\n`,
      );
      process.stdout.write(`bytes: ${String(tree.bytes)}, tree: ${treeHash}\n`);
      process.stdout.write(`duration: ${String(report.durationMs)}ms\n`);
      for (const diagnostic of diagnostics) {
        const out = diagnostic.severity === "error" ? process.stderr : process.stdout;
        out.write(
          `${diagnostic.severity}[${diagnostic.code}] ${diagnostic.file}${diagnostic.line === undefined ? "" : `:${String(diagnostic.line)}${diagnostic.column === undefined ? "" : `:${String(diagnostic.column)}`}`} ${diagnostic.message}.${diagnostic.hint === undefined ? "" : ` Hint: ${diagnostic.hint}`}\n`,
        );
      }
    }
    return code;
  };

  if (check) {
    if (outOfDateError !== undefined) diagnostics.push(outOfDateError);
    // Temp-tree self-verification already ran inside buildTree; --check writes nothing.
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    if (errors > 0) return finish(1);
    if (strict && diagnostics.length > errors) return finish(1);
    return finish(0);
  }

  // Emit mode.
  if (diagnostics.some((d) => d.severity === "error")) {
    return finish(1);
  }
  if (planned.outOfDate.length > 0 && !writeLock) {
    diagnostics.push({
      severity: "error",
      code: "LOCK_OUT_OF_DATE",
      file: "registry.lock.json",
      message: `lock is out of date (slugs: ${planned.outOfDate.join(", ")}). Run \`pnpm build:registry --write-lock\` to update it.`,
    });
    return finish(1);
  }
  try {
    const writeDiags = await writeBuildTree(outDir, tree, previews.assets);
    diagnostics.push(...writeDiags);
    for (const entry of archive.pending) {
      await writeArchiveFile(archiveDir, entry.name, entry.content);
    }
    if (writeLock) {
      await writeLockFile(registryRoot, planned.newLockText);
    }
  } catch (error) {
    process.stderr.write(`error: emit failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return finish(1);
  }
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  if (errors > 0) return finish(1);
  if (strict && diagnostics.length > errors) return finish(1);
  return finish(0);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `unexpected error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}

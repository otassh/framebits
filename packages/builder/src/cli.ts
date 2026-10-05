/**
 * `pnpm build:registry --check [--registry-root <dir>] [--json] [--strict]` (Task 4a).
 *
 * Validates the registry and reports an in-memory model. No emit, no lock handling,
 * no type-check yet (Task 4b). Without `--check`, exits 2: emit lands in Task 4b.
 *
 * Exit codes: 0 ok (warnings allowed, unless --strict), 1 diagnostics with errors
 * (or warnings with --strict), 2 usage error.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadRegistry } from "./registry/index.js";
import type { Diagnostic } from "./registry/types.js";

const USAGE = `usage: build:registry --check [--registry-root <dir>] [--json] [--strict]

  --check            run validation (required for now; emit lands in Task 4b)
  --registry-root    registry directory (default: <repo>/registry)
  --json             machine-readable report on stdout
  --strict           warnings fail (exit 1)
`;

function defaultRegistryRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "registry");
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const at =
    diagnostic.line === undefined
      ? diagnostic.file
      : diagnostic.column === undefined
        ? `${diagnostic.file}:${String(diagnostic.line)}`
        : `${diagnostic.file}:${String(diagnostic.line)}:${String(diagnostic.column)}`;
  const hint = diagnostic.hint === undefined ? "" : ` Hint: ${diagnostic.hint}`;
  return `${diagnostic.severity}[${diagnostic.code}] ${at} ${diagnostic.message}.${hint}`;
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
        json: { type: "boolean", default: false },
        strict: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }

  if (parsed.values["check"] !== true) {
    process.stderr.write(`error: --check is required (emit is implemented in Task 4b)\n${USAGE}`);
    return 2;
  }

  const registryRoot = resolve(
    typeof parsed.values["registry-root"] === "string"
      ? parsed.values["registry-root"]
      : defaultRegistryRoot(),
  );
  const started = Date.now();
  const { items, diagnostics, summary } = await loadRegistry({ registryRoot });
  const durationMs = Date.now() - started;

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;

  if (parsed.values["json"] === true) {
    process.stdout.write(
      `${JSON.stringify(
        {
          registryRoot,
          durationMs,
          counts: {
            items: summary.modeled,
            discovered: summary.discovered,
            byType: summary.byType,
            byStatus: summary.byStatus,
            errors,
            warnings,
          },
          items: items.map((item) => ({
            slug: item.slug,
            type: item.meta.type,
            status: item.meta.status,
            hash: item.hash,
            files: item.files.map((file) => file.path),
          })),
          diagnostics,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`registry: ${registryRoot}\n`);
    process.stdout.write(
      `items: ${String(summary.modeled)} (component: ${String(summary.byType.component)}, lib: ${String(summary.byType.lib)}, hook: ${String(summary.byType.hook)}; published: ${String(summary.byStatus.published)}, deprecated: ${String(summary.byStatus.deprecated)}, draft: ${String(summary.byStatus.draft)})\n`,
    );
    process.stdout.write(`errors: ${String(errors)}, warnings: ${String(warnings)}\n`);
    process.stdout.write(`duration: ${String(durationMs)}ms\n`);
    for (const diagnostic of diagnostics) {
      const out = diagnostic.severity === "error" ? process.stderr : process.stdout;
      out.write(`${formatDiagnostic(diagnostic)}\n`);
    }
  }

  if (errors > 0) return 1;
  if (warnings > 0 && parsed.values["strict"] === true) return 1;
  return 0;
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

/**
 * `pnpm new-component <slug> [--category=<cat>] [--title="..."] [--description="..."]
 * [--type=component|lib|hook]` (Task 3, MASTER_PROMPT Section 6).
 *
 * Thin CLI wrapper: parses args, calls the pure core in
 * `packages/builder/src/scaffold/`, prints results, sets the exit code.
 * All logic (validation, rendering, atomic write) lives in the core so it is
 * unit-testable with explicit `registryRoot` and `now`.
 *
 * Exit codes: 0 success, 1 conflict/validation error, 2 usage error.
 */
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  ScaffoldError,
  scaffold,
} from "../packages/builder/src/scaffold/index.js";

export interface RunWriters {
  out?: ((text: string) => void) | undefined;
  err?: ((text: string) => void) | undefined;
  /** Overrides the registry root. Test-only affordance (see wrapper e2e tests). */
  registryRoot?: string | undefined;
}

const USAGE = `usage: new-component <slug> [--category=<cat>] [--title="..."] [--description="..."] [--type=component|lib|hook]

  <slug>         kebab-case, 2-64 chars, unique across the whole registry
  --category     required for components; defaults to "utilities" for lib/hook
  --type         component (default), lib, or hook
  --registry-root  override the registry directory (test only)
`;

function defaultRegistryRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "registry");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function run(argv: readonly string[], writers: RunWriters = {}): Promise<number> {
  const out: (text: string) => void =
    writers.out ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  const err: (text: string) => void =
    writers.err ??
    ((text: string): void => {
      process.stderr.write(text);
    });

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        category: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        type: { type: "string" },
        "registry-root": { type: "string" },
      },
    });
  } catch (error) {
    err(`error: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }

  const [slug, ...extra] = parsed.positionals;
  if (slug === undefined || extra.length > 0) {
    err(`error: expected exactly one <slug> argument\n${USAGE}`);
    return 2;
  }

  const registryRoot =
    optionalString(parsed.values["registry-root"]) ?? writers.registryRoot ?? defaultRegistryRoot();

  try {
    const result = await scaffold(
      {
        slug,
        category: optionalString(parsed.values["category"]),
        title: optionalString(parsed.values["title"]),
        description: optionalString(parsed.values["description"]),
        type: optionalString(parsed.values["type"]),
      },
      registryRoot,
      new Date(),
    );
    const display = relative(resolve(), result.dir);
    out(`created ${display}/\n`);
    for (const file of result.files) {
      out(`  ${file}\n`);
    }
    out("next steps:\n");
    out("  1. Edit the generated files.\n");
    out("  2. Run `pnpm build:registry` once Task 4 lands to validate and publish.\n");
    return 0;
  } catch (error) {
    if (error instanceof ScaffoldError) {
      err(`error: ${error.message}\n`);
      return 1;
    }
    err(`unexpected error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
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

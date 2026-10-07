/**
 * Install command builder (E4). Never builds a shell string: argv only.
 * Defense in depth: every name must be allowlisted and every range bounded
 * immediately before the command runs, otherwise exit 4 (this also rejects
 * injection attempts — allowlisted names never start with `-` and ranges
 * must be valid bounded semver).
 */
import {
  ALLOWED_DEPENDENCIES,
  SemverRangeSchema,
} from "@framebits/shared";
import { integrityError } from "../errors.js";
import type { PackageManager } from "../detect/index.js";

export interface InstallSpec {
  name: string;
  range: string;
}

export function assertInstallable(spec: InstallSpec): void {
  if (!(ALLOWED_DEPENDENCIES as readonly string[]).includes(spec.name)) {
    throw integrityError(
      `package "${spec.name}" is not on this CLI's allowlist`,
      "update the CLI or report the registry",
    );
  }
  if (!SemverRangeSchema.safeParse(spec.range).success) {
    throw integrityError(
      `range ${JSON.stringify(spec.range)} for "${spec.name}" is not a valid bounded semver range`,
      "report the registry content",
    );
  }
}

export interface BuiltCommand {
  program: string;
  args: string[];
}

/**
 * PATH caution: the package-manager binary resolves via PATH at spawn time.
 * Callers must surface this warning before running the installer so a
 * shadowed binary (e.g. a malicious `pnpm` earlier in PATH) is noticed.
 */
export function pmBinaryCaution(program: string): string {
  return (
    `package-manager binary "${program}" resolves via PATH — ` +
    "verify it is the expected binary before confirming"
  );
}

/** Review hint for lifecycle scripts (postinstall etc.) in installed packages. */
export const IGNORE_SCRIPTS_HINT =
  "review package lifecycle scripts before installing (untrusted postinstall " +
  "scripts run with your user privileges; consider --ignore-scripts and " +
  "installing manually after review)";

export function buildInstallCommand(
  manager: PackageManager,
  installs: readonly InstallSpec[],
): BuiltCommand | undefined {
  if (installs.length === 0) return undefined;
  for (const spec of installs) assertInstallable(spec);
  const pinned = installs.map((spec) => `${spec.name}@${spec.range}`);
  switch (manager) {
    case "pnpm":
      return { program: "pnpm", args: ["add", ...pinned] };
    case "yarn":
      return { program: "yarn", args: ["add", ...pinned] };
    case "bun":
      return { program: "bun", args: ["add", ...pinned] };
    case "npm":
      return { program: "npm", args: ["install", ...pinned] };
  }
}

/** Display form only (execution always uses argv). Quotes args with spaces. */
export function renderCommand(command: BuiltCommand): string {
  const quote = (arg: string): string => (/[\s"']/.test(arg) ? JSON.stringify(arg) : arg);
  return `${command.program} ${command.args.map(quote).join(" ")}`;
}

#!/usr/bin/env node
/* global process, Buffer */
/**
 * Build the GitHub Pages changelog site.
 *
 * Reads the curated `CHANGELOG.md` at the repo root and writes a single
 * self-contained `index.html` (see `render.mjs`) to the output directory
 * (default `dist/changelog-site/`, already gitignored).
 *
 * Usage:
 *   node scripts/changelog/build.mjs [--out <dir>]
 *   pnpm build:changelog
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChangelog, renderSite } from "./render.mjs";

/**
 * @param {string[]} argv e.g. `process.argv.slice(2)`.
 * @returns {{ outDir: string }} the resolved output directory.
 */
export function parseBuildArgs(argv) {
  let outDir = join("dist", "changelog-site");
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      const value = argv[i + 1];
      if (value === undefined || value === "") {
        throw new Error('Missing value for --out: expected "node scripts/changelog/build.mjs --out <dir>".');
      }
      outDir = value;
      i += 1;
    } else {
      throw new Error(
        `Unknown argument ${JSON.stringify(argv[i])}: expected only "--out <dir>".`,
      );
    }
  }
  return { outDir };
}

/**
 * @param {string} repoRoot absolute path to the repository root.
 * @param {string} outDir output directory (resolved against `repoRoot` when relative).
 * @returns {{ indexPath: string, bytes: number, releases: number }} what was written.
 */
export function buildChangelogSite(repoRoot, outDir) {
  const markdown = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
  const data = parseChangelog(markdown);
  const html = renderSite(data, { generatedAt: new Date().toISOString() });
  const resolvedOut = resolve(repoRoot, outDir);
  mkdirSync(resolvedOut, { recursive: true });
  const indexPath = join(resolvedOut, "index.html");
  writeFileSync(indexPath, `${html}\n`, "utf8");
  return { indexPath, bytes: Buffer.byteLength(html, "utf8"), releases: data.releases.length };
}

/**
 * @param {string} message
 */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function main() {
  let args = undefined;
  try {
    args = parseBuildArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try {
    const result = buildChangelogSite(repoRoot, args.outDir);
    process.stdout.write(
      `changelog site: wrote ${result.indexPath} (${result.bytes} bytes, ${result.releases} releases)\n`,
    );
  } catch (error) {
    fail(`changelog site: failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const invokedDirectly =
  typeof process.argv[1] === "string" && process.argv[1].endsWith(join("changelog", "build.mjs"));
if (invokedDirectly) {
  main();
}

#!/usr/bin/env node
/* global process */
/**
 * Release version guard for the `framebits` npm package (apps/cli).
 *
 * Fails unless the release tag `vX.Y.Z` equals the version in
 * `apps/cli/package.json` exactly AND the package is not `"private": true`.
 * (npm itself also refuses to publish private packages; this fails earlier
 * with a clearer message, before the expensive pipeline steps run.)
 *
 * Usage:
 *   node scripts/check-release-version.mjs <tag>
 *   node scripts/check-release-version.mjs            # reads GITHUB_REF_NAME
 *
 * The pure functions (`parseReleaseTag`, `checkReleaseVersion`) are exported
 * for unit tests; the CLI wrapper below only runs when invoked directly.
 */

// TODO(question): the repo is currently private and apps/cli is still
// `"private": true` at version `0.0.0`, so this guard FAILS today by design.
// Owner: flip `private` (and set version/license per docs/RELEASING.md) at
// launch; until then every `release` workflow run stops here before publish.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;

/**
 * Return the `X.Y.Z` version encoded in a `vX.Y.Z` tag.
 *
 * @param {string} tag the raw tag (e.g. from `github.ref_name`).
 * @returns {string} the `X.Y.Z` version without the `v` prefix.
 * @throws {Error} when the tag is not exactly `vX.Y.Z`.
 */
export function parseReleaseTag(tag) {
  const trimmed = tag.trim();
  const match = TAG_PATTERN.exec(trimmed);
  if (match === null || match[1] === undefined) {
    throw new Error(
      `Invalid release tag ${JSON.stringify(tag)}: expected exactly "vX.Y.Z" (e.g. "v0.1.0"). ` +
        `The release workflow only runs on "v*.*.*" tags.`,
    );
  }
  return match[1];
}

/**
 * Check a release tag against the `framebits` package metadata.
 *
 * @param {{ tag: string, version: string, isPrivate: boolean }} input
 * @returns {{ tag: string, version: string }} the normalized tag + version.
 * @throws {Error} on tag/version mismatch or when the package is private.
 */
export function checkReleaseVersion({ tag, version, isPrivate }) {
  const tagVersion = parseReleaseTag(tag);
  const pkgVersion = version.trim();
  if (tagVersion !== pkgVersion) {
    throw new Error(
      `Release tag ${JSON.stringify(tag)} (version ${JSON.stringify(tagVersion)}) does not match ` +
        `apps/cli/package.json version ${JSON.stringify(version)}. ` +
        `Set the package version to ${JSON.stringify(tagVersion)} or retag.`,
    );
  }
  if (isPrivate === true) {
    throw new Error(
      `apps/cli/package.json is still "private": true (version ${JSON.stringify(pkgVersion)}): ` +
        `refusing to release. Remove "private" (and set version/license per docs/RELEASING.md) at launch.`,
    );
  }
  return { tag: tag.trim(), version: pkgVersion };
}

/**
 * @param {string} message
 */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function main() {
  const cliArg = process.argv.length > 2 ? process.argv[2] : undefined;
  const envTag = process.env["GITHUB_REF_NAME"];
  const tag = (cliArg ?? envTag ?? "").trim();
  if (tag === "") {
    fail(
      'Missing release tag: pass it as the first argument (e.g. "node scripts/check-release-version.mjs v0.1.0") or set GITHUB_REF_NAME.',
    );
    return;
  }
  let pkg = undefined;
  try {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    pkg = JSON.parse(readFileSync(join(repoRoot, "apps", "cli", "package.json"), "utf8"));
  } catch (error) {
    fail(`Cannot read apps/cli/package.json: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const version = typeof pkg.version === "string" ? pkg.version : "";
  const isPrivate = pkg.private === true;
  try {
    const ok = checkReleaseVersion({ tag, version, isPrivate });
    process.stdout.write(
      `release version guard: OK (tag ${ok.tag} == apps/cli@${ok.version}, package is public)\n`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

const invokedDirectly =
  typeof process.argv[1] === "string" && process.argv[1].endsWith("check-release-version.mjs");
if (invokedDirectly) {
  main();
}

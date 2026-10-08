/**
 * Type declarations for the sibling `build.mjs` changelog-site builder, so
 * TypeScript tests can import its pure functions. (With
 * `moduleResolution: NodeNext`, an import of `./build.mjs` resolves its
 * types from this `build.d.mts` file.)
 */

export interface BuildArgs {
  outDir: string;
}

export interface BuildResult {
  indexPath: string;
  bytes: number;
  releases: number;
}

export function parseBuildArgs(argv: string[]): BuildArgs;
export function buildChangelogSite(repoRoot: string, outDir: string): BuildResult;

/**
 * Type declarations for the sibling `check-release-version.mjs` release-guard
 * script, so TypeScript tests can import its pure functions. (With
 * `moduleResolution: NodeNext`, an import of `./check-release-version.mjs`
 * resolves its types from this `check-release-version.d.mts` file.)
 */
export interface ReleaseVersionCheckInput {
  tag: string;
  version: string;
  isPrivate: boolean;
  packageName: string;
}

export interface ReleaseVersionCheckResult {
  tag: string;
  version: string;
}

export function parseReleaseTag(tag: string): string;
export const EXPECTED_PACKAGE_NAME: "@framebits/cli";
export function checkReleaseVersion(input: ReleaseVersionCheckInput): ReleaseVersionCheckResult;

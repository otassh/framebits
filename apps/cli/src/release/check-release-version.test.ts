import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkReleaseVersion,
  parseReleaseTag,
} from "../../../../scripts/check-release-version.mjs";

describe("parseReleaseTag", () => {
  it("accepts exactly vX.Y.Z and strips the v prefix", () => {
    expect(parseReleaseTag("v0.1.0")).toBe("0.1.0");
    expect(parseReleaseTag("v10.20.30")).toBe("10.20.30");
  });

  it.each([
    "1.2.3",
    "v1.2",
    "v1.2.3.4",
    "vv1.2.3",
    "framebits-v0.1.0",
    "v1.2.3-rc.1",
    "",
    "   ",
    "vX.Y.Z",
  ])("rejects %s", (tag) => {
    expect(() => parseReleaseTag(tag)).toThrow(/expected exactly "vX\.Y\.Z"/);
  });
});

describe("checkReleaseVersion", () => {
  it("passes when the tag equals a public package version", () => {
    expect(checkReleaseVersion({ tag: "v0.1.0", version: "0.1.0", isPrivate: false })).toEqual({
      tag: "v0.1.0",
      version: "0.1.0",
    });
  });

  it("fails when the tag version differs from package.json", () => {
    expect(() =>
      checkReleaseVersion({ tag: "v9.9.9", version: "0.1.0", isPrivate: false }),
    ).toThrow(/does not match/);
  });

  it("fails while the package is still private", () => {
    expect(() =>
      checkReleaseVersion({ tag: "v0.1.0", version: "0.1.0", isPrivate: true }),
    ).toThrow(/"private": true/);
  });

  it("fails on a malformed tag even when the package is public", () => {
    expect(() =>
      checkReleaseVersion({ tag: "framebits-v0.1.0", version: "0.1.0", isPrivate: false }),
    ).toThrow(/Invalid release tag/);
  });

  it("passes for the current repo state (live apps/cli/package.json)", () => {
    // Guards the first-publish prep: the real package must be public and the
    // guard must accept the tag matching its version. Built from the live
    // version so this stays green on future bumps (v0.1.1, ...).
    const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
    const pkg: { version: unknown; private?: unknown } = JSON.parse(
      readFileSync(join(repoRoot, "apps", "cli", "package.json"), "utf8"),
    ) as { version: unknown; private?: unknown };
    expect(pkg.private).not.toBe(true);
    expect(typeof pkg.version).toBe("string");
    const version = pkg.version as string;
    expect(checkReleaseVersion({ tag: `v${version}`, version, isPrivate: false })).toEqual({
      tag: `v${version}`,
      version,
    });
  });
});

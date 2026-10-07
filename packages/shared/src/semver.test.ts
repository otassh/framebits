import { describe, expect, it } from "vitest";
import {
  MAX_SEMVER_LENGTH,
  SemverRangeSchema,
  SemverVersionSchema,
  bumpSemverVersion,
  canonicalizeSemverVersion,
  doSemverRangesIntersect,
  isBoundedSemverRange,
  isGreaterSemverVersion,
  isPrereleaseSemverRange,
  isSemverSubset,
  isValidSemverRange,
  isValidSemverVersion,
  satisfiesSemverRange,
} from "./semver.js";

describe("isValidSemverRange", () => {
  // Strict: non-empty AND syntactically valid AND bounded (both ends per ||
  // branch) AND prerelease-free. `*`, `x`, `latest`, lone floors/ceilings, and
  // prerelease ranges are all rejected here (not just in the schema).
  it.each(["^11.0.0", "~1.2.3", ">=1.0.0 <2.0.0", "1.2.3", "1.x", "1.2.3 - 2.3.4"])(
    "accepts %s",
    (range) => {
      expect(isValidSemverRange(range)).toBe(true);
    },
  );

  // Note: semver treats "" as "*" (wildcard). The schema rejects "" via .min(1).
  it.each(["not a version!!!", "^^1", "1.2.3.4.5"])("rejects %s", (range) => {
    expect(isValidSemverRange(range)).toBe(false);
  });

  it.each(["*", "x", ">=0.0.0", ">0", ">=1", ">=1.0.0", "<2.0.0", "^1.0.0-beta.1", ""])(
    "rejects unbounded-or-prerelease %s",
    (range) => {
      expect(isValidSemverRange(range)).toBe(false);
    },
  );

  it.each([
    "latest",
    "next",
    "beta",
    "https://example.com/foo.tgz",
    "git+https://github.com/user/repo.git",
    "git://github.com/user/repo",
    "github:user/repo",
    "file:../foo",
    "link:../foo",
    "portal:../foo",
    "workspace:*",
    "npm:motion@^14.0.0",
    "motion@^14.0.0",
  ])("rejects non-registry spec %s", (range) => {
    expect(isValidSemverRange(range)).toBe(false);
  });
});

describe("isBoundedSemverRange", () => {
  it.each(["^11.0.0", "~1.2.3", "1.2.3", ">=1.0.0 <2.0.0", "1.x", "1.2.3 - 2.3.4"])(
    "accepts bounded %s",
    (range) => {
      expect(isBoundedSemverRange(range)).toBe(true);
    },
  );

  it.each([
    "*",
    "x",
    ">=0.0.0",
    ">0",
    ">=1",
    ">=1.0.0",
    ">1.0.0",
    "<2.0.0",
    "<=2.0.0",
    ">=1.0.0 || >=3.0.0",
    ">=1.0.0 <2.0.0 || <5.0.0",
    ">=1.0.0 <2.0.0 || >5.0.0",
    "",
  ])("rejects unbounded %s", (range) => {
    expect(isBoundedSemverRange(range)).toBe(false);
  });
});

describe("isPrereleaseSemverRange", () => {
  it.each(["^1.0.0-beta.1", ">=1.0.0-alpha <2.0.0", "1.0.0-0", "~2.0.0-rc.1"])(
    "flags prerelease %s",
    (range) => {
      expect(isPrereleaseSemverRange(range)).toBe(true);
    },
  );

  it.each([
    "^11.0.0",
    "~1.2.3",
    "1.2.3",
    ">=1.0.0 <2.0.0",
    "1.x",
    "1.2.3 - 2.3.4",
    "*",
    "banana",
  ])("does not flag %s", (range) => {
    expect(isPrereleaseSemverRange(range)).toBe(false);
  });

  it("does not mistake desugared caret/tilde upper bounds for prereleases", () => {
    // semver expands ^11.0.0 to `>=11.0.0 <12.0.0-0` internally; the raw string
    // has no prerelease marker, so it must not be flagged.
    expect(isPrereleaseSemverRange("^11.0.0")).toBe(false);
    expect(isPrereleaseSemverRange("~1.2.3")).toBe(false);
  });
});

describe("canonicalizeSemverVersion", () => {
  it.each([
    ["1.0.0", "1.0.0"],
    ["v1.0.0", "1.0.0"],
    ["  1.0.0  ", "1.0.0"],
    ["1.0.0-beta.1", "1.0.0-beta.1"],
  ])("canonicalizes %s -> %s", (input, expected) => {
    expect(canonicalizeSemverVersion(input)).toBe(expected);
  });

  it.each(["", "=1.0.0", "^1.0.0", "*", "1.2", "latest", "banana"])(
    "returns null for %s",
    (input) => {
      expect(canonicalizeSemverVersion(input)).toBeNull();
    },
  );
});

describe("isValidSemverVersion", () => {
  it.each(["1.0.0", "0.0.1", "2.3.4-beta.1", "10.20.30"])("accepts %s", (version) => {
    expect(isValidSemverVersion(version)).toBe(true);
  });

  it.each(["", "^1.0.0", "*", "1.2", "v1", "latest", "1.0.0-"])("rejects %s", (version) => {
    expect(isValidSemverVersion(version)).toBe(false);
  });
});

describe("SemverRangeSchema", () => {
  it.each(["^11.0.0", "~1.2.3", "1.2.3", ">=1.0.0 <2.0.0", "1.x", "1.2.3 - 2.3.4"])(
    "accepts %s",
    (range) => {
      expect(SemverRangeSchema.safeParse(range).success).toBe(true);
    },
  );

  it.each([
    "",
    "*",
    "x",
    "latest",
    "banana",
    ">=0.0.0",
    ">0",
    ">=1",
    "<2.0.0",
    ">1.0.0",
    ">=1.0.0 || >=3.0.0",
    ">=1.0.0 <2.0.0 || <5.0.0",
    "^1.0.0-beta.1",
    ">=1.0.0-alpha <2.0.0",
  ])("rejects %s", (range) => {
    expect(SemverRangeSchema.safeParse(range).success).toBe(false);
  });

  it(`rejects strings over ${String(MAX_SEMVER_LENGTH)} characters`, () => {
    const longRange = `>=1.0.0 <${"9".repeat(MAX_SEMVER_LENGTH)}.0.0`;
    expect(longRange.length).toBeGreaterThan(MAX_SEMVER_LENGTH);
    expect(SemverRangeSchema.safeParse(longRange).success).toBe(false);
  });

  it.each([
    "next",
    "https://example.com/motion.tgz",
    "git+https://github.com/user/repo.git",
    "github:user/repo",
    "file:../foo",
    "workspace:*",
    "npm:motion@^14.0.0",
    "   ",
  ])("rejects non-registry/dist-tag spec %s", (range) => {
    expect(SemverRangeSchema.safeParse(range).success).toBe(false);
  });
});

describe("bumpSemverVersion / isGreaterSemverVersion", () => {
  it.each([
    ["1.2.3", "patch", "1.2.4"],
    ["1.2.3", "minor", "1.3.0"],
    ["1.2.3", "major", "2.0.0"],
  ])("bumps %s %s -> %s", (version, level, expected) => {
    expect(bumpSemverVersion(version, level as "patch" | "minor" | "major")).toBe(expected);
  });

  it("returns null for invalid versions", () => {
    expect(bumpSemverVersion("nope", "patch")).toBeNull();
  });

  it("compares strictly", () => {
    expect(isGreaterSemverVersion("1.0.1", "1.0.0")).toBe(true);
    expect(isGreaterSemverVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isGreaterSemverVersion("1.0.0", "2.0.0")).toBe(false);
    expect(isGreaterSemverVersion("nope", "1.0.0")).toBe(false);
  });
});

describe("isSemverSubset / doSemverRangesIntersect", () => {
  it("detects subsets", () => {
    expect(isSemverSubset("1.2.3", "^1.0.0")).toBe(true);
    expect(isSemverSubset("^2.0.0", "^1.0.0")).toBe(false);
    expect(isSemverSubset("nope", "^1.0.0")).toBe(false);
  });

  it("detects intersections", () => {
    expect(doSemverRangesIntersect("^14.0.0", "^14.5.0")).toBe(true);
    expect(doSemverRangesIntersect("^13.0.0", "^14.0.0")).toBe(false);
    expect(doSemverRangesIntersect("nope", "^1.0.0")).toBe(false);
  });
});

describe("satisfiesSemverRange", () => {
  it.each([
    ["14.0.0", "^14.0.0", true],
    ["14.1.0", "^14.0.0", true],
    ["15.0.0", "^14.0.0", false],
    ["1.2.3", "1.2.3", true],
    ["1.2.4", "1.2.3", false],
  ])("%s satisfies %s -> %s", (version, range, expected) => {
    expect(satisfiesSemverRange(version, range)).toBe(expected);
  });

  it("returns false for garbage", () => {
    expect(satisfiesSemverRange("nope", "^1.0.0")).toBe(false);
  });
});

describe("SemverVersionSchema", () => {
  it("accepts exact versions", () => {
    expect(SemverVersionSchema.safeParse("1.0.0").success).toBe(true);
    expect(SemverVersionSchema.safeParse("2.3.4-beta.1").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(SemverVersionSchema.parse("  1.0.0  ")).toBe("1.0.0");
  });

  it(`rejects strings over ${String(MAX_SEMVER_LENGTH)} characters`, () => {
    expect(SemverVersionSchema.safeParse(`1.0.0-${"a".repeat(MAX_SEMVER_LENGTH)}`).success).toBe(
      false,
    );
  });

  it("rejects ranges and tags", () => {
    expect(SemverVersionSchema.safeParse("^1.0.0").success).toBe(false);
    expect(SemverVersionSchema.safeParse("latest").success).toBe(false);
  });
});

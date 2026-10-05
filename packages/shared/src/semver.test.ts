import { describe, expect, it } from "vitest";
import {
  SemverRangeSchema,
  SemverVersionSchema,
  bumpSemverVersion,
  isBoundedSemverRange,
  isGreaterSemverVersion,
  isValidSemverRange,
  isValidSemverVersion,
  satisfiesSemverRange,
} from "./semver.js";

describe("isValidSemverRange", () => {
  it.each(["^11.0.0", "~1.2.3", ">=1.0.0 <2.0.0", "1.2.3", "*", ">=1", "1.x", "^1.0.0-beta.1"])(
    "accepts %s",
    (range) => {
      expect(isValidSemverRange(range)).toBe(true);
    },
  );

  // Note: semver treats "" as "*" (wildcard). The schema rejects "" via .min(1).
  it.each(["not a version!!!", "^^1", "1.2.3.4.5"])("rejects %s", (range) => {
    expect(isValidSemverRange(range)).toBe(false);
  });
});

describe("isBoundedSemverRange", () => {
  it.each(["^11.0.0", "~1.2.3", "1.2.3", ">=1.0.0 <2.0.0", "1.x", "<2.0.0", "1.2.3 - 2.3.4"])(
    "accepts bounded %s",
    (range) => {
      expect(isBoundedSemverRange(range)).toBe(true);
    },
  );

  it.each(["*", "x", ">=0.0.0", ">0", ">=1", ">=1.0.0 || >=3.0.0", ""])(
    "rejects unbounded %s",
    (range) => {
      expect(isBoundedSemverRange(range)).toBe(false);
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
  it.each(["^11.0.0", "~1.2.3", "1.2.3", ">=1.0.0 <2.0.0"])("accepts %s", (range) => {
    expect(SemverRangeSchema.safeParse(range).success).toBe(true);
  });

  it.each(["", "*", "x", "latest", "banana", ">=0.0.0", ">0", ">=1"])("rejects %s", (range) => {
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
  });

  it("rejects ranges and tags", () => {
    expect(SemverVersionSchema.safeParse("^1.0.0").success).toBe(false);
    expect(SemverVersionSchema.safeParse("latest").success).toBe(false);
  });
});

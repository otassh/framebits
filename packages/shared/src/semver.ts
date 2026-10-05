import * as semver from "semver";
import { z } from "zod";

/**
 * Semver validation.
 *
 * `semver` (runtime dependency, justified): "valid semver range" is defined by the
 * reference grammar (carets, tildes, hyphen ranges, comparators, prereleases, build
 * metadata, `*`, `||`). Hand-rolling it would be incomplete and would drift from what
 * npm itself accepts. `semver@7` is tiny, dependency-free, and the same implementation
 * family npm ships with — it is the definition of correctness here.
 *
 * On top of validity, dependency ranges must be BOUNDED: every `||` branch must have
 * an upper bound (`<`, `<=`, or an exact pin). Wildcards (`*`, `x`), `latest`, and
 * open-ended ranges (`>=0.0.0`, `>0`, `>=1`) resolve to arbitrary future versions and
 * are rejected. Accepted: carets, tildes, exact versions, bounded comparator ranges.
 */

export function isValidSemverRange(range: string): boolean {
  return semver.validRange(range) !== null;
}

export function isValidSemverVersion(version: string): boolean {
  return semver.valid(version) !== null;
}

/** True when an exact version satisfies a range (both assumed syntactically valid). */
export function satisfiesSemverRange(version: string, range: string): boolean {
  try {
    return semver.satisfies(version, range);
  } catch {
    return false;
  }
}

export type SemverBumpLevel = "patch" | "minor" | "major";

/** Next version after a bump level, or null when it cannot be computed. */
export function bumpSemverVersion(version: string, level: SemverBumpLevel): string | null {
  try {
    return semver.inc(version, level);
  } catch {
    return null;
  }
}

/** True when `a` is a strictly greater version than `b` (false on any failure). */
export function isGreaterSemverVersion(a: string, b: string): boolean {
  try {
    return semver.gt(a, b);
  } catch {
    return false;
  }
}

/** True when every version satisfying `sub` also satisfies `dom` (false on any failure). */
export function isSemverSubset(sub: string, dom: string): boolean {
  try {
    return semver.subset(sub, dom);
  } catch {
    return false;
  }
}

/** True when at least one version satisfies both ranges (false on any failure). */
export function doSemverRangesIntersect(a: string, b: string): boolean {
  try {
    return semver.intersects(a, b);
  } catch {
    return false;
  }
}

/** True when every `||` branch of the range has an upper bound. Assumes validity. */
export function isBoundedSemverRange(range: string): boolean {
  let parsed: semver.Range;
  try {
    parsed = new semver.Range(range);
  } catch {
    return false;
  }
  if (parsed.set.length === 0) return false;
  return parsed.set.every((comparators) =>
    comparators.some((comparator) => isUpperBound(comparator)),
  );
}

/**
 * `<` / `<=` bound above. So does an exact pin (`op === ""` with a real version).
 * The wildcard sentinel also carries `op === ""` but has an empty value —
 * semver collapses `*`, `x`, `""`, and `>=0.0.0` into it, so it must not count.
 */
function isUpperBound(comparator: semver.Comparator): boolean {
  if (comparator.operator === "<" || comparator.operator === "<=") return true;
  return comparator.operator === "" && comparator.value !== "";
}

/**
 * Accepts bounded ranges only (`^11.0.0`, `~1.2.3`, `1.2.3`, `>=1.0.0 <2.0.0`).
 * Rejects `*`, `x`, `latest`, empty, and effectively unbounded ranges.
 */
export const SemverRangeSchema = z
  .string()
  .min(1, "must not be empty")
  .refine((range) => isValidSemverRange(range), "must be a valid semver range")
  .refine(
    (range) => isBoundedSemverRange(range),
    "must be a bounded range (wildcards and open-ended ranges are rejected)",
  );

/** Accepts exact versions only (`1.0.0`, prereleases included, no ranges). */
export const SemverVersionSchema = z
  .string()
  .min(1, "must not be empty")
  .refine((version) => isValidSemverVersion(version), "must be a valid semver version");

export type SemverRange = z.infer<typeof SemverRangeSchema>;
export type SemverVersion = z.infer<typeof SemverVersionSchema>;

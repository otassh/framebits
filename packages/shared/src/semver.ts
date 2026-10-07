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
 * BOTH an upper bound (`<`, `<=`, or an exact pin) AND a lower bound (`>`, `>=`, or
 * an exact pin). Wildcards (`*`, `x`), `latest`, lone ceilings (`<2.0.0`), lone
 * floors (`>=1`), and open-ended ranges (`>=0.0.0`, `>0`) resolve to arbitrary
 * versions and are rejected. Accepted: carets, tildes, exact versions, ranges with
 * both ends (`>=1.0.0 <2.0.0`).
 *
 * PRERELEASE POLICY: ranges containing a prerelease comparator (e.g. `^1.0.0-beta.1`,
 * `>=1.0.0-alpha <2.0.0`) are rejected. `semver.satisfies()` ignores prereleases
 * unless `includePrerelease: true` is passed, so accepting a prerelease range while
 * satisfying without that flag would silently resolve to a different set than the
 * author wrote. Exact prerelease VERSIONS (e.g. `1.0.0-beta.1`) stay valid: a pin is
 * unambiguous and `satisfies` handles it deterministically.
 */

/** Max length for semver range/version strings (cheap DoS guard on pathological inputs). */
export const MAX_SEMVER_LENGTH = 256;

export function isValidSemverRange(range: string): boolean {
  const trimmed = range.trim();
  if (trimmed.length === 0) return false;
  return (
    semver.validRange(trimmed) !== null &&
    isBoundedSemverRange(trimmed) &&
    !isPrereleaseSemverRange(trimmed)
  );
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

/** True when every `||` branch of the range has an upper AND a lower bound. Assumes validity. */
export function isBoundedSemverRange(range: string): boolean {
  let parsed: semver.Range;
  try {
    parsed = new semver.Range(range);
  } catch {
    return false;
  }
  if (parsed.set.length === 0) return false;
  return parsed.set.every(
    (comparators) =>
      comparators.some((comparator) => isUpperBound(comparator)) &&
      comparators.some((comparator) => isLowerBound(comparator)),
  );
}

/**
 * True when the range contains a prerelease comparator in any `||` branch
 * (e.g. `^1.0.0-beta.1`, `>=1.0.0-alpha <2.0.0`). Detection runs on the RAW
 * string on purpose: semver desugars `^`/`~` upper bounds with a `-0` suffix
 * (`^11.0.0` becomes `<12.0.0-0`), so inspecting parsed comparators would flag
 * every caret/tilde as prerelease. Hyphen ranges (`1.2.3 - 2.3.4`, spaces on
 * both sides of the dash) are stripped first; a dash directly attached to a
 * full version (`1.2.3-foo`) IS a prerelease per semver and is flagged.
 * Returns false when nothing prerelease-like is present (validity of the
 * range itself is checked separately). See PRERELEASE POLICY above.
 */
export function isPrereleaseSemverRange(range: string): boolean {
  const withoutHyphenRanges = range.replace(/\s+-\s+/g, " ");
  return /\d+\.\d+\.\d+-[0-9A-Za-z-]/.test(withoutHyphenRanges);
}

/**
 * Canonical form of an exact version via `semver.valid()` (trims whitespace,
 * strips a leading `v`), or null when the input is not a valid version. Use
 * wherever a version is stored or compared so `v1.0.0` and `1.0.0` never
 * diverge.
 */
export function canonicalizeSemverVersion(version: string): string | null {
  try {
    return semver.valid(version);
  } catch {
    return null;
  }
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
 * `>` / `>=` bound below. An exact pin (`op === ""` with a real version) also
 * counts: it fixes the version from both sides. The wildcard sentinel
 * (`op === ""`, empty value) must not count.
 */
function isLowerBound(comparator: semver.Comparator): boolean {
  if (comparator.operator === ">" || comparator.operator === ">=") return true;
  return comparator.operator === "" && comparator.value !== "";
}

/**
 * Accepts bounded, non-prerelease ranges only (`^11.0.0`, `~1.2.3`, `1.2.3`,
 * `>=1.0.0 <2.0.0`). Rejects `*`, `x`, `latest`, empty, effectively unbounded
 * ranges (missing either end of any `||` branch), overlong strings, and
 * prerelease ranges (see PRERELEASE POLICY above).
 */
export const SemverRangeSchema = z
  .string()
  .min(1, "must not be empty")
  .max(MAX_SEMVER_LENGTH, `must be at most ${String(MAX_SEMVER_LENGTH)} characters`)
  .refine((range) => semver.validRange(range) !== null, "must be a valid semver range")
  .refine(
    (range) => isBoundedSemverRange(range),
    "must be a bounded range (every || branch needs a lower and an upper bound; wildcards and open-ended ranges are rejected)",
  )
  .refine(
    (range) => !isPrereleaseSemverRange(range),
    "must not contain prerelease comparators (pin an exact prerelease version instead)",
  );

/**
 * Accepts exact versions only (`1.0.0`; prerelease pins like `1.0.0-beta.1`
 * included, no ranges). Validity AND canonicalization both go through
 * `semver.valid()` (see `canonicalizeSemverVersion`): surrounding whitespace is
 * trimmed and near-miss spellings are accepted-or-rejected by the same
 * reference implementation. Call
 * `canonicalizeSemverVersion()` when a stored/compared form is needed — the
 * schema itself stays `transform`-free so it remains representable in the
 * published JSON Schemas.
 */
export const SemverVersionSchema = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .max(MAX_SEMVER_LENGTH, `must be at most ${String(MAX_SEMVER_LENGTH)} characters`)
  .refine(
    (version) => canonicalizeSemverVersion(version) !== null,
    "must be a valid semver version",
  );

export type SemverRange = z.infer<typeof SemverRangeSchema>;
export type SemverVersion = z.infer<typeof SemverVersionSchema>;

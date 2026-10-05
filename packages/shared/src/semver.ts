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
 */

export function isValidSemverRange(range: string): boolean {
  return semver.validRange(range) !== null;
}

export function isValidSemverVersion(version: string): boolean {
  return semver.valid(version) !== null;
}

/** Accepts anything `semver.validRange` accepts (`^11.0.0`, `~1.2`, `>=1 <2`, `*`, ...). */
export const SemverRangeSchema = z
  .string()
  .min(1, "must not be empty")
  .refine((range) => isValidSemverRange(range), "must be a valid semver range");

/** Accepts exact versions only (`1.0.0`, prereleases included, no ranges). */
export const SemverVersionSchema = z
  .string()
  .min(1, "must not be empty")
  .refine((version) => isValidSemverVersion(version), "must be a valid semver version");

export type SemverRange = z.infer<typeof SemverRangeSchema>;
export type SemverVersion = z.infer<typeof SemverVersionSchema>;

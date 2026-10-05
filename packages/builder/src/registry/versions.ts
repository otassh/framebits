import {
  RegistryLockSchema,
  bumpSemverVersion,
  isGreaterSemverVersion,
  type RegistryLock,
} from "@algorithco-ui/shared";
import type { RegistryItemModel } from "./index.js";
import type { Diagnostic } from "./types.js";

/**
 * Version planning against registry.lock.json (Task 4b Part 2).
 * Pure functions: no I/O here (reading/writing the lock lives in emit.ts).
 * Lock shape: { version: 1, components: { slug: { version, hash } } }.
 */

export type BumpLevel = "minor" | "major";
export type PlanChange = "new" | "unchanged" | "patch" | "minor" | "major";

export interface VersionPlan {
  slug: string;
  version: string;
  previousVersion: string | undefined;
  hash: string;
  change: PlanChange;
}

export interface PlanInput {
  /** Non-draft validated items (the loadRegistry model). */
  items: RegistryItemModel[];
  /** Current lock contents (already schema-validated). */
  lock: RegistryLock;
  /** `--bump slug=level` requests. */
  bumps: ReadonlyMap<string, string>;
  /** Slugs whose current registry status is draft (lock entry + draft = error). */
  draftSlugs: ReadonlySet<string>;
  /** `--prune` slugs (lock entries to drop). */
  prune: ReadonlySet<string>;
}

export const LOCK_REL = "registry.lock.json";

/** Parse raw lock text. LOCK_INVALID covers schema failure and bad versions. */
export function parseLockFile(text: string):
  | { ok: true; lock: RegistryLock }
  | { ok: false; diagnostic: Diagnostic } {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        severity: "error",
        code: "LOCK_INVALID",
        file: LOCK_REL,
        message: `registry.lock.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  const parsed = RegistryLockSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostic: {
        severity: "error",
        code: "LOCK_INVALID",
        file: LOCK_REL,
        message: `registry.lock.json is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`,
      },
    };
  }
  return { ok: true, lock: parsed.data };
}

/** Canonical lock serialization: sorted keys, 2 spaces, LF, trailing newline. */
export function serializeLock(lock: RegistryLock): string {
  const components: Record<string, { version: string; hash: string }> = {};
  for (const slug of Object.keys(lock.components).sort()) {
    const entry = lock.components[slug];
    if (entry !== undefined) components[slug] = { version: entry.version, hash: entry.hash };
  }
  return `${JSON.stringify({ version: lock.version, components }, null, 2)}\n`;
}

/**
 * Implement the version decision table exactly (rows 1-8; rows 9-10 compare the
 * planned lock against disk in emit.ts).
 */
export function planVersions(input: PlanInput): { plans: VersionPlan[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const plans: VersionPlan[] = [];
  const seen = new Set<string>();

  for (const item of [...input.items].sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    seen.add(item.slug);
    const entry = input.lock.components[item.slug];
    if (entry === undefined) {
      plans.push({
        slug: item.slug,
        version: "1.0.0",
        previousVersion: undefined,
        hash: item.hash,
        change: "new",
      });
      continue;
    }
    if (entry.hash === item.hash) {
      plans.push({
        slug: item.slug,
        version: entry.version,
        previousVersion: entry.version,
        hash: item.hash,
        change: "unchanged",
      });
      continue;
    }
    const rawLevel = input.bumps.get(item.slug);
    const level = rawLevel === "minor" || rawLevel === "major" ? rawLevel : "patch";
    if (rawLevel !== undefined && level === "patch" && rawLevel !== "patch") {
      diagnostics.push({
        severity: "error",
        code: "BUMP_NOT_APPLICABLE",
        file: LOCK_REL,
        message: `--bump ${item.slug} has invalid level "${rawLevel}" (expected minor|major)`,
      });
    }
    const next = bumpSemverVersion(entry.version, level);
    if (next === null || !isGreaterSemverVersion(next, entry.version)) {
      diagnostics.push({
        severity: "error",
        code: "LOCK_INVALID",
        file: LOCK_REL,
        message: `cannot bump ${item.slug} from ${entry.version} (result ${next ?? "null"} is not greater)`,
      });
      continue;
    }
    plans.push({
      slug: item.slug,
      version: next,
      previousVersion: entry.version,
      hash: item.hash,
      change: level,
    });
  }

  // Row 4: lock entries with no registry item at all (prune or error).
  for (const slug of Object.keys(input.lock.components).sort()) {
    if (seen.has(slug) || input.draftSlugs.has(slug)) continue;
    if (input.prune.has(slug)) continue;
    diagnostics.push({
      severity: "error",
      code: "LOCK_ENTRY_REMOVED",
      file: LOCK_REL,
      message: `lock entry "${slug}" has no registry item (deleting is forbidden; deprecate instead)`,
      hint: `To drop it deliberately, re-run with --prune ${slug}.`,
    });
  }

  // Row 5: published/deprecated in lock, now draft.
  for (const slug of [...input.draftSlugs].sort()) {
    if (input.lock.components[slug] !== undefined && !input.prune.has(slug)) {
      diagnostics.push({
        severity: "error",
        code: "PUBLISHED_TO_DRAFT",
        file: LOCK_REL,
        message: `"${slug}" is locked as released but is now a draft`,
        hint: "Re-publish it, or drop the entry deliberately with --prune <slug>.",
      });
    }
  }

  // Row 7: bumps that cannot apply (unchanged hash, unknown slug, draft/new slugs).
  const planned = new Map(plans.map((plan) => [plan.slug, plan]));
  for (const slug of [...input.bumps.keys()].sort()) {
    const plan = planned.get(slug);
    if (plan === undefined || plan.change === "unchanged" || plan.change === "new") {
      diagnostics.push({
        severity: "error",
        code: "BUMP_NOT_APPLICABLE",
        file: LOCK_REL,
        message: `--bump ${slug} does not apply (unchanged hash, or slug not locked as released)`,
      });
    }
  }

  return { plans, diagnostics };
}

/** Build the planned lock contents from plans (plus untouched entries). */
export function plannedLock(
  current: RegistryLock,
  plans: VersionPlan[],
  prune: ReadonlySet<string>,
): RegistryLock {
  const components: Record<string, { version: string; hash: string }> = {};
  for (const [slug, entry] of Object.entries(current.components)) {
    if (!prune.has(slug)) components[slug] = { version: entry.version, hash: entry.hash };
  }
  for (const plan of plans) {
    components[plan.slug] = { version: plan.version, hash: plan.hash };
  }
  return { version: 1, components };
}

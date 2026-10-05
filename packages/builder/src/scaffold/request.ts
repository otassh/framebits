import {
  CATEGORIES,
  CategorySchema,
  ItemTypeSchema,
  MetaSchema,
  SlugSchema,
  type Meta,
} from "@framebits/shared";
import { toTitleCase } from "./names.js";
import { ScaffoldError, type ScaffoldItemType, type ScaffoldRequest } from "./types.js";

/**
 * Caret range of the current stable major of `motion` (researched 2026-10-05:
 * npm `motion@14.0.0` is latest and its `exports` map contains `./react`).
 * Components depend on it; lib/hook scaffolds depend on nothing.
 */
export const MOTION_RANGE = "^14.0.0";

export interface ResolvedScaffold {
  slug: string;
  title: string;
  description: string;
  type: ScaffoldItemType;
  category: string;
}

/** Placeholder description that satisfies the 10-200 char schema rule. */
export function defaultDescription(title: string): string {
  return `TODO: replace with a 10-200 character description of what ${title} does.`;
}

/**
 * Validate raw request fields with the shared schemas and apply documented defaults:
 * type defaults to "component"; category is required for components and defaults to
 * "utilities" for lib/hook; title defaults to Title Case; description to a placeholder.
 */
export function resolveScaffoldRequest(request: ScaffoldRequest): ResolvedScaffold {
  const slugResult = SlugSchema.safeParse(request.slug);
  if (!slugResult.success) {
    throw new ScaffoldError("validation", `invalid slug ${JSON.stringify(request.slug)}: ${slugResult.error.issues.map((issue) => issue.message).join("; ")}`);
  }

  const typeResult = ItemTypeSchema.default("component").safeParse(request.type);
  if (!typeResult.success) {
    throw new ScaffoldError("validation", `invalid type ${JSON.stringify(request.type)}: expected "component", "lib" or "hook"`);
  }
  const type = typeResult.data;

  let category = request.category;
  if (category === undefined) {
    if (type === "component") {
      throw new ScaffoldError(
        "validation",
        `missing required --category for a component (valid: ${CATEGORIES.join(", ")})`,
      );
    }
    category = "utilities";
  }
  const categoryResult = CategorySchema.safeParse(category);
  if (!categoryResult.success) {
    throw new ScaffoldError(
      "validation",
      `unknown category ${JSON.stringify(category)} (valid: ${CATEGORIES.join(", ")})`,
    );
  }

  return {
    slug: slugResult.data,
    title: request.title ?? toTitleCase(slugResult.data),
    description: request.description ?? defaultDescription(toTitleCase(slugResult.data)),
    type,
    category: categoryResult.data,
  };
}

/** Build the meta.json object (key order exactly as in MASTER_PROMPT Section 4.1) and validate it. */
export function buildMeta(resolved: ResolvedScaffold, addedAt: string): Meta {
  // Key order below is deliberate: it is the order serialized into meta.json.
  const raw = {
    slug: resolved.slug,
    title: resolved.title,
    type: resolved.type,
    category: resolved.category,
    tags: [] as string[],
    description: resolved.description,
    dependencies: (resolved.type === "component" ? { motion: MOTION_RANGE } : {}) as Record<
      string,
      string
    >,
    registryDependencies: [] as string[],
    difficulty: "easy" as const,
    performance: "light" as const,
    status: "draft" as const,
    addedAt,
  };
  const result = MetaSchema.safeParse(raw);
  if (!result.success) {
    throw new ScaffoldError(
      "validation",
      `generated meta.json is invalid: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  }
  return result.data;
}

/** Serialize meta.json: 2 spaces, LF, trailing newline, Section 4.1 key order. */
export function serializeMeta(meta: Meta): string {
  const ordered = {
    slug: meta.slug,
    title: meta.title,
    type: meta.type,
    category: meta.category,
    tags: meta.tags,
    description: meta.description,
    dependencies: meta.dependencies,
    registryDependencies: meta.registryDependencies,
    difficulty: meta.difficulty,
    performance: meta.performance,
    status: meta.status,
    addedAt: meta.addedAt,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

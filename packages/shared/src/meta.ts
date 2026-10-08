import { z } from "zod";
import { isAllowedDependency } from "./allowed-dependencies.js";
import { CategorySchema } from "./categories.js";
import { guardedRecord, rejectDangerousKeys } from "./hashable-json.js";
import { SemverRangeSchema } from "./semver.js";

/** `/^[a-z0-9]+(-[a-z0-9]+)*$/`, 2-64 chars, unique across components and lib. */
export const SlugSchema = z
  .string()
  .min(2, "slug must be at least 2 characters")
  .max(64, "slug must be at most 64 characters")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "slug must be kebab-case (lowercase alphanumerics separated by single hyphens)",
  );

export type Slug = z.infer<typeof SlugSchema>;

export const ItemTypeSchema = z.enum(["component", "lib", "hook"]);

export type ItemType = z.infer<typeof ItemTypeSchema>;

/** 0-8 items, kebab-case, unique. Max length 48 per tag is a chosen bound (prompt is silent). */
export const TagSchema = z
  .string()
  .min(1, "tag must not be empty")
  .max(48, "tag must be at most 48 characters")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "tag must be kebab-case (lowercase alphanumerics separated by single hyphens)",
  );

function unique(items: readonly unknown[]): boolean {
  return new Set(items).size === items.length;
}

/** Non-empty; max 120 chars is a chosen bound (prompt is silent). Surrounding space is trimmed. */
export const TitleSchema = z.string().trim().min(1, "title must not be empty").max(120);

/** 10-200 chars (prompt-specified). Surrounding space is trimmed. */
export const DescriptionSchema = z
  .string()
  .trim()
  .min(10, "description must be at least 10 characters")
  .max(200, "description must be at most 200 characters");

/** npm package -> semver range. Every key must be allowlisted; `{}` (no deps) is valid. */
export const DependenciesSchema = guardedRecord(SemverRangeSchema).superRefine(
  (dependencies, ctx) => {
    rejectDangerousKeys(dependencies, ctx);
    for (const name of Object.keys(dependencies)) {
      if (!isAllowedDependency(name)) {
        ctx.addIssue({
          code: "custom",
          message: `unknown dependency "${name}" (not in the allowlist)`,
          path: [name],
        });
      }
    }
  },
);

export const RegistryDependenciesSchema = z.array(SlugSchema).max(100).default([]);

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export const PerformanceSchema = z.enum(["light", "medium", "heavy"]);
export const PublishStatusSchema = z.enum(["draft", "published", "deprecated"]);

/**
 * `meta.json`, written by humans.
 * `.strict()`: unknown keys are rejected.
 */
export const MetaSchema = z
  .object({
    slug: SlugSchema,
    title: TitleSchema,
    type: ItemTypeSchema.default("component"),
    category: CategorySchema,
    tags: z
      .array(TagSchema)
      .max(8, "at most 8 tags")
      .refine((tags) => unique(tags), "tags must be unique"),
    description: DescriptionSchema,
    dependencies: DependenciesSchema.default({}),
    registryDependencies: RegistryDependenciesSchema,
    difficulty: DifficultySchema,
    performance: PerformanceSchema,
    status: PublishStatusSchema,
    addedAt: z.iso.date(),
    /** Optional version-bump hint for this release. */
    bump: z.enum(["minor", "major"]).optional(),
  })
  .strict()
  .superRefine((meta, ctx) => {
    if (meta.registryDependencies.includes(meta.slug)) {
      ctx.addIssue({
        code: "custom",
        message: "registryDependencies must not reference the item itself",
        path: ["registryDependencies"],
      });
    }
    if (!unique(meta.registryDependencies)) {
      ctx.addIssue({
        code: "custom",
        message: "registryDependencies must be unique",
        path: ["registryDependencies"],
      });
    }
  });

export type Meta = z.infer<typeof MetaSchema>;

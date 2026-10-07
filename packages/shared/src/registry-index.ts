import { z } from "zod";
import { CategorySchema } from "./categories.js";
import {
  DescriptionSchema,
  DifficultySchema,
  ItemTypeSchema,
  PerformanceSchema,
  SlugSchema,
  TagSchema,
  TitleSchema,
} from "./meta.js";
import { SCHEMA_VERSION } from "./registry-item.js";
import { SemverVersionSchema } from "./semver.js";
import { Sha256HashSchema } from "./hashable-json.js";
import { RegistryPreviewsSchema } from "./preview.js";

/**
 * One entry of `/r/index.json` (MASTER_PROMPT Section 4.3).
 * Only `published`/`deprecated` items appear; drafts never leave the builder.
 */
export const RegistryIndexItemSchema = z
  .object({
    slug: SlugSchema,
    type: ItemTypeSchema,
    title: TitleSchema,
    category: CategorySchema,
    tags: z
      .array(TagSchema)
      .max(8, "at most 8 tags")
      .refine((tags) => new Set(tags).size === tags.length, "tags must be unique"),
    description: DescriptionSchema,
    version: SemverVersionSchema,
    hash: Sha256HashSchema,
    performance: PerformanceSchema,
    difficulty: DifficultySchema,
    addedAt: z.iso.date(),
    deprecated: z.boolean().optional(),
    previews: RegistryPreviewsSchema.optional(),
  })
  .strict();

export type RegistryIndexItem = z.infer<typeof RegistryIndexItemSchema>;

/** `/r/index.json` (MASTER_PROMPT Section 4.3). */
export const RegistryIndexSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    generatedAt: z.iso.datetime(),
    items: z.array(RegistryIndexItemSchema),
  })
  .strict();

export type RegistryIndex = z.infer<typeof RegistryIndexSchema>;

import { z } from "zod";

/**
 * Central category list.
 * Single source of truth: extend this tuple to add a category.
 */
export const CATEGORIES = [
  "text-animations",
  "backgrounds",
  "cursors",
  "buttons",
  "scroll",
  "3d",
  "layout",
  "utilities",
] as const;

export type Category = (typeof CATEGORIES)[number];

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const KebabCaseSchema = z
  .string()
  .max(64, "must be at most 64 characters")
  .regex(
    KEBAB_CASE_PATTERN,
    "must be kebab-case (lowercase alphanumerics separated by single hyphens)",
  );

export const CategorySchema = z.enum(CATEGORIES);

export type CategorySchemaType = z.infer<typeof CategorySchema>;

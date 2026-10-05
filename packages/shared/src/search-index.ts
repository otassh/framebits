import { z } from "zod";

/**
 * `/search-index.json` (Task 4b): MiniSearch over published components.
 * The `index` blob is MiniSearch's own serialization (opaque to us, hence a
 * string-keyed record); `docs` is the minimal per-slug doc store.
 */
export const SearchIndexDocSchema = z
  .object({
    title: z.string().min(1),
    category: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

export type SearchIndexDoc = z.infer<typeof SearchIndexDocSchema>;

export const SearchIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    index: z.record(z.string(), z.unknown()),
    docs: z.record(z.string(), SearchIndexDocSchema),
  })
  .strict();

export type SearchIndex = z.infer<typeof SearchIndexSchema>;

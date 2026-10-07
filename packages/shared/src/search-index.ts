import { z } from "zod";
import { guardedRecord, rejectDangerousKeys } from "./hashable-json.js";
import { SlugSchema } from "./meta.js";

/** Max keys per search-index record (DoS guard on the static index blob). */
export const MAX_SEARCH_INDEX_KEYS = 5000;

/**
 * Key shape of the opaque MiniSearch `index` blob: word/field identifiers only
 * (alphanumerics plus `_`, `.`, `-`, `$`), 1-128 chars. Anything else is not a
 * MiniSearch serialization we produced.
 */
const SEARCH_INDEX_KEY_PATTERN = /^[A-Za-z0-9_.$-]{1,128}$/;

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
    index: guardedRecord(z.unknown()),
    docs: guardedRecord(SearchIndexDocSchema),
  })
  .strict()
  .superRefine((searchIndex, ctx) => {
    rejectDangerousKeys(searchIndex.index, ctx);
    rejectDangerousKeys(searchIndex.docs, ctx);
    const indexKeys = Object.keys(searchIndex.index);
    if (indexKeys.length > MAX_SEARCH_INDEX_KEYS) {
      ctx.addIssue({
        code: "custom",
        message: `index must have at most ${String(MAX_SEARCH_INDEX_KEYS)} keys`,
        path: ["index"],
      });
    }
    for (const key of indexKeys) {
      if (!SEARCH_INDEX_KEY_PATTERN.test(key)) {
        ctx.addIssue({
          code: "custom",
          message: `index key "${key}" is not a valid search-index key`,
          path: ["index", key],
        });
        break;
      }
    }
    const docKeys = Object.keys(searchIndex.docs);
    if (docKeys.length > MAX_SEARCH_INDEX_KEYS) {
      ctx.addIssue({
        code: "custom",
        message: `docs must have at most ${String(MAX_SEARCH_INDEX_KEYS)} keys`,
        path: ["docs"],
      });
    }
    for (const key of docKeys) {
      if (!SlugSchema.safeParse(key).success) {
        ctx.addIssue({
          code: "custom",
          message: `docs key "${key}" is not a valid slug`,
          path: ["docs", key],
        });
        break;
      }
    }
  });

export type SearchIndex = z.infer<typeof SearchIndexSchema>;

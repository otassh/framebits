import { z } from "zod";

/** `sha256:` followed by 64 lowercase hex chars (MASTER_PROMPT Sections 4.2, 5.7). */
export const Sha256HashSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, 'must look like "sha256:<64 lowercase hex>"');

export type Sha256Hash = z.infer<typeof Sha256HashSchema>;

/**
 * JSON-compatible value that is safe to hash.
 *
 * Leaves are STRINGS ONLY (deliberate): Tailwind fragments and CSS variables are
 * string-valued in practice (`"0"`, `"16px"`, `"fade 1s"`), and forbidding numbers,
 * booleans, and null removes the entire float/canonical-number problem at parse time
 * instead of failing later inside the hasher. `undefined` is not a member: absent
 * optional fields are omitted, never serialized.
 */
export type HashableJsonValue =
  | string
  | HashableJsonValue[]
  | { [key: string]: HashableJsonValue };

export const HashableJsonValueSchema: z.ZodType<HashableJsonValue> = z.union([
  z.string(),
  z.array(z.lazy((): z.ZodType<HashableJsonValue> => HashableJsonValueSchema)),
  z.record(z.string(), z.lazy((): z.ZodType<HashableJsonValue> => HashableJsonValueSchema)),
]);

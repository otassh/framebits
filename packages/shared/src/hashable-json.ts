import { z } from "zod";

/** `sha256:` followed by 64 lowercase hex chars (MASTER_PROMPT Sections 4.2, 5.7). */
export const Sha256HashSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, 'must look like "sha256:<64 lowercase hex>"');

export type Sha256Hash = z.infer<typeof Sha256HashSchema>;

/**
 * JSON-compatible value that is safe to hash.
 *
 * Numbers are restricted to integers: the canonical form must contain no floats,
 * so non-integers are rejected at parse time (with a schema path) instead of
 * failing later inside the hasher. `undefined` is not a member: absent optional
 * fields are omitted, never serialized.
 */
export type HashableJsonValue =
  | string
  | number
  | boolean
  | null
  | HashableJsonValue[]
  | { [key: string]: HashableJsonValue };

const IntegerSchema = z
  .number()
  .refine(
    (n) => Number.isInteger(n),
    "must be an integer (floats cannot be hashed deterministically)",
  );

export const HashableJsonValueSchema: z.ZodType<HashableJsonValue> = z.union([
  z.string(),
  IntegerSchema,
  z.boolean(),
  z.null(),
  z.array(z.lazy((): z.ZodType<HashableJsonValue> => HashableJsonValueSchema)),
  z.record(z.string(), z.lazy((): z.ZodType<HashableJsonValue> => HashableJsonValueSchema)),
]);

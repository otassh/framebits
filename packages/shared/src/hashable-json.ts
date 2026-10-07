import { z } from "zod";

/** Keys that enable prototype pollution. Rejected in every record/object we validate. */
export const DANGEROUS_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** True when `key` is a prototype-pollution key. */
export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

/** First dangerous key in `record`, or null when clean. */
export function findDangerousKey(record: Record<string, unknown>): string | null {
  for (const key of Object.keys(record)) {
    if (isDangerousKey(key)) return key;
  }
  return null;
}

/**
 * Shared `superRefine` for string-keyed records: rejects `__proto__`,
 * `constructor`, and `prototype` keys (prototype-pollution guard).
 */
export function rejectDangerousKeys(
  record: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  const bad = findDangerousKey(record);
  if (bad !== null) {
    ctx.addIssue({ code: "custom", message: `key "${bad}" is not allowed` });
  }
}

/** Recursively true when any object in a hashable-JSON value has a dangerous key. */
export function containsDangerousKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsDangerousKey(entry));
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (findDangerousKey(record) !== null) return true;
    return Object.values(record).some((entry) => containsDangerousKey(entry));
  }
  return false;
}

/**
 * Guard that inspects the RAW unknown input for dangerous keys (deep).
 * It must run BEFORE `z.record()` parsing: Zod silently drops own `__proto__`
 * keys while parsing, so an output-side `superRefine` alone can never reject
 * them. Used inside {@link guardedRecord}.
 */
export const RawDangerousKeysGuard: z.ZodType = z.unknown().superRefine((value, ctx) => {
  if (containsDangerousKey(value)) {
    ctx.addIssue({
      code: "custom",
      message: 'keys "__proto__", "constructor", and "prototype" are not allowed',
    });
  }
});

/**
 * `z.record` that REJECTS `__proto__`/`constructor`/`prototype` keys instead of
 * letting Zod silently drop `__proto__`. Implemented as an intersection so the
 * raw-input guard above sees every key before record parsing; the inferred
 * output type is unchanged (`Record<string, V>`).
 */
export function guardedRecord<V extends z.ZodType>(
  valueSchema: V,
): z.ZodIntersection<typeof RawDangerousKeysGuard, z.ZodRecord<z.ZodString, V>> {
  return z.intersection(RawDangerousKeysGuard, z.record(z.string(), valueSchema));
}

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

export const HashableJsonValueSchema: z.ZodType<HashableJsonValue> = z
  .union([
    z.string(),
    z.array(z.lazy((): z.ZodType<HashableJsonValue> => HashableJsonValueSchema)),
    guardedRecord(z.lazy((): z.ZodType<HashableJsonValue> => HashableJsonValueSchema)),
  ])
  .superRefine((value, ctx) => {
    if (containsDangerousKey(value)) {
      ctx.addIssue({
        code: "custom",
        message: 'keys "__proto__", "constructor", and "prototype" are not allowed',
      });
    }
  });

/**
 * Canonical JSON serialization (JCS / RFC 8785 principles).
 *
 * Rules: UTF-8, no whitespace, object keys sorted by UTF-16 code unit order
 * (recursively), arrays keep their order. Numbers are restricted to integers —
 * the hashed payload must contain no floats — and `undefined`, NaN/Infinity,
 * bigints, functions, and symbols are rejected loudly instead of being
 * silently coerced (which is how nondeterministic hashes happen).
 */
export class CanonicalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalizeError";
  }
}

/**
 * Maximum nesting depth for `canonicalize` (objects/arrays combined).
 * Iterative-guard: deeper input throws `CanonicalizeError` instead of
 * overflowing the call stack on hostile payloads.
 */
export const MAX_DEPTH = 100;

function compareKeys(a: string, b: string): number {
  // UTF-16 code unit order (plain JS relational semantics, no locale, no code-point
  // collation). This is what RFC 8785 requires for key sorting.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function canonicalize(value: unknown): string {
  return canonicalizeAtDepth(value, 0);
}

function canonicalizeAtDepth(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new CanonicalizeError(
      `cannot canonicalize: nesting depth exceeds ${String(MAX_DEPTH)}`,
    );
  }
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new CanonicalizeError(`cannot canonicalize non-integer number: ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeAtDepth(entry, depth + 1)).join(",")}]`;
  }
  if (typeof value === "object") {
    if (!isPlainObject(value)) {
      throw new CanonicalizeError(
        "cannot canonicalize non-plain objects (only object literals and arrays are hashable)",
      );
    }
    const entries = Object.entries(value).sort(([a], [b]) => compareKeys(a, b));
    for (const [key] of entries) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new CanonicalizeError(`cannot canonicalize dangerous key "${key}"`);
      }
    }
    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeAtDepth(entryValue, depth + 1)}`)
      .join(",");
    return `{${body}}`;
  }
  throw new CanonicalizeError(
    `cannot canonicalize value of type ${typeof value} (undefined, bigint, function and symbol are not hashable)`,
  );
}

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

function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function canonicalize(value: unknown): string {
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
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => compareKeys(a, b));
    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
      .join(",");
    return `{${body}}`;
  }
  throw new CanonicalizeError(
    `cannot canonicalize value of type ${typeof value} (undefined, bigint, function and symbol are not hashable)`,
  );
}

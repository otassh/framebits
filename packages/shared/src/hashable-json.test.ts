import { describe, expect, it } from "vitest";
import { HashableJsonValueSchema, Sha256HashSchema } from "./hashable-json.js";

describe("Sha256HashSchema", () => {
  it("accepts a well-formed hash", () => {
    expect(Sha256HashSchema.safeParse(`sha256:${"a".repeat(64)}`).success).toBe(true);
  });

  it.each([
    "",
    "sha256:abc",
    `sha256:${"A".repeat(64)}`,
    "a".repeat(64),
    `sha512:${"a".repeat(128)}`,
    `sha256:${"g".repeat(64)}`,
  ])("rejects %s", (value) => {
    expect(Sha256HashSchema.safeParse(value).success).toBe(false);
  });
});

describe("HashableJsonValueSchema", () => {
  it.each([
    "text",
    3,
    -5,
    true,
    false,
    null,
    [1, "a", null],
    { a: { b: [1, 2] } },
  ])("accepts %j", (value) => {
    expect(HashableJsonValueSchema.safeParse(value).success).toBe(true);
  });

  it.each([[1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [undefined], [() => 0]])(
    "rejects non-hashable value",
    (value) => {
      expect(HashableJsonValueSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects bigints", () => {
    expect(HashableJsonValueSchema.safeParse(1n).success).toBe(false);
  });

  it("rejects nested floats with a path", () => {
    const result = HashableJsonValueSchema.safeParse({ keyframes: { from: { opacity: 0.5 } } });
    expect(result.success).toBe(false);
  });
});

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
  it.each([["text"], [["a", "b"]], [{ a: { b: "c" } }], [{ arr: [{ deep: "x" }] }]])(
    "accepts %j",
    (value) => {
      expect(HashableJsonValueSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([[[3]], [[true]], [[null]], [[1.5]], [[undefined]], [[() => 0]]])(
    "rejects non-string leaves",
    (value) => {
      expect(HashableJsonValueSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects bigints", () => {
    expect(HashableJsonValueSchema.safeParse(1n).success).toBe(false);
  });

  it("rejects nested numbers with a path", () => {
    const result = HashableJsonValueSchema.safeParse({ keyframes: { from: { opacity: 0 } } });
    expect(result.success).toBe(false);
  });
});

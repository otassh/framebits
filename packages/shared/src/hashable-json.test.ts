import { describe, expect, it } from "vitest";
import {
  HashableJsonValueSchema,
  Sha256HashSchema,
  containsDangerousKey,
  findDangerousKey,
  guardedRecord,
  isDangerousKey,
} from "./hashable-json.js";

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

describe("dangerous keys", () => {
  it("isDangerousKey flags exactly the trio", () => {
    expect(isDangerousKey("__proto__")).toBe(true);
    expect(isDangerousKey("constructor")).toBe(true);
    expect(isDangerousKey("prototype")).toBe(true);
    expect(isDangerousKey("motion")).toBe(false);
    expect(isDangerousKey("")).toBe(false);
  });

  it("findDangerousKey returns the first offender", () => {
    expect(findDangerousKey({ a: 1 })).toBeNull();
    const parsed = JSON.parse('{"ok": 1, "constructor": 2}') as Record<string, unknown>;
    expect(findDangerousKey(parsed)).toBe("constructor");
  });

  it("containsDangerousKey scans deep (arrays and nested objects)", () => {
    expect(containsDangerousKey({ a: [{ b: "c" }] })).toBe(false);
    expect(containsDangerousKey(JSON.parse('{"a": [{"__proto__": 1}]}'))).toBe(true);
    expect(containsDangerousKey(JSON.parse('{"a": {"b": {"prototype": 1}}}'))).toBe(true);
    expect(containsDangerousKey("__proto__")).toBe(false);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "HashableJsonValueSchema rejects top-level %s (via JSON.parse)",
    (key) => {
      expect(HashableJsonValueSchema.safeParse(JSON.parse(`{"${key}": "x"}`)).success).toBe(
        false,
      );
    },
  );

  it("HashableJsonValueSchema rejects nested dangerous keys", () => {
    expect(
      HashableJsonValueSchema.safeParse(JSON.parse('{"a": {"__proto__": "x"}}')).success,
    ).toBe(false);
    expect(
      HashableJsonValueSchema.safeParse(JSON.parse('{"a": [{"prototype": "x"}]}')).success,
    ).toBe(false);
  });

  it("guardedRecord preserves clean records and the value type", () => {
    const schema = guardedRecord(HashableJsonValueSchema);
    const parsed = schema.parse({ fade: "fade 1s" });
    expect(parsed).toEqual({ fade: "fade 1s" });
    expect(schema.safeParse(JSON.parse('{"__proto__": "x"}')).success).toBe(false);
  });
});

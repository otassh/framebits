import { describe, expect, it } from "vitest";
import { CanonicalizeError, canonicalize } from "./canonical.js";

describe("canonicalize", () => {
  it("serializes primitives", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize(0)).toBe("0");
    expect(canonicalize(-12)).toBe("-12");
    expect(canonicalize("")).toBe('""');
  });

  it("sorts object keys recursively (UTF-16 code unit order)", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ z: { d: 1, c: 2 }, a: 0 })).toBe('{"a":0,"z":{"c":2,"d":1}}');
    expect(canonicalize({ b: 1, A: 2 })).toBe('{"A":2,"b":1}');
  });

  it("keeps array order", () => {
    expect(canonicalize([2, 1])).toBe("[2,1]");
    expect(canonicalize({ files: [{ path: "b" }, { path: "a" }] })).toBe(
      '{"files":[{"path":"b"},{"path":"a"}]}',
    );
  });

  it("emits no whitespace", () => {
    expect(canonicalize({ a: [1, { b: null }] })).toBe('{"a":[1,{"b":null}]}');
  });

  it("escapes strings exactly like JSON", () => {
    expect(canonicalize('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(canonicalize("line\nbreak")).toBe('"line\\nbreak"');
    expect(canonicalize("café ☃")).toBe('"café ☃"');
  });

  it("serializes empty containers", () => {
    expect(canonicalize({})).toBe("{}");
    expect(canonicalize([])).toBe("[]");
  });

  it.each([[undefined], [Number.NaN], [Number.POSITIVE_INFINITY], [1.5], [-0.25]])(
    "throws for non-hashable number/undefined",
    (value) => {
      expect(() => canonicalize(value)).toThrow(CanonicalizeError);
    },
  );

  it("throws for bigint, function, and symbol", () => {
    expect(() => canonicalize(1n)).toThrow(CanonicalizeError);
    expect(() => canonicalize(() => 0)).toThrow(CanonicalizeError);
    expect(() => canonicalize(Symbol("s"))).toThrow(CanonicalizeError);
  });

  it("throws for undefined nested inside containers", () => {
    expect(() => canonicalize({ a: undefined })).toThrow(CanonicalizeError);
    expect(() => canonicalize([undefined])).toThrow(CanonicalizeError);
  });
});

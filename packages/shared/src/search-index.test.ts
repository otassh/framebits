import { describe, expect, it } from "vitest";
import { MAX_SEARCH_INDEX_KEYS, SearchIndexSchema } from "./search-index.js";

describe("SearchIndexSchema", () => {
  it("accepts a minimal index", () => {
    expect(
      SearchIndexSchema.safeParse({
        schemaVersion: 1,
        index: { documentCount: 1 },
        docs: { "aurora-text": { title: "Aurora Text", category: "text-animations", description: "Nice." } },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["bad version", { schemaVersion: 2, index: {}, docs: {} }],
    ["index array", { schemaVersion: 1, index: [], docs: {} }],
    ["thin doc", { schemaVersion: 1, index: {}, docs: { x: { title: "T" } } }],
    ["unknown key", { schemaVersion: 1, index: {}, docs: {}, extra: 1 }],
  ])("rejects %s", (_name, value) => {
    expect(SearchIndexSchema.safeParse(value).success).toBe(false);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects dangerous %s key in index and docs",
    (key) => {
      const index = JSON.parse(`{"${key}": 1}`) as Record<string, unknown>;
      expect(
        SearchIndexSchema.safeParse({ schemaVersion: 1, index, docs: {} }).success,
      ).toBe(false);
      const docs = JSON.parse(
        `{"${key}": {"title": "T", "category": "c", "description": "d"}}`,
      ) as Record<string, unknown>;
      expect(
        SearchIndexSchema.safeParse({ schemaVersion: 1, index: {}, docs }).success,
      ).toBe(false);
    },
  );

  it("rejects non-slug docs keys and bad index keys", () => {
    const doc = { title: "T", category: "c", description: "d" };
    expect(
      SearchIndexSchema.safeParse({ schemaVersion: 1, index: {}, docs: { Bad: doc } }).success,
    ).toBe(false);
    expect(
      SearchIndexSchema.safeParse({ schemaVersion: 1, index: { "a/b": 1 }, docs: {} }).success,
    ).toBe(false);
  });

  it(`rejects more than ${String(MAX_SEARCH_INDEX_KEYS)} keys`, () => {
    const index: Record<string, number> = {};
    for (let n = 0; n < MAX_SEARCH_INDEX_KEYS + 1; n++) index[`k${String(n)}`] = n;
    expect(SearchIndexSchema.safeParse({ schemaVersion: 1, index, docs: {} }).success).toBe(
      false,
    );
  });
});

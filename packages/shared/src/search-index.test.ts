import { describe, expect, it } from "vitest";
import { SearchIndexSchema } from "./search-index.js";

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
});

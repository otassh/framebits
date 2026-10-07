import { describe, expect, it } from "vitest";
import { CATEGORIES, CategorySchema, KebabCaseSchema } from "./categories.js";

describe("CATEGORIES", () => {
  it("contains the master-prompt list", () => {
    expect([...CATEGORIES]).toEqual([
      "text-animations",
      "backgrounds",
      "cursors",
      "buttons",
      "scroll",
      "3d",
      "layout",
      "utilities",
    ]);
  });
});

describe("KebabCaseSchema", () => {
  it.each(["text-animations", "a", "3d", "a-b-c-1"])("accepts %s", (value) => {
    expect(KebabCaseSchema.safeParse(value).success).toBe(true);
  });

  it.each(["", "Foo", "a_b", "a--b", "-a", "a-", "a b", "A-B"])("rejects %s", (value) => {
    expect(KebabCaseSchema.safeParse(value).success).toBe(false);
  });

  it("rejects strings over 64 characters", () => {
    expect(KebabCaseSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(KebabCaseSchema.safeParse("a".repeat(65)).success).toBe(false);
  });
});

describe("CategorySchema", () => {
  it("accepts every listed category", () => {
    for (const category of CATEGORIES) {
      expect(CategorySchema.safeParse(category).success).toBe(true);
    }
  });

  it.each(["unknown-cat", "Text-Animations", "", "components"])("rejects %s", (value) => {
    expect(CategorySchema.safeParse(value).success).toBe(false);
  });
});

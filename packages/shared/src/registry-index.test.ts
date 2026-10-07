import { describe, expect, it } from "vitest";
import { RegistryIndexItemSchema, RegistryIndexSchema } from "./registry-index.js";
export const validIndexItem = {
  slug: "aurora-text",
  type: "component",
  title: "Aurora Text",
  category: "text-animations",
  tags: ["gradient"],
  description: "Animated aurora gradient text.",
  version: "1.0.0",
  hash: `sha256:${"b".repeat(64)}`,
  performance: "light",
  difficulty: "easy",
  addedAt: "2026-10-04",
} as const;

describe("RegistryIndexItemSchema", () => {
  it("accepts a valid item", () => {
    expect(
      RegistryIndexItemSchema.safeParse({
        ...validIndexItem,
        previews: { image: "/previews/aurora-text.webp" },
      }).success,
    ).toBe(true);
  });

  it("rejects bad items", () => {
    expect(
      RegistryIndexItemSchema.safeParse({ ...validIndexItem, performance: "ultra" }).success,
    ).toBe(false);
    expect(
      RegistryIndexItemSchema.safeParse({
        ...validIndexItem,
        previews: { image: "../private.webp" },
      }).success,
    ).toBe(false);
  });

  it("accepts the deprecated flag and omits it otherwise", () => {
    expect(
      RegistryIndexItemSchema.safeParse({ ...validIndexItem, deprecated: true }).success,
    ).toBe(true);
    const parsed = RegistryIndexItemSchema.parse({ ...validIndexItem });
    expect("deprecated" in parsed).toBe(false);
  });

  it("rejects duplicate tags", () => {
    expect(
      RegistryIndexItemSchema.safeParse({ ...validIndexItem, tags: ["x", "x"] }).success,
    ).toBe(false);
  });
});

describe("RegistryIndexSchema", () => {
  it("accepts a valid index", () => {
    expect(
      RegistryIndexSchema.safeParse({
        schemaVersion: 1,
        generatedAt: "2026-10-05T02:00:00.000Z",
        items: [{ ...validIndexItem }],
      }).success,
    ).toBe(true);
  });

  it("accepts an empty index", () => {
    expect(
      RegistryIndexSchema.safeParse({
        schemaVersion: 1,
        generatedAt: "2026-10-05T02:00:00.000Z",
        items: [],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["bad schemaVersion", { schemaVersion: 2 }],
    ["bad generatedAt", { generatedAt: "yesterday" }],
    ["bad item", { items: [{ ...validIndexItem, hash: "nope" }] }],
    ["unknown key", { extra: 1 }],
  ])("rejects %s", (_rule, override) => {
    expect(
      RegistryIndexSchema.safeParse({
        schemaVersion: 1,
        generatedAt: "2026-10-05T02:00:00.000Z",
        items: [],
        ...override,
      }).success,
    ).toBe(false);
  });
});

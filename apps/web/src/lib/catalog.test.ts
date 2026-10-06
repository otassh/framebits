import type { RegistryIndexItem } from "@framebits/shared";
import { describe, expect, it } from "vitest";
import { catalogStats, filterCatalog, formatCategory } from "./catalog.js";

const HASH = `sha256:${"0".repeat(64)}`;

function item(
  overrides: Partial<RegistryIndexItem> & Pick<RegistryIndexItem, "slug" | "title">,
): RegistryIndexItem {
  return {
    type: "component",
    category: "buttons",
    tags: [],
    description: "A valid component description for catalog tests.",
    version: "1.0.0",
    hash: HASH,
    performance: "light",
    difficulty: "easy",
    addedAt: "2026-10-05",
    ...overrides,
    slug: overrides.slug,
    title: overrides.title,
  };
}

const ITEMS = [
  item({ slug: "shimmer-button", title: "Shimmer Button", tags: ["shimmer", "css"] }),
  item({
    slug: "aurora-text",
    title: "Aurora Text",
    category: "text-animations",
    tags: ["gradient", "text"],
    addedAt: "2026-10-06",
  }),
  item({ slug: "old-button", title: "Old Button", deprecated: true }),
  item({ slug: "cn", title: "CN", type: "lib", category: "utilities" }),
];

describe("filterCatalog", () => {
  it("returns only current component items", () => {
    expect(filterCatalog(ITEMS, { query: "", category: "all" }).map(({ slug }) => slug)).toEqual([
      "shimmer-button",
      "aurora-text",
    ]);
  });

  it("matches multi-token searches against real metadata fields", () => {
    expect(
      filterCatalog(ITEMS, { query: "aurora gradient", category: "all" }).map(({ slug }) => slug),
    ).toEqual(["aurora-text"]);
  });

  it("combines category and query filters", () => {
    expect(
      filterCatalog(ITEMS, { query: "shimmer", category: "buttons" }).map(({ slug }) => slug),
    ).toEqual(["shimmer-button"]);
    expect(filterCatalog(ITEMS, { query: "aurora", category: "buttons" })).toEqual([]);
  });
});

describe("catalogStats", () => {
  it("derives counts and latest date from real component metadata", () => {
    expect(catalogStats(ITEMS)).toEqual({
      components: 2,
      categories: 2,
      latestAddedAt: "2026-10-06",
    });
  });
});

describe("formatCategory", () => {
  it("formats registry category slugs", () => {
    expect(formatCategory("text-animations")).toBe("Text Animations");
    expect(formatCategory("3d")).toBe("3D");
  });
});

import type { Category, RegistryIndexItem } from "@framebits/shared";

export type CategoryFilter = Category | "all";

export interface CatalogFilters {
  query: string;
  category: CategoryFilter;
}

export interface CatalogStats {
  components: number;
  categories: number;
  latestAddedAt: string | undefined;
}

export function componentItems(items: readonly RegistryIndexItem[]): RegistryIndexItem[] {
  return items.filter((item) => item.type === "component" && item.deprecated !== true);
}

export function filterCatalog(
  items: readonly RegistryIndexItem[],
  filters: CatalogFilters,
): RegistryIndexItem[] {
  const query = filters.query.trim().toLowerCase();
  const tokens = query.split(/\s+/).filter((token) => token !== "");

  return componentItems(items).filter((item) => {
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (tokens.length === 0) return true;
    const haystack = [item.title, item.slug, item.description, item.category, ...item.tags]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function catalogStats(items: readonly RegistryIndexItem[]): CatalogStats {
  const components = componentItems(items);
  const latest = components
    .map((item) => item.addedAt)
    .sort()
    .at(-1);
  return {
    components: components.length,
    categories: new Set(components.map((item) => item.category)).size,
    latestAddedAt: latest,
  };
}

export function formatCategory(category: string): string {
  if (category === "3d") return "3D";
  return category
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  componentItems,
  filterCatalog,
  formatCategory,
  type CategoryFilter,
} from "../lib/catalog.js";
import type { IndexState } from "../lib/page-state.js";
import { AppLink, ComponentCard, LoadingCards, ErrorPanel } from "../components/site-ui.js";
import { ComponentSidebar } from "../components/component-sidebar.js";

export function CatalogPage({
  state,
  retry,
}: {
  state: IndexState;
  retry: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const deferredQuery = useDeferredValue(query);
  const items = state.status === "ready" ? componentItems(state.index.items) : [];
  const categories = Array.from(new Set(items.map((item) => item.category))).sort();
  const filtered =
    state.status === "ready"
      ? filterCatalog(state.index.items, { query: deferredQuery, category })
      : [];

  return (
    <main id="main-content" tabIndex={-1} className="page catalog-page">
      <div className="shell component-browser-layout">
        <ComponentSidebar state={state} query={query} onQueryChange={setQuery} retry={retry} />
        <div className="component-browser-content catalog-content">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <AppLink href="/">Home</AppLink>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Components</span>
          </nav>
          <div className="workspace-heading">
            <div>
              <span className="eyebrow eyebrow-static">Component registry</span>
              <h1>Components</h1>
            </div>
            <p>
              A little motion. A lot of possibility. Find a component, try its preview, and make it
              yours.
            </p>
          </div>
          <div className="catalog-toolbar">
            <div
              className="filter-row catalog-category-filters"
              role="group"
              aria-label="Filter by category"
            >
              {(["all", ...categories] as CategoryFilter[]).map((value) => (
                <button
                  type="button"
                  className={category === value ? "is-active" : ""}
                  aria-pressed={category === value}
                  onClick={() => {
                    setCategory(value);
                  }}
                  key={value}
                >
                  <span className="filter-label">
                    {value === "all" ? "All" : formatCategory(value)}
                    <span>
                      {value === "all"
                        ? items.length
                        : items.filter((item) => item.category === value).length}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {state.status === "loading" ? <LoadingCards /> : null}
          {state.status === "error" ? <ErrorPanel message={state.message} retry={retry} /> : null}
          {state.status === "ready" ? (
            <p className="result-count" role="status" aria-live="polite" aria-atomic="true">
              <span>
                {filtered.length} of {items.length}
              </span>
            </p>
          ) : null}
          {state.status === "ready" && filtered.length > 0 ? (
            <div className="component-grid catalog-grid">
              {filtered.map((item) => (
                <ComponentCard key={item.slug} item={item} />
              ))}
            </div>
          ) : null}
          {state.status === "ready" && filtered.length === 0 ? (
            <div className="state-panel empty-panel">
              <span className="state-icon">
                <Search size={22} aria-hidden="true" />
              </span>
              <div>
                <h3>No matching components</h3>
                <p>Try a broader query or select a different category.</p>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                Reset filters
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

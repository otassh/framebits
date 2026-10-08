import { BookOpen, Search, X, ArrowRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import {
  componentItems,
  filterCatalog,
  formatCategory,
  type CategoryFilter,
} from "../lib/catalog.js";
import type { IndexState } from "../lib/page-state.js";
import { AppLink, ComponentCard, LoadingCards, ErrorPanel } from "../components/site-ui.js";
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
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))),
    [items],
  );
  const filtered =
    state.status === "ready"
      ? filterCatalog(state.index.items, { query: deferredQuery, category })
      : [];
  const options: CategoryFilter[] = ["all", ...categories];

  const stepCategory = (direction: 1 | -1): void => {
    const current = options.indexOf(category);
    const next = options[(current + direction + options.length) % options.length];
    if (next !== undefined) setCategory(next);
  };

  return (
    <main id="main-content" tabIndex={-1} className="page catalog-page">
      <div className="shell">
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
        <div className="catalog-workspace">
          <aside className="workspace-sidebar catalog-sidebar">
            <span className="sidebar-label">Browse by category</span>
            <div
              className="filter-row category-list"
              role="group"
              aria-label="Filter by category"
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") stepCategory(1);
                else if (event.key === "ArrowLeft") stepCategory(-1);
              }}
            >
              <button
                type="button"
                className={category === "all" ? "is-active" : ""}
                aria-pressed={category === "all"}
                onClick={() => {
                  setCategory("all");
                }}
              >
                {category === "all" ? <span className="filter-pill" aria-hidden="true" /> : null}
                <span className="filter-label">
                  All <span>{items.length}</span>
                </span>
              </button>
              {categories.map((value) => (
                <button
                  type="button"
                  className={category === value ? "is-active" : ""}
                  aria-pressed={category === value}
                  onClick={() => {
                    setCategory(value);
                  }}
                  key={value}
                >
                  {category === value ? <span className="filter-pill" aria-hidden="true" /> : null}
                  <span className="filter-label">
                    {formatCategory(value)}
                    <span>{items.filter((item) => item.category === value).length}</span>
                  </span>
                </button>
              ))}
            </div>
            <AppLink href="/docs" className="sidebar-guide">
              <BookOpen size={18} />
              <strong>New to Framebits?</strong>
              <span>Set up your first component.</span>
              <ArrowRight size={16} />
            </AppLink>
          </aside>
          <div className="catalog-content">
            <div className="catalog-toolbar">
              <label className="search-field">
                <Search size={19} aria-hidden="true" />
                <span className="sr-only">Search components</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                  }}
                  placeholder="Search components, tags, categories…"
                />
                {query !== "" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                    }}
                    aria-label="Clear search"
                  >
                    <X size={17} />
                  </button>
                ) : null}
              </label>
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
                  <Search size={22} />
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
      </div>
    </main>
  );
}

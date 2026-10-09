import { ArrowRight, ChevronDown, Layers, LayoutGrid, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { componentItems, filterCatalog, formatCategory } from "../lib/catalog.js";
import type { IndexState } from "../lib/page-state.js";
import { AppLink } from "./site-ui.js";

interface ComponentSidebarProps {
  state: IndexState;
  activeSlug?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  retry?: () => void;
}

export function ComponentSidebar({
  state,
  activeSlug,
  query: controlledQuery,
  onQueryChange,
  retry,
}: ComponentSidebarProps): React.JSX.Element {
  const [localQuery, setLocalQuery] = useState("");
  const [open, setOpen] = useState(false);
  const query = controlledQuery ?? localQuery;
  const deferredQuery = useDeferredValue(query);
  const navId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const items = state.status === "ready" ? componentItems(state.index.items) : [];
  const matches =
    state.status === "ready"
      ? filterCatalog(state.index.items, { query: deferredQuery, category: "all" })
      : [];
  const categories = Array.from(new Set(matches.map((item) => item.category))).sort();
  const setQuery = onQueryChange ?? setLocalQuery;
  const clearSearch = (): void => {
    setQuery("");
    searchRef.current?.focus({ preventScroll: true });
  };
  const closeList = (): void => {
    if (!open) return;
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)");
    const reset = (): void => {
      setOpen(false);
      if (mobile.matches && navRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus({ preventScroll: true });
      } else if (!mobile.matches && document.activeElement === toggleRef.current) {
        searchRef.current?.focus({ preventScroll: true });
      }
    };
    mobile.addEventListener("change", reset);
    return () => {
      mobile.removeEventListener("change", reset);
    };
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav === null || current === undefined || current === null || nav.clientHeight === 0) return;
    const bounds = nav.getBoundingClientRect();
    const selected = current.getBoundingClientRect();
    if (selected.top < bounds.top || selected.bottom > bounds.bottom) {
      nav.scrollTop += selected.top - bounds.top - (nav.clientHeight - selected.height) / 2;
    }
  }, [activeSlug, state.status, open, deferredQuery]);

  return (
    <aside
      className={`component-browser${open ? " is-open" : ""}`}
      aria-label="Component browser"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        closeList();
      }}
    >
      <div className="component-browser-heading">
        <h2>
          <Layers size={17} aria-hidden="true" /> Components
        </h2>
        {state.status === "ready" ? <span>{items.length}</span> : null}
      </div>
      <button
        ref={toggleRef}
        type="button"
        className="component-browser-toggle"
        aria-label="Component list"
        aria-expanded={open}
        aria-controls={navId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Layers size={18} aria-hidden="true" />
        <span>Component list</span>
        {state.status === "ready" ? (
          <span className="component-browser-count">{items.length}</span>
        ) : null}
        <ChevronDown size={18} className="component-browser-chevron" aria-hidden="true" />
      </button>
      <label className="search-field component-browser-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Search components</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search components…"
          autoComplete="off"
          spellCheck={false}
        />
        {query !== "" ? (
          <button type="button" onClick={clearSearch} aria-label="Clear search">
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </label>
      <nav
        id={navId}
        ref={navRef}
        className="component-browser-nav"
        aria-label="Component navigation"
      >
        <AppLink
          href="/components"
          className="component-browser-link component-browser-overview"
          current={activeSlug === undefined}
          onNavigate={closeList}
        >
          <LayoutGrid size={16} aria-hidden="true" />
          <span>All components</span>
          <ArrowRight size={14} className="component-browser-arrow" aria-hidden="true" />
        </AppLink>
        {state.status === "loading" ? (
          <div className="component-browser-loading" role="status">
            <span className="sr-only">Loading component list…</span>
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        ) : null}
        {state.status === "error" ? (
          <div className="component-browser-message" role="status">
            <p>Component list unavailable.</p>
            {retry === undefined ? null : (
              <button type="button" onClick={retry}>
                Try again
              </button>
            )}
          </div>
        ) : null}
        {categories.map((category) => (
          <section className="component-browser-group" key={category}>
            <h3 className="component-browser-category">
              {formatCategory(category)}
              <span>{matches.filter((item) => item.category === category).length}</span>
            </h3>
            <ul>
              {matches
                .filter((item) => item.category === category)
                .sort((left, right) => left.title.localeCompare(right.title))
                .map((item) => (
                  <li key={item.slug}>
                    <AppLink
                      href={`/components/${item.slug}`}
                      className="component-browser-link"
                      current={activeSlug === item.slug}
                      onNavigate={closeList}
                    >
                      <span className="component-browser-dot" aria-hidden="true" />
                      <span>{item.title}</span>
                      <ArrowRight
                        size={14}
                        className="component-browser-arrow"
                        aria-hidden="true"
                      />
                    </AppLink>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {state.status === "ready" && matches.length === 0 ? (
          <div className="component-browser-message" role="status">
            <p>{items.length === 0 ? "Components are coming soon." : "No components found."}</p>
            {query !== "" ? (
              <button type="button" onClick={clearSearch}>
                Reset search
              </button>
            ) : null}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

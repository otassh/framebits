import { ArrowRight, ArrowUpRight } from "lucide-react";
import { componentItems } from "../lib/catalog.js";
import type { IndexState } from "../lib/page-state.js";
import { AppLink, ComponentCard, ErrorPanel, LoadingCards } from "./site-ui.js";

export function HomeCollection({
  state,
  retry,
}: {
  state: IndexState;
  retry: () => void;
}): React.JSX.Element {
  const items = state.status === "ready" ? componentItems(state.index.items) : [];
  return (
    <div className="home-collection">
      <section className="shell collection-index" aria-labelledby="collection-title">
        <div className="collection-intro">
          <span className="content-label">The collection</span>
          <h2 id="collection-title">
            Small details. <br />
            Lasting impressions.
          </h2>
          <p>
            Find the interaction your interface is missing. Hover to try it. Open it to take the
            source.
          </p>
          <AppLink href="/components" className="content-link">
            Explore all components <ArrowUpRight size={17} aria-hidden="true" />
          </AppLink>
        </div>
        <div className="collection-list">
          <div className="collection-list-heading">
            <span>Component index</span>
            <span>
              {state.status === "ready" ? String(items.length).padStart(2, "0") : "—"} components
            </span>
          </div>
          <div className="component-ledger">
            {state.status === "ready"
              ? items.slice(0, 4).map((item) => <ComponentCard item={item} key={item.slug} />)
              : null}
            {state.status === "loading" ? <LoadingCards /> : null}
          </div>
          {state.status === "error" ? <ErrorPanel message={state.message} retry={retry} /> : null}
          {state.status === "ready" && items.length === 0 ? (
            <p className="collection-empty">New components are on their way.</p>
          ) : null}
        </div>
      </section>
      <section className="shell collection-workflow" aria-labelledby="workflow-title">
        <div className="collection-workflow-heading">
          <span className="content-label">Your next step</span>
          <h2 id="workflow-title">
            From a detail <br />
            to your design.
          </h2>
          <AppLink href="/docs" className="content-link">
            Read the guide <ArrowRight size={16} aria-hidden="true" />
          </AppLink>
        </div>
        <ol className="collection-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Try the interaction</h3>
              <p>Open a component and explore its live preview.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Take the source</h3>
              <p>Switch to Code. Select a file and copy its source.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Make it your own</h3>
              <p>Check the dependencies, then adapt the styles and timing.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { createRegistryClient } from "./lib/registry.js";
import { useRoute } from "./lib/router.js";
import type { IndexState } from "./lib/page-state.js";
import { Header } from "./components/site-ui.js";
import { Footer } from "./components/site-footer.js";
import { HomePage } from "./pages/home-page.js";
import { CatalogPage } from "./pages/catalog-page.js";
import { DetailPage } from "./pages/detail-page.js";
import { DocsPage } from "./pages/docs-page.js";
import { NotFoundPage } from "./pages/not-found-page.js";
const REGISTRY_URL = import.meta.env.VITE_REGISTRY_URL ?? "/r";

export function App(): React.JSX.Element {
  const route = useRoute();
  const client = useMemo(() => createRegistryClient({ baseUrl: REGISTRY_URL }), []);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<IndexState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void client.loadIndex(controller.signal).then(
      (index) => {
        setState({ status: "ready", index });
      },
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown registry error",
        });
      },
    );
    return () => {
      controller.abort();
    };
  }, [client, reloadKey]);

  const routeKey = route.kind === "component" ? `${route.kind}:${route.slug}` : route.kind;

  useEffect(() => {
    const title =
      route.kind === "home"
        ? "Framebits — Motion that feels engineered"
        : route.kind === "docs"
          ? "Getting started — Framebits"
          : route.kind === "catalog"
            ? "Components — Framebits"
            : route.kind === "component"
              ? `${route.slug} — Framebits`
              : "Not found — Framebits";
    document.title = title;
  }, [route]);

  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [routeKey]);

  const retry = (): void => {
    setReloadKey((value) => value + 1);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="grain" aria-hidden="true" />
      <Header route={route} />
      <div className="route-view" key={routeKey} id="route-view">
        {route.kind === "home" ? <HomePage /> : null}
        {route.kind === "docs" ? <DocsPage /> : null}
        {route.kind === "catalog" ? <CatalogPage state={state} retry={retry} /> : null}
        {route.kind === "component" ? (
          <DetailPage slug={route.slug} client={client} indexState={state} retryIndex={retry} />
        ) : null}
        {route.kind === "not-found" ? <NotFoundPage /> : null}
      </div>
      <Footer />
    </div>
  );
}

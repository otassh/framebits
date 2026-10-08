import { useEffect, useState } from "react";

export type AppRoute =
  | { kind: "home" }
  | { kind: "catalog" }
  | { kind: "docs" }
  | { kind: "component"; slug: string }
  | { kind: "not-found" };

export function parseRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") return { kind: "home" };
  if (normalized === "/components") return { kind: "catalog" };
  if (normalized === "/docs") return { kind: "docs" };
  const match = /^\/components\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(normalized);
  if (match?.[1] !== undefined) return { kind: "component", slug: match[1] };
  return { kind: "not-found" };
}

export function navigate(pathname: string): void {
  if (window.location.pathname === pathname) return;
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = (): void => {
      setRoute(parseRoute(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return route;
}

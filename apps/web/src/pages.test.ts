import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Header } from "./components/site-ui.js";
import type { IndexState } from "./lib/page-state.js";
import { HomePage } from "./pages/home-page.js";
import { CatalogPage } from "./pages/catalog-page.js";
import { DocsPage } from "./pages/docs-page.js";

const state: IndexState = {
  status: "ready",
  index: {
    schemaVersion: 1,
    generatedAt: "2026-10-08T10:00:00.000Z",
    items: [
      {
        slug: "aurora-text",
        type: "component",
        title: "Aurora Text",
        category: "text-animations",
        tags: ["gradient"],
        description: "Animated gradient text for React interfaces.",
        version: "1.0.0",
        hash: `sha256:${"0".repeat(64)}`,
        performance: "light",
        difficulty: "easy",
        addedAt: "2026-10-08",
      },
    ],
  },
};

describe("public pages", () => {
  it("keeps browsing and installation instructions off the homepage", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    expect(html).toContain('href="/components"');
    expect(html).toContain('href="/docs"');
    expect(html).toContain('class="hero-ballpit"');
    expect(html).not.toContain('class="component-card"');
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain("npx @framebits/cli init");
  });

  it("renders the searchable collection and links to individual detail pages", () => {
    const html = renderToStaticMarkup(createElement(CatalogPage, { state, retry: () => {} }));
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Filter by category"');
    expect(html).toContain('href="/components/aurora-text"');
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain('class="hero-ballpit"');
    expect(html).not.toContain("Initialize your project");
  });

  it("renders setup independently of the live registry", () => {
    const html = renderToStaticMarkup(createElement(DocsPage));
    expect(html).toContain("npx @framebits/cli init");
    expect(html).toContain("npx @framebits/cli add aurora-text");
    expect(html).toContain('id="cli-options"');
    expect(html).not.toContain('class="component-card"');
    expect(html).not.toContain('class="hero-ballpit"');
  });

  it.each([
    [{ kind: "home" } as const, "/"],
    [{ kind: "catalog" } as const, "/components"],
    [{ kind: "component", slug: "aurora-text" } as const, "/components"],
    [{ kind: "docs" } as const, "/docs"],
  ])("marks the current navigation destination for %j", (route, href) => {
    const html = renderToStaticMarkup(createElement(Header, { route }));
    expect(html).toContain(`href="${href}" aria-current="page"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

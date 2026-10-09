/* global document, getComputedStyle, innerHeight, window, fetch */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = createRequire(require.resolve("@framebits/builder"))("playwright");
const baseUrl = process.env.SIDEBAR_BASE_URL ?? "http://localhost:8080";
const webRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(webRoot, "test-results", "sidebar");
const widths = [320, 390, 820, 900, 901, 1280, 1920];
let browser;
let checks = 0;

function activeComponents(index) {
  return index.items.filter((item) => item.type === "component" && item.deprecated !== true);
}

function categoryLabel(category) {
  if (category === "3d") return "3D";
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function matchesQuery(item, query) {
  const haystack = [item.title, item.slug, item.description, item.category, ...item.tags]
    .join(" ")
    .toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

async function openPage(page, route) {
  await page.goto(new URL(route, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.locator(".component-browser").waitFor();
  await page.locator(".component-browser-link[href='/components']").waitFor({ state: "attached" });
  if (route === "/components") await page.locator(".component-card").first().waitFor();
  else await page.locator(".component-workspace").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function waitForLinks(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".component-browser-link").length === expected,
    count,
  );
}

async function assertRegistryLinks(page, expected) {
  await waitForLinks(page, expected.length + 1);
  const links = await page
    .locator(".component-browser-link")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("href")).sort());
  assert.deepEqual(
    links,
    ["/components", ...expected.map((item) => `/components/${item.slug}`)].sort(),
    "sidebar exposes exactly the published, active components and catalog overview",
  );
  const groups = await page.locator(".component-browser-group").evaluateAll((elements) =>
    elements.map((element) => ({
      label: element.querySelector("h3")?.textContent,
      hrefs: Array.from(element.querySelectorAll(".component-browser-link"))
        .map((link) => link.getAttribute("href"))
        .sort(),
    })),
  );
  const categories = [...new Set(expected.map((item) => item.category))];
  assert.equal(groups.length, categories.length, "each nonempty category has a navigation group");
  for (const category of categories) {
    const categoryItems = expected.filter((item) => item.category === category);
    const group = groups.find((entry) => entry.label.includes(categoryLabel(category)));
    assert(group, `${category} has an accessible heading`);
    assert.deepEqual(
      group.hrefs,
      categoryItems.map((item) => `/components/${item.slug}`).sort(),
      `${category} contains its own components`,
    );
  }
  checks++;
}

async function assertLayout(page, label) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const viewport = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > viewport + 1)
      issues.push("horizontal page overflow");
    for (const selector of [
      ".component-browser-layout",
      ".component-browser",
      ".component-browser-content",
      ".component-browser .search-field",
      ".component-workspace",
      ".workspace-toolbar",
      ".component-card",
    ]) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.left < -1 || rect.right > viewport + 1) issues.push(`${selector} leaves viewport`);
        if (element.scrollWidth > element.clientWidth + 2) issues.push(`${selector} clips content`);
      }
    }
    const sidebar = document.querySelector(".component-browser").getBoundingClientRect();
    const content = document.querySelector(".component-browser-content").getBoundingClientRect();
    if (viewport > 900 && sidebar.right > content.left + 1) issues.push("sidebar overlaps content");
    if (viewport <= 900 && sidebar.bottom > content.top + 1)
      issues.push("mobile browser overlaps content");
    return issues;
  });
  assert.deepEqual(problems, [], `${label}: ${problems.join(", ")}`);
  checks++;
}

async function assertCurrent(page, href) {
  const current = page.locator(".component-browser-link[aria-current='page']");
  assert.equal(await current.count(), 1, "navigation has a single current location");
  assert.equal(await current.getAttribute("href"), href);
  checks++;
}

async function assertMobileControls(page) {
  const nav = page.getByRole("navigation", { name: "Component navigation", includeHidden: true });
  const toggle = page.getByRole("button", { name: "Component list", exact: true });
  assert.equal(await toggle.isVisible(), true);
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await toggle.getAttribute("aria-controls"), await nav.getAttribute("id"));
  assert.equal(await nav.isVisible(), false);
  assert.equal(await page.getByRole("searchbox", { name: "Search components" }).isVisible(), true);
  await toggle.focus();
  for (let count = 0; count < 5; count++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await nav.evaluate((element) => element.contains(document.activeElement)),
      false,
      "collapsed navigation links are omitted from keyboard focus",
    );
  }
  await toggle.click();
  assert.equal(await nav.isVisible(), true);
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await nav.isVisible(), false);
  assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
  await toggle.click();
  await nav.locator("[aria-current='page']").focus();
  await page.keyboard.press("Enter");
  await nav.waitFor({ state: "hidden" });
  assert.equal(
    await toggle.evaluate((element) => element === document.activeElement),
    true,
    "keyboard activation of the current page restores disclosure focus",
  );
  checks++;
  checks++;
}

async function newContext() {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("https://api.github.com/**", (route) =>
    route.fulfill({ json: { full_name: "otassh/framebits", stargazers_count: 12345 } }),
  );
  return context;
}

try {
  // This checker only connects to an existing deployment; it never starts a server.
  const response = await fetch(new URL("/r/index.json", baseUrl));
  assert(response.ok, `registry index returned HTTP ${response.status}`);
  const registry = await response.json();
  const items = activeComponents(registry);
  assert(items.length > 0, "registry must contain a component");
  const demo = items.find((item) => item.slug === "aurora-text") ?? items[0];
  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.SIDEBAR_BROWSER_CHANNEL ?? "chrome",
  });
  const context = await newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPage(page, "/components");
  await assertRegistryLinks(page, items);
  await assertCurrent(page, "/components");
  const search = page.getByRole("searchbox", { name: "Search components" });
  assert.equal(await search.count(), 1, "catalog has one shared search input");
  const query = demo.slug;
  const matching = items.filter((item) => matchesQuery(item, query));
  await search.fill(query);
  await assertRegistryLinks(page, matching);
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".catalog-grid .component-card").length === expected,
    matching.length,
  );
  assert.equal(await page.locator(".catalog-grid .component-card").count(), matching.length);
  checks++;
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await assertRegistryLinks(page, items);
  assert.equal(await search.inputValue(), "");
  assert.equal(
    await search.evaluate((element) => element === document.activeElement),
    true,
    "clearing catalog search restores input focus",
  );
  checks++;
  await search.fill("zzzz-sidebar-missing");
  await waitForLinks(page, 1);
  await page.getByRole("heading", { name: "No matching components", exact: true }).waitFor();
  assert.equal(await page.locator(".catalog-grid .component-card").count(), 0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await assertRegistryLinks(page, items);
  await page.locator(`.component-browser-link[href='/components/${demo.slug}']`).click();
  await page.locator(".component-workspace").waitFor();
  assert.equal(new URL(page.url()).pathname, `/components/${demo.slug}`);
  await assertCurrent(page, `/components/${demo.slug}`);
  assert.equal(
    await page.getByRole("button", { name: "Copy source", exact: true }).isVisible(),
    true,
  );
  checks++;
  const detailSearch = page.getByRole("searchbox", { name: "Search components" });
  await detailSearch.fill("zzzz-sidebar-missing");
  await waitForLinks(page, 1);
  assert.equal(new URL(page.url()).pathname, `/components/${demo.slug}`);
  assert.equal(await page.locator("h1").textContent(), demo.title);
  assert.equal(
    await page.getByRole("tab", { name: "Preview", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await page.locator(".preview-live").isVisible(),
    true,
    "detail search leaves the active demo in place",
  );
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await assertRegistryLinks(page, items);
  await assertCurrent(page, `/components/${demo.slug}`);
  assert.equal(
    await detailSearch.evaluate((element) => element === document.activeElement),
    true,
    "clearing detail search restores input focus",
  );
  checks++;
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator(".catalog-grid .component-card").first().waitFor();
  await assertCurrent(page, "/components");
  await page.goForward({ waitUntil: "domcontentloaded" });
  await page.locator(".component-workspace").waitFor();
  await assertCurrent(page, `/components/${demo.slug}`);
  checks++;

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/components", `/components/${demo.slug}`]) {
      await openPage(page, route);
      await assertRegistryLinks(page, items);
      await assertCurrent(page, route);
      await assertLayout(page, `${width}px ${route}`);
      if (width <= 900) await assertMobileControls(page);
      else {
        assert.equal(
          await page.getByRole("button", { name: "Component list", exact: true }).isVisible(),
          false,
        );
        assert.equal(
          await page.getByRole("navigation", { name: "Component navigation" }).isVisible(),
          true,
        );
        checks++;
      }
      if (route !== "/components") {
        const preview = page.getByRole("tab", { name: "Preview", exact: true });
        assert.equal(await preview.getAttribute("aria-selected"), "true");
        assert.equal(
          await page.getByRole("button", { name: "Copy source", exact: true }).isVisible(),
          true,
        );
        await page.getByRole("tab", { name: "Code", exact: true }).click();
        await page.locator(".code-panel pre").waitFor();
        await assertLayout(page, `${width}px source view`);
        await preview.click();
        await page.locator(".component-preview").waitFor();
        checks++;
      }
    }
    if ([320, 900, 1280, 1920].includes(width))
      await page.screenshot({ path: join(outputDir, `detail-${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, "/components");
  await page.getByRole("button", { name: "Component list", exact: true }).click();
  await page.locator(`.component-browser-link[href='/components/${demo.slug}']`).click();
  await page.locator(".component-workspace").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Component list", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await assertCurrent(page, `/components/${demo.slug}`);
  await page.getByRole("button", { name: "Component list", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator(".component-browser-link[aria-current='page']").focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Component navigation", includeHidden: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Component list", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Component list", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
    "collapsing navigation during resize returns focus to its toggle",
  );
  checks++;
  checks++;

  const synthetic = await newContext();
  const longIndex = {
    ...registry,
    items: [
      ...registry.items,
      ...Array.from({ length: 90 }, (_, number) => ({
        ...items[number % items.length],
        slug: `sidebar-example-${number + 1}`,
        title: `Sidebar example ${number + 1}`,
      })),
    ],
  };
  await synthetic.route("**/r/index.json", (route) => route.fulfill({ json: longIndex }));
  const longPage = await synthetic.newPage();
  longPage.on("pageerror", (error) => errors.push(error.message));
  await longPage.setViewportSize({ width: 1280, height: 800 });
  await openPage(longPage, "/components");
  await assertRegistryLinks(longPage, activeComponents(longIndex));
  // Activate the sticky position after the catalog heading scrolls past the header.
  await longPage.evaluate(() => window.scrollTo(0, 500));
  await longPage.waitForFunction(() => window.scrollY >= 499);
  const longNav = longPage.getByRole("navigation", { name: "Component navigation" });
  const scrollMetrics = await longNav.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    overflow: getComputedStyle(element).overflowY,
    overscroll: getComputedStyle(element).overscrollBehaviorY,
    bottom: element.getBoundingClientRect().bottom,
    viewport: innerHeight,
  }));
  assert(
    scrollMetrics.scrollHeight > scrollMetrics.clientHeight,
    "long registry uses local navigation scrolling",
  );
  assert(["auto", "scroll"].includes(scrollMetrics.overflow));
  assert.equal(scrollMetrics.overscroll, "contain", "navigation scroll stays inside the panel");
  assert(scrollMetrics.bottom <= scrollMetrics.viewport + 1, "desktop panel fits below the header");
  const pageScrollBefore = await longPage.evaluate(() => window.scrollY);
  await longNav.locator(".component-browser-link").last().scrollIntoViewIfNeeded();
  assert(await longNav.evaluate((element) => element.scrollTop > 0));
  assert.equal(
    await longPage.evaluate(() => window.scrollY),
    pageScrollBefore,
    "browsing the list does not scroll the page",
  );
  const sticky = await longPage.locator(".component-browser").evaluate((element) => ({
    position: getComputedStyle(element).position,
    top: element.getBoundingClientRect().top,
    headerBottom: document.querySelector(".site-header").getBoundingClientRect().bottom,
  }));
  assert.equal(sticky.position, "sticky");
  assert(sticky.top >= sticky.headerBottom - 1, "sticky sidebar stays clear of the header");
  checks++;
  await longPage.screenshot({ path: join(outputDir, "desktop-long-list.png"), fullPage: false });

  await longPage.setViewportSize({ width: 1024, height: 375 });
  await openPage(longPage, "/components");
  await longPage.evaluate(() => window.scrollTo(0, 500));
  await longPage.waitForFunction(() => window.scrollY >= 499);
  const shortDesktop = await longNav.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    top: element.getBoundingClientRect().top,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    viewport: innerHeight,
  }));
  assert(shortDesktop.clientHeight > 0, "short desktop retains a usable list");
  assert(
    shortDesktop.scrollHeight > shortDesktop.clientHeight,
    "short desktop list scrolls locally",
  );
  assert(
    shortDesktop.top >= 0 && shortDesktop.bottom <= shortDesktop.viewport + 1,
    "short desktop list stays inside the viewport",
  );
  await assertLayout(longPage, "1024px short desktop with long list");
  checks++;

  await longPage.setViewportSize({ width: 667, height: 375 });
  await openPage(longPage, "/components");
  await longPage.getByRole("button", { name: "Component list", exact: true }).click();
  const landscapeNav = longPage.getByRole("navigation", { name: "Component navigation" });
  await landscapeNav.scrollIntoViewIfNeeded();
  const landscape = await landscapeNav.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    overflow: getComputedStyle(element).overflowY,
  }));
  assert(landscape.height <= 375, "short landscape list remains smaller than the viewport");
  assert(landscape.scrollHeight > landscape.clientHeight, "landscape list scrolls locally");
  assert(["auto", "scroll"].includes(landscape.overflow));
  await landscapeNav.locator(".component-browser-link").last().scrollIntoViewIfNeeded();
  assert(await landscapeNav.evaluate((element) => element.scrollTop > 0));
  await assertLayout(longPage, "667px short landscape with long list");
  await longPage.screenshot({ path: join(outputDir, "mobile-long-list.png"), fullPage: false });
  checks++;

  const loadingContext = await newContext();
  let releaseIndex;
  const heldIndex = new Promise((resolve) => {
    releaseIndex = resolve;
  });
  await loadingContext.route("**/r/index.json", async (route) => {
    await heldIndex;
    await route.fulfill({ json: registry });
  });
  const loadingPage = await loadingContext.newPage();
  loadingPage.on("pageerror", (error) => errors.push(error.message));
  await loadingPage.setViewportSize({ width: 1280, height: 800 });
  try {
    await loadingPage.goto(new URL("/components", baseUrl).href, { waitUntil: "domcontentloaded" });
    await loadingPage.locator(".component-browser-loading").waitFor();
    assert.equal(
      await loadingPage.getByRole("searchbox", { name: "Search components" }).isVisible(),
      true,
    );
    assert.equal(
      await loadingPage.locator(".component-browser-link").count(),
      1,
      "overview remains available while the list is loading",
    );
    await assertLayout(loadingPage, "sidebar loading state");
  } finally {
    releaseIndex();
  }
  await loadingPage.locator(".catalog-grid .component-card").first().waitFor();
  await assertRegistryLinks(loadingPage, items);
  checks++;

  const retryContext = await newContext();
  let indexAttempts = 0;
  await retryContext.route("**/r/index.json", (route) => {
    indexAttempts++;
    return indexAttempts === 1
      ? route.fulfill({ status: 503, contentType: "text/plain", body: "Registry unavailable" })
      : route.fulfill({ json: registry });
  });
  const retryPage = await retryContext.newPage();
  retryPage.on("pageerror", (error) => errors.push(error.message));
  await retryPage.setViewportSize({ width: 1280, height: 800 });
  await retryPage.goto(new URL("/components", baseUrl).href, { waitUntil: "domcontentloaded" });
  await retryPage
    .locator(".component-browser-message")
    .getByText("Component list unavailable.", { exact: true })
    .waitFor();
  await assertLayout(retryPage, "sidebar registry error state");
  await retryPage
    .locator(".component-browser-message")
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await retryPage.locator(".catalog-grid .component-card").first().waitFor();
  await assertRegistryLinks(retryPage, items);
  assert.equal(indexAttempts, 2, "sidebar retry recovers from the failed registry request");
  checks++;
  assert.deepEqual(errors, [], "component browser introduces no runtime errors");
  checks++;
  process.stdout.write(
    `Component sidebar: ${checks} browser checks passed at ${baseUrl}.\nScreenshots: ${outputDir}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}

/* global AbortSignal, document, fetch, getComputedStyle, innerHeight, navigator */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
// The registry builder is already a web dev dependency and owns the browser runner.
const { chromium } = createRequire(require.resolve("@framebits/builder"))("playwright");
const webRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(webRoot, "test-results", "responsive");
const viewports = [
  [320, 720],
  [360, 800],
  [390, 844],
  [540, 720],
  [600, 800],
  [768, 1024],
  [820, 1180],
  [900, 900],
  [901, 900],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];
const routes = [
  "/",
  "/components",
  "/docs",
  "/components/aurora-text",
  "/components/shimmer-button",
  "/components/framebits-logo-3d",
  "/missing-page",
];
let server;
let browser;
let serverOutput = "";
let checks = 0;

function sourceHash(content) {
  // Windows clipboard text uses CRLF even when the registry payload uses LF.
  return createHash("sha256").update(content.replace(/\r\n/g, "\n")).digest("hex");
}

async function startServer() {
  if (process.env.RESPONSIVE_BASE_URL) return process.env.RESPONSIVE_BASE_URL;
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const vite = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
  server = spawn(
    process.execPath,
    [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: webRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.on("error", (error) => {
    serverOutput += error.message;
  });
  server.stdout.on("data", (data) => {
    serverOutput = (serverOutput + data).slice(-4000);
  });
  server.stderr.on("data", (data) => {
    serverOutput = (serverOutput + data).slice(-4000);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview server stopped: ${serverOutput}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return baseUrl;
    } catch {
      /* Wait for Vite to bind the local port. */
    }
    await delay(200);
  }
  throw new Error(`Preview server did not start: ${serverOutput}`);
}

async function openPage(page, baseUrl, route) {
  await page.goto(new URL(route, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor();
  if (route === "/components") await page.locator(".component-card").first().waitFor();
  if (route.startsWith("/components/")) await page.locator(".component-workspace").waitFor();
  if (route === "/components/aurora-text") await page.locator(".preview-live > span").waitFor();
  if (route === "/components/shimmer-button")
    await page.locator(".preview-live button").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function assertLayout(page, label) {
  const issues = await page.evaluate(() => {
    const problems = [];
    const viewport = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > viewport + 1)
      problems.push("page scrolls horizontally");
    const selectors = [
      ".header-inner",
      ".hero-copy",
      "h1",
      ".hero-title-line",
      ".detail-copy",
      ".copy-command",
      ".destination-card",
      ".footer-navigation",
      ".docs-step",
      ".component-card",
      ".detail-layout",
      ".preview-live",
      ".component-workspace",
      ".workspace-toolbar",
      ".dependency-list",
      ".state-panel",
    ];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.left < -1 || rect.right > viewport + 1)
          problems.push(`${selector} leaves the viewport`);
        if (element.scrollWidth > element.clientWidth + 2)
          problems.push(`${selector} clips content`);
      }
    }
    const brand = document.querySelector(".site-header .brand").getBoundingClientRect();
    const actions = document.querySelector(".header-actions").getBoundingClientRect();
    if (brand.right > actions.left) problems.push("header controls overlap the brand");
    const mainNav = document.querySelector(".main-nav");
    if (getComputedStyle(mainNav).display !== "none" && viewport > 900) {
      const nav = mainNav.getBoundingClientRect();
      if (brand.right > nav.left || nav.right > actions.left)
        problems.push("desktop navigation overlaps");
    }
    return problems;
  });
  assert.deepEqual(issues, [], `${label}: ${issues.join(", ")}`);
  checks++;
}

async function assertMenu(page, baseUrl, width) {
  await openPage(page, baseUrl, "/");
  const toggle = page.getByRole("button", { name: "Open navigation" });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await toggle.click();
  assert.equal(await nav.isVisible(), true);
  assert.equal(
    await nav
      .getByRole("link", { name: "Home", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await nav.isVisible(), false);
  assert.equal(await toggle.evaluate((el) => el === document.activeElement), true);
  await toggle.click();
  await page.locator(".hero-lede").click();
  assert.equal(await nav.isVisible(), false);
  await toggle.click();
  await nav.getByRole("link", { name: "Docs", exact: true }).click();
  await page.locator(".docs-page").waitFor();
  assert.equal(await nav.isVisible(), false);
  await toggle.click();
  const rect = await nav.boundingBox();
  assert(rect.x >= 0 && rect.x + rect.width <= width + 1, "open navigation must fit the viewport");
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.equal(await page.locator(".menu-button").getAttribute("aria-expanded"), "false");
  await page.setViewportSize({ width, height: 800 });
  assert.equal(await nav.isVisible(), false, "resizing must reset the collapsed menu");
  checks++;
}

try {
  const baseUrl = await startServer();
  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.RESPONSIVE_BROWSER_CHANNEL
      ? { channel: process.env.RESPONSIVE_BROWSER_CHANNEL }
      : {}),
  });
  const context = await browser.newContext({
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // Keep the public repository request deterministic and independent of network access.
  await context.route("https://api.github.com/**", (route) =>
    route.fulfill({ json: { full_name: "otassh/framebits", stargazers_count: 12345 } }),
  );
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await openPage(page, baseUrl, route);
      await assertLayout(page, `${width}px ${route}`);
      if (route.startsWith("/components/")) {
        const preview = page.getByRole("tab", { name: "Preview", exact: true });
        const code = page.getByRole("tab", { name: "Code", exact: true });
        const workspace = await page.locator(".component-workspace").boundingBox();
        const stage = await page.locator(".component-preview").boundingBox();
        assert.equal(await preview.getAttribute("aria-selected"), "true");
        assert.equal(
          await page.locator(".code-panel").count(),
          0,
          "source is hidden on first load",
        );
        assert(
          stage.height >= 360 && Math.abs(stage.width - workspace.width) < 3,
          "preview occupies the full large workspace",
        );
        assert.equal(
          await page.getByRole("button", { name: "Copy source", exact: true }).isVisible(),
          true,
        );
        await code.click();
        await page.locator(".code-panel pre").waitFor();
        assert.equal(await page.locator(".preview-live").count(), 0, "hidden demos stop rendering");
        await assertLayout(page, `${width}px ${route} source view`);
        await preview.click();
        if (route === "/components/aurora-text")
          await page.locator(".preview-live > span").waitFor();
        if (route === "/components/shimmer-button")
          await page.locator(".preview-live button").first().waitFor();
      }
      if (route === "/" && width <= 600) {
        const actions = await page.locator(".hero-actions").boundingBox();
        for (const button of await page.locator(".hero-actions .button").all()) {
          assert(
            Math.abs((await button.boundingBox()).width - actions.width) < 2,
            "mobile calls to action use the full width",
          );
        }
      }
      if (
        [320, 820, 1440].includes(width) &&
        ["/", "/components", "/docs", "/components/aurora-text"].includes(route)
      ) {
        await page.screenshot({
          path: join(outputDir, `${width}-${route.replaceAll("/", "_")}.png`),
          fullPage: true,
        });
      }
    }
    process.stdout.write(`Checked ${width} × ${height}: ${routes.length} pages\n`);
  }

  for (const width of [320, 820, 900]) {
    await page.setViewportSize({ width, height: 800 });
    await assertMenu(page, baseUrl, width);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, baseUrl, "/components");
  const search = page.getByRole("searchbox", { name: "Search components" });
  await search.fill("aurora");
  await page.waitForFunction(() => document.querySelectorAll(".component-card").length === 1);
  await search.fill("no-such-component");
  await page.getByRole("heading", { name: "No matching components" }).waitFor();
  await assertLayout(page, "mobile empty search");
  await page.getByRole("button", { name: "Reset filters" }).click();
  assert.equal(await search.inputValue(), "");
  await page.getByRole("button", { name: "Text Animations" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".component-card").length === 1);
  await openPage(page, baseUrl, "/components/shimmer-button");
  const demoButton = page.locator(".preview-live button").first();
  const demoStyles = await demoButton.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      radius: style.borderRadius,
      padding: style.paddingLeft,
      animation: style.animationName,
    };
  });
  assert.notEqual(demoStyles.radius, "0px", "live demo Tailwind utilities must load");
  assert.notEqual(demoStyles.padding, "0px", "live demo button spacing must load");
  await openPage(page, baseUrl, "/components/aurora-text");
  const textStyle = await page
    .locator(".preview-live > span")
    .evaluate((el) => getComputedStyle(el).backgroundClip);
  assert.equal(textStyle, "text", "live gradient demo must apply its text clipping utility");
  await openPage(page, baseUrl, "/components/shimmer-button");
  const source = await page.evaluate(async () => {
    const response = await fetch("/r/shimmer-button.json");
    return (await response.json()).files[0].content;
  });
  await page.getByRole("button", { name: "Copy source", exact: true }).click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert.equal(
    sourceHash(await page.evaluate(() => navigator.clipboard.readText())),
    sourceHash(source),
    "copy from Preview returns source code",
  );
  const viewTabs = page.getByRole("tablist", { name: "Component view" });
  await viewTabs.getByRole("tab", { name: "Preview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.locator(".code-panel pre").waitFor();
  assert.equal(
    await viewTabs
      .getByRole("tab", { name: "Code", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  const fileTabs = page.getByRole("tablist", { name: "Component files" });
  const activeTab = fileTabs.getByRole("tab", { selected: true });
  await activeTab.focus();
  await page.keyboard.press("End");
  assert.equal(await fileTabs.getByRole("tab").last().getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");
  assert.equal(await fileTabs.getByRole("tab").first().getAttribute("aria-selected"), "true");
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await fileTabs
      .getByRole("tab", { selected: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Copy source", exact: true }).click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert.equal(
    sourceHash(await page.evaluate(() => navigator.clipboard.readText())),
    sourceHash(source),
    "copy from Code returns source code",
  );
  checks++;

  await openPage(page, baseUrl, "/docs");
  const table = page.getByRole("region", { name: "CLI options table" });
  await table.focus();
  const scrollable = await table.evaluate((el) => el.scrollWidth > el.clientWidth);
  assert.equal(scrollable, true, "mobile table scrolls inside its region");
  await page.getByRole("link", { name: "CLI options", exact: true }).click();
  await page.waitForFunction(() => {
    const section = document.getElementById("cli-options").getBoundingClientRect();
    const header = document.querySelector(".site-header").getBoundingClientRect();
    return section.top >= header.bottom && section.top < innerHeight;
  });
  checks++;

  await page.route("**/r/index.json", (route) => route.abort());
  await page.goto(new URL("/components", baseUrl).href);
  await page.getByRole("button", { name: "Try again" }).waitFor();
  await assertLayout(page, "mobile registry error");
  await page.unroute("**/r/index.json");

  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  await touchContext.route("https://api.github.com/**", (route) =>
    route.fulfill({
      json: { full_name: "otassh/framebits", stargazers_count: 12345 },
    }),
  );
  const touchPage = await touchContext.newPage();
  touchPage.on("pageerror", (error) => pageErrors.push(error.message));
  await openPage(touchPage, baseUrl, "/");
  await touchPage.locator(".hero-copy").evaluate(async (el) => {
    await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
  await assertLayout(touchPage, "touch device with animations enabled");
  await touchPage.getByRole("button", { name: "Open navigation" }).tap();
  await touchPage
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Components", exact: true })
    .tap();
  await touchPage.locator(".component-card").first().waitFor();
  assert.equal(
    await touchPage.getByRole("navigation", { name: "Main navigation" }).isVisible(),
    false,
  );
  assert.equal(
    await touchPage.getByRole("searchbox").evaluate((el) => getComputedStyle(el).fontSize),
    "16px",
  );
  await openPage(touchPage, baseUrl, "/components/shimmer-button");
  assert.notEqual(
    await touchPage
      .locator(".preview-live button")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
    "default preview animates",
  );
  await touchPage.getByRole("tab", { name: "Code", exact: true }).tap();
  await touchPage.locator(".code-panel pre").waitFor();
  await touchPage.getByRole("tab", { name: "Preview", exact: true }).tap();
  await touchPage.locator(".preview-live button").first().waitFor();
  await touchContext.close();
  checks++;

  // Short landscape screens must still allow access to every dropdown item.
  await page.setViewportSize({ width: 667, height: 375 });
  await openPage(page, baseUrl, "/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Docs", exact: true }).scrollIntoViewIfNeeded();
  const menuRect = await nav.boundingBox();
  assert(menuRect.y + menuRect.height <= 375, "landscape menu fits the screen height");
  checks++;

  assert.deepEqual(pageErrors, [], "pages must not produce uncaught browser errors");
  process.stdout.write(
    `Passed ${checks} responsive and interaction checks. Screenshots: ${outputDir}\n`,
  );
} catch (error) {
  if (serverOutput) process.stderr.write(serverOutput);
  throw error;
} finally {
  await browser?.close();
  server?.kill();
}

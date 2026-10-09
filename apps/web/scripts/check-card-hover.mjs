/* global document, getComputedStyle, window, Event */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = createRequire(require.resolve("@framebits/builder"))("playwright");
const baseUrl = process.env.CARD_BASE_URL ?? "http://localhost:8080";
const outputDir = join(fileURLToPath(new URL("..", import.meta.url)), "test-results", "cards");
const widths = [320, 390, 820, 901, 1280, 1920];
let checks = 0;
let browser;

function cardFor(page, slug) {
  return page.locator(`.component-card:has(.card-link[href="/components/${slug}"])`);
}

async function openCatalog(page) {
  await page.mouse.move(0, 0);
  await page.goto(new URL("/components", baseUrl).href, { waitUntil: "networkidle" });
  await page.locator(".component-card[data-preview-active]").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function assertInactive(card) {
  await card.locator(".preview-live").waitFor({ state: "detached" });
  assert.equal(await card.getAttribute("data-preview-active"), "false");
  assert.equal(await card.locator(".card-preview .preview-art").isVisible(), true);
  checks++;
}

async function activate(card) {
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await card.locator(".preview-live").waitFor();
  assert.equal(await card.getAttribute("data-preview-active"), "true");
  checks++;
}

async function assertAnimationChanges(page, element, label) {
  await element.waitFor();
  const before = await element.evaluate((node) => getComputedStyle(node).backgroundPosition);
  await page.waitForTimeout(280);
  const after = await element.evaluate((node) => getComputedStyle(node).backgroundPosition);
  assert.notEqual(after, before, `${label} renders a running component animation`);
  checks++;
}

async function assertBounds(page, label) {
  const issues = await page.evaluate(() => {
    const problems = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width + 1) problems.push("horizontal page overflow");
    for (const node of document.querySelectorAll(".component-card, .card-preview, .card-title")) {
      const box = node.getBoundingClientRect();
      if (box.left < -1 || box.right > width + 1)
        problems.push(`${node.className} exceeds viewport`);
      if (node.scrollWidth > node.clientWidth + 2) problems.push(`${node.className} clips content`);
    }
    return problems;
  });
  assert.deepEqual(issues, [], `${label}: ${issues.join(", ")}`);
  checks++;
}

try {
  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.CARD_BROWSER_CHANNEL ?? "chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await context.route("https://api.github.com/**", (route) =>
    route.fulfill({ json: { full_name: "otassh/framebits", stargazers_count: 12345 } }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openCatalog(page);

  const cards = page.locator(".component-card[data-preview-active]");
  assert.equal(await cards.count(), 3, "all published cards are visible");
  assert.equal(await cards.locator(".preview-live").count(), 0, "idle cards use static previews");
  assert.equal(
    await cards.locator(".card-meta, .tag-row, .card-open, p").count(),
    0,
    "cards show the component and name only",
  );
  assert.equal(
    await cards.locator("a button, a input, a select, a a").count(),
    0,
    "card links do not nest interactive controls",
  );
  assert.equal(
    await cards.locator(".card-preview[inert][aria-hidden='true']").count(),
    3,
    "demo controls cannot enter keyboard or accessibility navigation",
  );
  const loadedDemoChunks = await page.evaluate(() =>
    window.performance
      .getEntriesByType("resource")
      .filter((entry) => /\/assets\/demo-[^/]+\.js/.test(entry.name))
      .map((entry) => entry.name),
  );
  assert.deepEqual(loadedDemoChunks, [], "idle catalog does not load component demo chunks");
  checks += 6;
  await page.screenshot({ path: join(outputDir, "desktop-idle.png"), fullPage: true });

  const aurora = cardFor(page, "aurora-text");
  await activate(aurora);
  await assertAnimationChanges(page, aurora.locator(".preview-live > span"), "Aurora Text");
  await aurora.screenshot({ path: join(outputDir, "aurora-active.png") });
  await page.mouse.move(0, 0);
  await assertInactive(aurora);

  const shimmer = cardFor(page, "shimmer-button");
  await activate(shimmer);
  await assertAnimationChanges(
    page,
    shimmer.locator(".preview-live button").first(),
    "Shimmer Button",
  );
  await shimmer.screenshot({ path: join(outputDir, "shimmer-active.png") });
  await page.mouse.move(0, 0);
  await assertInactive(shimmer);

  const logo = cardFor(page, "framebits-logo-3d");
  await activate(logo);
  await logo
    .locator(".preview-live canvas, .preview-live svg, .preview-live img")
    .first()
    .waitFor();
  const canvas = logo.locator("canvas");
  if (await canvas.count()) {
    const dimensions = await canvas.evaluate((node) => ({
      width: node.width,
      height: node.height,
    }));
    assert(dimensions.width > 0 && dimensions.height > 0, "3D preview has a drawable canvas");
    const first = await logo.locator(".card-preview").screenshot();
    await page.waitForTimeout(350);
    const second = await logo.locator(".card-preview").screenshot();
    assert.equal(first.equals(second), false, "3D canvas displays changing animation frames");
    process.stdout.write("3D preview: live WebGL animation verified.\n");
  } else {
    assert.equal(
      await logo.locator(".preview-live svg, .preview-live img").first().isVisible(),
      true,
      "3D preview degrades gracefully when WebGL is unavailable",
    );
    process.stdout.write("3D preview: visible fallback verified (WebGL unavailable).\n");
  }
  checks++;
  await page.mouse.move(0, 0);
  await assertInactive(logo);

  await aurora.scrollIntoViewIfNeeded();
  await page.keyboard.press("Tab");
  await aurora.locator(".card-link").focus();
  await aurora.locator(".preview-live > span").waitFor();
  await assertAnimationChanges(
    page,
    aurora.locator(".preview-live > span"),
    "Keyboard-focused Aurora Text",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.closest(".card-preview") !== null),
    false,
    "keyboard cannot enter an inert demo",
  );
  await assertInactive(aurora);
  checks++;

  await page.evaluate(() => document.activeElement.blur());
  await activate(aurora);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await assertInactive(aurora);

  // The visibility event is deterministic even in headless Chrome, where every tab stays visible.
  await activate(aurora);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await assertInactive(aurora);
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await assertInactive(aurora);

  const [newTab] = await Promise.all([
    context.waitForEvent("page"),
    aurora.locator(".card-link").click({ modifiers: ["Control"] }),
  ]);
  await newTab.waitForURL("**/components/aurora-text");
  await newTab.close();
  assert.equal(
    new URL(page.url()).pathname,
    "/components",
    "modified clicks preserve the catalog tab",
  );
  checks++;

  for (const target of ["preview", "title", "blank"]) {
    await openCatalog(page);
    const card = cardFor(page, "aurora-text");
    if (target === "preview") {
      await card.scrollIntoViewIfNeeded();
      const box = await card.locator(".card-preview").boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else if (target === "title") await card.locator(".card-link").click();
    else await card.click({ position: { x: 8, y: (await card.boundingBox()).height - 8 } });
    await page.waitForURL("**/components/aurora-text");
    await page.locator(".component-workspace").waitFor();
    checks++;
  }
  await openCatalog(page);
  await cardFor(page, "aurora-text").locator(".card-link").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/components/aurora-text");
  checks++;

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 901 ? 844 : 900 });
    await openCatalog(page);
    await assertBounds(page, `${width}px idle cards`);
    for (const slug of ["aurora-text", "shimmer-button", "framebits-logo-3d"]) {
      const card = cardFor(page, slug);
      const before = await card.boundingBox();
      await activate(card);
      if (slug === "aurora-text") await card.locator(".preview-live > span").waitFor();
      if (slug === "shimmer-button") await card.locator(".preview-live button").first().waitFor();
      if (slug === "framebits-logo-3d")
        await card
          .locator(".preview-live canvas, .preview-live svg, .preview-live img")
          .first()
          .waitFor();
      const after = await card.boundingBox();
      assert(
        Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1,
        `${width}px ${slug}: hover preserves card dimensions`,
      );
      checks++;
      await assertBounds(page, `${width}px ${slug} active`);
      await page.mouse.move(0, 0);
      await assertInactive(card);
    }
    if (width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(outputDir, "mobile-idle.png"), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCatalog(page);
  for (const slug of ["aurora-text", "shimmer-button", "framebits-logo-3d"]) {
    const card = cardFor(page, slug);
    await card.hover();
    await assertInactive(card);
    await page.mouse.move(0, 0);
    await card.locator(".card-link").focus();
    await assertInactive(card);
    await page.evaluate(() => document.activeElement.blur());
  }

  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
  });
  await touchContext.route("https://api.github.com/**", (route) =>
    route.fulfill({ json: { full_name: "otassh/framebits", stargazers_count: 12345 } }),
  );
  const touchPage = await touchContext.newPage();
  await openCatalog(touchPage);
  const touchCard = cardFor(touchPage, "shimmer-button");
  await touchCard.scrollIntoViewIfNeeded();
  await assertInactive(touchCard);
  const touchBox = await touchCard.locator(".card-preview").boundingBox();
  await touchPage.touchscreen.tap(
    touchBox.x + touchBox.width / 2,
    touchBox.y + touchBox.height / 2,
  );
  await touchPage.waitForURL("**/components/shimmer-button");
  checks++;
  await touchContext.close();

  assert.deepEqual(pageErrors, [], "component cards do not raise uncaught browser errors");
  checks++;
  process.stdout.write(
    `Component cards: ${checks} browser checks passed at ${baseUrl}.\nScreenshots: ${outputDir}\n`,
  );
} finally {
  await browser?.close();
}

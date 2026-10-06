import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("brand assets", () => {
  it("ships the real logo mark, round tab icon, and apple touch icon", () => {
    for (const file of [
      "framebits-mark.png",
      "framebits-icon-round.png",
      "framebits-apple-touch.png",
    ]) {
      const path = join(root, "src", "assets", file);
      expect(existsSync(path), `${file} exists`).toBe(true);
      expect(statSync(path).size, `${file} is non-empty`).toBeGreaterThan(1024);
    }
  });

  it("links the tab icon and apple touch icon from index.html", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    expect(html).toContain('rel="icon"');
    expect(html).toContain("framebits-icon-round.png");
    expect(html).toContain("apple-touch-icon");
    expect(html).toContain("framebits-apple-touch.png");
  });

  it("renders the real mark in the Brand component", () => {
    const source = readFileSync(join(root, "src", "app.tsx"), "utf8");
    expect(source).toContain("framebits-mark.png");
    expect(source).toContain("<img src={brandMarkUrl}");
  });
});

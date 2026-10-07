import { describe, expect, it } from "vitest";
import { computePatched } from "./patch.js";
import { validateCssValue, validateStyles } from "./validate.js";

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code: unknown = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

describe("styles hardening", () => {
  it("computePatched throws on malformed markers instead of appending", () => {
    try {
      computePatched({
        current: "/* framebits:begin x */\nno end\n",
        slug: "y",
        blockInner: "body",
        overwrite: false,
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error instanceof Error ? error.message : error)).toContain("malformed");
    }
  });

  it.each([
    ["url with space", "url (x.png)"],
    ["URL upper with space", "URL (x)"],
    ["expression with space", "expression (alert(1))"],
    ["webkit image-set", "-webkit-image-set(a)"],
    ["image-set with space", "image-set (a)"],
    ["data url", "data:image/svg+xml;base64,AAA"],
    ["data with space", "data :text/plain,hi"],
  ])("blocks %s (exit 4)", (_label, value) => {
    try {
      validateCssValue("s", "test", value);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("enforces total declarations via plan (500 per CSS)", () => {
    // Per-item cap is 50; 11 items x 50 = 550 > 500 total.
    const decls: Record<string, string> = {};
    for (let i = 0; i < 50; i++) decls[`prop-${String(i)}`] = "0";
    const validated = validateStyles("s", { keyframes: { k: { from: decls } } }, undefined);
    expect(validated.declarationCount).toBe(50);
  });
});

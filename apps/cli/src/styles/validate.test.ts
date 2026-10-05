import { describe, expect, it } from "vitest";
import {
  normalizeCssVarName,
  validateCssValue,
  validateKeyframeSelector,
  validatePropertyName,
  validateStyleName,
  validateStyles,
} from "./validate.js";

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

describe("validateStyleName", () => {
  it.each([["shimmer"], ["fade-in-2"], ["a"]])("accepts %s", (name) => {
    expect(() => { validateStyleName("slug", "keyframe", name); }).not.toThrow();
  });

  it.each([
    ["empty", ""],
    ["uppercase", "Shimmer"],
    ["leading digit", "2fast"],
    ["underscore", "my_anim"],
    ["dot", "a.b"],
    ["space", "a b"],
    ["at", "@media"],
  ])("rejects %s (exit 4)", (_label, name) => {
    try {
      validateStyleName("slug", "keyframe", name);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });
});

describe("normalizeCssVarName", () => {
  it("keeps -- prefix or adds it", () => {
    expect(normalizeCssVarName("s", "--color-x")).toBe("--color-x");
    expect(normalizeCssVarName("s", "color-x")).toBe("--color-x");
  });

  it.each([[""], ["--"], ["--Bad"], ["--a b"]])("rejects %s (exit 4)", (key) => {
    try {
      normalizeCssVarName("s", key);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });
});

describe("validateKeyframeSelector", () => {
  it.each([["from"], ["to"], ["0%"], ["100%"], ["12.5%"], ["0%, 100%"], ["from, 50%, to"]])(
    "accepts %s",
    (selector) => {
      expect(() => { validateKeyframeSelector("s", "k", selector); }).not.toThrow();
    },
  );

  it.each([
    ["middle", "middle"],
    ["over 100", "101%"],
    ["negative", "-5%"],
    ["double percent", "50%%"],
    ["empty part", "from,,to"],
    ["at-rule", "@media"],
  ])("rejects %s (exit 4)", (_label, selector) => {
    try {
      validateKeyframeSelector("s", "k", selector);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });
});

describe("validatePropertyName", () => {
  it.each([["background-position"], ["opacity"], ["--custom"], ["-webkit-x"]])(
    "accepts %s",
    (property) => {
      expect(() => { validatePropertyName("s", property); }).not.toThrow();
    },
  );

  it.each([["empty", ""], ["digit", "2x"], ["space", "a b"], ["colon", "a:b"], ["triple dash", "---x"], ["uppercase first", "MozX"]])(
    "rejects %s (exit 4)",
    (_label, property) => {
      try {
        validatePropertyName("s", property);
        expect.unreachable();
      } catch (error) {
        expect(exitCodeOf(error)).toBe(4);
      }
    },
  );
});

describe("validateCssValue", () => {
  it.each([["shimmer 2s linear infinite"], ["200% 0"], ["0"], ["var(--x)"], ["#fff"]])(
    "accepts %s",
    (value) => {
      expect(() => { validateCssValue("s", "test", value); }).not.toThrow();
    },
  );

  it.each([
    ["braces", "a{b}"],
    ["semicolon", "a;b"],
    ["backslash", "a\\b"],
    ["comment open", "a/*b"],
    ["comment close", "a*/b"],
    ["at-rule", "@import x"],
    ["angle", "a<b"],
    ["url()", "url(x.png)"],
    ["URL upper", "URL(x)"],
    ["expression", "expression(alert(1))"],
    ["image-set", "image-set(a)"],
    ["javascript uri", "javascript:alert(1)"],
    ["newline", "a\nb"],
    ["control char", "ab"],
    ["too long", "x".repeat(201)],
  ])("rejects %s (exit 4)", (_label, value) => {
    try {
      validateCssValue("s", "test", value);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });
});

describe("validateStyles", () => {
  it("accepts the real shimmer-button shapes", () => {
    const validated = validateStyles(
      "shimmer-button",
      {
        keyframes: { shimmer: { from: { "background-position": "200% 0" }, to: { "background-position": "-200% 0" } } },
        animation: { shimmer: "shimmer 2s linear infinite" },
      },
      undefined,
    );
    expect(validated.keyframes.map((frame) => frame.name)).toEqual(["shimmer"]);
    expect(validated.animations).toEqual([{ name: "shimmer", value: "shimmer 2s linear infinite" }]);
  });

  it("accepts numbers and normalizes var prefixes", () => {
    const validated = validateStyles(
      "s",
      undefined,
      { light: { brand: 0, "--accent": "#fff" }, dark: { brand: "#000" } },
    );
    expect(validated.varsLight).toContainEqual({ name: "--brand", value: "0" });
    expect(validated.varsLight).toContainEqual({ name: "--accent", value: "#fff" });
  });

  it("rejects non-object shapes (exit 4)", () => {
    for (const tailwind of [
      { keyframes: "nope" },
      { keyframes: { k: "nope" } },
      { keyframes: { k: { from: 42 } } },
      { animation: { a: { nested: true } } },
    ]) {
      try {
        validateStyles("s", tailwind as never, undefined);
        expect.unreachable();
      } catch (error) {
        expect(exitCodeOf(error)).toBe(4);
      }
    }
  });

  it("enforces the 50-declaration cap (exit 4)", () => {
    const decls: Record<string, string> = {};
    for (let i = 0; i < 51; i++) decls[`prop-${String(i)}`] = "0";
    try {
      validateStyles("s", { keyframes: { k: { from: decls } } }, undefined);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });
});

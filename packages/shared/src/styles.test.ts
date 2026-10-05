import { describe, expect, it } from "vitest";
import { ComponentStylesSchema } from "./registry-item.js";

describe("ComponentStylesSchema", () => {
  it("accepts empty, partial, and full styles", () => {
    expect(ComponentStylesSchema.safeParse({}).success).toBe(true);
    expect(
      ComponentStylesSchema.safeParse({ tailwind: { animation: { fade: "fade 1s" } } }).success,
    ).toBe(true);
    expect(
      ComponentStylesSchema.safeParse({
        tailwind: { keyframes: { fade: { from: { opacity: "0" } } } },
        cssVars: { light: { "--x": "1" }, dark: { "--x": "2" } },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["unknown top-level key", { theme: {} }],
    ["unknown tailwind key", { tailwind: { bogus: {} } }],
    ["unknown cssVars key", { cssVars: { noon: {} } }],
    ["numeric leaf", { tailwind: { keyframes: { k: 1 } } }],
    ["float leaf", { cssVars: { light: { "--x": 0.5 } } }],
  ])("rejects %s", (_rule, value) => {
    expect(ComponentStylesSchema.safeParse(value).success).toBe(false);
  });
});

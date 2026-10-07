import { describe, expect, it } from "vitest";
import { MAX_RENDER_CHARS, truncateForDisplay } from "./code-view.js";

describe("truncateForDisplay", () => {
  it("passes small content through untouched", () => {
    const result = truncateForDisplay("export const x = 1;\n");
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("export const x = 1;\n");
  });

  it("truncates content over 500KB with a CLI notice contract", () => {
    expect(MAX_RENDER_CHARS).toBe(500_000);
    const big = "a".repeat(MAX_RENDER_CHARS + 1);
    const result = truncateForDisplay(big);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(MAX_RENDER_CHARS);
    expect(result.totalChars).toBe(big.length);
  });
});

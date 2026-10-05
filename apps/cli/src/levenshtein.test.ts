import { describe, expect, it } from "vitest";
import { didYouMean, levenshtein, suggestAll } from "./levenshtein.js";

describe("levenshtein", () => {
  it("computes distances", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("a", "")).toBe(1);
    expect(levenshtein("aurora-text", "aurora-text")).toBe(0);
    expect(levenshtein("aurora-text", "aurora-txet")).toBe(2);
    expect(levenshtein("cn", "cm")).toBe(1);
  });

  it("suggests within distance 2", () => {
    expect(didYouMean("aurora-tex", ["aurora-text", "shimmer-button"])).toBe("aurora-text");
    expect(didYouMean("zzz", ["aurora-text"])).toBeUndefined();
  });

  it("suggestAll returns up to 3 closest", () => {
    const result = suggestAll("cn", ["cn", "cm", "co", "zzz"]);
    expect(result).toContain("cn");
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

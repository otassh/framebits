import { describe, expect, it } from "vitest";
import { DOC_NAV } from "./docs.js";

describe("docs outline", () => {
  it("keeps unique section ids in install order", () => {
    const ids = DOC_NAV.map((item) => item.id);
    expect(ids).toEqual(["install", "add", "files", "safety", "cli-options"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

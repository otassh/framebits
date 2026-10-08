import { describe, expect, it } from "vitest";
import { parseRoute } from "./router.js";

describe("parseRoute", () => {
  it("recognizes public frontend routes", () => {
    expect(parseRoute("/")).toEqual({ kind: "home" });
    expect(parseRoute("/components/")).toEqual({ kind: "catalog" });
    expect(parseRoute("/docs/")).toEqual({ kind: "docs" });
    expect(parseRoute("/components/aurora-text")).toEqual({
      kind: "component",
      slug: "aurora-text",
    });
  });

  it("rejects malformed and unknown component routes", () => {
    expect(parseRoute("/components/Aurora")).toEqual({ kind: "not-found" });
    expect(parseRoute("/admin")).toEqual({ kind: "not-found" });
    expect(parseRoute("/docs/unknown")).toEqual({ kind: "not-found" });
  });
});

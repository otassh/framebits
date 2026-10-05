import { describe, expect, it } from "vitest";
import { BUILDER_PACKAGE_NAME } from "./index.js";

describe("builder stub", () => {
  it("exposes a package name", () => {
    expect(BUILDER_PACKAGE_NAME).toBe("@framebits/builder");
  });
});

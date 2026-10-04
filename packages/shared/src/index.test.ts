import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_NAME } from "./index.js";

describe("shared stub", () => {
  it("exposes a package name", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@algorithco-ui/shared");
  });
});

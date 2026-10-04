import { describe, expect, it } from "vitest";
import { API_PACKAGE_NAME } from "./index.js";

describe("api stub", () => {
  it("exposes a package name", () => {
    expect(API_PACKAGE_NAME).toBe("@algorithco-ui/api");
  });
});

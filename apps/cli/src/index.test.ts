import { describe, expect, it } from "vitest";
import { CLI_PACKAGE_NAME } from "./index.js";

describe("cli stub", () => {
  it("exposes a package name", () => {
    expect(CLI_PACKAGE_NAME).toBe("algorithco-ui");
  });
});

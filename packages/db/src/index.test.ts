import { describe, expect, it } from "vitest";
import { DB_PACKAGE_NAME } from "./index.js";

describe("db stub", () => {
  it("exposes a package name", () => {
    expect(DB_PACKAGE_NAME).toBe("@algorithco-ui/db");
  });
});

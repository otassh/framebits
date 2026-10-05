import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTRY_URL,
  PLACEHOLDER_DOMAIN,
  PROJECT_NAME,
  SHARED_PACKAGE_NAME,
} from "./index.js";

describe("shared stub", () => {
  it("exposes a package name", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@algorithco-ui/shared");
  });

  it("defines the domain and default registry URL in one place", () => {
    expect(PLACEHOLDER_DOMAIN).toBe("algorithco.dev");
    expect(DEFAULT_REGISTRY_URL).toBe(`https://${PLACEHOLDER_DOMAIN}/r`);
  });

  it("defines the project name in one place", () => {
    expect(PROJECT_NAME).toBe("Algorithco UI");
  });
});

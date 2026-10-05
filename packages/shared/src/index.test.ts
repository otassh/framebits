import { describe, expect, it } from "vitest";
import {
  CliConfigSchema,
  DEFAULT_REGISTRY_URL,
  EventsRequestSchema,
  MetaSchema,
  PLACEHOLDER_DOMAIN,
  PROJECT_NAME,
  RegistryIndexSchema,
  RegistryItemSchema,
  RegistryLockSchema,
  SHARED_PACKAGE_NAME,
  computeItemHash,
  verifyItemHash,
} from "./index.js";

describe("shared stub", () => {
  it("exposes a package name", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@framebits/shared");
  });

  it("defines the domain and default registry URL in one place", () => {
    expect(PLACEHOLDER_DOMAIN).toBe("framebits.dev");
    expect(DEFAULT_REGISTRY_URL).toBe(`https://${PLACEHOLDER_DOMAIN}/r`);
  });

  it("defines the project name in one place", () => {
    expect(PROJECT_NAME).toBe("Framebits");
  });

  it("exports every contract schema and hash helper by name", () => {
    for (const schema of [
      MetaSchema,
      RegistryItemSchema,
      RegistryIndexSchema,
      CliConfigSchema,
      RegistryLockSchema,
      EventsRequestSchema,
    ]) {
      expect(schema).toBeDefined();
    }
    expect(typeof computeItemHash).toBe("function");
    expect(typeof verifyItemHash).toBe("function");
  });
});

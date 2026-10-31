import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CliConfigSchema,
  CONFIG_SCHEMA_URL,
  DEFAULT_REGISTRY_URL,
  EventsRequestSchema,
  MAX_DEPTH,
  MAX_FILE_CONTENT_BYTES,
  MAX_INSTALLED_ENTRIES,
  MAX_LOCK_COMPONENTS,
  MAX_SEARCH_INDEX_KEYS,
  MAX_SEMVER_LENGTH,
  MetaSchema,
  PAYLOAD_VERSION,
  SITE_DOMAIN,
  SITE_ORIGIN,
  PROJECT_NAME,
  RegistryIndexSchema,
  RegistryItemSchema,
  RegistryLockSchema,
  SHARED_PACKAGE_NAME,
  canonicalizeSemverVersion,
  computeItemHash,
  exceedsContentLimits,
  guardedRecord,
  isPrereleaseSemverRange,
  verifyItemHash,
} from "./index.js";
import type {
  CliConfig,
  InstalledEntry,
  LockEntry,
  Meta,
  PopularQuery,
  RegistryItem,
  RegistryLock,
  SearchIndex,
  SearchIndexDoc,
} from "./index.js";

describe("shared stub", () => {
  it("exposes a package name", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@framebits/shared");
  });

  it("defines the domain and default registry URL in one place", () => {
    expect(SITE_DOMAIN).toBe("framebits.trqsh.uz");
    expect(SITE_ORIGIN).toBe(`https://${SITE_DOMAIN}`);
    expect(DEFAULT_REGISTRY_URL).toBe(`https://${SITE_DOMAIN}/r`);
    expect(CONFIG_SCHEMA_URL).toBe(`${SITE_ORIGIN}/schema/config.json`);
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

  it("exports the hardening helpers and caps (additive surface)", () => {
    expect(PAYLOAD_VERSION).toBe(1);
    expect(MAX_DEPTH).toBe(100);
    expect(MAX_FILE_CONTENT_BYTES).toBe(1_048_576);
    expect(MAX_INSTALLED_ENTRIES).toBe(1000);
    expect(MAX_LOCK_COMPONENTS).toBe(1000);
    expect(MAX_SEARCH_INDEX_KEYS).toBe(5000);
    expect(MAX_SEMVER_LENGTH).toBe(256);
    expect(typeof exceedsContentLimits).toBe("function");
    expect(typeof guardedRecord).toBe("function");
    expect(typeof isPrereleaseSemverRange).toBe("function");
    expect(typeof canonicalizeSemverVersion).toBe("function");
  });

  it("keeps inferred contract types backward-compatible", () => {
    expectTypeOf<Meta["dependencies"]>().toEqualTypeOf<Record<string, string>>();
    expectTypeOf<Meta["registryDependencies"]>().toEqualTypeOf<string[]>();
    expectTypeOf<CliConfig["installed"]>().toEqualTypeOf<Record<string, InstalledEntry>>();
    expectTypeOf<PopularQuery["limit"]>().toEqualTypeOf<number>();
    expectTypeOf<RegistryItem["registryDependencies"]>().toEqualTypeOf<string[]>();
    expectTypeOf<RegistryLock["components"]>().toEqualTypeOf<Record<string, LockEntry>>();
    expectTypeOf<SearchIndex["docs"]>().toEqualTypeOf<Record<string, SearchIndexDoc>>();
  });
});

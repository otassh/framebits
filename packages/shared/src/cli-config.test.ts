import { describe, expect, it } from "vitest";
import { CliConfigSchema, MAX_INSTALLED_ENTRIES } from "./cli-config.js";

export const validConfig = {
  $schema: "https://framebits.dev/schema/config.json",
  schemaVersion: 1,
  registry: "https://framebits.dev/r",
  framework: "next",
  typescript: true,
  tailwind: { version: 3, config: "tailwind.config.ts", css: "src/app/globals.css" },
  aliases: { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
  installed: { "aurora-text": { version: "1.0.0", hash: `sha256:${"c".repeat(64)}` } },
} as const;

describe("CliConfigSchema", () => {
  it("accepts the master-prompt example and defaults installed", () => {
    expect(CliConfigSchema.safeParse({ ...validConfig }).success).toBe(true);
    const withoutInstalled: Record<string, unknown> = { ...validConfig };
    delete withoutInstalled["installed"];
    expect(CliConfigSchema.parse(withoutInstalled).installed).toEqual({});
  });

  it("accepts localhost registries for development", () => {
    for (const registry of [
      "http://localhost:3000/r",
      "http://127.0.0.1:8080/r",
      "http://[::1]:3000/r",
      "http://localhost/r",
    ]) {
      expect(CliConfigSchema.safeParse({ ...validConfig, registry }).success).toBe(true);
    }
  });

  it("rejects credentialed and off-host registry URLs", () => {
    for (const registry of [
      "https://user:pass@framebits.dev/r",
      "https://user@framebits.dev/r",
      "http://user:pass@localhost:3000/r",
      "http://localhost.evil.com/r",
      "http://evil-localhost/r",
      "http://192.168.1.10/r",
      "http://[::2]/r",
      "ftp://framebits.dev/r",
    ]) {
      expect(CliConfigSchema.safeParse({ ...validConfig, registry }).success).toBe(false);
    }
  });

  it("constrains aliases and tailwind paths to relative paths", () => {
    for (const aliases of [
      { components: "/abs/components", lib: "@/lib", hooks: "@/hooks" },
      { components: "../shared", lib: "@/lib", hooks: "@/hooks" },
      { components: "C:/x", lib: "@/lib", hooks: "@/hooks" },
    ]) {
      expect(CliConfigSchema.safeParse({ ...validConfig, aliases }).success).toBe(false);
    }
    expect(
      CliConfigSchema.safeParse({
        ...validConfig,
        tailwind: { version: 3, config: "/abs/tailwind.config.ts" },
      }).success,
    ).toBe(false);
    expect(
      CliConfigSchema.safeParse({
        ...validConfig,
        tailwind: { version: 4, css: "..\\evil.css" },
      }).success,
    ).toBe(false);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects installed key %s",
    (key) => {
      const installed = JSON.parse(
        `{"${key}": {"version": "1.0.0", "hash": "sha256:${"c".repeat(64)}"}}`,
      ) as Record<string, unknown>;
      expect(CliConfigSchema.safeParse({ ...validConfig, installed }).success).toBe(false);
    },
  );

  it(`rejects more than ${String(MAX_INSTALLED_ENTRIES)} installed entries`, () => {
    const installed: Record<string, { version: string; hash: string }> = {};
    for (let n = 0; n < MAX_INSTALLED_ENTRIES + 1; n++) {
      installed[`pkg-${String(n)}`] = { version: "1.0.0", hash: `sha256:${"c".repeat(64)}` };
    }
    expect(CliConfigSchema.safeParse({ ...validConfig, installed }).success).toBe(false);
  });

  it("accepts an optional timeoutSeconds in seconds (1-300)", () => {
    expect(
      CliConfigSchema.safeParse({ ...validConfig, timeoutSeconds: 10 }).success,
    ).toBe(true);
    expect(CliConfigSchema.safeParse({ ...validConfig, timeoutSeconds: 1 }).success).toBe(
      true,
    );
    expect(
      CliConfigSchema.safeParse({ ...validConfig, timeoutSeconds: 300 }).success,
    ).toBe(true);
    // Absent entirely: still valid (CLI default applies).
    expect(CliConfigSchema.safeParse({ ...validConfig }).success).toBe(true);
  });

  it.each([
    ["below 1s", { timeoutSeconds: 0 }],
    ["above 300s", { timeoutSeconds: 301 }],
    ["non-integer", { timeoutSeconds: 1.5 }],
    ["wrong type", { timeoutSeconds: "30" }],
  ])("rejects timeoutSeconds %s", (_rule, override) => {
    expect(CliConfigSchema.safeParse({ ...validConfig, ...override }).success).toBe(
      false,
    );
  });

  it.each([
    ["http registry", { registry: "http://example.com/r" }],
    ["not a url", { registry: "not-a-url" }],
    ["bad framework", { framework: "angular" }],
    ["bad tailwind version", { tailwind: { version: 2 } }],
    ["empty alias", { aliases: { components: "", lib: "@/lib", hooks: "@/hooks" } }],
    ["bad installed hash", { installed: { x: { version: "1.0.0", hash: "bad" } } }],
    ["unknown key", { extra: 1 }],
  ])("rejects %s", (_rule, override) => {
    expect(CliConfigSchema.safeParse({ ...validConfig, ...override }).success).toBe(false);
  });
});

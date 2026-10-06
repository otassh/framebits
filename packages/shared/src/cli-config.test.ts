import { describe, expect, it } from "vitest";
import { CliConfigSchema } from "./cli-config.js";

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
    for (const registry of ["http://localhost:3000/r", "http://127.0.0.1:8080/r"]) {
      expect(CliConfigSchema.safeParse({ ...validConfig, registry }).success).toBe(true);
    }
  });

  it("accepts an optional timeoutMs in milliseconds (1-300s)", () => {
    expect(
      CliConfigSchema.safeParse({ ...validConfig, timeoutMs: 10000 }).success,
    ).toBe(true);
    expect(CliConfigSchema.safeParse({ ...validConfig, timeoutMs: 1000 }).success).toBe(
      true,
    );
    expect(
      CliConfigSchema.safeParse({ ...validConfig, timeoutMs: 300000 }).success,
    ).toBe(true);
    // Absent entirely: still valid (CLI default applies).
    expect(CliConfigSchema.safeParse({ ...validConfig }).success).toBe(true);
  });

  it.each([
    ["below 1s", { timeoutMs: 999 }],
    ["above 300s", { timeoutMs: 300001 }],
    ["non-integer", { timeoutMs: 1500.5 }],
    ["wrong type", { timeoutMs: "30" }],
  ])("rejects timeoutMs %s", (_rule, override) => {
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

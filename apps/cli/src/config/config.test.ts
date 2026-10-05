import { describe, expect, it } from "vitest";
import { mergeInitConfig, parseConfig, serializeConfig } from "./index.js";

const validConfig = {
  $schema: "https://algorithco.dev/schema/config.json",
  schemaVersion: 1,
  registry: "https://algorithco.dev/r",
  framework: "next",
  typescript: true,
  tailwind: { version: 3, config: "tailwind.config.ts", css: "src/app/globals.css" },
  aliases: { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
  installed: { "aurora-text": { version: "1.0.0", hash: `sha256:${"c".repeat(64)}` } },
} as const;

describe("config", () => {
  it("parses valid configs and rejects invalid ones", () => {
    expect(parseConfig(JSON.stringify(validConfig), "f").registry).toBe(validConfig.registry);
    try {
      parseConfig(JSON.stringify({ ...validConfig, registry: "http://example.com/r" }), "f");
      expect.unreachable();
    } catch (error) {
      expect((error as { exitCode?: number }).exitCode).toBe(2);
    }
  });

  it("serializes with 2-space indent, LF, trailing newline", () => {
    const text = serializeConfig(parseConfig(JSON.stringify(validConfig), "f"));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.includes("\r")).toBe(false);
    expect(text).toContain('  "registry"');
  });

  it("mergeInitConfig is idempotent and preserves installed", () => {
    const existing = parseConfig(JSON.stringify(validConfig), "f");
    const merged = mergeInitConfig(
      existing,
      {
        registry: existing.registry,
        framework: "vite",
        typescript: true,
        tailwind: { version: 4, config: undefined, css: "src/index.css" },
        aliases: { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
      },
      { yes: true, registryFlag: undefined },
    );
    expect(merged.installed).toEqual(existing.installed);
    expect(merged.framework).toBe(existing.framework);
  });

  it("creates fresh configs with empty installed", () => {
    const fresh = mergeInitConfig(
      undefined,
      {
        registry: "https://algorithco.dev/r",
        framework: "next",
        typescript: true,
        tailwind: { version: 3, config: "tailwind.config.ts", css: "src/app/globals.css" },
        aliases: { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
      },
      { yes: false, registryFlag: undefined },
    );
    expect(fresh.installed).toEqual({});
    expect(fresh.schemaVersion).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { formatError, usageError } from "./errors.js";
import { writeConfigAtomic, parseConfig } from "./config/index.js";

describe("errors/output hardening", () => {
  it("redacts credentials embedded in messages and hints", () => {
    const error = usageError("bad https://user:secret@example.com/r", "see https://a:b@example.com/x");
    const formatted = formatError(error, false);
    expect(formatted.message).not.toContain("user");
    expect(formatted.message).not.toContain("secret");
    expect(formatted.message).toContain("***@");
    expect(formatted.hint ?? "").toContain("***@");
  });

  it("keeps stacks debug-only", () => {
    const error = usageError("boom");
    expect(formatError(error, false).stack).toBeUndefined();
    expect(formatError(error, true).stack).toBeDefined();
  });
});

describe("config mode preservation", () => {
  it("writeConfigAtomic preserves the existing file mode", async () => {
    const store = new Map<string, { content: string; mode: number }>();
    store.set("/proj/framebits.json", { content: "old", mode: 0o600 });
    const chmodded: Array<{ path: string; mode: number }> = [];
    const fs = {
      readFile: (path: string) => Promise.resolve(store.get(path)?.content),
      writeFile: (path: string, content: string) => {
        store.set(path, { content, mode: 0o644 });
        return Promise.resolve();
      },
      rename: (from: string, to: string) => {
        const entry = store.get(from);
        if (entry === undefined) return Promise.reject(new Error("missing"));
        store.delete(from);
        store.set(to, entry);
        return Promise.resolve();
      },
      statMode: (path: string) => Promise.resolve(store.get(path)?.mode),
      chmod: (path: string, mode: number) => {
        chmodded.push({ path, mode });
        const entry = store.get(path);
        if (entry !== undefined) store.set(path, { ...entry, mode });
        return Promise.resolve();
      },
    };
    const config = parseConfig(
      JSON.stringify({
        $schema: "https://framebits.dev/schema/config.json",
        schemaVersion: 1,
        registry: "https://framebits.dev/r",
        framework: "next",
        typescript: true,
        tailwind: { version: 3 },
        aliases: { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
        installed: {},
      }),
      "framebits.json",
    );
    await writeConfigAtomic("/proj", config, fs);
    expect(chmodded.some((entry) => entry.mode === 0o600)).toBe(true);
  });
});

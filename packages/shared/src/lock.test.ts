import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RegistryLockSchema } from "./lock.js";

describe("RegistryLockSchema", () => {
  it("accepts an empty lock", () => {
    expect(RegistryLockSchema.safeParse({ version: 1, components: {} }).success).toBe(true);
  });

  it("accepts entries", () => {
    expect(
      RegistryLockSchema.safeParse({
        version: 1,
        components: { "aurora-text": { version: "1.0.0", hash: `sha256:${"d".repeat(64)}` } },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["bad version", { version: 2, components: {} }],
    ["bad entry version", { version: 1, components: { x: { version: "^1", hash: `sha256:${"d".repeat(64)}` } } }],
    ["bad entry hash", { version: 1, components: { x: { version: "1.0.0", hash: "nope" } } }],
    ["bad slug key", { version: 1, components: { Bad: { version: "1.0.0", hash: `sha256:${"d".repeat(64)}` } } }],
    ["unknown key", { version: 1, components: {}, extra: 1 }],
  ])("rejects %s", (_rule, value) => {
    expect(RegistryLockSchema.safeParse(value).success).toBe(false);
  });

  it("the committed registry/registry.lock.json validates", async () => {
    const lockPath = fileURLToPath(
      new URL("../../../registry/registry.lock.json", import.meta.url),
    );
    const parsed: unknown = JSON.parse(await readFile(lockPath, "utf8"));
    expect(RegistryLockSchema.safeParse(parsed).success).toBe(true);
  });
});

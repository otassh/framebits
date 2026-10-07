import { describe, expect, it } from "vitest";
import {
  CssVarsSchema,
  MAX_FILES_PER_ITEM,
  MAX_FILE_CONTENT_CHARS,
  RegistryFileSchema,
  RegistryItemSchema,
  TailwindFragmentSchema,
} from "./registry-item.js";

export const validFile = {
  path: "components/ui/aurora-text.tsx",
  content: "export function AuroraText() {\n  return null;\n}\n",
  type: "component",
} as const;

export const validItem = {
  schemaVersion: 1,
  slug: "aurora-text",
  type: "component",
  title: "Aurora Text",
  version: "1.0.0",
  hash: `sha256:${"a".repeat(64)}`,
  dependencies: { motion: "^11.0.0" },
  registryDependencies: ["cn"],
  files: [{ ...validFile }],
} as const;

describe("RegistryFileSchema", () => {
  it("accepts a valid file and defaults variant", () => {
    const parsed = RegistryFileSchema.parse({ ...validFile });
    expect(parsed.variant).toBe("ts-tw");
  });

  it("keeps an explicit variant", () => {
    expect(RegistryFileSchema.parse({ ...validFile, variant: "js" }).variant).toBe("js");
  });

  it.each([
    ["traversal path", { path: "../../../etc/passwd" }],
    ["absolute path", { path: "/etc/passwd" }],
    ["windows path", { path: "C:\\evil.ts" }],
    ["empty content", { content: "" }],
    ["bad type", { type: "widget" }],
    ["unknown key", { extra: 1 }],
  ])("rejects %s", (_rule, override) => {
    expect(RegistryFileSchema.safeParse({ ...validFile, ...override }).success).toBe(false);
  });

  it(`rejects content over ${String(MAX_FILE_CONTENT_CHARS)} characters`, () => {
    const big = `x\n`.padStart(MAX_FILE_CONTENT_CHARS + 8, "x");
    expect(big.length).toBeGreaterThan(MAX_FILE_CONTENT_CHARS);
    expect(RegistryFileSchema.safeParse({ ...validFile, content: big }).success).toBe(false);
    expect(
      RegistryFileSchema.safeParse({ ...validFile, content: "x".repeat(100) }).success,
    ).toBe(true);
  });
});

describe("TailwindFragmentSchema / CssVarsSchema", () => {
  it("accepts fragments", () => {
    expect(
      TailwindFragmentSchema.safeParse({
        keyframes: { fade: { from: { opacity: "0" } } },
        animation: { fade: "fade 1s" },
      }).success,
    ).toBe(true);
    expect(
      CssVarsSchema.safeParse({ light: { "--au": "red" }, dark: { "--au": "blue" } }).success,
    ).toBe(true);
  });

  it("accepts empty objects", () => {
    expect(TailwindFragmentSchema.safeParse({}).success).toBe(true);
    expect(CssVarsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects float leaves and unknown keys", () => {
    expect(
      TailwindFragmentSchema.safeParse({ keyframes: { fade: { opacity: 0.5 } } }).success,
    ).toBe(false);
    expect(TailwindFragmentSchema.safeParse({ keyframes: {}, bogus: 1 }).success).toBe(false);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects dangerous key %s in tailwind/cssVars records",
    (key) => {
      expect(
        TailwindFragmentSchema.safeParse(JSON.parse(`{"keyframes": {"${key}": "x"}}`)).success,
      ).toBe(false);
      expect(
        CssVarsSchema.safeParse(JSON.parse(`{"light": {"${key}": "x"}}`)).success,
      ).toBe(false);
    },
  );
});

describe("RegistryItemSchema", () => {
  it("accepts a valid item", () => {
    expect(RegistryItemSchema.safeParse({ ...validItem }).success).toBe(true);
  });

  it("materializes file variant defaults", () => {
    const parsed = RegistryItemSchema.parse({ ...validItem });
    expect(parsed.files[0]?.variant).toBe("ts-tw");
  });

  it("rejects a future schemaVersion", () => {
    expect(RegistryItemSchema.safeParse({ ...validItem, schemaVersion: 2 }).success).toBe(false);
  });

  it.each([
    ["duplicate file paths", { files: [{ ...validFile }, { ...validFile }] }],
    [
      "case-insensitive duplicate paths",
      {
        files: [
          { ...validFile, path: "components/ui/Aurora-Text.tsx" },
          { ...validFile, path: "components/ui/aurora-text.tsx" },
        ],
      },
    ],
    [
      "unicode-normalization duplicate paths",
      {
        files: [
          { ...validFile, path: "components/ui/Café.tsx" },
          { ...validFile, path: "components/ui/Café.tsx" },
        ],
      },
    ],
    ["no files", { files: [] }],
    ["bad version", { version: "^1.0.0" }],
    ["bad hash", { hash: "abc" }],
    ["unknown key", { extra: 1 }],
    ["bad file inside", { files: [{ ...validFile, path: "../x.ts" }] }],
  ])("rejects %s", (_rule, override) => {
    expect(RegistryItemSchema.safeParse({ ...validItem, ...override }).success).toBe(false);
  });

  it(`rejects more than ${String(MAX_FILES_PER_ITEM)} files`, () => {
    const files = Array.from({ length: MAX_FILES_PER_ITEM + 1 }, (_, n) => ({
      ...validFile,
      path: `components/ui/file-${String(n)}.tsx`,
    }));
    expect(RegistryItemSchema.safeParse({ ...validItem, files }).success).toBe(false);
    expect(
      RegistryItemSchema.safeParse({
        ...validItem,
        files: files.slice(0, MAX_FILES_PER_ITEM),
      }).success,
    ).toBe(true);
  });

  it("rejects more than 100 registryDependencies", () => {
    const deps = Array.from({ length: 101 }, (_, n) => `dep-${String(n)}`);
    expect(
      RegistryItemSchema.safeParse({ ...validItem, registryDependencies: deps }).success,
    ).toBe(false);
  });
});

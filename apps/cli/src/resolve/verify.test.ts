import { describe, expect, it } from "vitest";
import { computeItemHash } from "@framebits/shared";
import { verifyItem } from "./verify.js";

function validItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const path = "components/ui/aurora-text.tsx";
  const content = "export {};\n";
  const base: Record<string, unknown> = {
    schemaVersion: 1,
    slug: "aurora-text",
    type: "component",
    title: "Aurora Text",
    version: "1.0.0",
    dependencies: {},
    registryDependencies: [],
    files: [{ path, content, type: "component", variant: "ts-tw" }],
  };
  const merged = { ...base, ...overrides };
  const dependencies = merged["dependencies"];
  const registryDependencies = merged["registryDependencies"];
  const hash = computeItemHash({
    type: "component",
    dependencies:
      typeof dependencies === "object" && dependencies !== null
        ? (dependencies as Record<string, string>)
        : {},
    registryDependencies: Array.isArray(registryDependencies)
      ? (registryDependencies as string[])
      : [],
    files: [{ path, content: fileContent(merged), type: "component" }],
  });
  return { ...merged, hash };
}

function fileContent(merged: Record<string, unknown>): string {
  const files: unknown = merged["files"];
  if (Array.isArray(files)) {
    const first: unknown = files[0];
    if (typeof first === "object" && first !== null && "content" in first) {
      const content = first.content;
      if (typeof content === "string") return content;
    }
  }
  return "export {};\n";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

describe("verifyItem", () => {
  it("accepts a valid item", () => {
    const item = verifyItem(JSON.stringify(validItem()), "aurora-text");
    expect(item.slug).toBe("aurora-text");
  });

  it("rejects tampered content (exit 4, hash mismatch)", () => {
    const tampered = validItem({
      files: [{ path: "components/ui/aurora-text.tsx", content: "tampered\n", type: "component", variant: "ts-tw" }],
    });
    // Recompute is intentionally skipped: the stored hash is for the original content.
    const original = validItem();
    tampered["hash"] = original["hash"];
    try {
      verifyItem(JSON.stringify(tampered), "aurora-text");
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("rejects disallowed dependencies", () => {
    const content = "export {};\n";
    const hash = computeItemHash({
      type: "component",
      dependencies: { "left-pad": "^1.0.0" },
      registryDependencies: [],
      files: [{ path: "components/ui/aurora-text.tsx", content, type: "component" }],
    });
    const payload = {
      schemaVersion: 1,
      slug: "aurora-text",
      type: "component",
      title: "Aurora Text",
      version: "1.0.0",
      hash,
      dependencies: { "left-pad": "^1.0.0" },
      registryDependencies: [],
      files: [{ path: "components/ui/aurora-text.tsx", content, type: "component", variant: "ts-tw" }],
    };
    try {
      verifyItem(JSON.stringify(payload), "aurora-text");
      expect.unreachable();
    } catch (error) {
      expect(messageOf(error)).toContain("allowlist");
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("rejects future schema versions with an update hint", () => {
    try {
      verifyItem(JSON.stringify(validItem({ schemaVersion: 2 })), "aurora-text");
      expect.unreachable();
    } catch (error) {
      expect(messageOf(error)).toContain("schemaVersion");
      if (typeof error === "object" && error !== null && "hint" in error) {
        expect(String(error.hint)).toContain("update framebits");
      } else {
        expect.unreachable();
      }
    }
  });

  it("rejects slug mismatches", () => {
    const content = "export {};\n";
    const path = "components/ui/other.tsx";
    const hash = computeItemHash({
      type: "component",
      dependencies: {},
      registryDependencies: [],
      files: [{ path, content, type: "component" }],
    });
    const payload = {
      schemaVersion: 1,
      slug: "other",
      type: "component",
      title: "Other",
      version: "1.0.0",
      hash,
      dependencies: {},
      registryDependencies: [],
      files: [{ path, content, type: "component", variant: "ts-tw" }],
    };
    try {
      verifyItem(JSON.stringify(payload), "aurora-text");
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });
});

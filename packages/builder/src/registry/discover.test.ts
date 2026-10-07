import { symlink } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  MAX_DISCOVERED_FILES,
  MAX_DISCOVERY_DEPTH,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  detectCaseCollisions,
  detectFileCaseCollisions,
  discoverRegistry,
} from "./discover.js";
import type { Diagnostic } from "./types.js";
import { loadRegistry } from "./index.js";
import { makeRegistry, metaJson, rmRegistry, SIMPLE_DEMO, SIMPLE_TSX } from "./test-helpers.js";

function validComponent(dir: string, slug: string): Record<string, string> {
  const prefix = `${dir}/${slug}`;
  return {
    [`${prefix}/meta.json`]: metaJson(slug),
    [`${prefix}/${slug}.tsx`]: SIMPLE_TSX,
    [`${prefix}/demo.tsx`]: SIMPLE_DEMO,
  };
}

describe("discoverRegistry", () => {
  it("finds component and lib items", async () => {
    const root = await makeRegistry({
      ...validComponent("components/buttons", "ok-widget"),
      "lib/cn/meta.json": metaJson("cn", { type: "lib" }),
      "lib/cn/cn.ts": "export const x = 1;\n",
    });
    try {
      const { items, diagnostics } = await discoverRegistry(root);
      expect(diagnostics).toEqual([]);
      expect(items.map((item) => item.dirRel).sort()).toEqual([
        "components/buttons/ok-widget",
        "lib/cn",
      ]);
    } finally {
      await rmRegistry(root);
    }
  });

  it("warns (not empties) on a missing root", async () => {
    const { items, diagnostics } = await discoverRegistry("/tmp/definitely-not-here-xyz");
    expect(items).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(["REGISTRY_ROOT_MISSING"]);
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(diagnostics[0]?.message).toContain("treating as an empty registry");
  });

  it("rejects oversized files with an error plus a SKIPPED_SCAN warning", async () => {
    const root = await makeRegistry({
      ...validComponent("components/buttons", "ok"),
      "components/buttons/ok/big.tsx": `x${"y".repeat(300 * 1024)}`,
    });
    try {
      const { diagnostics } = await discoverRegistry(root);
      expect(diagnostics.map((d) => d.code)).toContain("FILE_TOO_LARGE");
      const skipped = diagnostics.filter((d) => d.code === "SKIPPED_SCAN");
      expect(skipped.length).toBeGreaterThan(0);
      expect(skipped.every((d) => d.severity === "warning")).toBe(true);
    } finally {
      await rmRegistry(root);
    }
  });

  it("rejects invalid UTF-8 with an error plus a SKIPPED_SCAN warning", async () => {
    const root = await makeRegistry({
      ...validComponent("components/buttons", "ok"),
      "components/buttons/ok/bad.tsx": new Uint8Array([0xff, 0xfe, 0x41]),
    });
    try {
      const { diagnostics } = await discoverRegistry(root);
      expect(diagnostics.map((d) => d.code)).toContain("ENCODING_INVALID");
      expect(diagnostics.map((d) => d.code)).toContain("SKIPPED_SCAN");
    } finally {
      await rmRegistry(root);
    }
  });

  it("rejects NUL bytes", async () => {
    const root = await makeRegistry({
      ...validComponent("components/buttons", "ok"),
      "components/buttons/ok/nul.tsx": "ab\u0000cd",
    });
    try {
      const { diagnostics } = await discoverRegistry(root);
      expect(diagnostics.map((d) => d.code)).toContain("NUL_BYTE");
      expect(diagnostics.map((d) => d.code)).toContain("SKIPPED_SCAN");
    } finally {
      await rmRegistry(root);
    }
  });

  it("rejects symlinks without following them", async (ctx) => {
    const root = await makeRegistry(validComponent("components/buttons", "ok"));
    try {
      try {
        await symlink("ok/ok.tsx", `${root}/components/buttons/link-dir-target`);
      } catch {
        // Fall through to the file-link attempt below.
      }
      try {
        await symlink(
          "components/buttons/ok/ok.tsx",
          `${root}/components/buttons/ok/link.tsx`,
        );
      } catch (error) {
        ctx.skip(
          `symlink creation refused by the OS: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      const { diagnostics } = await discoverRegistry(root);
      expect(diagnostics.map((d) => d.code)).toContain("SYMLINK_NOT_ALLOWED");
    } finally {
      await rmRegistry(root);
    }
  });

  it("flags folders that differ from their slug only by case", async () => {
    const root = await makeRegistry({
      "components/buttons/OK/meta.json": metaJson("ok"),
      "components/buttons/OK/ok.tsx": SIMPLE_TSX,
      "components/buttons/OK/demo.tsx": SIMPLE_DEMO,
    });
    try {
      const { diagnostics } = await loadRegistry({ registryRoot: root });
      expect(diagnostics.map((d) => d.code)).toContain("SLUG_FOLDER_MISMATCH");
    } finally {
      await rmRegistry(root);
    }
  });

  it("emits an explicit CASE_COLLISION for NFC/case-folded directory duplicates", () => {
    // Synthetic items: real colliding directories cannot be created on
    // case-insensitive filesystems.
    const item = (dirRel: string): { dirRel: string; dirAbs: string; files: [] } => ({
      dirRel,
      dirAbs: `/tmp/root/${dirRel}`,
      files: [],
    });
    const diagnostics: Diagnostic[] = [];
    detectCaseCollisions(
      [item("components/buttons/ok"), item("components/buttons/OK"), item("lib/other")],
      diagnostics,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["CASE_COLLISION", "CASE_COLLISION"]);
    expect(diagnostics.every((d) => d.severity === "error")).toBe(true);

    const nfc: Diagnostic[] = [];
    detectCaseCollisions(
      [item("components/buttons/caf\u00e9"), item("components/buttons/cafe\u0301")],
      nfc,
    );
    expect(nfc.map((d) => d.code)).toEqual(["CASE_COLLISION", "CASE_COLLISION"]);
  });

  it("emits CASE_COLLISION for files colliding within one directory", () => {
    // Synthetic files: real colliding files cannot be created on
    // case-insensitive filesystems.
    const diagnostics: Diagnostic[] = [];
    detectFileCaseCollisions(
      "components/buttons/ok",
      [
        { relPath: "components/buttons/ok/ok.tsx", absPath: "/tmp/a", size: 1, text: "x" },
        { relPath: "components/buttons/ok/OK.tsx", absPath: "/tmp/b", size: 1, text: "x" },
      ],
      diagnostics,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["CASE_COLLISION", "CASE_COLLISION"]);
    expect(diagnostics.every((d) => d.severity === "error")).toBe(true);
  });

  it("fails closed on traversal budget, file count, and depth", async () => {
    expect(MAX_TOTAL_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_DISCOVERED_FILES).toBe(500);
    expect(MAX_DISCOVERY_DEPTH).toBe(10);
    expect(MAX_FILE_BYTES).toBe(200 * 1024);

    // Total budget: just over 10 MB across per-file-legal files.
    const perFile = 200 * 1024;
    const fileCount = Math.floor(MAX_TOTAL_BYTES / perFile) + 2;
    const bulk: Record<string, string> = { ...validComponent("components/buttons", "ok") };
    for (let i = 0; i < fileCount; i++) {
      bulk[`components/buttons/ok/f${String(i)}.txt`] = `x${"y".repeat(perFile - 1)}`;
    }
    const big = await makeRegistry(bulk);
    try {
      const { diagnostics } = await discoverRegistry(big);
      expect(diagnostics.map((d) => d.code)).toContain("DISCOVERY_BUDGET_EXCEEDED");
    } finally {
      await rmRegistry(big);
    }

    // Depth: nest past MAX_DISCOVERY_DEPTH.
    const deep: Record<string, string> = {};
    const segments = Array.from({ length: MAX_DISCOVERY_DEPTH + 3 }, (_, i) => `d${String(i)}`);
    deep[`${["components", ...segments].join("/")}/meta.json`] = metaJson("deep");
    const deepRoot = await makeRegistry(deep);
    try {
      const { diagnostics } = await discoverRegistry(deepRoot);
      expect(diagnostics.map((d) => d.code)).toContain("DISCOVERY_MAX_DEPTH");
    } finally {
      await rmRegistry(deepRoot);
    }
  }, 60000);
});

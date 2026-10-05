import { symlink } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { discoverRegistry } from "./discover.js";
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

  it("returns empty for a missing root", async () => {
    const { items, diagnostics } = await discoverRegistry("/tmp/definitely-not-here-xyz");
    expect(items).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("rejects oversized files", async () => {
    const root = await makeRegistry({
      ...validComponent("components/buttons", "ok"),
      "components/buttons/ok/big.tsx": `x${"y".repeat(300 * 1024)}`,
    });
    try {
      const { diagnostics } = await discoverRegistry(root);
      expect(diagnostics.map((d) => d.code)).toContain("FILE_TOO_LARGE");
    } finally {
      await rmRegistry(root);
    }
  });

  it("rejects invalid UTF-8", async () => {
    const root = await makeRegistry({
      ...validComponent("components/buttons", "ok"),
      "components/buttons/ok/bad.tsx": new Uint8Array([0xff, 0xfe, 0x41]),
    });
    try {
      const { diagnostics } = await discoverRegistry(root);
      expect(diagnostics.map((d) => d.code)).toContain("ENCODING_INVALID");
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
});

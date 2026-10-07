import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasDefaultExport, loadRegistry } from "./index.js";
import { makeRegistry, metaJson, rmRegistry, demoTsx, SIMPLE_TSX } from "./test-helpers.js";

describe("hasDefaultExport", () => {
  it.each([
    ["export default function", "export default function Demo() {\n  return null;\n}\n"],
    ["export default class", "export default class Demo {}\n"],
    ["export default expression", "const Demo = 1;\nexport default Demo;\n"],
    ["export as default", "function Demo() {}\nexport { Demo as default };\n"],
  ])("accepts %s", (_form, text) => {
    expect(hasDefaultExport(text)).toBe(true);
  });

  it.each([
    ["named only", "export function Demo() {\n  return null;\n}\n"],
    ["empty", ""],
  ])("rejects %s", (_form, text) => {
    expect(hasDefaultExport(text)).toBe(false);
  });
});

function componentFiles(
  dir: string,
  slug: string,
  tsx: string = SIMPLE_TSX,
): Record<string, string> {
  return {
    [`${dir}/${slug}/meta.json`]: metaJson(slug),
    [`${dir}/${slug}/${slug}.tsx`]: tsx,
    [`${dir}/${slug}/demo.tsx`]: demoTsx(slug),
  };
}

describe("loadRegistry", () => {
  it("models a valid component with hash and target paths", async () => {
    const root = await makeRegistry(componentFiles("components/buttons", "ok-widget"));
    try {
      const { items, diagnostics, summary } = await loadRegistry({ registryRoot: root });
      expect(diagnostics).toEqual([]);
      expect(items.length).toBe(1);
      const item = items[0];
      expect(item?.slug).toBe("ok-widget");
      expect(item?.files.map((file) => file.path)).toEqual(["components/ui/ok-widget.tsx"]);
      expect(item?.files[0]?.type).toBe("component");
      expect(item?.files[0]?.variant).toBe("ts-tw");
      expect(item?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(summary).toMatchObject({
        discovered: 1,
        modeled: 1,
        byType: { component: 1, lib: 0, hook: 0 },
      });
    } finally {
      await rmRegistry(root);
    }
  });

  it("models css and styles.json content", async () => {
    const root = await makeRegistry({
      ...componentFiles("components/buttons", "ok"),
      "components/buttons/ok/ok.css": ".ok { color: red; }\n",
      "components/buttons/ok/styles.json": JSON.stringify({
        cssVars: { light: { "--ok": "red" } },
      }),
    });
    try {
      const { items, diagnostics } = await loadRegistry({ registryRoot: root });
      expect(diagnostics).toEqual([]);
      expect(items[0]?.files.map((file) => file.path)).toEqual([
        "components/ui/ok.css",
        "components/ui/ok.tsx",
      ]);
      expect(items[0]?.cssVars).toEqual({ light: { "--ok": "red" } });
    } finally {
      await rmRegistry(root);
    }
  });

  it("does not report ambient declaration packages as unused", async () => {
    const root = await makeRegistry({
      ...componentFiles("components/buttons", "typed-widget"),
    });
    await writeFile(
      join(root, "components", "buttons", "typed-widget", "meta.json"),
      metaJson("typed-widget", { dependencies: { "@types/three": "0.186.0" } }),
      "utf8",
    );
    try {
      const { diagnostics } = await loadRegistry({ registryRoot: root });
      expect(diagnostics).toEqual([]);
    } finally {
      await rmRegistry(root);
    }
  });

  it("excludes drafts from the model but validates them", async () => {
    const root = await makeRegistry({
      ...componentFiles("components/buttons", "pub"),
      ...componentFiles("components/buttons", "wip"),
    });
    // Rewrite wip as a valid draft carrying an unexpected file: drafts are fully
    // validated (UNEXPECTED_FILE) but excluded from the model.
    await writeFile(
      join(root, "components", "buttons", "wip", "meta.json"),
      metaJson("wip", { status: "draft" }),
      "utf8",
    );
    await writeFile(join(root, "components", "buttons", "wip", "notes.txt"), "x", "utf8");
    try {
      const { items, diagnostics, summary } = await loadRegistry({ registryRoot: root });
      expect(items.map((item) => item.slug)).toEqual(["pub"]);
      expect(summary.byStatus.draft).toBe(1);
      expect(diagnostics.map((d) => d.code)).toContain("UNEXPECTED_FILE");
    } finally {
      await rmRegistry(root);
    }
  });

  it("an empty registry is valid with 0 items", async () => {
    const root = await makeRegistry({});
    try {
      const { items, diagnostics } = await loadRegistry({ registryRoot: root });
      expect(items).toEqual([]);
      expect(diagnostics).toEqual([]);
    } finally {
      await rmRegistry(root);
    }
  });

  it("flags duplicate slugs across categories", async () => {
    const root = await makeRegistry({
      ...componentFiles("components/buttons", "dup"),
      ...componentFiles("components/cursors", "dup"),
    });
    try {
      const { items, diagnostics } = await loadRegistry({ registryRoot: root });
      expect(items).toEqual([]);
      expect(diagnostics.filter((d) => d.code === "DUPLICATE_SLUG").length).toBe(2);
    } finally {
      await rmRegistry(root);
    }
  });

  it("CRLF/BOM sources hash like LF sources", async () => {
    const lf = await makeRegistry(componentFiles("components/buttons", "ok"));
    const crlf = await makeRegistry({
      [`components/buttons/ok/meta.json`]: metaJson("ok"),
      [`components/buttons/ok/ok.tsx`]: "﻿export function Widget() {\r\n  return null;\r\n}\r\n",
      [`components/buttons/ok/demo.tsx`]: demoTsx("ok"),
    });
    try {
      const a = await loadRegistry({ registryRoot: lf });
      const b = await loadRegistry({ registryRoot: crlf });
      expect(a.diagnostics).toEqual([]);
      expect(b.diagnostics).toEqual([]);
      expect(a.items[0]?.hash).toBe(b.items[0]?.hash);
    } finally {
      await rmRegistry(lf);
      await rmRegistry(crlf);
    }
  });

  it("running twice yields deep-equal results", async () => {
    const root = await makeRegistry({
      ...componentFiles("components/buttons", "ok"),
      "lib/cn/meta.json": metaJson("cn", { type: "lib", category: "utilities" }),
      "lib/cn/cn.ts": "export const x = 1;\n",
    });
    try {
      const first = await loadRegistry({ registryRoot: root });
      const second = await loadRegistry({ registryRoot: root });
      expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(second)));
    } finally {
      await rmRegistry(root);
    }
  });

  it("orders diagnostics deterministically (file, line, column, code)", async () => {
    const root = await makeRegistry({
      ...componentFiles("components/buttons", "zeta"),
      ...componentFiles("components/buttons", "alpha"),
    });
    // Corrupt both metas so each yields META_INVALID (plus folder-derived layout
    // diagnostics); order must follow the file.
    await writeFile(join(root, "components", "buttons", "zeta", "meta.json"), "{bad", "utf8");
    await writeFile(join(root, "components", "buttons", "alpha", "meta.json"), "{bad", "utf8");
    try {
      const { diagnostics } = await loadRegistry({ registryRoot: root });
      const files = diagnostics.map((d) => d.file);
      expect(files.length).toBeGreaterThan(0);
      expect(files).toEqual([...files].sort());
      expect(files[0]?.startsWith("components/buttons/alpha/")).toBe(true);
      expect(files[files.length - 1]?.startsWith("components/buttons/zeta/")).toBe(true);
    } finally {
      await rmRegistry(root);
    }
  });

  it("reports DEMO_UNREADABLE for an unscannable demo and BUMP_IGNORED for meta.bump", async () => {
    const root = await makeRegistry({
      ...componentFiles("components/buttons", "ok"),
      "components/buttons/ok/demo.tsx": `x${"y".repeat(300 * 1024)}`,
      "components/buttons/bumped/meta.json": metaJson("bumped", { bump: "minor" }),
      "components/buttons/bumped/bumped.tsx": SIMPLE_TSX,
      "components/buttons/bumped/demo.tsx": demoTsx("bumped"),
    });
    try {
      const { diagnostics } = await loadRegistry({ registryRoot: root, skipTypecheck: true });
      const codes = diagnostics.map((d) => d.code);
      expect(codes).toContain("FILE_TOO_LARGE");
      expect(codes).toContain("DEMO_UNREADABLE");
      const bumped = diagnostics.filter((d) => d.code === "BUMP_IGNORED");
      expect(bumped.length).toBe(1);
      expect(bumped[0]?.severity).toBe("warning");
    } finally {
      await rmRegistry(root);
    }
  });

  it("flags dangerous CSS constructs and keeps clean CSS quiet", async () => {
    const clean = await makeRegistry({
      ...componentFiles("components/buttons", "ok"),
      "components/buttons/ok/ok.css": ".ok { color: red; }\n",
    });
    try {
      const { diagnostics } = await loadRegistry({ registryRoot: clean, skipTypecheck: true });
      expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    } finally {
      await rmRegistry(clean);
    }
    const dirty = await makeRegistry({
      ...componentFiles("components/buttons", "ok"),
      "components/buttons/ok/ok.css": "@import \"https://evil.example/x.css\";\n",
    });
    try {
      const { diagnostics } = await loadRegistry({ registryRoot: dirty, skipTypecheck: true });
      expect(diagnostics.map((d) => d.code)).toContain("SECURITY_CSS_IMPORT");
    } finally {
      await rmRegistry(dirty);
    }
  });
});

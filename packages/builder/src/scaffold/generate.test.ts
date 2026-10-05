import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prettier from "prettier";
import { afterEach, describe, expect, it } from "vitest";
import { MetaSchema } from "@algorithco-ui/shared";
import prettierConfig from "../../../config/prettier.base.js";
import { resolveTargetDir, ScaffoldError, scaffold } from "./index.js";

let roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "scaffold-gen-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

const NOW = new Date("2026-10-05T12:34:56.789Z");

async function readTree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of await readdir(dir)) {
    out[name] = await readFile(join(dir, name), "utf8");
  }
  return out;
}

describe("scaffold", () => {
  it("generates a component with the expected files and schema-valid meta", async () => {
    const root = await makeRoot();
    const result = await scaffold(
      { slug: "aurora-text", category: "text-animations" },
      root,
      NOW,
    );
    expect(result.dir).toBe(join(root, "components", "text-animations", "aurora-text"));
    expect(result.files).toEqual(["aurora-text.tsx", "demo.tsx", "meta.json"]);

    const tree = await readTree(result.dir);
    const meta: unknown = JSON.parse(tree["meta.json"] ?? "");
    expect(MetaSchema.safeParse(meta).success).toBe(true);
    expect(tree["aurora-text.tsx"]).toContain("export function AuroraText");
    expect(tree["demo.tsx"]).toContain('from "./aurora-text"');
  });

  it("generates lib and hook layouts", async () => {
    const root = await makeRoot();
    const lib = await scaffold({ slug: "cn", type: "lib" }, root, NOW);
    expect(lib.dir).toBe(join(root, "lib", "cn"));
    expect(lib.files).toEqual(["cn.ts", "meta.json"]);

    const hook = await scaffold({ slug: "use-mounted", type: "hook" }, root, NOW);
    expect(hook.files).toEqual(["use-mounted.ts", "meta.json"]);
    const hookTree = await readTree(hook.dir);
    expect(hookTree["use-mounted.ts"]).toContain("export function useMounted");
    const hookMeta: unknown = JSON.parse(hookTree["meta.json"] ?? "");
    expect(MetaSchema.safeParse(hookMeta).success).toBe(true);
  });

  it("is deterministic for the same inputs and now", async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    const request = { slug: "aurora-text", category: "text-animations" };
    const a = await scaffold(request, first, NOW);
    const b = await scaffold(request, second, NOW);
    expect(await readTree(a.dir)).toEqual(await readTree(b.dir));
  });

  it("uses addedAt from the injected now (UTC date)", async () => {
    const root = await makeRoot();
    const result = await scaffold(
      { slug: "aurora-text", category: "text-animations" },
      root,
      new Date("2026-01-02T03:04:05.000Z"),
    );
    const meta: unknown = JSON.parse(await readFile(join(result.dir, "meta.json"), "utf8"));
    expect(MetaSchema.parse(meta).addedAt).toBe("2026-01-02");
  });

  it("all generated text files are LF-only, BOM-free, newline-terminated", async () => {
    const root = await makeRoot();
    const requests = [
      { slug: "aurora-text", category: "text-animations" },
      { slug: "cn", type: "lib" },
      { slug: "use-mounted", type: "hook" },
    ] as const;
    for (const request of requests) {
      const result = await scaffold(request, root, NOW);
      for (const name of result.files) {
        const content = await readFile(join(result.dir, name), "utf8");
        expect(content.includes("\r")).toBe(false);
        expect(content.charCodeAt(0)).not.toBe(0xfeff);
        expect(content.endsWith("\n")).toBe(true);
      }
    }
  });

  it("generated sources satisfy the repo Prettier config", async () => {
    const root = await makeRoot();
    const result = await scaffold({ slug: "aurora-text", category: "text-animations" }, root, NOW);
    for (const name of result.files) {
      const content = await readFile(join(result.dir, name), "utf8");
      const parser = name.endsWith(".json") ? "json" : "typescript";
      await expect(prettier.check(content, { ...prettierConfig, parser })).resolves.toBe(true);
    }
  });

  it("component template is client-rendered, SSR-safe, reduced-motion aware", async () => {
    const root = await makeRoot();
    const result = await scaffold({ slug: "aurora-text", category: "text-animations" }, root, NOW);
    const tsx = await readFile(join(result.dir, "aurora-text.tsx"), "utf8");
    expect(tsx.split("\n")[0]).toBe('"use client";');
    expect(tsx).toContain("useReducedMotion");
    expect(tsx).toContain('from "motion/react"');
    expect(tsx).toContain("export interface AuroraTextProps");
    expect(/(^|[^A-Za-z_.])window([^A-Za-z_]|$)/.test(tsx)).toBe(false);
    expect(/(^|[^A-Za-z_.])document([^A-Za-z_]|$)/.test(tsx)).toBe(false);
    // Full type-check of generated components is deferred to the builder (Task 4):
    // TODO: picks this up — assert `pnpm build:registry --check` passes on samples.
  });

  it("refuses an existing folder and leaves it untouched", async () => {
    const root = await makeRoot();
    const first = await scaffold({ slug: "aurora-text", category: "text-animations" }, root, NOW);
    const before = await readTree(first.dir);
    await expect(
      scaffold({ slug: "aurora-text", category: "text-animations" }, root, NOW),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await readTree(first.dir)).toEqual(before);
  });

  it("rejects duplicates across categories and bad inputs before writing", async () => {
    const root = await makeRoot();
    await scaffold({ slug: "dup-slug", category: "buttons" }, root, NOW);
    await expect(scaffold({ slug: "dup-slug", category: "cursors" }, root, NOW)).rejects.toThrow(
      /already exists/,
    );
    await expect(scaffold({ slug: "Bad_Slug", category: "buttons" }, root, NOW)).rejects.toThrow(
      /invalid slug/,
    );
    await expect(scaffold({ slug: "ok-slug", category: "nope" }, root, NOW)).rejects.toThrow(
      /unknown category/,
    );
    await expect(scaffold({ slug: "lonely" }, root, NOW)).rejects.toThrow(/--category/);
    // Nothing extra was written: only the first item exists.
    expect(await readdir(join(root, "components"))).toEqual(["buttons"]);
  });

  it("treats a missing root as empty (creates the chain)", async () => {
    const base = await makeRoot();
    const nested = join(base, "nested", "registry");
    const result = await scaffold({ slug: "fresh-one", category: "buttons" }, nested, NOW);
    expect(result.dir).toBe(join(nested, "components", "buttons", "fresh-one"));
    expect(result.files).toEqual(["fresh-one.tsx", "demo.tsx", "meta.json"]);
  });

  it("leaves no partial output when the filesystem fails", async () => {
    const root = await makeRoot();
    const blockingFile = join(root, "blocker");
    await writeFile(blockingFile, "x", "utf8");
    await expect(
      scaffold({ slug: "aurora-text", category: "text-animations" }, blockingFile, NOW),
    ).rejects.toThrow();
    // Only the blocker file exists; no scaffold dirs, no temp leftovers.
    expect(await readdir(root)).toEqual(["blocker"]);
  });
});

describe("resolveTargetDir", () => {
  it("joins inside the root", async () => {
    const root = await makeRoot();
    expect(resolveTargetDir(root, "components", "a", "b")).toBe(
      join(root, "components", "a", "b"),
    );
  });

  it("refuses escapes", async () => {
    const root = await makeRoot();
    expect(() => resolveTargetDir(root, "..", "evil")).toThrow(ScaffoldError);
    expect(() => resolveTargetDir(root, "/abs")).toThrow(ScaffoldError);
  });
});

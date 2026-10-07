import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSlugUnique, listMetaFiles } from "./scan.js";

let roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "scaffold-scan-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function writeMeta(root: string, sub: string, slug: string): Promise<string> {
  const dir = join(root, sub);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "meta.json");
  await writeFile(
    file,
    JSON.stringify({
      slug,
      title: "T",
      type: "component",
      category: "buttons",
      tags: [],
      description: "A long enough description here.",
      dependencies: {},
      registryDependencies: [],
      difficulty: "easy",
      performance: "light",
      status: "published",
      addedAt: "2026-10-05",
    }),
    "utf8",
  );
  return file;
}

describe("listMetaFiles", () => {
  it("finds metas recursively, sorted", async () => {
    const root = await makeRoot();
    const second = await writeMeta(root, join("lib", "two"), "two");
    const first = await writeMeta(root, join("components", "a", "one"), "one");
    // Sanity: fixtures are readable files.
    await readFile(first, "utf8");
    expect(await listMetaFiles(root)).toEqual([first, second].sort());
  });
});

describe("assertSlugUnique", () => {
  it("passes in an empty registry", async () => {
    const root = await makeRoot();
    await expect(assertSlugUnique(root, "fresh-slug")).resolves.toEqual([]);
  });

  it("fails naming the existing path on collision", async () => {
    const root = await makeRoot();
    const existing = await writeMeta(root, join("components", "buttons", "dup-slug"), "dup-slug");
    await expect(assertSlugUnique(root, "dup-slug")).rejects.toThrow(existing);
  });

  it("collides across categories", async () => {
    const root = await makeRoot();
    await writeMeta(root, join("components", "cursors", "shared-slug"), "shared-slug");
    await expect(assertSlugUnique(root, "shared-slug")).rejects.toThrow(/already exists/);
  });

  it("skips invalid existing meta with a warning instead of failing", async () => {
    const root = await makeRoot();
    const dir = join(root, "components", "buttons", "broken");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "meta.json");
    await writeFile(file, "{ not json", "utf8");
    const warnings = await assertSlugUnique(root, "anything");
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(file);
  });

  it("skips oversized, undecodable, and NUL-containing metas with warnings", async () => {
    const root = await makeRoot();
    const cases: Array<{ sub: string; content: string | Uint8Array }> = [
      { sub: "huge", content: `{"slug": "huge"}${"x".repeat(250 * 1024)}` },
      { sub: "nul", content: '{"slug": "nul"}\0' },
    ];
    for (const { sub, content } of cases) {
      const dir = join(root, "components", "buttons", sub);
      await mkdir(dir, { recursive: true });
      if (typeof content === "string") {
        await writeFile(join(dir, "meta.json"), content, "utf8");
      } else {
        await writeFile(join(dir, "meta.json"), content);
      }
    }
    const badDir = join(root, "components", "buttons", "badenc");
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, "meta.json"), new Uint8Array([0xff, 0xfe]));
    const warnings = await assertSlugUnique(root, "fresh");
    expect(warnings.length).toBe(3);
  });
});

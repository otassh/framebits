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
    await expect(assertSlugUnique(root, "fresh-slug")).resolves.toBeUndefined();
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

  it("fails on invalid existing meta, naming the path", async () => {
    const root = await makeRoot();
    const dir = join(root, "components", "buttons", "broken");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "meta.json");
    await writeFile(file, "{ not json", "utf8");
    await expect(assertSlugUnique(root, "anything")).rejects.toThrow(file);
  });
});

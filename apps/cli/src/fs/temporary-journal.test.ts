import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withTemporaryJournal } from "./temporary-journal.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "framebits-journal-test-"));
  roots.push(root);
  return root;
}

describe("withTemporaryJournal", () => {
  it("removes backup files after a successful operation", async () => {
    const root = await makeRoot();
    const result = await withTemporaryJournal(async (journalDir) => {
      await writeFile(join(journalDir, "backup-0"), "secret\n", "utf8");
      return journalDir;
    }, root);

    expect(result.startsWith(root)).toBe(true);
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("preserves the operation error and removes backups after failure", async () => {
    const root = await makeRoot();
    await expect(
      withTemporaryJournal(async (journalDir) => {
        await writeFile(join(journalDir, "backup-0"), "secret\n", "utf8");
        throw new Error("apply failed");
      }, root),
    ).rejects.toThrow("apply failed");

    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("removes the directory when the operation throws before returning a promise", async () => {
    const root = await makeRoot();
    await expect(
      withTemporaryJournal(() => {
        throw new Error("synchronous failure");
      }, root),
    ).rejects.toThrow("synchronous failure");

    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("uses distinct directories for concurrent transactions", async () => {
    const root = await makeRoot();
    const paths = await Promise.all([
      withTemporaryJournal((journalDir) => Promise.resolve(journalDir), root),
      withTemporaryJournal((journalDir) => Promise.resolve(journalDir), root),
    ]);

    expect(new Set(paths).size).toBe(2);
    await expect(readdir(root)).resolves.toEqual([]);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scaffold } from "../scaffold/index.js";
import { loadRegistry } from "./index.js";

let roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

/**
 * Generator -> pipeline integration (closes the deferred TODO in the generator
 * tests): scaffold all 3 types into a temp registry, then run the full builder
 * pipeline WITH type-check. Zero errors expected.
 */
describe("generator into pipeline", () => {
  it("scaffolded output validates and type-checks with zero errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipeline-e2e-"));
    roots.push(root);
    const now = new Date("2026-10-05T00:00:00.000Z");

    await scaffold({ slug: "e2e-text", category: "text-animations" }, root, now);
    await scaffold({ slug: "e2e-util", type: "lib" }, root, now);
    await scaffold({ slug: "e2e-flag", type: "hook" }, root, now);

    const { items, diagnostics, summary } = await loadRegistry({ registryRoot: root });
    expect(diagnostics).toEqual([]);
    expect(summary.discovered).toBe(3);
    // Generated metas are drafts: validated, but excluded from the model.
    expect(items).toEqual([]);
    expect(summary.byStatus.draft).toBe(3);
  }, 120000);
});

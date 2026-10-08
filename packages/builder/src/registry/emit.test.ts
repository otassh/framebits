import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import MiniSearch from "minisearch";
import { RegistryIndexSchema, verifyItemHash } from "@framebits/shared";
import type { RegistryItemModel } from "./index.js";
import {
  buildTree,
  hashTree,
  planArchive,
  planBuild,
  serializeCanonical,
  verifyArchiveFiles,
  verifyLockFile,
  verifyWrittenTree,
  writeBuildTree,
} from "./emit.js";
import { loadRegistry } from "./index.js";
import { makeRegistry, metaJson, rmRegistry, demoTsx, SIMPLE_TSX } from "./test-helpers.js";

const GIT_SHA = "abc123";
const GENERATED_AT = "2026-10-05T00:00:00.000Z";

function componentFiles(slug: string, tsx: string = SIMPLE_TSX): Record<string, string> {
  return {
    [`components/text-animations/${slug}/meta.json`]: metaJson(slug, { category: "text-animations" }),
    [`components/text-animations/${slug}/${slug}.tsx`]: tsx,
    [`components/text-animations/${slug}/demo.tsx`]: demoTsx(slug),
  };
}

async function loadModels(files: Record<string, string>): Promise<{
  root: string;
  items: RegistryItemModel[];
}> {
  const root = await makeRegistry(files);
  const loaded = await loadRegistry({ registryRoot: root, skipTypecheck: true });
  expect(loaded.diagnostics.filter((d) => d.code !== "TYPECHECK_SKIPPED")).toEqual([]);
  expect(loaded.typecheckRan).toBe(false);
  return { root, items: loaded.items };
}

describe("serializeCanonical", () => {
  it("sorts keys, compacts, and ends with LF", () => {
    expect(serializeCanonical({ b: 1, a: [2, 1] })).toBe('{"a":[2,1],"b":1}\n');
  });
});

describe("buildTree determinism", () => {
  it("two builds produce byte-identical trees with equal tree hashes", async () => {
    const { root, items } = await loadModels({
      ...componentFiles("aurora-text"),
      ...componentFiles("glow-card"),
    });
    try {
      const first = buildTree(items, [], GIT_SHA, GENERATED_AT, "0.0.0");
      const second = buildTree(items, [], GIT_SHA, GENERATED_AT, "0.0.0");
      expect([...second.files.keys()].sort()).toEqual([...first.files.keys()].sort());
      for (const [path, content] of first.files) {
        expect(second.files.get(path)).toBe(content);
      }
      expect(await hashTree(first.files)).toBe(await hashTree(second.files));
      expect(await hashTree(first.files)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await rmRegistry(root);
    }
  });

  it("emits index, items, versioned copies, search, manifest, and schemas", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      expect(tree.files.has("r/index.json")).toBe(true);
      expect(tree.files.has("r/aurora-text.json")).toBe(true);
      expect(tree.files.has("r/aurora-text@1.0.0.json")).toBe(true);
      expect(tree.files.has("search-index.json")).toBe(true);
      expect(tree.files.has("build-manifest.json")).toBe(true);
      expect(tree.files.has("schema/meta.json")).toBe(true);
      const index: unknown = JSON.parse(tree.files.get("r/index.json") as string);
      expect(RegistryIndexSchema.safeParse(index).success).toBe(true);
      expect(RegistryIndexSchema.parse(index).items[0]?.previews).toEqual({
        image: "/previews/aurora-text.webp",
      });
      expect(tree.bytes).toBeGreaterThan(0);
    } finally {
      await rmRegistry(root);
    }
  });

  it("MiniSearch finds the component, including with typos", async () => {
    const { root, items } = await loadModels({
      "components/text-animations/aurora-text/meta.json": metaJson("aurora-text", {
        category: "text-animations",
        title: "Aurora Text",
        tags: ["gradient", "text"],
        description: "Animated aurora gradient text.",
      }),
      "components/text-animations/aurora-text/aurora-text.tsx": SIMPLE_TSX,
      "components/text-animations/aurora-text/demo.tsx": demoTsx("aurora-text"),
    });
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      const search: unknown = JSON.parse(tree.files.get("search-index.json") as string);
      const parsed = (await import("@framebits/shared")).SearchIndexSchema.parse(search);
      const mini = MiniSearch.loadJSON(JSON.stringify(parsed.index), {
        fields: ["title", "tags", "category", "description"],
      });
      expect(mini.search("aurora").map((hit: { id: string }) => hit.id)).toContain("aurora-text");
      // Typo tolerance comes from query-time options (same ones the CLI uses).
      // "aurorra" is one edit from "aurora" (fuzzy 0.2 on length 6 allows 1).
      expect(
        mini.search("aurorra", { prefix: true, fuzzy: 0.2 }).map((hit: { id: string }) => hit.id),
      ).toContain("aurora-text");
    } finally {
      await rmRegistry(root);
    }
  });

  it("emitted item hashes verify independently from disk bytes", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      const parent = await mkdtemp(join(tmpdir(), "emit-disk-"));
      try {
        const out = join(parent, "out");
        expect(await writeBuildTree(out, tree)).toEqual([]);
        // Read the emitted file back from disk (not the in-memory tree) and verify.
        const raw: unknown = JSON.parse(await readFile(join(out, "r", "aurora-text.json"), "utf8"));
        const { RegistryItemSchema } = await import("@framebits/shared");
        const parsed = RegistryItemSchema.parse(raw);
        expect(verifyItemHash(parsed, parsed.hash)).toBe(true);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    } finally {
      await rmRegistry(root);
    }
  });
});

describe("verifyWrittenTree", () => {
  it("catches a deliberately corrupted item", async () => {    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      // Corrupt one emitted item file, then verify a directory holding the tree.
      const tampered = new Map(tree.files);
      const original = tampered.get("r/aurora-text.json") ?? "";
      tampered.set("r/aurora-text.json", original.replace("aurora-text", "aurora-tampered"));
      const dir = await mkdtemp(join(tmpdir(), "emit-verify-"));
      try {
        for (const [rel, content] of tampered) {
          const abs = join(dir, ...rel.split("/"));
          await mkdir(join(abs, ".."), { recursive: true });
          await writeFile(abs, content, "utf8");
        }
        const diagnostics = await verifyWrittenTree(dir, tree);
        expect(diagnostics.map((d) => d.code)).toContain("EMIT_VERIFY_FAILED");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } finally {
      await rmRegistry(root);
    }
  });
});

describe("verifyWrittenTree extra files", () => {
  it("flags files on disk that the tree does not account for", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      const dir = await mkdtemp(join(tmpdir(), "emit-extra-"));
      try {
        for (const [rel, content] of tree.files) {
          const abs = join(dir, ...rel.split("/"));
          await mkdir(join(abs, ".."), { recursive: true });
          await writeFile(abs, content, "utf8");
        }
        await writeFile(join(dir, "stowaway.txt"), "smuggled", "utf8");
        const diagnostics = await verifyWrittenTree(dir, tree);
        expect(diagnostics.map((d) => d.code)).toContain("EMIT_VERIFY_FAILED");
        expect(diagnostics.some((d) => d.file === "stowaway.txt")).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } finally {
      await rmRegistry(root);
    }
  });
});

describe("verifyArchiveFiles and verifyLockFile", () => {
  it("re-reads archive and lock bytes after writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "emit-postwrite-"));
    try {
      await writeFile(join(dir, "ok@1.0.0.json"), "{}", "utf8");
      expect(await verifyArchiveFiles(dir, [{ name: "ok@1.0.0.json", content: "{}" }])).toEqual(
        [],
      );
      const drifted = await verifyArchiveFiles(dir, [{ name: "ok@1.0.0.json", content: "{} " }]);
      expect(drifted.map((d) => d.code)).toEqual(["EMIT_VERIFY_FAILED"]);
      const missing = await verifyArchiveFiles(dir, [{ name: "ghost@1.0.0.json", content: "{}" }]);
      expect(missing.map((d) => d.code)).toEqual(["EMIT_VERIFY_FAILED"]);

      expect(await verifyLockFile(dir, "{\"version\":1}\n")).toEqual([
        expect.objectContaining({ code: "EMIT_VERIFY_FAILED" }),
      ]);
      await writeFile(join(dir, "registry.lock.json"), "{\"version\":1}\n", "utf8");
      expect(await verifyLockFile(dir, "{\"version\":1}\n")).toEqual([]);
      const lockDrift = await verifyLockFile(dir, "{\"version\":1, \"x\": 1}\n");
      expect(lockDrift.map((d) => d.code)).toEqual(["EMIT_VERIFY_FAILED"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("planArchive", () => {
  it("detects immutability violations and missing previous versions", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      const archive = await mkdtemp(join(tmpdir(), "emit-archive-"));
      try {
        // Seed a tampered archived copy of the current version.
        await writeFile(join(archive, "aurora-text@1.0.0.json"), "{tampered}", "utf8");
        const sync = await planArchive(archive, plans, tree);
        expect(sync.diagnostics.map((d) => d.code)).toContain("IMMUTABILITY_VIOLATION");

        // Clean archive: current version pending, previous flagged missing.
        await rm(join(archive, "aurora-text@1.0.0.json"), { force: true });
        const bumped = plans.map((plan) =>
          plan.slug === "aurora-text"
            ? { ...plan, version: "1.0.1", previousVersion: "1.0.0", hash: plan.hash, change: "patch" as const }
            : plan,
        );
        const tree2 = buildTree(items, bumped, GIT_SHA, GENERATED_AT, "0.0.0");
        const sync2 = await planArchive(archive, bumped, tree2);
        expect(sync2.diagnostics.map((d) => d.code)).toContain("ARCHIVE_MISSING_VERSION");
        expect(sync2.pending.map((p) => p.name)).toContain("aurora-text@1.0.1.json");
      } finally {
        await rm(archive, { recursive: true, force: true });
      }
    } finally {
      await rmRegistry(root);
    }
  });

  it("refuses version reuse when the archive holds a higher version", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      const archive = await mkdtemp(join(tmpdir(), "emit-reuse-"));
      try {
        // A retired 2.0.0 lingers in the archive: re-releasing as 1.0.0 is reuse.
        await writeFile(join(archive, "aurora-text@2.0.0.json"), "{}\n", "utf8");
        const sync = await planArchive(archive, plans, tree);
        expect(sync.diagnostics.map((d) => d.code)).toContain("VERSION_REUSE");
      } finally {
        await rm(archive, { recursive: true, force: true });
      }
    } finally {
      await rmRegistry(root);
    }
  });

  it("errors when an unchanged locked version is absent from archive history", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const hash = items[0]?.hash as string;
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: { "aurora-text": { version: "1.2.0", hash } } },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      expect(plans[0]).toMatchObject({ version: "1.2.0", change: "unchanged" });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      const archive = await mkdtemp(join(tmpdir(), "emit-absent-"));
      try {
        // History exists (1.0.0) but the locked 1.2.0 was never archived: gap.
        await writeFile(join(archive, "aurora-text@1.0.0.json"), "{}\n", "utf8");
        const sync = await planArchive(archive, plans, tree);
        expect(sync.diagnostics.map((d) => d.code)).toContain("IMMUTABILITY_VIOLATION");

        // An empty archive (fresh checkout / default CI dir) never errors here.
        await rm(join(archive, "aurora-text@1.0.0.json"), { force: true });
        const fresh = await planArchive(archive, plans, tree);
        expect(fresh.diagnostics.map((d) => d.code)).not.toContain("IMMUTABILITY_VIOLATION");
      } finally {
        await rm(archive, { recursive: true, force: true });
      }
    } finally {
      await rmRegistry(root);
    }
  });
});

describe("planBuild out-of-date", () => {
  it("reports slugs that would change (rows 9-10)", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const hash = items[0]?.hash as string;
      const fresh = planBuild({
        items,
        draftSlugs: new Set(),
        lock: { version: 1, components: {} },
        bumps: new Map(),
        prune: new Set(),
        gitSha: GIT_SHA,
        generatedAt: GENERATED_AT,
      });
      expect(fresh.outOfDate).toEqual(["aurora-text"]);

      const current = planBuild({
        items,
        draftSlugs: new Set(),
        lock: { version: 1, components: { "aurora-text": { version: "1.0.0", hash } } },
        bumps: new Map(),
        prune: new Set(),
        gitSha: GIT_SHA,
        generatedAt: GENERATED_AT,
      });
      expect(current.outOfDate).toEqual([]);
    } finally {
      await rmRegistry(root);
    }
  });
});

describe("writeBuildTree", () => {
  it("creates a missing output parent before staging the atomic write", async () => {
    const root = await mkdtemp(join(tmpdir(), "emit-missing-parent-"));
    try {
      const out = join(root, "missing", "out");
      const tree = { files: new Map([["r/index.json", "{}\n"]]), bytes: 3 };

      expect(await writeBuildTree(out, tree)).toEqual([]);
      expect(await readFile(join(out, "r", "index.json"), "utf8")).toBe("{}\n");
      expect(await readdir(join(root, "missing"))).toEqual(["out"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes atomically and replaces on re-run without leftovers", async () => {
    const { root, items } = await loadModels(componentFiles("aurora-text"));
    try {
      const { plans } = (await import("./versions.js")).planVersions({
        items,
        lock: { version: 1, components: {} },
        bumps: new Map(),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      const tree = buildTree(items, plans, GIT_SHA, GENERATED_AT, "0.0.0");
      const parent = await mkdtemp(join(tmpdir(), "emit-parent-"));
      try {
        const out = join(parent, "out");
        expect(await writeBuildTree(out, tree)).toEqual([]);
        expect(await readFile(join(out, "r", "index.json"), "utf8")).toBe(
          tree.files.get("r/index.json"),
        );

        // Second write replaces the first; no staging/backup dirs remain.
        expect(await writeBuildTree(out, tree)).toEqual([]);
        expect(await readdir(parent)).toEqual(["out"]);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    } finally {
      await rmRegistry(root);
    }
  });
});

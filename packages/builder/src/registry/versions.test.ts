import { describe, expect, it } from "vitest";
import type { RegistryItemModel } from "./index.js";
import type { RegistryLock } from "@algorithco-ui/shared";
import {
  plannedLock,
  planVersions,
  parseLockFile,
  serializeLock,
} from "./versions.js";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function model(slug: string, hash: string): RegistryItemModel {
  return {
    slug,
    meta: {
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
    },
    files: [],
    dependencies: {},
    registryDependencies: [],
    hash,
  };
}

function lock(entries: Record<string, { version: string; hash: string }>): RegistryLock {
  return { version: 1, components: entries };
}

describe("parseLockFile", () => {
  it("parses valid locks", () => {
    const parsed = parseLockFile(JSON.stringify(lock({ ok: { version: "1.0.0", hash: HASH_A } })));
    expect(parsed.ok).toBe(true);
  });

  it.each([["not json", "{bad"], ["bad shape", JSON.stringify({ version: 2, components: {} })]])(
    "rejects %s with LOCK_INVALID",
    (_name, text) => {
      const parsed = parseLockFile(text);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.diagnostic.code).toBe("LOCK_INVALID");
    },
  );
});

describe("serializeLock", () => {
  it("is canonical: sorted keys, 2 spaces, LF, trailing newline", () => {
    const text = serializeLock(lock({ zeta: { version: "1.0.0", hash: HASH_A }, alpha: { version: "2.0.0", hash: HASH_B } }));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.includes("\r")).toBe(false);
    const parsed: unknown = JSON.parse(text);
    expect(typeof parsed === "object" && parsed !== null).toBe(true);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "components" in parsed &&
      typeof parsed.components === "object" &&
      parsed.components !== null
    ) {
      expect(Object.keys(parsed.components)).toEqual(["alpha", "zeta"]);
    }
    expect(text).toBe(`${JSON.stringify({ version: 1, components: { alpha: { version: "2.0.0", hash: HASH_B }, zeta: { version: "1.0.0", hash: HASH_A } } }, null, 2)}\n`);
  });
});

describe("planVersions decision table", () => {
  it("row 1: new slug -> 1.0.0", () => {
    const { plans, diagnostics } = planVersions({
      items: [model("fresh", HASH_A)],
      lock: lock({}),
      bumps: new Map(),
      draftSlugs: new Set(),
      prune: new Set(),
    });
    expect(diagnostics).toEqual([]);
    expect(plans).toEqual([
      { slug: "fresh", version: "1.0.0", previousVersion: undefined, hash: HASH_A, change: "new" },
    ]);
  });

  it("row 2: equal hash keeps version", () => {
    const { plans, diagnostics } = planVersions({
      items: [model("ok", HASH_A)],
      lock: lock({ ok: { version: "1.2.3", hash: HASH_A } }),
      bumps: new Map(),
      draftSlugs: new Set(),
      prune: new Set(),
    });
    expect(diagnostics).toEqual([]);
    expect(plans[0]).toMatchObject({ version: "1.2.3", change: "unchanged" });
  });

  it("row 3: changed hash bumps patch by default, minor/major on request", () => {
    const changed = model("ok", HASH_B);
    const base = {
      items: [changed],
      lock: lock({ ok: { version: "1.2.3", hash: HASH_A } }),
      draftSlugs: new Set<string>(),
      prune: new Set<string>(),
    };
    expect(planVersions({ ...base, bumps: new Map() }).plans[0]).toMatchObject({
      version: "1.2.4",
      change: "patch",
    });
    expect(
      planVersions({ ...base, bumps: new Map([["ok", "minor"]]) }).plans[0],
    ).toMatchObject({ version: "1.3.0", change: "minor" });
    expect(
      planVersions({ ...base, bumps: new Map([["ok", "major"]]) }).plans[0],
    ).toMatchObject({ version: "2.0.0", change: "major" });
  });

  it("row 4: removed entry errors unless pruned", () => {
    const withGhost = lock({ ghost: { version: "1.0.0", hash: HASH_A } });
    const errored = planVersions({
      items: [],
      lock: withGhost,
      bumps: new Map(),
      draftSlugs: new Set(),
      prune: new Set(),
    });
    expect(errored.diagnostics.map((d) => d.code)).toEqual(["LOCK_ENTRY_REMOVED"]);

    const pruned = planVersions({
      items: [],
      lock: withGhost,
      bumps: new Map(),
      draftSlugs: new Set(),
      prune: new Set(["ghost"]),
    });
    expect(pruned.diagnostics).toEqual([]);
    expect(plannedLock(withGhost, [], new Set(["ghost"])).components).toEqual({});
  });

  it("row 5: locked slug now draft errors", () => {
    const { diagnostics } = planVersions({
      items: [],
      lock: lock({ wip: { version: "1.0.0", hash: HASH_A } }),
      bumps: new Map(),
      draftSlugs: new Set(["wip"]),
      prune: new Set(),
    });
    expect(diagnostics.map((d) => d.code)).toEqual(["PUBLISHED_TO_DRAFT"]);
  });

  it("row 6: drafts never enter the lock", () => {
    const { plans } = planVersions({
      items: [],
      lock: lock({}),
      bumps: new Map(),
      draftSlugs: new Set(["wip"]),
      prune: new Set(),
    });
    expect(plans).toEqual([]);
    expect(plannedLock(lock({}), [], new Set()).components).toEqual({});
  });

  it("row 7: inapplicable bumps error", () => {
    const cases: Array<{ bumps: Array<[string, "minor" | "major"]>; label: string }> = [
      { bumps: [["ok", "minor"]], label: "unchanged hash" },
      { bumps: [["ghost", "minor"]], label: "unknown slug" },
    ];
    for (const { bumps } of cases) {
      const { diagnostics } = planVersions({
        items: [model("ok", HASH_A)],
        lock: lock({ ok: { version: "1.0.0", hash: HASH_A } }),
        bumps: new Map(bumps),
        draftSlugs: new Set(),
        prune: new Set(),
      });
      expect(diagnostics.map((d) => d.code)).toContain("BUMP_NOT_APPLICABLE");
    }
    // Bump for a draft slug (in registry but never locked) is not applicable either.
    const { diagnostics } = planVersions({
      items: [],
      lock: lock({}),
      bumps: new Map([["wip", "minor"]]),
      draftSlugs: new Set(["wip"]),
      prune: new Set(),
    });
    expect(diagnostics.map((d) => d.code)).toContain("BUMP_NOT_APPLICABLE");
  });

  it("row 8: invalid current versions error", () => {
    const { diagnostics } = planVersions({
      items: [model("ok", HASH_B)],
      lock: lock({ ok: { version: "not-semver", hash: HASH_A } }),
      bumps: new Map(),
      draftSlugs: new Set(),
      prune: new Set(),
    });
    // Schema-validated locks cannot hold this, but a hand-built one must still fail loudly.
    expect(diagnostics.map((d) => d.code)).toContain("LOCK_INVALID");
  });
});

describe("plannedLock", () => {
  it("merges plans over untouched entries", () => {
    const next = plannedLock(
      lock({ keep: { version: "1.0.0", hash: HASH_A } }),
      [{ slug: "ok", version: "1.0.1", previousVersion: "1.0.0", hash: HASH_B, change: "patch" }],
      new Set(),
    );
    expect(next.components["keep"]).toEqual({ version: "1.0.0", hash: HASH_A });
    expect(next.components["ok"]).toEqual({ version: "1.0.1", hash: HASH_B });
  });
});

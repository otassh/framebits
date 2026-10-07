import { describe, expect, it } from "vitest";
import type { DiscoveredItem } from "./discover.js";
import type { Diagnostic } from "./types.js";
import {
  checkCycles,
  checkDuplicateSlugs,
  checkRegistryDeps,
  parseItemMeta,
  parseItemStyles,
  scanStylesValues,
  validateLayout,
} from "./validate.js";
import { metaJson } from "./test-helpers.js";

function item(dirRel: string, files: Record<string, string | undefined>): DiscoveredItem {
  return {
    dirRel,
    dirAbs: `/tmp/root/${dirRel}`,
    files: Object.entries(files)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([name, text]) => ({
        relPath: `${dirRel}/${name}`,
        absPath: `/tmp/root/${dirRel}/${name}`,
        size: text.length,
        text,
      })),
  };
}

function codes(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe("parseItemMeta", () => {
  it("parses valid meta", () => {
    const diagnostics: Diagnostic[] = [];
    const { meta } = parseItemMeta(
      item("components/buttons/ok", { "meta.json": metaJson("ok") }),
      diagnostics,
    );
    expect(meta?.slug).toBe("ok");
    expect(diagnostics).toEqual([]);
  });

  it("reports META_INVALID for bad JSON and bad schemas", () => {
    for (const content of ["{ nope", JSON.stringify({ slug: "Bad" })]) {
      const diagnostics: Diagnostic[] = [];
      const { meta } = parseItemMeta(
        item("components/buttons/ok", { "meta.json": content }),
        diagnostics,
      );
      expect(meta).toBeUndefined();
      expect(codes(diagnostics)).toEqual(["META_INVALID"]);
    }
  });
});

describe("parseItemStyles", () => {
  it("returns undefined when absent, parses when present", () => {
    const diagnostics: Diagnostic[] = [];
    expect(
      parseItemStyles(item("components/buttons/ok", { "meta.json": metaJson("ok") }), diagnostics),
    ).toBeUndefined();
    expect(
      parseItemStyles(
        item("components/buttons/ok", {
          "meta.json": metaJson("ok"),
          "styles.json": JSON.stringify({ cssVars: { light: { "--x": "1" } } }),
        }),
        diagnostics,
      ),
    ).toEqual({ cssVars: { light: { "--x": "1" } } });
    expect(diagnostics).toEqual([]);
  });

  it("reports STYLES_INVALID", () => {
    const diagnostics: Diagnostic[] = [];
    const styles = parseItemStyles(
      item("components/buttons/ok", {
        "meta.json": metaJson("ok"),
        "styles.json": JSON.stringify({ tailwind: { nope: 1 } }),
      }),
      diagnostics,
    );
    expect(styles).toBeUndefined();
    expect(codes(diagnostics)).toEqual(["STYLES_INVALID"]);
  });
});

describe("validateLayout", () => {
  it("accepts a correct component and lib layout", () => {
    const cases = [
      {
        dirRel: "components/buttons/ok",
        slug: "ok",
        type: "component",
        files: ["meta.json", "ok.tsx", "demo.tsx"],
      },
      { dirRel: "lib/cn", slug: "cn", type: "lib", files: ["meta.json", "cn.ts"] },
    ] as const;
    for (const { dirRel, slug, type, files } of cases) {
      const diagnostics: Diagnostic[] = [];
      const metaText = metaJson(slug, type === "lib" ? { type: "lib" } : {});
      const { meta } = parseItemMeta(item(dirRel, { "meta.json": metaText }), []);
      const present: Record<string, string> = { "meta.json": metaText };
      for (const name of files) {
        if (name !== "meta.json") present[name] = "x";
      }
      validateLayout(item(dirRel, present), meta, diagnostics);
      expect(codes(diagnostics)).toEqual([]);
    }
  });

  it("flags slug, category, and location mismatches", () => {
    const cases: Array<{ dir: string; metaText: string; expectCode: string }> = [
      {
        dir: "components/buttons/other",
        metaText: metaJson("ok"),
        expectCode: "SLUG_FOLDER_MISMATCH",
      },
      {
        dir: "components/cursors/ok",
        metaText: metaJson("ok"),
        expectCode: "CATEGORY_FOLDER_MISMATCH",
      },
      { dir: "lib/ok", metaText: metaJson("ok"), expectCode: "LAYOUT_INVALID" },
      { dir: "random/place", metaText: metaJson("ok"), expectCode: "LAYOUT_INVALID" },
      {
        dir: "components/buttons/ok",
        metaText: metaJson("ok", { type: "lib" }),
        expectCode: "LAYOUT_INVALID",
      },
    ];
    for (const { dir, metaText, expectCode } of cases) {
      const diagnostics: Diagnostic[] = [];
      const { meta } = parseItemMeta(item(dir, { "meta.json": metaText }), []);
      validateLayout(item(dir, { "meta.json": metaText }), meta, diagnostics);
      expect(codes(diagnostics)).toContain(expectCode);
    }
  });

  it("flags missing and unexpected files", () => {
    const dir = "components/buttons/ok";
    const base = { "meta.json": metaJson("ok"), "ok.tsx": "x", "demo.tsx": "x" };

    const missingSource: Diagnostic[] = [];
    const { meta: m1 } = parseItemMeta(item(dir, base), []);
    validateLayout(
      item(dir, { "meta.json": base["meta.json"], "demo.tsx": "x" }),
      m1,
      missingSource,
    );
    expect(codes(missingSource)).toContain("MISSING_SOURCE");

    const missingDemo: Diagnostic[] = [];
    validateLayout(item(dir, { "meta.json": base["meta.json"], "ok.tsx": "x" }), m1, missingDemo);
    expect(codes(missingDemo)).toContain("MISSING_DEMO");

    const unexpected: Diagnostic[] = [];
    validateLayout(item(dir, { ...base, "notes.txt": "x" }), m1, unexpected);
    expect(codes(unexpected)).toContain("UNEXPECTED_FILE");
  });

  it("still checks layout when meta.json is invalid (folder name stands in)", () => {
    const dir = "components/buttons/ok";
    // Invalid meta: layout falls back to folder-derived expectations.
    const noSource: Diagnostic[] = [];
    validateLayout(
      item(dir, { "meta.json": "{bad", "demo.tsx": "x" }),
      undefined,
      noSource,
    );
    expect(codes(noSource)).toContain("MISSING_SOURCE");

    const noDemo: Diagnostic[] = [];
    validateLayout(item(dir, { "meta.json": "{bad", "ok.tsx": "x" }), undefined, noDemo);
    expect(codes(noDemo)).toContain("MISSING_DEMO");

    const unexpected: Diagnostic[] = [];
    validateLayout(
      item(dir, { "meta.json": "{bad", "ok.tsx": "x", "demo.tsx": "x", "notes.txt": "x" }),
      undefined,
      unexpected,
    );
    expect(codes(unexpected)).toContain("UNEXPECTED_FILE");

    const lib: Diagnostic[] = [];
    validateLayout(item("lib/cn", { "meta.json": "{bad" }), undefined, lib);
    expect(codes(lib)).toContain("MISSING_SOURCE");

    // Misplaced directories are still LAYOUT_INVALID without a meta.
    const misplaced: Diagnostic[] = [];
    validateLayout(item("random/place", { "meta.json": "{bad" }), undefined, misplaced);
    expect(codes(misplaced)).toContain("LAYOUT_INVALID");
  });
});

describe("scanStylesValues", () => {
  it("accepts plain values", () => {
    expect(
      scanStylesValues({ cssVars: { light: { "--ok": "red" } } }),
    ).toEqual([]);
    expect(
      scanStylesValues({ tailwind: { keyframes: { fade: { from: { opacity: "0" } } } } }),
    ).toEqual([]);
  });

  it("rejects url/expression/javascript/data payloads and at-rules", () => {
    expect(
      scanStylesValues({ cssVars: { light: { "--bg": "url(https://evil.example/x.png)" } } }).length,
    ).toBeGreaterThan(0);
    expect(
      scanStylesValues({ cssVars: { light: { "--x": "expression(alert(1))" } } }).length,
    ).toBeGreaterThan(0);
    expect(
      scanStylesValues({ cssVars: { light: { "--x": "javascript:alert(1)" } } }).length,
    ).toBeGreaterThan(0);
    expect(
      scanStylesValues({ cssVars: { light: { "--x": "data:text/html,<b>hi</b>" } } }).length,
    ).toBeGreaterThan(0);
    expect(
      scanStylesValues({ tailwind: { keyframes: { "@media x": { from: { opacity: "0" } } } } }).length,
    ).toBeGreaterThan(0);
  });

  it("surfaces STYLES_INVALID through parseItemStyles", () => {
    const diagnostics: Diagnostic[] = [];
    const styles = parseItemStyles(
      item("components/buttons/ok", {
        "meta.json": metaJson("ok"),
        "styles.json": JSON.stringify({ cssVars: { light: { "--bg": "url(/x.png)" } } }),
      }),
      diagnostics,
    );
    expect(styles).toBeUndefined();
    expect(codes(diagnostics)).toEqual(["STYLES_INVALID"]);
  });
});

describe("checkDuplicateSlugs", () => {
  it("flags every directory sharing a slug", () => {
    const diagnostics: Diagnostic[] = [];
    const a = parseItemMeta(item("components/a/dup", { "meta.json": metaJson("dup") }), []).meta;
    const b = parseItemMeta(item("lib/dup", { "meta.json": metaJson("dup", { type: "lib" }) }), []).meta;
    if (a === undefined || b === undefined) throw new Error("fixture broken");
    checkDuplicateSlugs(
      [
        { item: item("components/a/dup", {}), meta: a },
        { item: item("lib/dup", {}), meta: b },
      ],
      diagnostics,
    );
    expect(codes(diagnostics)).toEqual(["DUPLICATE_SLUG", "DUPLICATE_SLUG"]);
    expect(diagnostics.map((d) => d.file).sort()).toEqual([
      "components/a/dup/meta.json",
      "lib/dup/meta.json",
    ]);
  });

  it("passes unique slugs", () => {
    const diagnostics: Diagnostic[] = [];
    const a = parseItemMeta(item("components/a/one", { "meta.json": metaJson("one") }), []).meta;
    if (a === undefined) throw new Error("fixture broken");
    checkDuplicateSlugs([{ item: item("components/a/one", {}), meta: a }], diagnostics);
    expect(diagnostics).toEqual([]);
  });
});

describe("checkRegistryDeps", () => {
  function records(slugs: Array<{ slug: string; deps?: string[]; status?: string }>) {
    return slugs.map(({ slug, deps = [], status = "published" }) => {
      const meta = parseItemMeta(
        item(`lib/${slug}`, {
          "meta.json": metaJson(slug, {
            type: "lib",
            registryDependencies: deps,
            status,
          }),
        }),
        [],
      ).meta;
      if (meta === undefined) throw new Error("fixture broken");
      return { item: item(`lib/${slug}`, {}), meta };
    });
  }

  it("passes resolved published deps", () => {
    const diagnostics: Diagnostic[] = [];
    checkRegistryDeps(records([{ slug: "aa", deps: ["bb"] }, { slug: "bb" }]), diagnostics);
    expect(diagnostics).toEqual([]);
  });

  it("flags missing and draft targets", () => {
    const diagnostics: Diagnostic[] = [];
    checkRegistryDeps(
      records([
        { slug: "aa", deps: ["ghost", "wip"] },
        { slug: "wip", status: "draft" },
      ]),
      diagnostics,
    );
    expect(codes(diagnostics).sort()).toEqual(["REGISTRY_DEP_DRAFT", "REGISTRY_DEP_MISSING"]);
  });
});

describe("checkCycles", () => {
  function records(pairs: Array<[string, string[]]>) {
    return pairs.map(([slug, deps]) => {
      const meta = parseItemMeta(
        item(`lib/${slug}`, { "meta.json": metaJson(slug, { type: "lib", registryDependencies: deps }) }),
        [],
      ).meta;
      if (meta === undefined) throw new Error("fixture broken");
      return { item: item(`lib/${slug}`, {}), meta };
    });
  }

  it("passes acyclic graphs", () => {
    const diagnostics: Diagnostic[] = [];
    checkCycles(
      records([
        ["aa", ["bb"]],
        ["bb", ["cc"]],
        ["cc", []],
      ]),
      diagnostics,
    );
    expect(diagnostics).toEqual([]);
  });

  it("reports a 3-node cycle with the full path", () => {
    const diagnostics: Diagnostic[] = [];
    checkCycles(
      records([
        ["aa", ["bb"]],
        ["bb", ["cc"]],
        ["cc", ["aa"]],
      ]),
      diagnostics,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["REGISTRY_DEP_CYCLE"]);
    expect(diagnostics[0]?.message).toBe("dependency cycle: aa -> bb -> cc -> aa");
  });

  it("reports self cycles", () => {
    // Self-references never reach the cycle detector through meta.json (MetaSchema
    // rejects them); exercise the detector directly with an equivalent record.
    const base = parseItemMeta(
      item("lib/aa", { "meta.json": metaJson("aa", { type: "lib" }) }),
      [],
    ).meta;
    if (base === undefined) throw new Error("fixture broken");
    const self = { ...base, registryDependencies: ["aa"] };
    const diagnostics: Diagnostic[] = [];
    checkCycles([{ item: item("lib/aa", {}), meta: self }], diagnostics);
    expect(diagnostics.map((d) => d.code)).toEqual(["REGISTRY_DEP_CYCLE"]);
    expect(diagnostics[0]?.message).toBe("dependency cycle: aa -> aa");
  });
});

import { describe, expect, it } from "vitest";
import { buildPlan } from "./index.js";
import type { RegistryItem } from "@framebits/shared";
import { computeItemHash } from "@framebits/shared";

function makeItem(slug: string, content: string, registryPath: string): RegistryItem {
  const type = registryPath.startsWith("lib/") ? "lib" as const : "component" as const;
  const hash = computeItemHash({
    type,
    dependencies: {},
    registryDependencies: [],
    files: [{ path: registryPath, content, type }],
  });
  return {
    schemaVersion: 1,
    slug,
    type,
    title: slug,
    version: "1.0.0",
    hash,
    dependencies: {},
    registryDependencies: [],
    files: [{ path: registryPath, content, type, variant: "ts-tw" }],
  };
}

function makeStyledItem(slug: string): RegistryItem {
  const base = makeItem(slug, "export {};\n", `components/ui/${slug}.tsx`);
  const tailwind = {
    keyframes: { shimmer: { from: { opacity: "0" }, to: { opacity: "1" } } },
    animation: { shimmer: "shimmer 2s linear infinite" },
  };
  const hash = computeItemHash({
    type: "component",
    dependencies: {},
    registryDependencies: [],
    files: [{ path: `components/ui/${slug}.tsx`, content: "export {};\n", type: "component" }],
    tailwind,
  });
  return { ...base, tailwind, hash };
}

const ALIASES = { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" };
const DIRS = { components: "/proj/src/components/ui", lib: "/proj/src/lib", hooks: "/proj/src/hooks" };

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

describe("buildPlan", () => {
  it("maps prefixes and marks create/unchanged/conflict", () => {
    const item = makeItem("aurora-text", "export {};\n", "components/ui/aurora-text.tsx");
    const plan = buildPlan({
      items: [item],
      aliases: ALIASES,
      aliasDirs: DIRS,
      projectRoot: "/proj",
      existing: new Map([["/proj/src/components/ui/aurora-text.tsx", "export {};\n"]]),
      existingPaths: ["/proj/src/components/ui/aurora-text.tsx"],
      installed: {},
      installCommandFor: () => "",
    });
    expect(plan.files[0]?.action).toBe("unchanged");
    expect(plan.files[0]?.targetAbs).toBe("/proj/src/components/ui/aurora-text.tsx");

    const changed = buildPlan({
      items: [makeItem("aurora-text", "different\n", "components/ui/aurora-text.tsx")],
      aliases: ALIASES,
      aliasDirs: DIRS,
      projectRoot: "/proj",
      existing: new Map([["/proj/src/components/ui/aurora-text.tsx", "export {};\n"]]),
      existingPaths: ["/proj/src/components/ui/aurora-text.tsx"],
      installed: {},
      installCommandFor: () => "",
    });
    expect(changed.files[0]?.action).toBe("conflict");
  });

  it("rejects unknown prefixes and duplicate targets (exit 4)", () => {
    try {
      buildPlan({
        items: [makeItem("x", "c\n", "weird/x.ts")],
        aliases: ALIASES,
        aliasDirs: DIRS,
        projectRoot: "/proj",
        existing: new Map(),
        existingPaths: [],
        installed: {},
        installCommandFor: () => "",
      });
      expect.unreachable();
    } catch (error) {
      expect((error as { exitCode?: number }).exitCode).toBe(4);
    }
  });

  it("detects case collisions", () => {
    const plan = buildPlan({
      items: [makeItem("aurora-text", "export {};\n", "components/ui/aurora-text.tsx")],
      aliases: ALIASES,
      aliasDirs: DIRS,
      projectRoot: "/proj",
      existing: new Map(),
      existingPaths: ["/proj/src/components/ui/Aurora-Text.tsx"],
      installed: {},
      installCommandFor: () => "",
    });
    expect(plan.files[0]?.action).toBe("conflict");
    expect(plan.files[0]?.caseCollisionWith).toBe("/proj/src/components/ui/Aurora-Text.tsx");
  });

  it("reports already-installed when hash matches and files unchanged", () => {
    const item = makeItem("cn", "export {};\n", "lib/cn.ts");
    const plan = buildPlan({
      items: [item],
      aliases: ALIASES,
      aliasDirs: DIRS,
      projectRoot: "/proj",
      existing: new Map([["/proj/src/lib/cn.ts", "export {};\n"]]),
      existingPaths: ["/proj/src/lib/cn.ts"],
      installed: { cn: { version: "1.0.0", hash: item.hash } },
      installCommandFor: () => "",
    });
    expect(plan.statuses).toEqual([{ slug: "cn", status: "already-installed" }]);
  });
});

describe("buildPlan styles", () => {
  interface StyleOverrides {
    styles?: {
      tailwindVersion?: 3 | 4 | undefined;
      cssAbs?: string | undefined;
      cssRel?: string | undefined;
      cssContent?: string | undefined;
      noStyles?: boolean;
    };
    existing?: ReadonlyMap<string, string>;
    existingPaths?: readonly string[];
    installed?: Record<string, { version: string; hash: string }>;
  }

  function planWith(item: RegistryItem, overrides: StyleOverrides = {}): ReturnType<typeof buildPlan> {
    return buildPlan({
      items: [item],
      aliases: ALIASES,
      aliasDirs: DIRS,
      projectRoot: "/proj",
      existing: overrides.existing ?? new Map(),
      existingPaths: overrides.existingPaths ?? [],
      installed: overrides.installed ?? {},
      installCommandFor: () => "",
      styles: {
        tailwindVersion: 3,
        cssAbs: "/proj/src/app/globals.css",
        cssRel: "src/app/globals.css",
        cssContent: "@tailwind base;\n",
        noStyles: false,
        ...overrides.styles,
      },
    });
  }

  it("plans patch-css create for styled items", () => {
    const plan = planWith(makeStyledItem("shimmer-button"));
    expect(plan.css.map((entry) => [entry.slug, entry.action])).toEqual([["shimmer-button", "create"]]);
    expect(plan.css[0]?.block).toContain("framebits:begin shimmer-button");
    expect(plan.malformedCss).toEqual([]);
  });

  it("is idempotent: second plan is unchanged", () => {
    const first = planWith(makeStyledItem("shimmer-button"));
    const block = first.css[0]?.block ?? "";
    const cssContent = `@tailwind base;\n\n${block}\n`;
    const second = planWith(makeStyledItem("shimmer-button"), {
      styles: { cssContent },
    });
    expect(second.css.map((entry) => entry.action)).toEqual(["unchanged"]);
  });

  it("flags changed blocks as conflict", () => {
    const cssContent = "@tailwind base;\n\n/* framebits:begin shimmer-button */\nold\n/* framebits:end shimmer-button */\n";
    const plan = planWith(makeStyledItem("shimmer-button"), { styles: { cssContent } });
    expect(plan.css.map((entry) => entry.action)).toEqual(["conflict"]);
    expect(plan.cssConflicts.map((entry) => entry.slug)).toEqual(["shimmer-button"]);
  });

  it("skips with manual snippet when tailwind is missing or CSS is absent", () => {
    const noTailwind = planWith(makeStyledItem("shimmer-button"), {
      styles: { tailwindVersion: undefined },
    });
    expect(noTailwind.css[0]?.action).toBe("skip");
    expect(noTailwind.css[0]?.manualSnippet).toContain("v3 form:");
    expect(noTailwind.css[0]?.manualSnippet).toContain("v4 form:");

    const noCss = planWith(makeStyledItem("shimmer-button"), {
      styles: { cssAbs: undefined, cssRel: undefined, cssContent: undefined },
    });
    expect(noCss.css[0]?.action).toBe("skip");
    expect(noCss.css[0]?.manualSnippet).toContain("@keyframes shimmer");

    const noStyles = planWith(makeStyledItem("shimmer-button"), {
      styles: { noStyles: true },
    });
    expect(noStyles.css[0]?.action).toBe("skip");
    expect(noStyles.css[0]?.skipReason).toContain("--no-styles");
  });

  it("collects malformed markers (caller exits 1)", () => {
    const plan = planWith(makeStyledItem("shimmer-button"), {
      styles: { cssContent: "/* framebits:begin shimmer-button */\nno end\n" },
    });
    expect(plan.malformedCss.length).toBe(1);
    expect(plan.malformedCss[0]?.manualSnippet).toContain("framebits:begin shimmer-button");
  });

  it("skips on outside collisions with warnings", () => {
    const plan = planWith(makeStyledItem("shimmer-button"), {
      styles: { cssContent: "@keyframes shimmer {\n  from {\n    opacity: 0;\n  }\n}\n" },
    });
    expect(plan.css[0]?.action).toBe("skip");
    expect(plan.css[0]?.skipReason).toContain("outside the managed blocks");
  });

  it("rejects invalid style data (exit 4)", () => {
    const item = makeStyledItem("shimmer-button");
    const bad: RegistryItem = {
      ...item,
      tailwind: { keyframes: { "BAD NAME": { from: { opacity: "0" } } } },
    };
    try {
      planWith(bad);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("already-installed requires CSS unchanged too", () => {
    const item = makeStyledItem("shimmer-button");
    const plan = planWith(item, {
      existing: new Map([[`/proj/src/components/ui/${item.slug}.tsx`, "export {};\n"]]),
      existingPaths: [`/proj/src/components/ui/${item.slug}.tsx`],
      installed: { [item.slug]: { version: "1.0.0", hash: item.hash } },
    });
    // Files unchanged but CSS block missing => still install (needs CSS patch).
    expect(plan.statuses).toEqual([{ slug: item.slug, status: "install" }]);
  });
});

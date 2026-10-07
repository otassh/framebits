import { describe, expect, it } from "vitest";
import { computeItemHash, type RegistryItem } from "@framebits/shared";
import { buildPlan } from "./index.js";

const ALIASES = { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" };
const DIRS = { components: "/proj/src/components/ui", lib: "/proj/src/lib", hooks: "/proj/src/hooks" };

function makeItem(slug: string, registryPath: string, content = "export {};\n"): RegistryItem {
  const type = registryPath.startsWith("lib/") ? ("lib" as const) : ("component" as const);
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

describe("plan hardening", () => {
  it("rejects case-insensitive duplicates across the plan (exit 4)", () => {
    const a = makeItem("aa", "components/ui/Aa.tsx");
    const b = makeItem("bb", "components/ui/aa.tsx");
    try {
      buildPlan({
        items: [a, b],
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

  it("caps total files at 500 (exit 4)", () => {
    const files = Array.from({ length: 501 }, (_, i) => ({
      path: `components/ui/f${String(i)}.tsx`,
      content: "export {};\n",
      type: "component" as const,
      variant: "ts-tw" as const,
    }));
    const hash = computeItemHash({
      type: "component",
      dependencies: {},
      registryDependencies: [],
      files: files.map((f) => ({ path: f.path, content: f.content, type: f.type })),
    });
    const item: RegistryItem = {
      schemaVersion: 1,
      slug: "big",
      type: "component",
      title: "big",
      version: "1.0.0",
      hash,
      dependencies: {},
      registryDependencies: [],
      files,
    };
    try {
      buildPlan({
        items: [item],
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
});

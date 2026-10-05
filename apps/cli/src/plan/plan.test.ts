import { describe, expect, it } from "vitest";
import { buildPlan } from "./index.js";
import type { RegistryItem } from "@algorithco-ui/shared";
import { computeItemHash } from "@algorithco-ui/shared";

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

const ALIASES = { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" };
const DIRS = { components: "/proj/src/components/ui", lib: "/proj/src/lib", hooks: "/proj/src/hooks" };

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

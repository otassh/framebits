import { describe, expect, it } from "vitest";
import {
  analyzeSource,
  checkImports,
  isBuiltinSpecifier,
  isPeerSpecifier,
  packageNameOf,
  type ImportCheckContext,
} from "./imports.js";

function ctx(overrides: Partial<ImportCheckContext> = {}): ImportCheckContext {
  return {
    file: "components/buttons/ok/ok.tsx",
    declaredDeps: {},
    registryDeps: [],
    knownItems: new Map(),
    ownSource: "ok.tsx",
    demo: false,
    ...overrides,
  };
}

describe("analyzeSource", () => {
  it("collects static, type, export-from, dynamic, and require refs with positions", () => {
    const { imports, syntaxErrors } = analyzeSource(
      `import { a } from "motion";
import type { B } from "./types";
export { x } from "@/lib/cn";
const m = await import("gsap");
const r = require("fs");
`,
      "ok.tsx",
    );
    expect(syntaxErrors).toEqual([]);
    expect(imports.map((ref) => [ref.kind, ref.specifier])).toEqual([
      ["static", "motion"],
      ["type", "./types"],
      ["export-from", "@/lib/cn"],
      ["dynamic", "gsap"],
      ["require", undefined],
    ]);
    expect(imports[0]).toMatchObject({ line: 1, column: 1 });
  });

  it("records non-literal dynamic imports without a specifier", () => {
    const { imports } = analyzeSource(`const name = "x";\nawait import(name);\n`, "ok.tsx");
    expect(imports).toEqual([{ kind: "dynamic", specifier: undefined, line: 2, column: 7 }]);
  });

  it("reports syntax errors with positions", () => {
    const { syntaxErrors } = analyzeSource(`const broken = ;\n`, "ok.tsx");
    expect(syntaxErrors.length).toBeGreaterThan(0);
    expect(syntaxErrors[0]?.line).toBe(1);
  });
});

describe("packageNameOf / peers / builtins", () => {
  it.each([
    ["motion", "motion"],
    ["motion/react", "motion"],
    ["@scope/name", "@scope/name"],
    ["@scope/name/sub", "@scope/name"],
    ["react/jsx-runtime", "react"],
  ])("%s -> %s", (specifier, expected) => {
    expect(packageNameOf(specifier)).toBe(expected);
  });

  it("recognizes peers and subpaths", () => {
    expect(isPeerSpecifier("react")).toBe(true);
    expect(isPeerSpecifier("react-dom/client")).toBe(true);
    expect(isPeerSpecifier("motion")).toBe(false);
  });

  it("recognizes builtins", () => {
    expect(isBuiltinSpecifier("node:fs")).toBe(true);
    expect(isBuiltinSpecifier("fs")).toBe(true);
    expect(isBuiltinSpecifier("motion")).toBe(false);
  });
});

describe("checkImports rules (table)", () => {
  const cases: Array<{
    name: string;
    code: string;
    context?: Partial<ImportCheckContext>;
    expectCode: string | undefined;
  }> = [
    {
      name: "declared package passes",
      code: `import { motion } from "motion";\n`,
      context: { declaredDeps: { motion: "^14.0.0" } },
      expectCode: undefined,
    },
    {
      name: "undeclared package errors",
      code: `import { gsap } from "gsap";\n`,
      expectCode: "IMPORT_UNDECLARED_PACKAGE",
    },
    {
      name: "scoped package with subpath resolved by scope",
      code: `import { x } from "@react-three/fiber";\n`,
      context: { declaredDeps: { "@react-three/fiber": "^8.0.0" } },
      expectCode: undefined,
    },
    {
      name: "motion/react subpath uses declared motion",
      code: `import { motion } from "motion/react";\n`,
      context: { declaredDeps: { motion: "^14.0.0" } },
      expectCode: undefined,
    },
    {
      name: "react peer passes undeclared",
      code: `import { useState } from "react";\n`,
      expectCode: undefined,
    },
    {
      name: "react-dom subpath passes",
      code: `import { createRoot } from "react-dom/client";\n`,
      expectCode: undefined,
    },
    {
      name: "node builtin errors",
      code: `import fs from "node:fs";\n`,
      expectCode: "IMPORT_NODE_BUILTIN",
    },
    {
      name: "bare builtin errors",
      code: `import path from "path";\n`,
      expectCode: "IMPORT_NODE_BUILTIN",
    },
    {
      name: "https import errors",
      code: `import x from "https://example.com/x.js";\n`,
      expectCode: "IMPORT_URL_FORBIDDEN",
    },
    {
      name: "data import errors",
      code: `import x from "data:text/javascript,export default 1";\n`,
      expectCode: "IMPORT_URL_FORBIDDEN",
    },
    {
      name: "valid lib alias passes when declared",
      code: `import { cn } from "@/lib/cn";\n`,
      context: {
        registryDeps: ["cn"],
        knownItems: new Map([["cn", "lib"]]),
      },
      expectCode: undefined,
    },
    {
      name: "alias to missing slug errors",
      code: `import { cn } from "@/lib/cn";\n`,
      expectCode: "IMPORT_ALIAS_TARGET_MISSING",
    },
    {
      name: "alias with wrong type errors",
      code: `import { cn } from "@/lib/cn";\n`,
      context: {
        registryDeps: ["cn"],
        knownItems: new Map([["cn", "hook"]]),
      },
      expectCode: "IMPORT_ALIAS_TARGET_MISSING",
    },
    {
      name: "alias not listed errors",
      code: `import { cn } from "@/lib/cn";\n`,
      context: { knownItems: new Map([["cn", "lib"]]) },
      expectCode: "IMPORT_ALIAS_NOT_DECLARED",
    },
    {
      name: "unknown @/ scope errors",
      code: `import { x } from "@/utils/x";\n`,
      expectCode: "IMPORT_UNKNOWN_ALIAS",
    },
    {
      name: "relative outside files errors",
      code: `import { x } from "../other";\n`,
      expectCode: "IMPORT_RELATIVE_FORBIDDEN",
    },
    {
      name: "relative to css sibling passes",
      code: `import "./ok.css";\n`,
      expectCode: undefined,
    },
    {
      name: "dynamic literal follows package rules",
      code: `await import("gsap");\n`,
      expectCode: "IMPORT_UNDECLARED_PACKAGE",
    },
    {
      name: "dynamic non-literal errors",
      code: `await import(name);\n`,
      expectCode: "IMPORT_DYNAMIC_NONLITERAL",
    },
    {
      name: "require errors",
      code: `const x = require("motion");\n`,
      context: { declaredDeps: { motion: "^14.0.0" } },
      expectCode: "IMPORT_REQUIRE_FORBIDDEN",
    },
    {
      name: "globalThis.require errors",
      code: `const x = globalThis.require("motion");\n`,
      context: { declaredDeps: { motion: "^14.0.0" } },
      expectCode: "IMPORT_REQUIRE_FORBIDDEN",
    },
    {
      name: "window.require errors",
      code: `const x = window.require("motion");\n`,
      context: { declaredDeps: { motion: "^14.0.0" } },
      expectCode: "IMPORT_REQUIRE_FORBIDDEN",
    },
    {
      name: "module.require errors",
      code: `const x = module.require("motion");\n`,
      context: { declaredDeps: { motion: "^14.0.0" } },
      expectCode: "IMPORT_REQUIRE_FORBIDDEN",
    },
    {
      name: "createRequire errors",
      code: `import { createRequire } from "node:module";\nconst r = createRequire(import.meta.url);\n`,
      expectCode: "IMPORT_REQUIRE_FORBIDDEN",
    },
    {
      name: "require.resolve errors",
      code: `const p = require.resolve("motion");\n`,
      context: { declaredDeps: { motion: "^14.0.0" } },
      expectCode: "IMPORT_REQUIRE_FORBIDDEN",
    },
    {
      name: "new (require()) errors",
      code: `const w = new (require("ws"))("wss://x");\n`,
      expectCode: "IMPORT_REQUIRE_FORBIDDEN",
    },
    {
      name: "process.getBuiltinModule errors as a builtin",
      code: `const fs = process.getBuiltinModule("fs");\n`,
      expectCode: "IMPORT_NODE_BUILTIN",
    },
    {
      name: "process.getBuiltinModule with non-literal errors",
      code: `const m = process.getBuiltinModule(name);\n`,
      expectCode: "IMPORT_DYNAMIC_NONLITERAL",
    },
    {
      name: "import.meta.resolve follows package rules",
      code: `await import.meta.resolve("gsap");\n`,
      expectCode: "IMPORT_UNDECLARED_PACKAGE",
    },
    {
      name: "new URL with https errors",
      code: `const u = new URL("https://example.com/x");\n`,
      expectCode: "IMPORT_URL_FORBIDDEN",
    },
    {
      name: "new URL with a relative path passes",
      code: `const u = new URL("./x", import.meta.url);\n`,
      expectCode: undefined,
    },
  ];

  it.each(cases)("$name", ({ code, context, expectCode }) => {
    const { imports } = analyzeSource(code, "ok.tsx");
    const { diagnostics } = checkImports(imports, ctx(context));
    const codes = diagnostics.map((diagnostic) => diagnostic.code);
    if (expectCode === undefined) {
      expect(codes).toEqual([]);
    } else {
      expect(codes).toContain(expectCode);
    }
  });

  it("tracks used packages and registry deps", () => {
    const { imports } = analyzeSource(
      `import { motion } from "motion";\nimport { cn } from "@/lib/cn";\n`,
      "ok.tsx",
    );
    const { usedPackages, usedRegistryDeps } = checkImports(
      imports,
      ctx({ declaredDeps: { motion: "^14.0.0" }, registryDeps: ["cn"], knownItems: new Map([["cn", "lib"]]) }),
    );
    expect([...usedPackages]).toEqual(["motion"]);
    expect([...usedRegistryDeps]).toEqual(["cn"]);
  });

  it("demo forbids aliases", () => {
    const { imports } = analyzeSource(`import { cn } from "@/lib/cn";\n`, "demo.tsx");
    const { diagnostics } = checkImports(
      imports,
      ctx({ demo: true, registryDeps: ["cn"], knownItems: new Map([["cn", "lib"]]) }),
    );
    expect(diagnostics.map((d) => d.code)).toContain("IMPORT_ALIAS_NOT_DECLARED");
  });
});

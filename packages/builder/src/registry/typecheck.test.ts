import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MetaSchema, type Meta } from "@algorithco-ui/shared";
import { loadRegistry } from "./index.js";
import { makeRegistry, metaJson, rmRegistry } from "./test-helpers.js";
import { rewriteDemoImport, runTypecheck, type TypecheckItem } from "./typecheck.js";

function meta(slug: string, overrides: Record<string, unknown> = {}): Meta {
  return MetaSchema.parse(JSON.parse(metaJson(slug, overrides)));
}

function item(
  slug: string,
  files: Record<string, string>,
  overrides: Record<string, unknown> = {},
  demoText?: string,
): TypecheckItem {
  return { meta: meta(slug, overrides), files, demoText };
}

function envTmp(): string {
  return resolve(fileURLToPath(new URL("../../../registry-env/.tmp", import.meta.url)));
}

describe("runTypecheck", () => {
  it("passes a valid item with no diagnostics", async () => {
    const { diagnostics } = await runTypecheck([
      item("ok", {
        "components/ui/ok.tsx": "export function Ok(): null {\n  return null;\n}\n",
      }),
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("maps a real type error to the original file and line", async () => {
    const { diagnostics } = await runTypecheck([
      item("broken", {
        "components/ui/broken.tsx": "export const value: number = \"nope\";\n",
      }),
    ]);
    const errors = diagnostics.filter((d) => d.code === "TYPECHECK_ERROR");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.file).toBe("components/buttons/broken/broken.tsx");
    expect(errors[0]?.line).toBe(1);
    expect(errors[0]?.message).toContain("TS2322");
  });

  it("maps demo errors to demo.tsx and resolves the rewritten import", async () => {
    const { diagnostics } = await runTypecheck([
      {
        meta: meta("ok"),
        files: {
          "components/ui/ok.tsx": "export function Ok(): null {\n  return null;\n}\n",
        },
        demoText: "import { Ok } from \"./ok\";\n\nexport default function Demo(): number {\n  return Ok;\n}\n",
      },
    ]);
    // Demo returns the component (a function) where a number is declared.
    const errors = diagnostics.filter((d) => d.code === "TYPECHECK_ERROR");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.file).toBe("components/buttons/ok/demo.tsx");
  });

  it("flags env range mismatches", async () => {
    const { diagnostics } = await runTypecheck([
      item(
        "ok",
        { "components/ui/ok.tsx": "export const x = 1;\n" },
        { dependencies: { motion: "^99.0.0" } },
      ),
    ]);
    expect(diagnostics.map((d) => d.code)).toContain("TYPECHECK_ENV_RANGE_MISMATCH");
  });

  it("resolves react and motion from the pinned env", async () => {
    const { diagnostics } = await runTypecheck([
      item(
        "ok",
        {
          "components/ui/ok.tsx":
            "import { motion } from \"motion/react\";\nimport { useState } from \"react\";\n\nexport function Ok(): null {\n  const [on] = useState(false);\n  void on;\n  void motion;\n  return null;\n}\n",
        },
        { dependencies: { motion: "^14.0.0" } },
      ),
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("always cleans up its temp directory", async () => {
    await runTypecheck([
      item("ok", { "components/ui/ok.tsx": "export const x = 1;\n" }),
    ]);
    let entries: string[] = [];
    try {
      entries = await readdir(envTmp());
    } catch {
      entries = [];
    }
    expect(entries).toEqual([]);
  });
});

describe("rewriteDemoImport", () => {
  it("rewrites only the own-slug specifier", () => {
    expect(rewriteDemoImport("import { X } from \"./ok\";\n", "ok")).toBe(
      "import { X } from \"../components/ui/ok\";\n",
    );
    expect(rewriteDemoImport("import { X } from './ok';\n", "ok")).toContain("../components/ui/ok");
    expect(rewriteDemoImport("import { Y } from \"./other\";\n", "ok")).toBe(
      "import { Y } from \"./other\";\n",
    );
  });
});

describe("loadRegistry typecheck wiring", () => {
  it("runs typecheck by default and skips with the flag", async () => {
    const root = await makeRegistry({
      "components/buttons/broken/meta.json": metaJson("broken"),
      "components/buttons/broken/broken.tsx": "export const value: number = \"nope\";\n",
      "components/buttons/broken/demo.tsx":
        "import { value } from \"./broken\";\n\nexport default value;\n",
    });
    try {
      const full = await loadRegistry({ registryRoot: root });
      expect(full.diagnostics.map((d) => d.code)).toContain("TYPECHECK_ERROR");
      const skipped = await loadRegistry({ registryRoot: root, skipTypecheck: true });
      expect(skipped.diagnostics.map((d) => d.code)).not.toContain("TYPECHECK_ERROR");
    } finally {
      await rmRegistry(root);
    }
  });
});

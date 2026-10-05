import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { makeRegistry, metaJson, rmRegistry, demoTsx, SIMPLE_TSX } from "./test-helpers.js";

/**
 * End-to-end tests of `pnpm build:registry --check` (packages/builder/src/cli.ts)
 * in a real subprocess against temp registry roots.
 */
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const script = join(repoRoot, "packages", "builder", "src", "cli.ts");

let roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "build-cli-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  if (!existsSync(tsxCli)) {
    throw new Error(`tsx CLI not found at ${tsxCli}`);
  }
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], { encoding: "utf8" });
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

function validComponent(): Record<string, string> {
  return {
    "components/buttons/ok/meta.json": metaJson("ok"),
    "components/buttons/ok/ok.tsx": SIMPLE_TSX,
    "components/buttons/ok/demo.tsx": demoTsx("ok"),
  };
}

describe("packages/builder/src/cli.ts", () => {
  it(
    "checks a valid registry with exit 0 and reports counts",
    async () => {
      const root = await makeRegistry(validComponent());
      roots.push(root);
      const run = runCli(["--check", "--registry-root", root]);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("items: 1 (component: 1");
      expect(run.stdout).toContain("errors: 0, warnings: 0");
      await rmRegistry(root);
      roots = roots.filter((r) => r !== root);
    },
    30000,
  );

  it(
    "exits 1 on errors and supports --json",
    async () => {
      const root = await makeRegistry({
        "components/buttons/ok/meta.json": metaJson("ok"),
        "components/buttons/ok/ok.tsx": `import { gsap } from "gsap";\n`,
        "components/buttons/ok/demo.tsx": demoTsx("ok"),
      });
      roots.push(root);
      const human = runCli(["--check", "--registry-root", root]);
      expect(human.status).toBe(1);
      expect(human.stderr).toContain("IMPORT_UNDECLARED_PACKAGE");
      const machine = runCli(["--check", "--registry-root", root, "--json"]);
      expect(machine.status).toBe(1);
      const report = JSON.parse(machine.stdout) as {
        counts: { errors: number };
        diagnostics: Array<{ code: string }>;
      };
      expect(report.counts.errors).toBeGreaterThan(0);
      expect(report.diagnostics.map((d) => d.code)).toContain("IMPORT_UNDECLARED_PACKAGE");
      await rmRegistry(root);
      roots = roots.filter((r) => r !== root);
    },
    60000,
  );

  it(
    "exits 0 on an empty registry and 2 without --check",
    async () => {
      const root = await makeRoot();
      expect(runCli(["--check", "--registry-root", root]).status).toBe(0);
      expect(runCli(["--check", "--registry-root", root]).stdout).toContain("items: 0");
      expect(runCli([]).status).toBe(2);
      expect(runCli(["--bogus"]).status).toBe(2);
    },
    60000,
  );
});

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * End-to-end test of the `pnpm new-component` wrapper script in a real subprocess
 * (node + the repo's tsx), against a temp registry root. The registry-root override
 * (`--registry-root`) exists for tests only.
 */
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const script = join(repoRoot, "scripts", "new-component.ts");

let roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "scaffold-wrapper-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

function runWrapper(args: string[]): { status: number | null; stdout: string; stderr: string } {
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

describe("scripts/new-component.ts", () => {
  it("scaffolds a component into the given root", async () => {
    const root = await makeRoot();
    const run = runWrapper(["aurora-text", "--category=text-animations", "--registry-root", root]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("aurora-text.tsx");
    expect((await readdir(join(root, "components", "text-animations", "aurora-text"))).sort()).toEqual([
      "aurora-text.tsx",
      "demo.tsx",
      "meta.json",
    ]);
  });

  it("reports conflicts with exit 1 and usage errors with exit 2", async () => {
    const root = await makeRoot();
    expect(
      runWrapper(["aurora-text", "--category=text-animations", "--registry-root", root]).status,
    ).toBe(0);
    expect(
      runWrapper(["aurora-text", "--category=text-animations", "--registry-root", root]).status,
    ).toBe(1);
    expect(runWrapper(["Bad_Slug", "--category=text-animations", "--registry-root", root]).status).toBe(
      1,
    );
    expect(runWrapper([]).status).toBe(2);
    expect(runWrapper(["a", "b", "--registry-root", root]).status).toBe(2);
  });

  it("prints next steps on success", async () => {
    const root = await makeRoot();
    const run = runWrapper(["my-button", "--category=buttons", "--registry-root", root]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("next steps");
    expect(run.stdout).toContain("build:registry");
  });
});

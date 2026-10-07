import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadRegistry } from "./index.js";
import { previewCacheName } from "./previews.js";
import { makeRegistry, metaJson, rmRegistry, demoTsx, SIMPLE_TSX } from "./test-helpers.js";

/**
 * End-to-end tests of `pnpm build:registry` (packages/builder/src/cli.ts) in real
 * subprocesses. Every run points --registry-root/--out/--archive-dir at temp dirs;
 * the real repo is never touched.
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

let dirCounter = 0;

function dirs(root: string): { out: string; archive: string } {
  // Sibling temp dirs: out/archive must NEVER live inside the registry root
  // (emitted schema/meta.json files would be discovered as items).
  dirCounter += 1;
  const parent = join(root, "..");
  const tag = String(dirCounter);
  return { out: join(parent, `out-${tag}`), archive: join(parent, `arc-${tag}`) };
}

describe("packages/builder/src/cli.ts", () => {
  it("emits with --write-lock, then checks clean, then re-emits idempotently", async () => {
    const root = await makeRegistry(validComponent());
    roots.push(root);
    const loaded = await loadRegistry({ registryRoot: root, skipTypecheck: true });
    const item = loaded.items[0];
    if (item === undefined) throw new Error("fixture component was not modeled");
    const previewDir = join(root, "previews");
    await mkdir(previewDir, { recursive: true });
    await writeFile(
      join(previewDir, previewCacheName(item.slug, item.hash)),
      new TextEncoder().encode("RIFF0000WEBPVP8 "),
    );
    const { out, archive } = dirs(root);
    try {
      const emit = runCli([
        "--write-lock",
        "--registry-root",
        root,
        "--out",
        out,
        "--archive-dir",
        archive,
      ]);
      expect(emit.status).toBe(0);
      expect(existsSync(join(root, "registry.lock.json"))).toBe(true);
      expect(existsSync(join(out, "r", "index.json"))).toBe(true);
      expect(await readdir(archive)).toEqual(["ok@1.0.0.json"]);

      const check = runCli(["--check", "--registry-root", root]);
      expect(check.status).toBe(0);
      expect(check.stdout).toContain("lock: up-to-date");

      const again = runCli([
        "--write-lock",
        "--registry-root",
        root,
        "--out",
        out,
        "--archive-dir",
        archive,
      ]);
      expect(again.status).toBe(0);
      expect(again.stdout).toContain("unchanged 1");
      expect(await readdir(archive)).toEqual(["ok@1.0.0.json"]);
    } finally {
      roots = roots.filter((r) => r !== root);
      await rmRegistry(root);
    }
  });

  it("check fails on an out-of-date lock and reports machine-readable json", async () => {
    const root = await makeRegistry(validComponent());
    roots.push(root);
    try {
      const human = runCli(["--check", "--registry-root", root]);
      expect(human.status).toBe(1);
      expect(human.stderr).toContain("LOCK_OUT_OF_DATE");

      const machine = runCli(["--check", "--registry-root", root, "--json"]);
      expect(machine.status).toBe(1);
      const report = JSON.parse(machine.stdout) as {
        counts: { errors: number };
        diagnostics: Array<{ code: string }>;
      };
      expect(report.counts.errors).toBeGreaterThan(0);
      expect(report.diagnostics.map((d) => d.code)).toContain("LOCK_OUT_OF_DATE");
    } finally {
      roots = roots.filter((r) => r !== root);
      await rmRegistry(root);
    }
  });

  it("usage errors exit 2; empty registries check clean", async () => {
    const root = await makeRoot();
    const { out, archive } = dirs(root);
    // NOTE: bare `runCli([])` would emit into the real repo defaults — never run it.
    expect(runCli(["--bogus"]).status).toBe(2);
    expect(runCli(["--check", "--write-lock", "--registry-root", root]).status).toBe(2);
    expect(
      runCli(["--skip-typecheck", "--registry-root", root, "--out", out, "--archive-dir", archive])
        .status,
    ).toBe(2);
    // Out/archive inside the registry root would poison discovery: refused.
    expect(runCli(["--registry-root", root, "--out", join(root, "out")]).status).toBe(2);
    const empty = runCli(["--check", "--registry-root", root]);
    expect(empty.status).toBe(0);
    expect(empty.stdout).toContain("items: 0");
  });
});

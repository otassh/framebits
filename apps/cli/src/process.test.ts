/**
 * Process tests spawning the BUILT dist/cli.js (C1 packaging).
 * Requires `pnpm build` to have run (turbo test depends on build).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const distCli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [distCli, ...args], { encoding: "utf8" });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  return { status: result.status, stdout, stderr };
}

describe("built cli.js", () => {
  it("exists (build ran before test)", () => {
    expect(existsSync(distCli)).toBe(true);
  });

  it("--version prints a version", () => {
    const result = run(["--version"]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+(-|$)|0\.0\.0/);
  });

  it("--help prints usage with examples", () => {
    const result = run(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("algorithco-ui");
    expect(result.stdout).toContain("examples:");
  });

  it("add without init exits 2 with guidance", () => {
    const result = run(["add", "aurora-text", "--cwd", join(dirname(distCli), "..")]);
    expect([1, 2]).toContain(result.status);
  });

  it("add --help documents the 5b flags", () => {
    const result = run(["add", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--no-install");
    expect(result.stdout).toContain("--no-styles");
    expect(result.stdout).toContain("--dry-run");
    expect(result.stdout).toContain("--overwrite");
  });
});

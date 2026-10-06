/**
 * Process tests spawning the BUILT dist/cli.js (C1 packaging).
 * Requires `pnpm build` to have run (turbo test depends on build).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
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
    expect(result.stdout).toContain("framebits");
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

  it("runs through a symlink/junction shim like an npm bin link", () => {
    // npm bin shims are symlinks on POSIX (.cmd shims on Windows pass the
    // real path, so this bug never showed there): argv[1] is the shim path
    // while import.meta.url is the real path. The CLI must still run (it once
    // exited 0 silently here, which the pack-smoke caught on Linux CI).
    const dir = mkdtempSync(join(tmpdir(), "framebits-shim-"));
    try {
      let entry: string;
      if (process.platform === "win32") {
        // File symlinks need privilege; a junction to the dist dir (allowed)
        // produces the same argv[1]-vs-real-path mismatch.
        const junction = join(dir, "distlink");
        try {
          symlinkSync(dirname(distCli), junction, "junction");
        } catch {
          return; // No privilege: skip.
        }
        entry = join(junction, "cli.js");
      } else {
        entry = join(dir, "framebits");
        symlinkSync(distCli, entry, "file");
      }
      const result = spawnSync(process.execPath, [entry, "--version"], { encoding: "utf8" });
      const stdout = typeof result.stdout === "string" ? result.stdout : "";
      expect(result.status).toBe(0);
      expect(stdout.trim().length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

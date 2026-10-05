#!/usr/bin/env node
/* global process */
/**
 * Packaging smoke test (C1): pnpm pack -> install the tarball into a clean
 * temp dir with npm -> run `algorithco-ui --version` and `--help`.
 * Also tests via npx-style invocation of the tarball.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${stdout}\n${stderr}`);
  }
  return { stdout, stderr };
}

const packDir = mkdtempSync(join(tmpdir(), "cli-pack-"));
const installDir = mkdtempSync(join(tmpdir(), "cli-install-"));
try {
  execFileSync("pnpm", ["pack", "--pack-destination", packDir], { cwd: root, stdio: "inherit" });
  const tarballs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
  if (tarballs.length === 0) throw new Error("no tarball produced by pnpm pack");
  const first = tarballs[0];
  if (first === undefined) throw new Error("no tarball produced by pnpm pack");
  const tarball = join(packDir, first);
  run("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: installDir });
  const bin = join(
    installDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "algorithco-ui.cmd" : "algorithco-ui",
  );
  const direct = join(installDir, "node_modules", "algorithco-ui", "dist", "cli.js");
  const target = existsSync(bin) ? bin : direct;
  run(process.execPath, [target, "--version"]);
  run(process.execPath, [target, "--help"]);
  run("npm", ["exec", "--yes", "--package", tarball, "--", "algorithco-ui", "--version"], {
    cwd: installDir,
  });
  process.stdout.write("cli pack smoke: OK\n");
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(installDir, { recursive: true, force: true });
}

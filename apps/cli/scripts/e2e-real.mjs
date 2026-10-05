#!/usr/bin/env node
/* global process, URL */
/**
 * Real end-to-end test (Task 5b, NOT hermetic): builds the registry, serves it
 * locally, scaffolds REAL projects from the network, runs the BUILT CLI, and
 * verifies installs, typechecks, production builds, built CSS, and no-op
 * re-adds. Triggered manually or weekly (see .github/workflows/e2e-real.yml).
 *
 * Pinned versions (verified 2026-10-05; exact pins stay installable):
 *   create-next-app@16.3.8, vite@8.3.2 (via npm create), tailwindcss@3.4.19,
 *   postcss@8.5.29, autoprefixer@10.6.1
 */
import spawn from "cross-spawn";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PINS = {
  createNextApp: "16.3.8",
  vite: "8.3.2",
  tailwind3: "3.4.19",
  postcss: "8.5.29",
  autoprefixer: "10.6.1",
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cliJs = join(repoRoot, "apps", "cli", "dist", "cli.js");

function log(message) {
  process.stdout.write(`${message}\n`);
}

function run(cmd, args, options) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const result = spawn.sync(cmd, args, { encoding: "utf8", ...options });
  const stdout = typeof result.stdout === "string" ? result.stdout : String(result.stdout ?? "");
  const stderr = typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? "");
  if (result.status !== 0) {
    throw new Error(`${cmd} failed (${result.status}):\n${stdout}\n${stderr}`);
  }
  return { stdout, stderr };
}

function assertExists(path, label) {
  if (!existsSync(path)) throw new Error(`missing ${label}: ${path}`);
  log(`ok: ${label} exists`);
}

function findFiles(dir, suffix, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) findFiles(abs, suffix, out);
    else if (entry.name.endsWith(suffix)) out.push(abs);
  }
  return out;
}

function startRegistryServer(registryOut) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const key = url.pathname.replace(/^\/+/, "");
    const file = join(registryOut, ...key.split("/"));
    try {
      const text = readFileSync(file, "utf8");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(text);
    } catch {
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolvePromise({ server, url: `http://127.0.0.1:${String(port)}/r` });
    });
  });
}

function verifyCommon(projDir, label, cssFiles) {
  for (const dep of ["motion", "clsx", "tailwind-merge"]) {
    assertExists(join(projDir, "node_modules", dep), `${label} node_modules/${dep}`);
  }
  const cssHits = cssFiles.filter((file) => readFileSync(file, "utf8").includes("@keyframes shimmer"));
  if (cssHits.length === 0) throw new Error(`${label}: built CSS has no @keyframes shimmer`);
  log(`ok: ${label} built CSS contains @keyframes shimmer (${cssHits.join(", ")})`);
  const utilHits = cssFiles.filter((file) => {
    const text = readFileSync(file, "utf8");
    return text.includes(".animate-shimmer") || text.includes("--animate-shimmer");
  });
  if (utilHits.length === 0) throw new Error(`${label}: built CSS has no animate-shimmer utility/variable`);
  log(`ok: ${label} built CSS contains the animation class/variable`);
}

function verifyNoOp(projDir, label, registryUrl) {
  run("git", ["init"], { cwd: projDir });
  run("git", ["-c", "user.email=e2e@local", "-c", "user.name=e2e", "add", "-A", "--", ".", ":!node_modules", ":!.next", ":!dist"], { cwd: projDir });
  run("git", ["-c", "user.email=e2e@local", "-c", "user.name=e2e", "commit", "-m", "e2e baseline"], { cwd: projDir });
  run(process.execPath, [cliJs, "add", "--yes", "aurora-text", "shimmer-button", "--cwd", projDir, "--registry", registryUrl], { cwd: projDir });
  run("git", ["diff", "--exit-code"], { cwd: projDir });
  const status = run("git", ["status", "--porcelain"], { cwd: projDir });
  if (status.stdout.trim() !== "") throw new Error(`${label}: second add is not a no-op:\n${status.stdout}`);
  log(`ok: ${label} second add changes nothing (git diff clean)`);
}

async function scenarioNext(workRoot, registryUrl) {
  const projDir = join(workRoot, "e2e-next");
  log(`--- scenario: Next.js app router + src + Tailwind v4 (${projDir}) ---`);
  run("npx", ["-y", `create-next-app@${PINS.createNextApp}`, "e2e-next", "--typescript", "--tailwind", "--eslint", "--app", "--src-dir", "--import-alias", "@/*", "--use-npm"], { cwd: workRoot, timeout: 600000 });
  run(process.execPath, [cliJs, "init", "--yes", "--cwd", projDir], { cwd: projDir });
  run(process.execPath, [cliJs, "add", "--yes", "aurora-text", "shimmer-button", "--cwd", projDir, "--registry", registryUrl], { cwd: projDir, timeout: 600000 });
  run(join(projDir, "node_modules", ".bin", "tsc"), ["--noEmit", "-p", "tsconfig.json"], { cwd: projDir, timeout: 300000 });
  log("ok: next tsc --noEmit passes");
  run("npm", ["run", "build"], { cwd: projDir, timeout: 600000 });
  log("ok: next build passes");
  const cssFiles = findFiles(join(projDir, ".next", "static", "css"), ".css", []);
  if (cssFiles.length === 0) throw new Error("next: no built CSS found");
  verifyCommon(projDir, "next", cssFiles);
  verifyNoOp(projDir, "next", registryUrl);
}

async function scenarioVite(workRoot, registryUrl) {
  const projDir = join(workRoot, "e2e-vite");
  log(`--- scenario: Vite React-TS + Tailwind v3 (${projDir}) ---`);
  run("npm", ["create", `vite@${PINS.vite}`, "e2e-vite", "--", "--template", "react-ts"], { cwd: workRoot, timeout: 300000 });
  run("npm", ["install"], { cwd: projDir, timeout: 600000 });
  run("npm", ["install", "-D", `tailwindcss@${PINS.tailwind3}`, `postcss@${PINS.postcss}`, `autoprefixer@${PINS.autoprefixer}`], { cwd: projDir, timeout: 600000 });
  writeFileSync(join(projDir, "tailwind.config.js"), "/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: [\"./index.html\", \"./src/**/*.{ts,tsx}\"],\n  theme: { extend: {} },\n  plugins: [],\n};\n");
  writeFileSync(join(projDir, "postcss.config.js"), "module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n");
  writeFileSync(join(projDir, "src", "index.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  const tsconfigApp = join(projDir, "tsconfig.app.json");
  const tsconfigText = readFileSync(tsconfigApp, "utf8");
  const tsconfig = JSON.parse(tsconfigText);
  tsconfig.compilerOptions = tsconfig.compilerOptions ?? {};
  tsconfig.compilerOptions.baseUrl = ".";
  tsconfig.compilerOptions.paths = { "@/*": ["./src/*"] };
  writeFileSync(tsconfigApp, `${JSON.stringify(tsconfig, null, 2)}\n`);
  run(process.execPath, [cliJs, "init", "--yes", "--cwd", projDir], { cwd: projDir });
  run(process.execPath, [cliJs, "add", "--yes", "aurora-text", "shimmer-button", "--cwd", projDir, "--registry", registryUrl], { cwd: projDir, timeout: 600000 });
  run("npm", ["run", "build"], { cwd: projDir, timeout: 600000 });
  log("ok: vite build (tsc -b + vite build) passes");
  const cssFiles = findFiles(join(projDir, "dist", "assets"), ".css", []);
  if (cssFiles.length === 0) throw new Error("vite: no built CSS found");
  verifyCommon(projDir, "vite", cssFiles);
  verifyNoOp(projDir, "vite", registryUrl);
}

async function main() {
  const scenario = process.argv[2] ?? "all";
  log(`e2e-real pins: ${JSON.stringify(PINS)}`);
  run("pnpm", ["--filter", "algorithco-ui", "build"], { cwd: repoRoot, timeout: 300000 });
  const regOut = mkdtempSync(join(tmpdir(), "e2e-reg-"));
  const regArchive = mkdtempSync(join(tmpdir(), "e2e-archive-"));
  const workRoot = mkdtempSync(join(tmpdir(), "e2e-work-"));
  log(`registry out: ${regOut}`);
  try {
    run("pnpm", ["build:registry", "--out", regOut, "--archive-dir", regArchive], { cwd: repoRoot, timeout: 600000 });
    const { server, url } = await startRegistryServer(regOut);
    log(`registry: ${url}`);
    try {
      if (scenario === "all" || scenario === "next") await scenarioNext(workRoot, url);
      if (scenario === "all" || scenario === "vite") await scenarioVite(workRoot, url);
    } finally {
      server.close();
    }
    log("e2e-real: ALL GREEN");
  } finally {
    rmSync(regOut, { recursive: true, force: true });
    rmSync(regArchive, { recursive: true, force: true });
    rmSync(workRoot, { recursive: true, force: true });
  }
}

main().then(
  () => undefined,
  (error) => {
    process.stderr.write(`e2e-real FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);

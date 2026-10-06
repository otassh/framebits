#!/usr/bin/env node
/* global process, URL, setTimeout, clearTimeout */
/**
 * Real end-to-end test (Task 5b, NOT hermetic): builds the registry, serves it
 * locally, scaffolds REAL projects from the network, runs the BUILT CLI, and
 * verifies installs, typechecks, production builds, built CSS, and no-op
 * re-adds. Triggered manually or weekly (see .github/workflows/e2e-real.yml).
 *
 * Pinned versions (verified 2026-10-05; exact pins stay installable):
 *   create-next-app@16.3.8, create-vite@9.2.1 (via npm create),
 *   tailwindcss@3.4.19, postcss@8.5.29, autoprefixer@10.6.1
 */
import spawn from "cross-spawn";
import { createServer } from "node:http";
import { parse as parseJsonc } from "jsonc-parser";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PINS = {
  createNextApp: "16.3.8",
  createVite: "9.2.1",
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
  log(`[pid=${String(process.pid)} t=${Date.now()}] $ ${cmd} ${args.join(" ")}`);
  const settings = options ?? {};
  const timeout = typeof settings.timeout === "number" ? settings.timeout : 0;
  const spawnSettings = { ...settings };
  delete spawnSettings.timeout;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, spawnSettings);
    let stdout = "";
    let stderr = "";
    let done = false;
    let timer = null;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      if (error !== undefined) reject(error);
      else resolvePromise(result);
    };
    if (child.stdout !== null && child.stdout !== undefined) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }
    if (child.stderr !== null && child.stderr !== undefined) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }
    child.on("error", (error) => {
      finish(new Error(`${cmd} failed to start: ${error.message}`), undefined);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(`${cmd} failed (${String(code)}):\n${stdout}\n${stderr}`), undefined);
      } else {
        finish(undefined, { stdout, stderr });
      }
    });
    if (timeout > 0) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Already exited.
        }
        finish(new Error(`${cmd} timed out after ${String(timeout)}ms`), undefined);
      }, timeout);
    }
  });
}

function assertExists(path, label) {
  if (!existsSync(path)) throw new Error(`missing ${label}: ${path}`);
  log(`ok: ${label} exists`);
}

function findFiles(dir, suffix, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
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
  for (const dep of [
    "motion",
    "clsx",
    "tailwind-merge",
    "three",
    "@types/three",
    "@react-three/fiber",
  ]) {
    assertExists(join(projDir, "node_modules", dep), `${label} node_modules/${dep}`);
  }
  assertExists(
    join(projDir, "src", "components", "ui", "framebits-logo-3d.tsx"),
    `${label} FrameBitsLogo3D component`,
  );
  const cssHits = cssFiles.filter((file) =>
    readFileSync(file, "utf8").includes("@keyframes shimmer"),
  );
  if (cssHits.length === 0) throw new Error(`${label}: built CSS has no @keyframes shimmer`);
  log(`ok: ${label} built CSS contains @keyframes shimmer (${cssHits.join(", ")})`);
  const utilHits = cssFiles.filter((file) => {
    const text = readFileSync(file, "utf8");
    return text.includes(".animate-shimmer") || text.includes("--animate-shimmer");
  });
  if (utilHits.length === 0)
    throw new Error(`${label}: built CSS has no animate-shimmer utility/variable`);
  log(`ok: ${label} built CSS contains the animation class/variable`);
}

function snapshotProject(dir) {
  const entries = [];
  const walk = (current, rel) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".next" ||
        entry.name === "dist"
      )
        continue;
      const abs = join(current, entry.name);
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(abs, relPath);
      else entries.push([relPath, readFileSync(abs, "utf8")]);
    }
  };
  walk(dir, "");
  entries.sort(([a], [b]) => (a < b ? -1 : 1));
  return entries;
}

async function removeRecursive(dir, attempts) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    if (attempts <= 1) throw error;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    await removeRecursive(dir, attempts - 1);
  }
}

async function verifyNoOp(projDir, label, registryUrl) {
  log(`verifyNoOp enter ${label}`);
  // Primary assertion: byte-exact snapshot equality (no git quirks involved).
  const before = snapshotProject(projDir);
  await run(
    process.execPath,
    [
      cliJs,
      "add",
      "--yes",
      "aurora-text",
      "shimmer-button",
      "framebits-logo-3d",
      "--cwd",
      projDir,
      "--registry",
      registryUrl,
    ],
    { cwd: projDir },
  );
  const after = snapshotProject(projDir);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`${label}: second add is not a no-op (project snapshot differs)`);
  }
  log(`ok: ${label} second add changes nothing (snapshot equality)`);
  // Secondary: real `git diff` cleanliness, as specified.
  writeFileSync(join(projDir, ".gitignore"), "node_modules/\ndist/\n.next/\n");
  await run("git", ["init"], { cwd: projDir });
  await run("git", ["add", "-A"], { cwd: projDir });
  await run(
    "git",
    ["-c", "user.email=e2e@local", "-c", "user.name=e2e", "commit", "-m", "e2e baseline"],
    { cwd: projDir },
  );
  await run(
    process.execPath,
    [
      cliJs,
      "add",
      "--yes",
      "aurora-text",
      "shimmer-button",
      "framebits-logo-3d",
      "--cwd",
      projDir,
      "--registry",
      registryUrl,
    ],
    { cwd: projDir },
  );
  await run("git", ["diff", "--exit-code"], { cwd: projDir });
  const status = await run("git", ["status", "--porcelain"], { cwd: projDir });
  if (status.stdout.trim() !== "")
    throw new Error(`${label}: second add is not a no-op:\n${status.stdout}`);
  log(`ok: ${label} second add changes nothing (git diff clean)`);
}

async function scenarioNext(workRoot, registryUrl) {
  const projDir = join(workRoot, "e2e-next");
  log(`--- scenario: Next.js app router + src + Tailwind v4 (${projDir}) ---`);
  await run(
    "npx",
    [
      "-y",
      `create-next-app@${PINS.createNextApp}`,
      "e2e-next",
      "--typescript",
      "--tailwind",
      "--eslint",
      "--app",
      "--src-dir",
      "--import-alias",
      "@/*",
      "--use-npm",
    ],
    { cwd: workRoot, timeout: 600000 },
  );
  await run(process.execPath, [cliJs, "init", "--yes", "--cwd", projDir], { cwd: projDir });
  await run(
    process.execPath,
    [
      cliJs,
      "add",
      "--yes",
      "aurora-text",
      "shimmer-button",
      "framebits-logo-3d",
      "--cwd",
      projDir,
      "--registry",
      registryUrl,
    ],
    { cwd: projDir, timeout: 600000 },
  );
  writeFileSync(
    join(projDir, "src", "app", "page.tsx"),
    '"use client";\n\nimport { FrameBitsLogo3D } from "@/components/ui/framebits-logo-3d";\n\nexport default function Home() {\n  return (\n    <main style={{ minHeight: "100vh", background: "#050505" }}>\n      <FrameBitsLogo3D quality="low" intro={false} style={{ height: "100vh" }} />\n    </main>\n  );\n}\n',
  );
  await run(join(projDir, "node_modules", ".bin", "tsc"), ["--noEmit", "-p", "tsconfig.json"], {
    cwd: projDir,
    timeout: 300000,
  });
  log("ok: next tsc --noEmit passes");
  await run("npm", ["run", "build"], { cwd: projDir, timeout: 600000 });
  log("ok: next build passes");
  // Next 16 may emit CSS under .next/static/css (webpack) or elsewhere
  // (Turbopack); search broadly and report the layout when missing.
  let cssFiles = findFiles(join(projDir, ".next", "static"), ".css", []);
  if (cssFiles.length === 0) {
    cssFiles = findFiles(join(projDir, ".next"), ".css", []);
  }
  if (cssFiles.length === 0) {
    let layout = "(unreadable)";
    try {
      layout = readdirSync(join(projDir, ".next")).join(",");
    } catch {
      // Keep the placeholder.
    }
    throw new Error(`next: no built CSS found (.next contains: ${layout})`);
  }
  verifyCommon(projDir, "next", cssFiles);
  await verifyNoOp(projDir, "next", registryUrl);
}

async function scenarioVite(workRoot, registryUrl) {
  const projDir = join(workRoot, "e2e-vite");
  log(`--- scenario: Vite React-TS + Tailwind v3 (${projDir}) ---`);
  await run(
    "npm",
    ["create", `vite@${PINS.createVite}`, "e2e-vite", "--", "--template", "react-ts"],
    { cwd: workRoot, timeout: 300000 },
  );
  await run("npm", ["install"], { cwd: projDir, timeout: 600000 });
  await run(
    "npm",
    [
      "install",
      "-D",
      `tailwindcss@${PINS.tailwind3}`,
      `postcss@${PINS.postcss}`,
      `autoprefixer@${PINS.autoprefixer}`,
    ],
    { cwd: projDir, timeout: 600000 },
  );
  writeFileSync(
    join(projDir, "tailwind.config.js"),
    '/** @type {import(\'tailwindcss\').Config} */\nexport default {\n  content: ["./index.html", "./src/**/*.{ts,tsx}"],\n  theme: { extend: {} },\n  plugins: [],\n};\n',
  );
  writeFileSync(
    join(projDir, "postcss.config.js"),
    "export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n",
  );
  writeFileSync(
    join(projDir, "src", "index.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  );
  const tsconfigApp = join(projDir, "tsconfig.app.json");
  const tsconfigText = readFileSync(tsconfigApp, "utf8");
  const tsconfig = parseJsonc(tsconfigText);
  tsconfig.compilerOptions = tsconfig.compilerOptions ?? {};
  // Note: no baseUrl (deprecated in TS 7 templates). paths alone resolves
  // relative to tsconfig.app.json, which is what our alias detection expects.
  tsconfig.compilerOptions.paths = { "@/*": ["./src/*"] };
  writeFileSync(tsconfigApp, `${JSON.stringify(tsconfig, null, 2)}\n`);
  await run(process.execPath, [cliJs, "init", "--yes", "--cwd", projDir], { cwd: projDir });
  await run(
    process.execPath,
    [
      cliJs,
      "add",
      "--yes",
      "aurora-text",
      "shimmer-button",
      "framebits-logo-3d",
      "--cwd",
      projDir,
      "--registry",
      registryUrl,
    ],
    { cwd: projDir, timeout: 600000 },
  );
  writeFileSync(
    join(projDir, "src", "App.tsx"),
    'import { FrameBitsLogo3D } from "./components/ui/framebits-logo-3d";\n\nexport default function App() {\n  return (\n    <main style={{ minHeight: "100vh", background: "#050505" }}>\n      <FrameBitsLogo3D quality="low" intro={false} style={{ height: "100vh" }} />\n    </main>\n  );\n}\n',
  );
  await run("npm", ["run", "build"], { cwd: projDir, timeout: 600000 });
  log("ok: vite build (tsc -b + vite build) passes");
  const cssFiles = findFiles(join(projDir, "dist", "assets"), ".css", []);
  if (cssFiles.length === 0) throw new Error("vite: no built CSS found");
  verifyCommon(projDir, "vite", cssFiles);
  await verifyNoOp(projDir, "vite", registryUrl);
}

async function main() {
  const scenario = process.argv[2] ?? "all";
  log(`e2e-real pins: ${JSON.stringify(PINS)}`);
  await run("pnpm", ["--filter", "@framebits/cli", "build"], {
    cwd: repoRoot,
    timeout: 300000,
  });
  const regOut = mkdtempSync(join(tmpdir(), "e2e-reg-"));
  const regArchive = mkdtempSync(join(tmpdir(), "e2e-archive-"));
  const workRoot = mkdtempSync(join(tmpdir(), "e2e-work-"));
  log(`registry out: ${regOut}`);
  try {
    await run("pnpm", ["build:registry", "--out", regOut, "--archive-dir", regArchive], {
      cwd: repoRoot,
      timeout: 600000,
    });
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
    await removeRecursive(regOut, 3);
    await removeRecursive(regArchive, 3);
    await removeRecursive(workRoot, 5);
  }
}

main().then(
  () => undefined,
  (error) => {
    process.stderr.write(
      `e2e-real FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);

process.on("unhandledRejection", (reason) => {
  process.stderr.write(
    `e2e-real UNHANDLED REJECTION: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}\n`,
  );
  process.exitCode = 1;
});

#!/usr/bin/env node
/* global process, URL, setTimeout, clearTimeout */
/**
 * Packaging smoke test (C1 + publishability): pnpm pack -> inspect the tarball
 * (file list must be package.json/README/LICENSE/dist only; the bundled dist/cli.js
 * must not reference @framebits/* at runtime) -> install the tarball into a
 * clean temp dir with npm -> run `framebits --version` and `--help` (direct
 * node invocation and npx-style) -> build a real registry with the builder,
 * serve it over local http, init a fixture project with the packed binary and
 * run `framebits add aurora-text --dry-run` (exit 0, project untouched).
 *
 * Public organization-scoped package (MIT, version 0.1.0): this script
 * never publishes. It only packs and installs locally. The LICENSE in the
 * tarball is the generated copy staged by `prepack` (scripts/copy-license.mjs).
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..");
const isWindows = process.platform === "win32";

function quoteArg(arg) {
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function childEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  // The smoke intentionally performs REAL local side effects (pack to a temp
  // dir, clean-room install) even when it runs inside `npm publish --dry-run`
  // via `prepublishOnly`: npm exports `npm_config_dry_run=true` to lifecycle
  // children, and npm/pnpm CLIs honor it (no tarball written, no install).
  // Strip it so the smoke always exercises the real path. Nothing here
  // publishes; the outer `--dry-run` still prevents the actual upload.
  for (const key of Object.keys(env)) {
    if (/^npm_config_dry[-_]run$/i.test(key)) delete env[key];
  }
  return env;
}

function runSh(command, args, options = {}) {
  // pnpm/npm resolve to .CMD/.ps1 shims on Windows, which cannot be spawned
  // directly (EINVAL/ENOENT); run them through the shell on every platform so
  // this smoke test behaves the same locally and on CI.
  const line = [command, ...args].map(quoteArg).join(" ");
  const result = spawnSync(line, {
    encoding: "utf8",
    timeout: 600000,
    ...options,
    shell: true,
    env: childEnv(options.env ?? {}),
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (result.status !== 0) {
    throw new Error(`${line} failed (${result.status}): ${stdout}\n${stderr}`);
  }
  return { stdout, stderr };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    ...options,
    env: {
      ...process.env,
      FRAMEBITS_TELEMETRY: "0",
      DO_NOT_TRACK: "1",
      CI: "1",
      ...(options.env ?? {}),
    },
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${stdout}\n${stderr}`);
  }
  return { stdout, stderr };
}

function runAsync(command, args, options = {}) {
  // Async spawn: unlike spawnSync this does NOT block the event loop, so the
  // local static registry server above keeps answering while the packed CLI
  // runs. (Blocking the loop deadlocks init/add against our own server.)
  const { timeout = 120000, ...spawnOptions } = options;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      ...spawnOptions,
      env: {
        ...process.env,
        FRAMEBITS_TELEMETRY: "0",
        DO_NOT_TRACK: "1",
        CI: "1",
        ...(spawnOptions.env ?? {}),
      },
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout !== null) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }
    if (child.stderr !== null) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }
    const timer = setTimeout(() => {
      child.kill();
      rejectPromise(new Error(`${command} ${args.join(" ")} timed out after ${String(timeout)}ms`));
    }, timeout);
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rejectPromise(
          new Error(`${command} ${args.join(" ")} failed (${String(code)}): ${stdout}\n${stderr}`),
        );
      } else {
        resolvePromise({ stdout, stderr });
      }
    });
  });
}

function listFilesRecursive(dir) {
  const out = [];
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const abs = join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(relative(dir, abs));
    }
  }
  walk(dir);
  return out;
}

function snapshotDir(dir) {
  const files = listFilesRecursive(dir);
  const snapshot = new Map();
  for (const rel of files) {
    try {
      snapshot.set(rel, readFileSync(join(dir, rel), "utf8"));
    } catch {
      // Ignore unreadable entries.
    }
  }
  return snapshot;
}

function snapshotsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

function serveDirectory(webRoot) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const key = url.pathname.replace(/^\/+/, "");
    const file = join(webRoot, ...key.split("/"));
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(text);
  });
  return new Promise((resolveServer, rejectServer) => {
    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null && "port" in address ? address.port : 0;
      if (typeof port !== "number" || port === 0) {
        rejectServer(new Error("static server got no port"));
        return;
      }
      resolveServer({ server, baseUrl: `http://127.0.0.1:${String(port)}/r` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => {
    server.close(() => {
      resolveClose();
    });
  });
}

const packDir = mkdtempSync(join(tmpdir(), "cli-pack-"));
const installDir = mkdtempSync(join(tmpdir(), "cli-install-"));
const registryOutDir = mkdtempSync(join(tmpdir(), "cli-smoke-registry-"));
const archiveDir = mkdtempSync(join(tmpdir(), "cli-smoke-archive-"));
const projectDir = mkdtempSync(join(tmpdir(), "cli-smoke-project-"));
let staticServer = undefined;

try {
  // 1. Pack the CLI (local only; never publishes).
  const packed = runSh("pnpm", ["pack", "--pack-destination", packDir], { cwd: root });
  process.stdout.write(`${packed.stdout}`);
  const tarballs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
  if (tarballs.length === 0) throw new Error("no tarball produced by pnpm pack");
  const first = tarballs[0];
  if (first === undefined) throw new Error("no tarball produced by pnpm pack");
  const tarball = join(packDir, first);

  // 2. Inspect the tarball: only package.json/README/dist may ship.
  const tarList = run("tar", ["-tf", tarball], { timeout: 60000 });
  const entries = tarList.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  process.stdout.write(`tarball contents (${first}):\n${entries.join("\n")}\n`);
  if (!entries.includes("package/dist/cli.js")) {
    throw new Error("packed tarball is missing package/dist/cli.js");
  }
  for (const entry of entries) {
    const ok =
      entry === "package/package.json" ||
      entry === "package/README.md" ||
      entry.startsWith("package/LICENSE") ||
      entry.startsWith("package/dist/");
    if (!ok) {
      throw new Error(`packed tarball contains unexpected entry: ${entry}`);
    }
  }

  // 3. Clean-room install of the tarball (outside the repo). npm no-ops
  // ("up to date") in a directory without a package.json, so seed one first.
  writeFileSync(
    join(installDir, "package.json"),
    `${JSON.stringify({ name: "cli-smoke-install", private: true, version: "0.0.0" }, null, 2)}\n`,
    "utf8",
  );
  runSh("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: installDir });
  const installedBundle = join(installDir, "node_modules", "@framebits", "cli", "dist", "cli.js");
  if (!existsSync(installedBundle)) {
    throw new Error("installed tarball is missing dist/cli.js");
  }

  // 4. The packed bundle must be self-contained: no @framebits/* runtime imports.
  // (cross-spawn is the single allowed external; everything else is bundled.)
  const bundled = readFileSync(installedBundle, "utf8");
  const marker = "@framebits/";
  const hit = bundled.indexOf(marker);
  if (hit !== -1) {
    const lineStart = bundled.lastIndexOf("\n", hit) + 1;
    const lineEnd = bundled.indexOf("\n", hit);
    const line = bundled.slice(lineStart, lineEnd === -1 ? hit + 200 : lineEnd).slice(0, 200);
    throw new Error(`packed dist/cli.js references @framebits/* at runtime: ...${line}...`);
  }
  process.stdout.write("no @framebits/* runtime references in packed dist/cli.js: OK\n");

  // 5. Version/help through the installed binary (direct + npx-style).
  const bin = join(installDir, "node_modules", ".bin", isWindows ? "framebits.cmd" : "framebits");
  if (!isWindows && !existsSync(bin)) {
    throw new Error("installed tarball is missing the framebits bin shim");
  }
  // On Windows the .cmd shim needs cmd.exe; invoke the bundled file with node
  // directly instead (same code, no shell involved).
  const invoke = isWindows ? [process.execPath, installedBundle] : [bin];
  const asCommand = invoke[0];
  const asArgs = invoke.slice(1);
  if (asCommand === undefined) throw new Error("no CLI target to invoke");
  run(asCommand, [...asArgs, "--version"]);
  run(asCommand, [...asArgs, "--help"]);
  const versionOut = run(asCommand, [...asArgs, "--version"]);
  if (versionOut.stdout.trim().length === 0) {
    throw new Error(
      `installed framebits --version printed nothing (argv[1]-vs-real-path shim bug?):\n${versionOut.stderr}`,
    );
  }
  const helpOut = run(asCommand, [...asArgs, "--help"]);
  if (!helpOut.stdout.includes("framebits") || !helpOut.stdout.includes("add")) {
    throw new Error(
      `installed framebits --help looks wrong:\n${helpOut.stdout}\n${helpOut.stderr}`,
    );
  }
  runSh("npm", ["exec", "--yes", "--package", tarball, "--", "framebits", "--version"], {
    cwd: installDir,
  });

  // 6. Real registry output from the builder (emit to temp dirs; the repo lock
  // file is left untouched), served as static files over local http.
  const built = runSh(
    "pnpm",
    ["build:registry", "--out", registryOutDir, "--archive-dir", archiveDir],
    { cwd: repoRoot },
  );
  process.stdout.write(`${built.stdout}`);
  const indexFile = join(registryOutDir, "r", "index.json");
  const itemFile = join(registryOutDir, "r", "aurora-text.json");
  if (!existsSync(indexFile) || !existsSync(itemFile)) {
    throw new Error("builder output is missing r/index.json or r/aurora-text.json");
  }

  const { server, baseUrl } = await serveDirectory(registryOutDir);
  staticServer = server;
  try {
    // 7. Fixture project + init + add --dry-run through the PACKED binary.
    writeFileSync(
      join(projectDir, "package.json"),
      `${JSON.stringify(
        {
          name: "smoke-fixture",
          private: true,
          dependencies: { react: "^19.0.0" },
          devDependencies: { typescript: "^5.0.0" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    writeFileSync(
      join(projectDir, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }, null, 2)}\n`,
      "utf8",
    );
    mkdirSync(join(projectDir, "src"), { recursive: true });
    await runAsync(asCommand, [...asArgs, "init", "--yes", "--registry", baseUrl], {
      cwd: projectDir,
    });
    const before = snapshotDir(projectDir);
    const add = await runAsync(
      asCommand,
      [...asArgs, "add", "aurora-text", "--dry-run", "--yes", "--registry", baseUrl],
      { cwd: projectDir },
    );
    if (!add.stdout.toLowerCase().includes("aurora-text")) {
      throw new Error(
        `add --dry-run output does not mention aurora-text:\nstdout:\n${add.stdout}\nstderr:\n${add.stderr}`,
      );
    }
    if (!snapshotsEqual(before, snapshotDir(projectDir))) {
      throw new Error("add --dry-run modified the project directory (must write nothing)");
    }
    process.stdout.write("clean-room add aurora-text --dry-run against local registry: OK\n");
  } finally {
    await closeServer(staticServer);
    staticServer = undefined;
  }

  process.stdout.write("cli pack smoke: OK\n");
} finally {
  if (staticServer !== undefined) {
    await closeServer(staticServer);
  }
  rmSync(packDir, { recursive: true, force: true });
  rmSync(installDir, { recursive: true, force: true });
  rmSync(registryOutDir, { recursive: true, force: true });
  rmSync(archiveDir, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
}

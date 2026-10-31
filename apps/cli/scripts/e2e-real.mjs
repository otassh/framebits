#!/usr/bin/env node
/* global process, URL, setTimeout, clearTimeout */
/** Real consumer installs using the packed package, pnpm, and a built registry. */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import spawn from "cross-spawn";
import { createServer } from "node:http";
import { parse as parseJsonc } from "jsonc-parser";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PINS = {
  createNextApp: "16.3.8",
  createVite: "9.2.1",
  tailwind3: "3.4.19",
  tailwind4: "4.3.3",
  postcss: "8.5.29",
  autoprefixer: "10.6.1",
};
const SLUGS = ["aurora-text", "shimmer-button", "framebits-logo-3d"];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function log(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, options = {}) {
  log(`$ ${command} ${args.join(" ")}`);
  const { timeout = 600000, expectedCode = 0, ...settings } = options;
  const env = { ...process.env, CI: "1", DO_NOT_TRACK: "1", NEXT_TELEMETRY_DISABLED: "1" };
  delete env.FRAMEBITS_REGISTRY_URL;
  delete env.FRAMEBITS_TIMEOUT;
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...settings, env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${String(timeout)}ms`));
    }, timeout);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== expectedCode) {
        reject(
          new Error(
            `${command} exited ${String(code)} (expected ${String(expectedCode)}):\n${stdout}\n${stderr}`,
          ),
        );
      } else {
        resolveRun({ stdout, stderr });
      }
    });
  });
}

function filesUnder(dir, suffix = "") {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path, suffix));
    else if (entry.name.endsWith(suffix)) files.push(path);
  }
  return files.sort();
}

function snapshot(dir) {
  return filesUnder(dir).map((path) => [
    relative(dir, path),
    readFileSync(path).toString("base64"),
  ]);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function startRegistry(webRoot) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = resolve(webRoot, `.${url.pathname}`);
    const rel = relative(webRoot, path);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const body = readFileSync(path);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("{}");
    }
  });
  return new Promise((resolveServer, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address !== null && typeof address !== "string");
      resolveServer({ server, url: `http://127.0.0.1:${String(address.port)}/r` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    });
  });
}

function demoSource(alias, slugs = SLUGS) {
  const demos = [
    {
      slug: "aurora-text",
      name: "AuroraText",
      jsx: '<AuroraText text="Framebits consumer test" />',
    },
    {
      slug: "shimmer-button",
      name: "ShimmerButton",
      jsx: '<ShimmerButton label="Install verified" />',
    },
    {
      slug: "framebits-logo-3d",
      name: "FrameBitsLogo3D",
      jsx: '<FrameBitsLogo3D quality="low" intro={false} style={{ height: 300 }} />',
    },
  ].filter((demo) => slugs.includes(demo.slug));
  const imports = demos
    .map((demo) => `import { ${demo.name} } from "${alias}/components/ui/${demo.slug}";`)
    .join("\n");
  return `"use client";\n${imports}\nexport default function App() { return <main>${demos.map((demo) => demo.jsx).join("\n")}</main>; }\n`;
}

async function verifyStandalone(workRoot, baseline, tools, registryUrl) {
  for (const slug of SLUGS) {
    const project = join(workRoot, `standalone-${slug}`);
    mkdirSync(project);
    for (const [path, bytes] of baseline) {
      const target = join(project, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(bytes, "base64"));
    }
    await run("pnpm", ["install", "--frozen-lockfile"], { cwd: project });
    await run(
      "pnpm",
      ["exec", "framebits", "init", "--yes", "--registry", registryUrl, "--cwd", project],
      { cwd: tools },
    );
    await run("pnpm", ["exec", "framebits", "add", slug, "--yes", "--cwd", project], {
      cwd: tools,
    });
    const config = JSON.parse(readFileSync(join(project, "framebits.json"), "utf8"));
    const expected = slug === "framebits-logo-3d" ? [slug] : [slug, "cn"];
    assert.deepEqual(Object.keys(config.installed).sort(), expected.sort());
    writeFileSync(join(project, "src", "App.tsx"), demoSource("@", [slug]));
    await run("pnpm", ["run", "build"], { cwd: project });
    log(`ok: ${slug} installs and builds alone in a fresh consumer`);
  }
}

async function installAndVerify(project, tools, registryUrl, alias, tailwind, framework) {
  const cli = (args, options = {}) =>
    run("pnpm", ["exec", "framebits", ...args, "--cwd", project], { cwd: tools, ...options });
  await cli(["init", "--yes", "--registry", registryUrl]);
  const config = JSON.parse(readFileSync(join(project, "framebits.json"), "utf8"));
  assert.equal(config.registry, registryUrl);
  assert.equal(config.framework, framework);
  assert.equal(config.tailwind.version, tailwind);
  assert.equal(config.aliases.lib, `${alias}/lib`);

  const before = snapshot(project);
  const dryRun = await cli(["add", ...SLUGS, "--dry-run", "--yes"]);
  assert(dryRun.stdout.includes("patch-css"), "dry run must include the CSS plan");
  assert.deepEqual(snapshot(project), before, "dry run must leave the consumer untouched");
  // No --registry here: exercise the URL saved by init, using the packed bin.
  await cli(["add", ...SLUGS, "--yes"]);
  for (const slug of SLUGS) {
    assert(
      existsSync(join(project, "src", "components", "ui", `${slug}.tsx`)),
      `${slug} must be installed`,
    );
  }
  assert(
    existsSync(join(project, "src", "lib", "cn.ts")),
    "transitive registry helper must be installed",
  );
  const installedConfig = JSON.parse(readFileSync(join(project, "framebits.json"), "utf8"));
  assert.deepEqual(Object.keys(installedConfig.installed).sort(), [...SLUGS, "cn"].sort());
  for (const dep of [
    "motion",
    "clsx",
    "tailwind-merge",
    "three",
    "@types/three",
    "@react-three/fiber",
  ]) {
    assert(existsSync(join(project, "node_modules", dep)), `missing consumer dependency ${dep}`);
  }

  const installed = snapshot(project);
  await cli(["init", "--yes"]);
  await cli(["add", ...SLUGS, "--yes"]);
  assert.deepEqual(snapshot(project), installed, "repeat init and add must be byte-identical");

  const component = join(project, "src", "components", "ui", "aurora-text.tsx");
  const original = readFileSync(component, "utf8");
  writeFileSync(component, `${original}\n// Consumer customization\n`);
  const customized = snapshot(project);
  await cli(["add", ...SLUGS, "--yes"], { expectedCode: 1 });
  assert.deepEqual(snapshot(project), customized, "conflicts must preserve all consumer files");
  await cli(["add", ...SLUGS, "--overwrite", "--yes"]);
  assert.deepEqual(
    snapshot(project),
    installed,
    "explicit overwrite must restore the installed files",
  );
  log(
    `ok: ${framework}/Tailwind ${tailwind} packed install, dry run, dependencies, aliases, conflicts, and idempotency`,
  );
}

function verifyBuiltCss(buildRoot) {
  const css = filesUnder(buildRoot, ".css")
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.match(css, /@keyframes shimmer\s*\{/, "missing shimmer keyframes in production CSS");
  assert.match(css, /\.animate-shimmer\s*\{/, "missing shimmer animation class in production CSS");
  assert.match(css, /\.bg-clip-text\s*\{/, "missing component Tailwind utility in production CSS");
  log("ok: production CSS contains component utilities, shimmer animation class, and keyframes");
}

async function scenarioNext(workRoot, tools, registryUrl) {
  const project = join(workRoot, "consumer-next");
  await run(
    "pnpm",
    [
      "dlx",
      `create-next-app@${PINS.createNextApp}`,
      "consumer-next",
      "--typescript",
      "--tailwind",
      "--eslint",
      "--app",
      "--src-dir",
      "--import-alias",
      "@/*",
      "--use-pnpm",
      "--yes",
      "--skip-install",
      "--disable-git",
    ],
    { cwd: workRoot },
  );
  await run("pnpm", ["install"], { cwd: project });
  // Avoid external font downloads: this test verifies the installed components.
  writeFileSync(
    join(project, "src", "app", "layout.tsx"),
    'import "./globals.css";\nimport type { ReactNode } from "react";\nexport default function Layout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }\n',
  );
  await installAndVerify(project, tools, registryUrl, "@", 4, "next");
  writeFileSync(join(project, "src", "app", "page.tsx"), demoSource("@"));
  await run("pnpm", ["exec", "tsc", "--noEmit"], { cwd: project });
  await run("pnpm", ["run", "build"], { cwd: project });
  verifyBuiltCss(join(project, ".next", "static"));
  log("ok: Next.js App Router production build imports all shipped components");
}

async function scenarioVite(workRoot, tools, registryUrl, major) {
  const name = `consumer-vite${String(major)}`;
  const project = join(workRoot, name);
  const alias = major === 4 ? "~" : "@";
  await run(
    "pnpm",
    ["dlx", `create-vite@${PINS.createVite}`, name, "--template", "react-ts", "--no-interactive"],
    { cwd: workRoot },
  );
  await run("pnpm", ["install"], { cwd: project });
  const styleDeps =
    major === 3
      ? [
          `tailwindcss@${PINS.tailwind3}`,
          `postcss@${PINS.postcss}`,
          `autoprefixer@${PINS.autoprefixer}`,
        ]
      : [`tailwindcss@${PINS.tailwind4}`, `@tailwindcss/vite@${PINS.tailwind4}`];
  await run("pnpm", ["add", "-D", ...styleDeps], { cwd: project });
  writeFileSync(
    join(project, "src", "index.css"),
    major === 3
      ? "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"
      : '@import "tailwindcss";\n',
  );
  if (major === 3) {
    writeFileSync(
      join(project, "tailwind.config.js"),
      'export default { content: ["./index.html", "./src/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] };\n',
    );
    writeFileSync(
      join(project, "postcss.config.js"),
      "export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n",
    );
  }
  const appConfigPath = join(project, "tsconfig.app.json");
  const appConfig = parseJsonc(readFileSync(appConfigPath, "utf8"));
  appConfig.compilerOptions.paths = { [`${alias}/*`]: ["./src/*"] };
  writeJson(appConfigPath, appConfig);
  // Both TypeScript and Vite need the same alias; the CLI never edits JS config.
  writeFileSync(
    join(project, "vite.config.ts"),
    `import { defineConfig } from "vite";\nimport { fileURLToPath } from "node:url";\nimport react from "@vitejs/plugin-react";\n${major === 4 ? 'import tailwindcss from "@tailwindcss/vite";\n' : ""}export default defineConfig({ plugins: [react()${major === 4 ? ", tailwindcss()" : ""}], resolve: { alias: { "${alias}": fileURLToPath(new URL("./src", import.meta.url)) } } });\n`,
  );
  const baseline = major === 3 ? snapshot(project) : undefined;
  await installAndVerify(project, tools, registryUrl, alias, major, "vite");
  writeFileSync(join(project, "src", "App.tsx"), demoSource(alias));
  await run("pnpm", ["run", "build"], { cwd: project });
  verifyBuiltCss(join(project, "dist", "assets"));
  log(
    `ok: Vite/Tailwind ${String(major)} production build imports all shipped components (${alias} alias)`,
  );
  if (baseline !== undefined) await verifyStandalone(workRoot, baseline, tools, registryUrl);
}

async function main() {
  const scenario = process.argv[2] ?? "all";
  assert(
    ["all", "next", "vite3", "vite4"].includes(scenario),
    "scenario must be all, next, vite3, or vite4",
  );
  const workRoot = mkdtempSync(join(tmpdir(), "framebits-consumer-"));
  let server;
  try {
    log(`e2e pins: ${JSON.stringify(PINS)}`);
    await run("pnpm", ["--filter", "@framebits/cli", "build"], { cwd: repoRoot });
    const packDir = join(workRoot, "pack");
    mkdirSync(packDir);
    await run("pnpm", ["pack", "--pack-destination", packDir], {
      cwd: join(repoRoot, "apps", "cli"),
    });
    const tarballs = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
    assert.equal(tarballs.length, 1, "one packed CLI package is required");
    const tools = join(workRoot, "tools");
    mkdirSync(tools);
    writeJson(join(tools, "package.json"), {
      name: "consumer-cli-tools",
      private: true,
      packageManager: "pnpm@10.29.3",
    });
    await run("pnpm", ["add", join(packDir, tarballs[0])], { cwd: tools });
    const version = await run("pnpm", ["exec", "framebits", "--version"], { cwd: tools });
    const help = await run("pnpm", ["exec", "framebits", "--help"], { cwd: tools });
    assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);
    assert(help.stdout.includes("add"));
    const registryOut = join(workRoot, "registry");
    await run(
      "pnpm",
      ["build:registry", "--out", registryOut, "--archive-dir", join(workRoot, "archive")],
      { cwd: repoRoot },
    );
    const registry = await startRegistry(registryOut);
    server = registry.server;
    if (scenario === "all" || scenario === "next")
      await scenarioNext(workRoot, tools, registry.url);
    if (scenario === "all" || scenario === "vite3")
      await scenarioVite(workRoot, tools, registry.url, 3);
    if (scenario === "all" || scenario === "vite4")
      await scenarioVite(workRoot, tools, registry.url, 4);
    log(`e2e-real ${scenario}: ALL GREEN`);
  } finally {
    if (server !== undefined) await closeServer(server);
    const rel = relative(tmpdir(), workRoot);
    assert(rel.startsWith("framebits-consumer-") && !rel.includes("..") && !isAbsolute(rel));
    rmSync(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  }
}

main().catch((error) => {
  process.stderr.write(
    `e2e-real FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

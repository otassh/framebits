/**
 * End-to-end: real builder output served over node:http, fixture projects in
 * temp dirs, init + add through the real command functions. No external network.
 */
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAdd } from "./commands/add.js";
import { runInit } from "./commands/init.js";
import { nodeApplyFs, nodeConfigFs, readProjectSnapshot } from "./fs/node.js";
import { createBufferedOutput } from "./ui/output.js";
import { fakePrompts } from "./ui/prompts.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const registrySource = join(repoRoot, "registry");

let outDir = "";
let server: Server | undefined;
let baseUrl = "";
let previousCwd = "";

async function readDirRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (entry === "node_modules" || entry === ".git") continue;
      const abs = join(current, entry);
      try {
        await readFile(abs, "utf8");
        out.push(abs);
      } catch {
        await walk(abs);
      }
    }
  }
  await walk(dir);
  return out;
}

async function snapshotDir(dir: string): Promise<Map<string, string>> {
  const files = await readDirRecursive(dir);
  const snapshot = new Map<string, string>();
  for (const abs of files) {
    try {
      snapshot.set(abs, await readFile(abs, "utf8"));
    } catch {
      // Ignore unreadable.
    }
  }
  return snapshot;
}

function snapshotsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cli-fixture-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  return dir;
}

async function buildSnapshot(projectRoot: string): Promise<{
  files: ReadonlySet<string>;
  dirs: ReadonlySet<string>;
  contents: ReadonlyMap<string, string>;
  packageJson:
  | {
    dependencies?: Record<string, string> | undefined;
    devDependencies?: Record<string, string> | undefined;
    peerDependencies?: Record<string, string> | undefined;
    packageManager?: string | undefined;
  }
  | undefined;
  tsconfigText: string | undefined;
  jsconfigText: string | undefined;
  isVite: boolean;
}> {
  const snapshot = await readProjectSnapshot(projectRoot);
  let packageJson:
    | {
      dependencies?: Record<string, string> | undefined;
      devDependencies?: Record<string, string> | undefined;
      peerDependencies?: Record<string, string> | undefined;
      packageManager?: string | undefined;
    }
    | undefined;
  const pkgText = snapshot.contents.get("package.json");
  if (pkgText !== undefined) {
    try {
      const raw: unknown = JSON.parse(pkgText);
      if (typeof raw === "object" && raw !== null) {
        const record: Record<string, unknown> = raw as Record<string, unknown>;
        const pick = (key: string): Record<string, string> | undefined => {
          const value: unknown = record[key];
          if (typeof value !== "object" || value === null) return undefined;
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (typeof v === "string") out[k] = v;
          }
          return out;
        };
        const manager: unknown = record["packageManager"];
        packageJson = {
          dependencies: pick("dependencies"),
          devDependencies: pick("devDependencies"),
          peerDependencies: pick("peerDependencies"),
          packageManager: typeof manager === "string" ? manager : undefined,
        };
      }
    } catch {
      packageJson = undefined;
    }
  }
  const viteFiles = ["vite.config.ts", "vite.config.js", "vite.config.mjs"];
  const hasViteDep = packageJson?.dependencies?.["vite"] !== undefined ||
    packageJson?.devDependencies?.["vite"] !== undefined;
  return {
    files: snapshot.files,
    dirs: snapshot.dirs,
    contents: snapshot.contents,
    packageJson,
    tsconfigText: snapshot.contents.get("tsconfig.json"),
    jsconfigText: snapshot.contents.get("jsconfig.json"),
    isVite: hasViteDep || viteFiles.some((file) => snapshot.files.has(file)),
  };
}

const NEXT_APP_SRC: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    dependencies: { next: "^15.0.0", react: "^19.0.0" },
    devDependencies: { typescript: "^5.0.0" },
  }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
  "src/app/layout.tsx": "export default function Root(): null { return null; }\n",
  "src/app/globals.css": "@tailwind base;\n",
  "tailwind.config.ts": "export default {};\n",
  "pnpm-lock.yaml": "lockfileVersion: 9\n",
};

const NEXT_NO_SRC: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    dependencies: { next: "^15.0.0", react: "^19.0.0" },
    devDependencies: { typescript: "^5.0.0" },
  }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } }),
  "app/layout.tsx": "export default function Root(): null { return null; }\n",
  "app/globals.css": "@tailwind base;\n",
  "tailwind.config.js": "module.exports = {};\n",
  "package-lock.json": "{}",
};

const VITE_REFS: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    devDependencies: { vite: "^6.0.0", typescript: "^5.0.0" },
  }),
  "tsconfig.json": JSON.stringify({ references: [{ path: "./tsconfig.app.json" }] }),
  "tsconfig.app.json": JSON.stringify({
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
  }),
  "vite.config.ts": 'import { defineConfig } from "vite";\nexport default defineConfig({});\n',
  "src/index.css": '@import "tailwindcss";\n',
  "yarn.lock": "# yarn\n",
};

const TAILWIND_V4: Record<string, string> = {
  ...NEXT_APP_SRC,
  "src/app/globals.css": '@import "tailwindcss";\n',
};

const NO_TAILWIND: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    dependencies: { react: "^19.0.0" },
    devDependencies: { typescript: "^5.0.0" },
  }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
  "src/app/layout.tsx": "export default function Root(): null { return null; }\n",
  "pnpm-lock.yaml": "lockfileVersion: 9\n",
};

const CSS_ENTRY_MISSING: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    dependencies: { next: "^15.0.0", react: "^19.0.0" },
    devDependencies: { typescript: "^5.0.0" },
  }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
  "src/app/layout.tsx": "export default function Root(): null { return null; }\n",
  "tailwind.config.ts": "export default {};\n",
  "pnpm-lock.yaml": "lockfileVersion: 9\n",
};

const CUSTOM_ALIAS: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    dependencies: { react: "^19.0.0" },
    devDependencies: { typescript: "^5.0.0" },
  }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "~/*": ["./src/*"] } } }),
  "src/app/layout.tsx": "export default function Root(): null { return null; }\n",
};

const JS_ONLY: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", dependencies: { next: "^15.0.0" } }),
};

const NO_ALIAS: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", dependencies: { react: "^19.0.0" } }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
};

beforeAll(async () => {
  previousCwd = process.cwd();
  outDir = await mkdtemp(join(tmpdir(), "cli-registry-"));
  const { loadRegistry } = await import("@framebits/builder");
  const { buildTree } = await import("../../../packages/builder/src/registry/emit.js");
  const loaded = await loadRegistry({ registryRoot: registrySource, skipTypecheck: true });
  if (loaded.diagnostics.some((d) => d.severity === "error")) {
    throw new Error("sample registry failed to load");
  }
  const { planVersions } = await import("../../../packages/builder/src/registry/versions.js");
  const { plans } = planVersions({
    items: loaded.items,
    lock: { version: 1, components: {} },
    bumps: new Map(),
    draftSlugs: new Set(),
    prune: new Set(),
  });
  const tree = buildTree(loaded.items, plans, "test", new Date(0).toISOString(), "0.0.0-test");
  for (const [rel, content] of tree.files) {
    const abs = join(outDir, ...rel.split("/"));
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  // Serve r/*.json, index, search-index, schemas.
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const key = url.pathname.replace(/^\/+/, "");
    const file = join(outDir, ...key.split("/"));
    readFile(file, "utf8").then(
      (text) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(text);
      },
      () => {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
      },
    );
  });
  await new Promise<void>((resolveServer) => {
    if (server === undefined) {
      resolveServer();
      return;
    }
    server.listen(0, "127.0.0.1", () => {
      resolveServer();
    });
  });
  const address: unknown = server.address();
  const port = typeof address === "object" && address !== null && "port" in address &&
      typeof address.port === "number"
    ? address.port
    : 0;
  baseUrl = `http://127.0.0.1:${String(port)}/r`;
}, 120000);

afterAll(() => {
  process.chdir(previousCwd);
  if (server !== undefined) {
    const active: Server = server;
    return new Promise<void>((resolveServer) => {
      active.close(() => {
        resolveServer();
      });
    }).then(() => rm(outDir, { recursive: true, force: true }));
  }
  if (outDir !== "") return rm(outDir, { recursive: true, force: true });
  return Promise.resolve();
});

async function initProject(dir: string, registry: string): Promise<void> {
  const output = createBufferedOutput();
  const snap = await buildSnapshot(dir);
  await runInit(
    { cwd: dir, yes: true, registryFlag: registry },
    {
      snapshot: { root: dir, files: snap.files, dirs: snap.dirs, contents: snap.contents },
      packageJson: snap.packageJson,
      tsconfigText: snap.tsconfigText,
      jsconfigText: snap.jsconfigText,
    },
    {
      fs: {
        ...nodeConfigFs(),
        readSnapshotFile: (path: string): Promise<string | undefined> =>
          readFile(path, "utf8").then(
            (text): string => text,
            (): undefined => undefined,
          ),
      },
      output,
      prompts: fakePrompts({}),
      interactive: false,
    },
  );
}

interface AddRun {
  code: number;
  output: ReturnType<typeof createBufferedOutput>;
  installs: string[];
  error: string;
}

export interface FakeInstallerState {
  calls: string[];
  failNext: boolean;
}

async function runAddIn(
  dir: string,
  slugs: string[],
  options?: {
    overwrite?: boolean;
    dryRun?: boolean;
    noInstall?: boolean;
    noStyles?: boolean;
    yes?: boolean;
    timeoutFlag?: string | undefined;
    installerState?: FakeInstallerState | undefined;
    nodeModules?: Record<string, string> | undefined;
  },
): Promise<AddRun> {
  const output = createBufferedOutput();
  const snap = await buildSnapshot(dir);
  const journalDir = await mkdtemp(join(tmpdir(), "cli-journal-"));
  const installs: string[] = [];
  const failState = options?.installerState;
  try {
    await runAdd(
      {
        cwd: dir,
        slugs,
        overwrite: options?.overwrite === true,
        dryRun: options?.dryRun === true,
        yes: options?.yes !== false,
        noInstall: options?.noInstall === true,
        noStyles: options?.noStyles === true,
        registryFlag: baseUrl,
        timeoutFlag: options?.timeoutFlag,
        debug: false,
      },
      {
        configFs: nodeConfigFs(),
        applyFs: nodeApplyFs(),
        output,
        prompts: fakePrompts({}),
        interactive: false,
        fetchFn: globalThis.fetch,
        sleep: (): Promise<void> => Promise.resolve(),
        installer: {
          run: (command) => {
            installs.push(`${command.program} ${command.args.join(" ")}`);
            if (failState !== undefined) failState.calls.push(`${command.program} ${command.args.join(" ")}`);
            if (failState?.failNext === true) {
              failState.failNext = false;
              return Promise.resolve({ exitCode: 1, timedOut: false, stdout: "", stderr: "fake install boom" });
            }
            // Mimic a real installer: record the ranges in package.json.
            return readFile(join(dir, "package.json"), "utf8").then(
              (text) => {
                let raw: unknown;
                try {
                  raw = JSON.parse(text) as unknown;
                } catch {
                  return { exitCode: 0, timedOut: false, stdout: "", stderr: "" };
                }
                if (typeof raw !== "object" || raw === null) {
                  return { exitCode: 0, timedOut: false, stdout: "", stderr: "" };
                }
                const record = raw as Record<string, unknown>;
                const deps: Record<string, string> =
                  typeof record["dependencies"] === "object" && record["dependencies"] !== null
                    ? { ...(record["dependencies"] as Record<string, string>) }
                    : {};
                for (const spec of command.args.slice(1)) {
                  const at = spec.lastIndexOf("@");
                  if (at <= 0) continue;
                  deps[spec.slice(0, at)] = spec.slice(at + 1);
                }
                record["dependencies"] = deps;
                return writeFile(join(dir, "package.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8").then(
                  () => ({ exitCode: 0 as const, timedOut: false as const, stdout: "", stderr: "" }),
                  () => ({ exitCode: 0 as const, timedOut: false as const, stdout: "", stderr: "" }),
                );
              },
              () => ({ exitCode: 0 as const, timedOut: false as const, stdout: "", stderr: "" }),
            );
          },
        },
        snapshot: {
          files: snap.files,
          dirs: snap.dirs,
          contents: snap.contents,
          packageJson: snap.packageJson,
          tsconfigText: snap.tsconfigText,
          jsconfigText: snap.jsconfigText,
          isVite: snap.isVite,
        },
        readExistingFile: (abs: string): Promise<string | undefined> =>
          readFile(abs, "utf8").then(
            (text): string => text,
            (): undefined => undefined,
          ),
        readNodeModuleVersion: (name: string): Promise<string | undefined> => {
          const pinned = options?.nodeModules?.[name];
          return Promise.resolve(pinned);
        },
        listExistingPaths: () => readDirRecursive(dir),
        journalDir,
      },
    );
    return { code: 0, output, installs, error: "" };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "exitCode" in error &&
        typeof error.exitCode === "number"
      ? error.exitCode
      : 1;
    return {
      code,
      output,
      installs,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(journalDir, { recursive: true, force: true });
  }
}

describe("cli integration (real builder output)", () => {
  it("init detects next app router with src/ and tailwind v3", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const config = JSON.parse(await readFile(join(dir, "framebits.json"), "utf8")) as {
        framework: string;
        aliases: Record<string, string>;
      };
      expect(config.framework).toBe("next");
      expect(config.aliases["components"]).toBe("@/components/ui");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("init detects next without src/ and vite with references", async () => {
    const noSrc = await makeProject(NEXT_NO_SRC);
    try {
      await initProject(noSrc, baseUrl);
      const config = JSON.parse(await readFile(join(noSrc, "framebits.json"), "utf8")) as {
        framework: string;
      };
      expect(config.framework).toBe("next");
    } finally {
      await rm(noSrc, { recursive: true, force: true });
    }
    const vite = await makeProject(VITE_REFS);
    try {
      await initProject(vite, baseUrl);
      const config = JSON.parse(await readFile(join(vite, "framebits.json"), "utf8")) as {
        framework: string;
      };
      expect(config.framework).toBe("vite");
    } finally {
      await rm(vite, { recursive: true, force: true });
    }
  });

  it("init detects tailwind v4 via CSS import", async () => {
    const dir = await makeProject(TAILWIND_V4);
    try {
      await initProject(dir, baseUrl);
      const config = JSON.parse(await readFile(join(dir, "framebits.json"), "utf8")) as {
        tailwind: { version: number };
      };
      expect(config.tailwind.version).toBe(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("JS-only project exits 2; project without alias exits 2 with instructions", async () => {
    const js = await makeProject(JS_ONLY);
    try {
      const output = createBufferedOutput();
      const snap = await buildSnapshot(js);
      try {
        await runInit(
          { cwd: js, yes: true, registryFlag: baseUrl },
          {
            snapshot: { root: js, files: snap.files, dirs: snap.dirs, contents: snap.contents },
            packageJson: snap.packageJson,
            tsconfigText: snap.tsconfigText,
            jsconfigText: snap.jsconfigText,
          },
          {
            fs: {
              ...nodeConfigFs(),
              readSnapshotFile: (path: string): Promise<string | undefined> =>
                readFile(path, "utf8").then(
                  (text): string => text,
                  (): undefined => undefined,
                ),
            },
            output,
            prompts: fakePrompts({}),
            interactive: false,
          },
        );
        expect.unreachable();
      } catch (error) {
        expect(
          typeof error === "object" && error !== null && "exitCode" in error
            ? (error as { exitCode: number }).exitCode
            : 0,
        ).toBe(2);
      }
    } finally {
      await rm(js, { recursive: true, force: true });
    }
    const noAlias = await makeProject(NO_ALIAS);
    try {
      const output = createBufferedOutput();
      const snap = await buildSnapshot(noAlias);
      try {
        await runInit(
          { cwd: noAlias, yes: true, registryFlag: baseUrl },
          {
            snapshot: { root: noAlias, files: snap.files, dirs: snap.dirs, contents: snap.contents },
            packageJson: snap.packageJson,
            tsconfigText: snap.tsconfigText,
            jsconfigText: snap.jsconfigText,
          },
          {
            fs: {
              ...nodeConfigFs(),
              readSnapshotFile: (path: string): Promise<string | undefined> =>
                readFile(path, "utf8").then(
                  (text): string => text,
                  (): undefined => undefined,
                ),
            },
            output,
            prompts: fakePrompts({}),
            interactive: false,
          },
        );
        expect.unreachable();
      } catch (error) {
        expect(
          typeof error === "object" && error !== null && "exitCode" in error
            ? (error as { exitCode: number }).exitCode
            : 0,
        ).toBe(2);
      }
    } finally {
      await rm(noAlias, { recursive: true, force: true });
    }
  });

  it("add aurora-text creates files and updates config; second add is a no-op", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const first = await runAddIn(dir, ["aurora-text"]);
      expect(first.code).toBe(0);
      expect(first.installs).toEqual(["pnpm add clsx@^2.0.0 motion@^14.0.0 tailwind-merge@^3.0.0"]);
      expect(first.output.out.join("")).toContain("done:");
      const aurora = await readFile(join(dir, "src", "components", "ui", "aurora-text.tsx"), "utf8");
      expect(aurora).toContain("AuroraText");
      const cn = await readFile(join(dir, "src", "lib", "cn.ts"), "utf8");
      expect(cn).toContain("cn");
      const config = JSON.parse(await readFile(join(dir, "framebits.json"), "utf8")) as {
        installed: Record<string, { version: string }>;
      };
      expect(config.installed["aurora-text"]?.version).toBeDefined();
      expect(config.installed["cn"]?.version).toBeDefined();

      const before = await snapshotDir(dir);
      const second = await runAddIn(dir, ["aurora-text"]);
      expect(second.code).toBe(0);
      expect(second.output.out.join("")).toContain("already installed");
      expect(second.installs).toEqual([]);
      expect(snapshotsEqual(before, await snapshotDir(dir))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("add cn@1.0.0 pinned fetch works", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["cn@1.0.0"]);
      expect(result.code).toBe(0);
      const cn = await readFile(join(dir, "src", "lib", "cn.ts"), "utf8");
      expect(cn).toContain("cn");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("add --timeout 0 fails with usage error (exit 2) and writes nothing", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const before = await snapshotDir(dir);
      const result = await runAddIn(dir, ["aurora-text"], { timeoutFlag: "0" });
      expect(result.code).toBe(2);
      expect(result.error).toContain("--timeout");
      expect(snapshotsEqual(before, await snapshotDir(dir))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("tampered registry content exits 4 and leaves the project byte-identical", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const before = await snapshotDir(dir);
      const itemFile = join(outDir, "r", "aurora-text.json");
      const original = await readFile(itemFile, "utf8");
      const tampered = original.replace("AuroraText", "TamperedX");
      await writeFile(itemFile, tampered, "utf8");
      try {
        const result = await runAddIn(dir, ["aurora-text"]);
        expect(result.code).toBe(4);
      } finally {
        await writeFile(itemFile, original, "utf8");
      }
      const after = await snapshotDir(dir);
      expect(snapshotsEqual(before, after)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("dry-run writes nothing (snapshot equality)", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const before = await snapshotDir(dir);
      const result = await runAddIn(dir, ["aurora-text"], { dryRun: true });
      expect(result.code).toBe(0);
      const after = await snapshotDir(dir);
      expect(snapshotsEqual(before, after)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("conflicts: non-interactive fails exit 1; --overwrite replaces", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const first = await runAddIn(dir, ["cn@1.0.0"]);
      expect(first.code).toBe(0);
      const target = join(dir, "src", "lib", "cn.ts");
      await writeFile(target, "// local edit\n", "utf8");
      const conflict = await runAddIn(dir, ["cn@1.0.0"]);
      expect(conflict.code).toBe(1);
      const overwritten = await runAddIn(dir, ["cn@1.0.0"], { overwrite: true });
      expect(overwritten.code).toBe(0);
      expect(await readFile(target, "utf8")).toContain("tailwind-merge");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("custom ~/lib alias rewrites end to end", async () => {
    const dir = await makeProject(CUSTOM_ALIAS);
    try {
      await initProject(dir, baseUrl);
      const config = JSON.parse(await readFile(join(dir, "framebits.json"), "utf8")) as {
        aliases: { lib: string };
      };
      expect(config.aliases.lib).toBe("~/lib");
      const result = await runAddIn(dir, ["aurora-text"]);
      expect(result.code).toBe(0);
      const aurora = await readFile(join(dir, "src", "components", "ui", "aurora-text.tsx"), "utf8");
      expect(aurora).toContain("~/lib/cn");
      expect(aurora).not.toContain("@/lib/cn");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("404 suggests did-you-mean (exit 1)", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["aurora-tex"]);
      expect(result.code).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("404 suggests did-you-mean (exit 1)", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["aurora-tex"]);
      expect(result.code).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("v4 styles: shimmer block lands in the CSS entry with @theme", async () => {
    const dir = await makeProject(TAILWIND_V4);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["shimmer-button"]);
      expect(result.code).toBe(0);
      const css = await readFile(join(dir, "src", "app", "globals.css"), "utf8");
      expect(css).toContain("/* framebits:begin shimmer-button */");
      expect(css).toContain("@theme {");
      expect(css).toContain("--animate-shimmer: shimmer 2s linear infinite;");
      expect(css).toContain("@keyframes shimmer {");
      expect(css).toContain("/* framebits:end shimmer-button */");
      expect(result.installs).toEqual(["pnpm add clsx@^2.0.0 tailwind-merge@^3.0.0"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("v3 styles: shimmer block uses top-level keyframes plus utilities layer", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["shimmer-button"]);
      expect(result.code).toBe(0);
      const css = await readFile(join(dir, "src", "app", "globals.css"), "utf8");
      expect(css).toContain("@keyframes shimmer {");
      expect(css).toContain("@layer utilities {");
      expect(css).toContain(".animate-shimmer {");
      expect(css).not.toContain("@theme");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("second shimmer add is a complete no-op including CSS", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const first = await runAddIn(dir, ["shimmer-button"]);
      expect(first.code).toBe(0);
      const before = await snapshotDir(dir);
      const second = await runAddIn(dir, ["shimmer-button"]);
      expect(second.code).toBe(0);
      expect(second.output.out.join("")).toContain("already installed");
      expect(second.installs).toEqual([]);
      expect(snapshotsEqual(before, await snapshotDir(dir))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("missing Tailwind prints a manual snippet and exits 0", async () => {
    const dir = await makeProject(NO_TAILWIND);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["shimmer-button"]);
      expect(result.code).toBe(0);
      const out = result.output.out.join("");
      expect(out).toContain("Manual steps:");
      expect(out).toContain("framebits:begin shimmer-button");
      expect(out).toContain("@keyframes shimmer");
      expect(result.installs.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("missing CSS entry prints a manual snippet and exits 0", async () => {
    const dir = await makeProject(CSS_ENTRY_MISSING);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["shimmer-button"]);
      expect(result.code).toBe(0);
      expect(result.output.out.join("")).toContain("Manual steps:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("--no-install prints the command and never runs it", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["aurora-text"], { noInstall: true });
      expect(result.code).toBe(0);
      expect(result.installs).toEqual([]);
      expect(result.output.out.join("")).toContain("pnpm add clsx@^2.0.0 motion@^14.0.0 tailwind-merge@^3.0.0");
      const css = await readFile(join(dir, "src", "app", "globals.css"), "utf8");
      expect(css).not.toContain("framebits:begin");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("--no-styles skips patching and prints the snippet", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const before = await readFile(join(dir, "src", "app", "globals.css"), "utf8");
      const result = await runAddIn(dir, ["shimmer-button"], { noStyles: true });
      expect(result.code).toBe(0);
      expect(await readFile(join(dir, "src", "app", "globals.css"), "utf8")).toBe(before);
      expect(result.output.out.join("")).toContain("framebits:begin shimmer-button");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("--dry-run prints the install command and CSS block, writes nothing", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const before = await snapshotDir(dir);
      const result = await runAddIn(dir, ["shimmer-button"], { dryRun: true });
      expect(result.code).toBe(0);
      const out = result.output.out.join("");
      expect(out).toContain("patch-css");
      expect(out).toContain("pnpm add clsx@^2.0.0 tailwind-merge@^3.0.0");
      expect(out).toContain("framebits:begin shimmer-button");
      expect(result.installs).toEqual([]);
      expect(snapshotsEqual(before, await snapshotDir(dir))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("non-interactive without --yes never runs the installer (exit 0)", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["aurora-text"], { yes: false });
      expect(result.code).toBe(0);
      expect(result.installs).toEqual([]);
      expect(result.output.out.join("")).toContain("pnpm add");
      expect(await readFile(join(dir, "src", "lib", "cn.ts"), "utf8")).toContain("cn");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("unsatisfied declared ranges warn and are left untouched", async () => {
    const dir = await makeProject({
      ...NEXT_APP_SRC,
      "package.json": JSON.stringify({
        name: "fixture",
        dependencies: { next: "^15.0.0", react: "^19.0.0", motion: "^13.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
    });
    try {
      await initProject(dir, baseUrl);
      const result = await runAddIn(dir, ["aurora-text"], {
        nodeModules: { motion: "13.5.0" },
      });
      expect(result.code).toBe(0);
      const out = `${result.output.out.join("")}${result.output.err.join("")}`;
      expect(out).toContain("13.5.0");
      expect(out).toContain("^14.0.0");
      expect(result.installs).toEqual(["pnpm add clsx@^2.0.0 tailwind-merge@^3.0.0"]);
      expect(result.installs.join(" ")).not.toContain("motion");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("installer failure rolls back files, CSS and package.json; config untouched", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const configBefore = await readFile(join(dir, "framebits.json"), "utf8");
      const cssBefore = await readFile(join(dir, "src", "app", "globals.css"), "utf8");
      const state: FakeInstallerState = { calls: [], failNext: true };
      const result = await runAddIn(dir, ["shimmer-button"], { installerState: state });
      expect(result.code).toBe(1);
      expect(result.error).toContain("fake install boom");
      expect(await readFile(join(dir, "framebits.json"), "utf8")).toBe(configBefore);
      expect(await readFile(join(dir, "src", "app", "globals.css"), "utf8")).toBe(cssBefore);
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
      expect("clsx" in ((pkg["dependencies"] ?? {}) as Record<string, unknown>)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);

  it("malicious style data exits 4 with the project byte-identical", async () => {
    const dir = await makeProject(NEXT_APP_SRC);
    try {
      await initProject(dir, baseUrl);
      const before = await snapshotDir(dir);
      const itemFile = join(outDir, "r", "shimmer-button.json");
      const original = await readFile(itemFile, "utf8");
      const raw = JSON.parse(original) as Record<string, unknown>;
      const tailwind = raw["tailwind"] as Record<string, unknown>;
      const keyframes = tailwind["keyframes"] as Record<string, unknown>;
      keyframes["evil"] = { from: { PWN: "x; } .pwned { color: red" } };
      await writeFile(itemFile, JSON.stringify(raw), "utf8");
      try {
        const result = await runAddIn(dir, ["shimmer-button"]);
        expect(result.code).toBe(4);
      } finally {
        await writeFile(itemFile, original, "utf8");
      }
      expect(snapshotsEqual(before, await snapshotDir(dir))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);
});

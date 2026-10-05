import { describe, expect, it } from "vitest";
import { applyPlan, assertSafeTarget, type ApplyFs, type ApplyInput } from "./index.js";
import type { CliConfig } from "@framebits/shared";

function baseConfig(): CliConfig {
  return {
    $schema: "https://framebits.dev/schema/config.json",
    schemaVersion: 1,
    registry: "https://x/r",
    framework: "next",
    typescript: true,
    tailwind: { version: 3 },
    aliases: { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
    installed: {},
  };
}

interface MemoryApi extends ApplyFs {
  files: Map<string, string>;
  writes: number;
}

function inputBase(
  files: ApplyInput["files"],
  writeConfig: (next: CliConfig) => Promise<void>,
): ApplyInput {
  return {
    projectRoot: "/proj",
    files,
    css: [],
    snapshotFiles: [],
    installer: undefined,
    config: baseConfig(),
    versions: new Map(),
    writeConfig,
    overwrite: false,
    skipSlugs: new Set(),
  };
}

function memoryFs(options?: {
  failOnWrite?: number;
  symlinks?: string[];
  realRoot?: string;
}): MemoryApi {
  const files = new Map<string, string>();
  let writes = 0;
  const failOnWrite = options?.failOnWrite;
  const symlinks = new Set(options?.symlinks ?? []);
  const realRoot = options?.realRoot;
  const api: MemoryApi = {
    files,
    writes: 0,
    lstat(path: string): Promise<{ isSymbolicLink: boolean; isDirectory: boolean } | undefined> {
      if (symlinks.has(path)) return Promise.resolve({ isSymbolicLink: true, isDirectory: false });
      if (files.has(path)) return Promise.resolve({ isSymbolicLink: false, isDirectory: false });
      if (path === "/proj" || path === "/" || path === "/tmp") {
        return Promise.resolve({ isSymbolicLink: false, isDirectory: true });
      }
      for (const key of files.keys()) {
        if (key.startsWith(`${path}/`)) {
          return Promise.resolve({ isSymbolicLink: false, isDirectory: true });
        }
      }
      return Promise.resolve(undefined);
    },
    realpath(path: string): Promise<string> {
      return Promise.resolve(realRoot ?? path);
    },
    mkdir(): Promise<void> {
      return Promise.resolve();
    },
    writeFile(path: string, content: string): Promise<void> {
      writes += 1;
      api.writes = writes;
      if (failOnWrite !== undefined && writes === failOnWrite) {
        return Promise.reject(new Error(`injected failure at write ${String(writes)}`));
      }
      files.set(path, content);
      return Promise.resolve();
    },
    rename(from: string, to: string): Promise<void> {
      const content = files.get(from);
      if (content === undefined) return Promise.reject(new Error(`missing staging ${from}`));
      files.delete(from);
      files.set(to, content);
      return Promise.resolve();
    },
    readFile(path: string): Promise<string | undefined> {
      return Promise.resolve(files.get(path));
    },
    rm(path: string): Promise<void> {
      files.delete(path);
      return Promise.resolve();
    },
    rmdirIfEmpty(): Promise<boolean> {
      return Promise.resolve(false);
    },
    copyForBackup(from: string, to: string): Promise<void> {
      const content = files.get(from);
      if (content === undefined) return Promise.reject(new Error(`missing ${from}`));
      files.set(to, content);
      return Promise.resolve();
    },
  };
  return api;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

describe("apply", () => {
  it("writes files and updates config last", async () => {
    const fs = memoryFs();
    let saved: CliConfig | undefined;
    const result = await applyPlan(
      fs,
      {
        ...inputBase([], (next) => {
          saved = next;
          return Promise.resolve();
        }),
        files: [
          {
            itemSlug: "cn",
            itemVersion: "1.0.0",
            registryPath: "lib/cn.ts",
            targetAbs: "/proj/src/lib/cn.ts",
            targetRel: "src/lib/cn.ts",
            action: "create",
            content: "export {};\n",
            caseCollisionWith: undefined,
          },
        ],
        versions: new Map([["cn", { version: "1.0.0", hash: `sha256:${"a".repeat(64)}` }]]),
      },
      "/tmp/journal",
    );
    expect(result.written).toEqual(["/proj/src/lib/cn.ts"]);
    const installed = saved?.installed["cn"];
    expect(installed?.version).toBe("1.0.0");
  });

  it("rolls back on injected mid-write failure, leaving config untouched", async () => {
    const fs = memoryFs({ failOnWrite: 2 });
    fs.files.set("/proj/src/lib/keep.ts", "keep\n");
    let saved: CliConfig = baseConfig();
    try {
      await applyPlan(
        fs,
        {
          ...inputBase([], (next) => {
            saved = next;
            return Promise.resolve();
          }),
          files: [
            {
              itemSlug: "a",
              itemVersion: "1.0.0",
              registryPath: "lib/a.ts",
              targetAbs: "/proj/src/lib/a.ts",
              targetRel: "src/lib/a.ts",
              action: "create",
              content: "a\n",
              caseCollisionWith: undefined,
            },
            {
              itemSlug: "b",
              itemVersion: "1.0.0",
              registryPath: "lib/b.ts",
              targetAbs: "/proj/src/lib/b.ts",
              targetRel: "src/lib/b.ts",
              action: "create",
              content: "b\n",
              caseCollisionWith: undefined,
            },
          ],
          versions: new Map([
            ["a", { version: "1.0.0", hash: `sha256:${"a".repeat(64)}` }],
            ["b", { version: "1.0.0", hash: `sha256:${"b".repeat(64)}` }],
          ]),
        },
        "/tmp/journal",
      );
      expect.unreachable();
    } catch {
      expect(fs.files.has("/proj/src/lib/a.ts")).toBe(false);
      expect(fs.files.has("/proj/src/lib/b.ts")).toBe(false);
      expect(fs.files.get("/proj/src/lib/keep.ts")).toBe("keep\n");
      expect(saved.installed).toEqual({});
    }
  });

  it("refuses symlink targets", async () => {
    const fs = memoryFs({ symlinks: ["/proj/src/lib/link.ts"] });
    try {
      await assertSafeTarget(fs, "/proj", "/proj", "/proj/src/lib/link.ts");
      expect.unreachable();
    } catch (error) {
      expect(messageOf(error)).toContain("symlink");
    }
  });

  it("refuses writes outside the project root", async () => {
    const fs = memoryFs();
    try {
      await assertSafeTarget(fs, "/proj", "/proj", "/evil/x.ts");
      expect.unreachable();
    } catch (error) {
      expect(messageOf(error)).toContain("outside");
    }
  });

  it("patches CSS blocks through the journal", async () => {
    const fs = memoryFs();
    fs.files.set("/proj/src/app/globals.css", "@tailwind base;\n");
    let saved: CliConfig = baseConfig();
    const result = await applyPlan(
      fs,
      {
        ...inputBase([], (next) => {
          saved = next;
          return Promise.resolve();
        }),
        css: [
          {
            absPath: "/proj/src/app/globals.css",
            rel: "src/app/globals.css",
            slug: "shimmer-button",
            blockInner: "@keyframes shimmer {\n  from {\n    opacity: 0;\n  }\n}",
            overwrite: false,
          },
        ],
      },
      "/tmp/journal",
    );
    expect(result.cssPatched).toEqual(["/proj/src/app/globals.css"]);
    expect(fs.files.get("/proj/src/app/globals.css")).toContain("framebits:begin shimmer-button");
    expect(saved.installed).toEqual({});
  });

  it("rolls back files, CSS and package.json on installer failure; config untouched", async () => {
    const fs = memoryFs();
    fs.files.set("/proj/package.json", '{"name":"p"}\n');
    fs.files.set("/proj/pnpm-lock.yaml", "before\n");
    fs.files.set("/proj/src/app/globals.css", "@tailwind base;\n");
    let configWrites = 0;
    try {
      await applyPlan(
        fs,
        {
          ...inputBase([], () => {
            configWrites += 1;
            return Promise.resolve();
          }),
          files: [
            {
              itemSlug: "cn",
              itemVersion: "1.0.0",
              registryPath: "lib/cn.ts",
              targetAbs: "/proj/src/lib/cn.ts",
              targetRel: "src/lib/cn.ts",
              action: "create",
              content: "export {};\n",
              caseCollisionWith: undefined,
            },
          ],
          css: [
            {
              absPath: "/proj/src/app/globals.css",
              rel: "src/app/globals.css",
              slug: "shimmer-button",
              blockInner: "@keyframes shimmer {\n  from {\n    opacity: 0;\n  }\n}",
              overwrite: false,
            },
          ],
          snapshotFiles: ["/proj/package.json", "/proj/pnpm-lock.yaml"],
          installer: {
            command: {
              program: "pnpm",
              args: ["add", "motion@^14.0.0"],
              cwd: "/proj",
              display: "pnpm add motion@^14.0.0",
              packages: ["motion"],
            },
            run: () => {
              // Fake installer: partially mutates, then fails.
              fs.files.set("/proj/package.json", '{"name":"p","dependencies":{"motion":"^14.0.0"}}\n');
              fs.files.set("/proj/pnpm-lock.yaml", "after\n");
              return Promise.resolve({ exitCode: 1, timedOut: false, stdout: "out", stderr: "boom" });
            },
          },
          versions: new Map([["cn", { version: "1.0.0", hash: `sha256:${"a".repeat(64)}` }]]),
        },
        "/tmp/journal",
      );
      expect.unreachable();
    } catch (error) {
      expect(messageOf(error)).toContain("boom");
    }
    expect(fs.files.has("/proj/src/lib/cn.ts")).toBe(false);
    expect(fs.files.get("/proj/src/app/globals.css")).toBe("@tailwind base;\n");
    expect(fs.files.get("/proj/package.json")).toBe('{"name":"p"}\n');
    expect(fs.files.get("/proj/pnpm-lock.yaml")).toBe("before\n");
    expect(configWrites).toBe(0);
  });

  it("rolls back on a failing config step", async () => {
    const fs = memoryFs();
    try {
      await applyPlan(
        fs,
        {
          ...inputBase([], () => Promise.reject(new Error("config disk full"))),
          files: [
            {
              itemSlug: "cn",
              itemVersion: "1.0.0",
              registryPath: "lib/cn.ts",
              targetAbs: "/proj/src/lib/cn.ts",
              targetRel: "src/lib/cn.ts",
              action: "create",
              content: "export {};\n",
              caseCollisionWith: undefined,
            },
          ],
        },
        "/tmp/journal",
      );
      expect.unreachable();
    } catch (error) {
      expect(messageOf(error)).toContain("config disk full");
    }
    expect(fs.files.has("/proj/src/lib/cn.ts")).toBe(false);
  });
});

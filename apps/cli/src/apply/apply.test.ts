import { describe, expect, it } from "vitest";
import { applyPlan, assertSafeTarget, type ApplyFs } from "./index.js";
import type { CliConfig } from "@algorithco-ui/shared";

function baseConfig(): CliConfig {
  return {
    $schema: "https://algorithco.dev/schema/config.json",
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
        projectRoot: "/proj",
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
        config: baseConfig(),
        versions: new Map([["cn", { version: "1.0.0", hash: `sha256:${"a".repeat(64)}` }]]),
        writeConfig: (next) => {
          saved = next;
          return Promise.resolve();
        },
        overwrite: false,
        skipSlugs: new Set(),
      },
      "/tmp/journal",
    );
    expect(result.written).toEqual(["/proj/src/lib/cn.ts"]);
    const installed = saved?.installed["cn"];
    expect(installed?.version).toBe("1.0.0");
  });

  it("rolls back on injected mid-write failure, including config", async () => {
    const fs = memoryFs({ failOnWrite: 2 });
    fs.files.set("/proj/src/lib/keep.ts", "keep\n");
    let saved: CliConfig = baseConfig();
    try {
      await applyPlan(
        fs,
        {
          projectRoot: "/proj",
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
          config: baseConfig(),
          versions: new Map([
            ["a", { version: "1.0.0", hash: `sha256:${"a".repeat(64)}` }],
            ["b", { version: "1.0.0", hash: `sha256:${"b".repeat(64)}` }],
          ]),
          writeConfig: (next) => {
            saved = next;
            return Promise.resolve();
          },
          overwrite: false,
          skipSlugs: new Set(),
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
});

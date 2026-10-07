import { describe, expect, it } from "vitest";
import { applyPlan, assertSafeTarget, type ApplyFs } from "./index.js";
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

function memoryFs(symlinks: string[] = []): ApplyFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  const symlinkSet = new Set(symlinks);
  return {
    files,
    lstat(path: string) {
      if (symlinkSet.has(path)) {
        return Promise.resolve({ isSymbolicLink: true, isDirectory: false });
      }
      if (files.has(path)) return Promise.resolve({ isSymbolicLink: false, isDirectory: false });
      if (path === "/proj" || path === "/proj/src" || path === "/proj/src/lib" || path === "/") {
        return Promise.resolve({ isSymbolicLink: false, isDirectory: true });
      }
      return Promise.resolve(undefined);
    },
    realpath: (path: string) => Promise.resolve(path),
    mkdir: () => Promise.resolve(),
    writeFile: (path: string, content: string) => {
      files.set(path, content);
      return Promise.resolve();
    },
    rename: (from: string, to: string) => {
      const content = files.get(from);
      if (content === undefined) return Promise.reject(new Error(`missing ${from}`));
      files.delete(from);
      files.set(to, content);
      return Promise.resolve();
    },
    readFile: (path: string) => Promise.resolve(files.get(path)),
    rm: (path: string) => {
      files.delete(path);
      return Promise.resolve();
    },
    rmdirIfEmpty: () => Promise.resolve(false),
    copyForBackup: (from: string, to: string) => {
      const content = files.get(from);
      if (content === undefined) return Promise.reject(new Error(`missing ${from}`));
      files.set(to, content);
      return Promise.resolve();
    },
  };
}

describe("apply hardening", () => {
  it("refuses symlinked intermediate directories", async () => {
    const fs = memoryFs(["/proj/src/lib"]);
    try {
      await assertSafeTarget(fs, "/proj", "/proj", "/proj/src/lib/a.ts");
      expect.unreachable();
    } catch (error) {
      expect(String(error instanceof Error ? error.message : error)).toContain("symlink");
    }
  });

  it("aborts when a create target appeared since planning (snapshot drift)", async () => {
    const fs = memoryFs();
    fs.files.set("/proj/src/lib/a.ts", "someone else\n");
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
          ],
          css: [],
          snapshotFiles: [],
          installer: undefined,
          config: baseConfig(),
          versions: new Map(),
          writeConfig: () => Promise.resolve(),
          overwrite: false,
          skipSlugs: new Set(),
        },
        "/tmp/journal",
      );
      expect.unreachable();
    } catch (error) {
      expect(String(error instanceof Error ? error.message : error)).toContain("since planning");
    }
  });

  it("aborts when an unchanged file drifted since planning", async () => {
    const fs = memoryFs();
    fs.files.set("/proj/src/lib/a.ts", "drifted\n");
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
              action: "unchanged",
              content: "a\n",
              caseCollisionWith: undefined,
            },
          ],
          css: [],
          snapshotFiles: [],
          installer: undefined,
          config: baseConfig(),
          versions: new Map(),
          writeConfig: () => Promise.resolve(),
          overwrite: false,
          skipSlugs: new Set(),
        },
        "/tmp/journal",
      );
      expect.unreachable();
    } catch (error) {
      expect(String(error instanceof Error ? error.message : error)).toContain("since planning");
    }
  });
});

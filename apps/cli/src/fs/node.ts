/**
 * Node filesystem adapters for snapshot reading, config, and apply.
 * All path inputs are absolute; snapshot uses POSIX-relative keys.
 */
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import { MAX_TSCONFIG_DEPTH, MAX_TSCONFIG_FILES, TsconfigSchema } from "@framebits/shared";
import type { ProjectSnapshot } from "../detect/index.js";

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

const PROBE_FILES = [
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lockb",
  "bun.lock",
  "node_modules/tailwindcss/package.json",
  "src/app/globals.css",
  "app/globals.css",
  "src/globals.css",
  "src/index.css",
  "src/styles.css",
  "styles/globals.css",
  "app/global.css",
] as const;

const PROBE_DIRS = ["app", "src/app", "pages", "src/pages", "src"] as const;

export async function readProjectSnapshot(rootAbs: string): Promise<ProjectSnapshot> {
  const root = resolve(rootAbs);
  const files = new Set<string>();
  const dirs = new Set<string>();
  const contents = new Map<string, string>();

  for (const dir of PROBE_DIRS) {
    if (await isDirectory(join(root, ...dir.split("/")))) dirs.add(dir);
  }
  for (const layout of [
    "app/layout.tsx",
    "app/layout.jsx",
    "src/app/layout.tsx",
    "src/app/layout.jsx",
  ]) {
    if (await exists(join(root, ...layout.split("/")))) {
      files.add(layout);
      const dir = layout.slice(0, layout.lastIndexOf("/"));
      dirs.add(dir);
      const top = dir.split("/")[0] ?? "";
      if (top !== "") dirs.add(top);
    }
  }

  for (const file of PROBE_FILES) {
    const abs = join(root, ...file.split("/"));
    if (await exists(abs)) {
      files.add(file);
      try {
        const text = await readFile(abs, "utf8");
        contents.set(file, text);
      } catch {
        // Unreadable: presence is enough for lockfiles.
      }
    }
  }

  const cssRoots = ["src", "app", "styles"];
  const foundCss: string[] = [];
  for (const cssRoot of cssRoots) {
    const absRoot = join(root, cssRoot);
    if (!(await isDirectory(absRoot))) continue;
    await walkCss(absRoot, root, foundCss, 0);
    if (foundCss.length >= 20) break;
  }
  for (const rel of foundCss) {
    if (files.has(rel)) continue;
    try {
      const text = await readFile(join(root, ...rel.split("/")), "utf8");
      files.add(rel);
      contents.set(rel, text);
    } catch {
      // Ignore unreadable.
    }
  }

  // Alias resolution uses an injected snapshot. Load its complete local JSONC
  // config graph as well as the entry file, without walking outside the app.
  const realRoot = await realpath(root).catch(() => root);
  const visited = new Set<string>();
  async function loadConfigTree(abs: string, depth: number): Promise<boolean> {
    if (depth > MAX_TSCONFIG_DEPTH + 1 || visited.size >= MAX_TSCONFIG_FILES) return false;
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return false;
    if (visited.has(rel)) return true;
    let text: string;
    try {
      const actual = relative(realRoot, await realpath(abs));
      if (
        actual === ".." ||
        actual.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
        isAbsolute(actual)
      )
        return false;
      text = await readFile(abs, "utf8");
    } catch {
      return false;
    }
    visited.add(rel);
    files.add(rel);
    contents.set(rel, text);
    const errors: ParseError[] = [];
    const raw: unknown = parse(text, errors, { allowTrailingComma: true });
    const config = TsconfigSchema.safeParse(raw);
    if (errors.length > 0 || !config.success) return true; // Resolver reports malformed configs.
    const bases =
      config.data.extends === undefined
        ? []
        : Array.isArray(config.data.extends)
          ? config.data.extends
          : [config.data.extends];
    for (const base of bases) {
      if (!base.startsWith(".")) continue;
      await loadConfigTree(
        resolve(dirname(abs), base.endsWith(".json") ? base : `${base}.json`),
        depth + 1,
      );
    }
    for (const ref of config.data.references ?? []) {
      const target = resolve(dirname(abs), ref.path);
      for (const candidate of [target, `${target}.json`, join(target, "tsconfig.json")]) {
        if (await loadConfigTree(candidate, depth + 1)) break;
      }
    }
    return true;
  }
  for (const entry of ["tsconfig.json", "jsconfig.json"]) {
    if (files.has(entry)) await loadConfigTree(join(root, entry), 0);
  }

  return { root, files, dirs, contents };
}

async function walkCss(absDir: string, root: string, out: string[], depth: number): Promise<void> {
  if (depth > 3 || out.length >= 20) return;
  let entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }>;
  try {
    const raw = await readdir(absDir, { withFileTypes: true });
    entries = raw.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  } catch {
    return;
  }
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of sorted) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory) {
      await walkCss(abs, root, out, depth + 1);
    } else if (entry.isFile && entry.name.endsWith(".css")) {
      const rel = abs
        .replace(/\\/g, "/")
        .replace(`${root.replace(/\\/g, "/").replace(/\/+$/, "")}/`, "");
      out.push(rel);
    }
    if (out.length >= 20) return;
  }
}

export function readJsonFile(rootAbs: string, rel: string): Promise<unknown> {
  return readFile(join(resolve(rootAbs), ...rel.split("/")), "utf8").then(
    (text): unknown => JSON.parse(text) as unknown,
    (): undefined => undefined,
  );
}

export function nodeConfigFs(): {
  readFile(path: string): Promise<string | undefined>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  statMode(path: string): Promise<number | undefined>;
  chmod(path: string, mode: number): Promise<void>;
} {
  return {
    readFile(path: string): Promise<string | undefined> {
      return readFile(path, "utf8").then(
        (text): string => text,
        (): undefined => undefined,
      );
    },
    writeFile(path: string, content: string): Promise<void> {
      return mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, content, "utf8"));
    },
    rename(from: string, to: string): Promise<void> {
      return rename(from, to);
    },
    statMode(path: string): Promise<number | undefined> {
      return stat(path).then(
        (st) => st.mode,
        (): undefined => undefined,
      );
    },
    chmod(path: string, mode: number): Promise<void> {
      return chmod(path, mode);
    },
  };
}

export function nodeApplyFs(): {
  lstat(path: string): Promise<{ isSymbolicLink: boolean; isDirectory: boolean } | undefined>;
  realpath(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readFile(path: string): Promise<string | undefined>;
  rm(path: string): Promise<void>;
  rmdirIfEmpty(path: string): Promise<boolean>;
  copyForBackup(from: string, to: string): Promise<void>;
  statMode(path: string): Promise<number | undefined>;
  chmod(path: string, mode: number): Promise<void>;
  fsyncFile(path: string): Promise<void>;
  fsyncDir(path: string): Promise<void>;
} {
  return {
    lstat(path: string): Promise<{ isSymbolicLink: boolean; isDirectory: boolean } | undefined> {
      return lstat(path).then(
        (stat) => ({ isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() }),
        (): undefined => undefined,
      );
    },
    realpath(path: string): Promise<string> {
      return realpath(path);
    },
    mkdir(path: string): Promise<void> {
      return mkdir(path, { recursive: true }).then((): void => undefined);
    },
    writeFile(path: string, content: string): Promise<void> {
      return mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, content, "utf8"));
    },
    rename(from: string, to: string): Promise<void> {
      return rename(from, to);
    },
    readFile(path: string): Promise<string | undefined> {
      return readFile(path, "utf8").then(
        (text): string => text,
        (): undefined => undefined,
      );
    },
    rm(path: string): Promise<void> {
      return rm(path, { force: true }).then((): void => undefined);
    },
    rmdirIfEmpty(path: string): Promise<boolean> {
      return readdir(path).then(
        (entries): Promise<boolean> => {
          if (entries.length === 0) {
            return rmdir(path).then(
              (): boolean => true,
              (): boolean => false,
            );
          }
          return Promise.resolve(false);
        },
        (): boolean => false,
      );
    },
    copyForBackup(from: string, to: string): Promise<void> {
      return readFile(from, "utf8").then((content) =>
        mkdir(dirname(to), { recursive: true }).then(() => writeFile(to, content, "utf8")),
      );
    },
    statMode(path: string): Promise<number | undefined> {
      return stat(path).then(
        (st) => st.mode,
        (): undefined => undefined,
      );
    },
    chmod(path: string, mode: number): Promise<void> {
      return chmod(path, mode);
    },
    fsyncFile(path: string): Promise<void> {
      return open(path, "r").then((handle) =>
        handle
          .sync()
          .then(() => handle.close())
          .catch((error: unknown) =>
            handle.close().then(() => {
              throw error;
            }),
          ),
      );
    },
    fsyncDir(path: string): Promise<void> {
      return open(path, "r").then((handle) =>
        handle
          .sync()
          .then(() => handle.close())
          .catch((error: unknown) =>
            handle.close().then(() => {
              throw error;
            }),
          ),
      );
    },
  };
}

/**
 * Project detection (C5). Pure functions over an injected fs snapshot.
 */
import { detectionError } from "../errors.js";

export type PackageManager = "pnpm" | "yarn" | "npm" | "bun";
export type Framework = "next" | "vite" | "remix" | "other";
export type NextRouter = "app" | "pages";

export interface PackageJson {
  dependencies?: Record<string, string> | undefined;
  devDependencies?: Record<string, string> | undefined;
  peerDependencies?: Record<string, string> | undefined;
  packageManager?: string | undefined;
}

export interface SnapshotFile {
  path: string;
  content: string;
}

export interface ProjectSnapshot {
  /** Absolute project root (for error messages only; never read from disk here). */
  root: string;
  /** Relative POSIX paths of files present. */
  files: ReadonlySet<string>;
  /** Relative POSIX paths of directories present. */
  dirs: ReadonlySet<string>;
  /** File contents keyed by relative POSIX path (only for files detection reads). */
  contents: ReadonlyMap<string, string>;
}

export function createSnapshot(
  root: string,
  files: Record<string, string>,
  dirs: readonly string[],
): ProjectSnapshot {
  return {
    root,
    files: new Set(Object.keys(files)),
    dirs: new Set(dirs),
    contents: new Map(Object.entries(files)),
  };
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return (
    pkg.dependencies?.[name] !== undefined ||
    pkg.devDependencies?.[name] !== undefined ||
    pkg.peerDependencies?.[name] !== undefined
  );
}

function declaredRange(pkg: PackageJson, name: string): string | undefined {
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name];
}

export function detectPackageManager(
  snapshot: ProjectSnapshot,
  pkg: PackageJson,
): PackageManager {
  const field = pkg.packageManager?.trim() ?? "";
  if (field !== "") {
    const name = field.split("@")[0]?.trim() ?? "";
    if (name === "pnpm") return "pnpm";
    if (name === "yarn") return "yarn";
    if (name === "npm") return "npm";
    if (name === "bun") return "bun";
  }
  if (snapshot.files.has("pnpm-lock.yaml")) return "pnpm";
  if (snapshot.files.has("yarn.lock")) return "yarn";
  if (snapshot.files.has("package-lock.json")) return "npm";
  if (snapshot.files.has("bun.lockb") || snapshot.files.has("bun.lock")) return "bun";
  return "npm";
}

export interface FrameworkResult {
  framework: Framework;
  nextRouter: NextRouter | undefined;
}

export function detectFramework(snapshot: ProjectSnapshot, pkg: PackageJson): FrameworkResult {
  const hasNext = hasDep(pkg, "next");
  const hasVite = hasDep(pkg, "vite") || snapshot.files.has("vite.config.ts") ||
    snapshot.files.has("vite.config.js") || snapshot.files.has("vite.config.mjs");
  const hasRemix =
    hasDep(pkg, "@remix-run/node") ||
    hasDep(pkg, "@remix-run/react") ||
    hasDep(pkg, "@remix-run/serve");
  if (hasNext) {
    const hasAppDir =
      snapshot.dirs.has("app") ||
      snapshot.dirs.has("src/app") ||
      [...snapshot.files].some(
        (file) => file === "app/layout.tsx" || file === "app/layout.jsx" ||
          file === "src/app/layout.tsx" || file === "src/app/layout.jsx",
      );
    const hasPagesDir = snapshot.dirs.has("pages") || snapshot.dirs.has("src/pages");
    if (hasAppDir) return { framework: "next", nextRouter: "app" };
    if (hasPagesDir) return { framework: "next", nextRouter: "pages" };
    return { framework: "next", nextRouter: "app" };
  }
  if (hasVite) return { framework: "vite", nextRouter: undefined };
  if (hasRemix) return { framework: "remix", nextRouter: undefined };
  return { framework: "other", nextRouter: undefined };
}

export function detectTypeScript(snapshot: ProjectSnapshot): boolean {
  return snapshot.files.has("tsconfig.json");
}

export function detectSrcDir(snapshot: ProjectSnapshot): boolean {
  return snapshot.dirs.has("src");
}

export interface TailwindResult {
  version: 3 | 4 | undefined;
  config: string | undefined;
  css: string | undefined;
}

const CSS_CANDIDATES = [
  "src/app/globals.css",
  "app/globals.css",
  "src/globals.css",
  "src/index.css",
  "src/styles.css",
  "styles/globals.css",
  "app/global.css",
] as const;

const TAILWIND_CONFIGS = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
] as const;

function majorFromVersionText(text: string): 3 | 4 | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) return undefined;
    const version = (parsed).version;
    if (typeof version !== "string") return undefined;
    if (version.startsWith("4.")) return 4;
    if (version.startsWith("3.")) return 3;
    const major = Number(version.split(".")[0]);
    if (major === 4) return 4;
    if (major === 3) return 3;
    return undefined;
  } catch {
    return undefined;
  }
}

function majorFromRange(range: string): 3 | 4 | undefined {
  const trimmed = range.trim();
  if (trimmed.startsWith("4") || trimmed.includes("4.")) {
    if (trimmed.startsWith("3") || trimmed.startsWith("^3") || trimmed.startsWith("~3")) {
      return undefined;
    }
    if (/^[\^~]?\s*4/.test(trimmed)) return 4;
  }
  if (/^[\^~]?\s*3/.test(trimmed)) return 3;
  return undefined;
}

export function detectTailwind(snapshot: ProjectSnapshot, pkg: PackageJson): TailwindResult {
  let version: 3 | 4 | undefined;
  const installed = snapshot.contents.get("node_modules/tailwindcss/package.json");
  if (installed !== undefined) {
    version = majorFromVersionText(installed);
  }
  if (version === undefined) {
    const range = declaredRange(pkg, "tailwindcss");
    if (range !== undefined) version = majorFromRange(range);
  }

  let config: string | undefined;
  for (const candidate of TAILWIND_CONFIGS) {
    if (snapshot.files.has(candidate)) {
      config = candidate;
      break;
    }
  }

  let css: string | undefined;
  for (const candidate of CSS_CANDIDATES) {
    if (snapshot.files.has(candidate)) {
      css = candidate;
      break;
    }
  }
  if (css === undefined) {
    for (const [path, content] of snapshot.contents) {
      if (!path.endsWith(".css")) continue;
      if (content.includes("@tailwind base") || content.includes('@import "tailwindcss"') ||
        content.includes("@import 'tailwindcss'")) {
        css = path;
        break;
      }
    }
  }

  const cssContent = css !== undefined ? snapshot.contents.get(css) : undefined;
  if (cssContent !== undefined) {
    if (cssContent.includes('@import "tailwindcss"') || cssContent.includes("@import 'tailwindcss'")) {
      version = 4;
    } else if (version === undefined && cssContent.includes("@tailwind base")) {
      version = 3;
    }
  }
  if (version === undefined && config !== undefined) {
    version = 3;
  }
  return { version, config, css };
}

export interface Detection {
  packageManager: PackageManager;
  framework: Framework;
  nextRouter: NextRouter | undefined;
  typescript: boolean;
  srcDir: boolean;
  tailwind: TailwindResult;
}

export function detectProject(snapshot: ProjectSnapshot, pkg: PackageJson | undefined): Detection {
  if (pkg === undefined) {
    throw detectionError(
      "no package.json found in the current directory",
      "run inside the app directory (monorepo roots are not supported)",
    );
  }
  const typescript = detectTypeScript(snapshot);
  if (!typescript) {
    throw detectionError(
      "TypeScript is required (no tsconfig.json found)",
      "components are TypeScript-only; JS variants are a future feature",
    );
  }
  const packageManager = detectPackageManager(snapshot, pkg);
  const framework = detectFramework(snapshot, pkg);
  const srcDir = detectSrcDir(snapshot);
  const tailwind = detectTailwind(snapshot, pkg);
  return {
    packageManager,
    framework: framework.framework,
    nextRouter: framework.nextRouter,
    typescript,
    srcDir,
    tailwind,
  };
}

export function installCommand(packageManager: PackageManager, deps: readonly string[]): string {
  if (deps.length === 0) return "";
  const joined = deps.join(" ");
  switch (packageManager) {
    case "pnpm":
      return `pnpm add ${joined}`;
    case "yarn":
      return `yarn add ${joined}`;
    case "bun":
      return `bun add ${joined}`;
    case "npm":
      return `npm install ${joined}`;
  }
}

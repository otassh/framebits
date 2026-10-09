import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, type AliasOptions } from "vite";
import tailwindcss from "@tailwindcss/vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const registryRoot = join(repoRoot, "registry");

interface RegistryAlias {
  find: RegExp;
  replacement: string;
}

/**
 * Live-demo aliases for in-repo registry sources.
 *
 * Detail pages render the real `demo.tsx` of each published component via
 * `import.meta.glob` (see `src/lib/live-demos.tsx`); catalog cards lazily mount
 * those demos on hover or keyboard focus and use WebP previews while idle.
 * Demos import their sibling
 * source relatively (`./<slug>`) plus the `@/lib|@/hooks|@/components/ui`
 * registry aliases that `pnpm build:registry` enforces. Those aliases must
 * resolve to the same reviewed files here, so they are derived from the
 * registry tree itself: exact anchored patterns per slug, no prefixes, no
 * fallthrough. New slugs are picked up with zero config changes.
 *
 * Missing/unreadable registry (or a demo whose allowlisted dependency is not
 * installed in this app) degrades to the generated WebP preview instead of
 * breaking the site build: unknown imports fail the bundler loudly, which is
 * the intended signal to add the (allowlisted) dependency to package.json.
 */
function registryAliases(): AliasOptions {
  const aliases: RegistryAlias[] = [];
  let categories: string[] = [];
  let libs: string[] = [];
  try {
    categories = readdirSync(join(registryRoot, "components"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    libs = readdirSync(join(registryRoot, "lib"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return aliases;
  }
  for (const category of categories) {
    let slugs: string[] = [];
    try {
      slugs = readdirSync(join(registryRoot, "components", category), {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }
    for (const slug of slugs) {
      const file = join(registryRoot, "components", category, slug, `${slug}.tsx`);
      if (existsSync(file)) {
        aliases.push({
          find: new RegExp(`^@/components/ui/${escapeRegExp(slug)}$`),
          replacement: file,
        });
      }
    }
  }
  for (const slug of libs) {
    const file = join(registryRoot, "lib", slug, `${slug}.ts`);
    if (existsSync(file)) {
      aliases.push({
        find: new RegExp(`^@/lib/${escapeRegExp(slug)}$`),
        replacement: file,
      });
      aliases.push({
        find: new RegExp(`^@/hooks/${escapeRegExp(slug)}$`),
        replacement: file,
      });
    }
  }
  for (const alias of bareDependencyAliases()) {
    aliases.push(alias);
  }
  return aliases;
}

/**
 * Bare third-party imports used by registry demos (e.g. `motion/react`,
 * `three`, `@/lib/cn` aside) cannot resolve from `registry/`: pnpm only
 * links this app's dependencies inside `apps/web/node_modules`, and Node
 * resolution walks up from the importing file. Rewrite every bare specifier
 * found in demo sources to its ESM-resolved absolute file, so Rollup bundles
 * the same packages this app declares.
 *
 * A specifier that does not resolve here means the demo needs a dependency
 * that is not installed: fail fast with the exact `pnpm add` hint instead of
 * a cryptic Rollup error later. New deps must also be on the shared
 * allowlist (`packages/shared/src/allowed-dependencies.ts`).
 */
function bareDependencyAliases(): RegistryAlias[] {
  const specs = new Set<string>(["react/jsx-runtime", "react/jsx-dev-runtime"]);
  for (const file of demoSourceFiles()) {
    for (const spec of scanBareSpecifiers(file)) {
      specs.add(spec);
    }
  }
  const parent = pathToFileURL(join(webRoot, "package.json")).href;
  const missing: string[] = [];
  const aliases: RegistryAlias[] = [];
  for (const spec of [...specs].sort()) {
    let resolved: string;
    try {
      resolved = fileURLToPath(import.meta.resolve(spec, parent));
    } catch {
      missing.push(spec);
      continue;
    }
    aliases.push({ find: new RegExp(`^${escapeRegExp(spec)}$`), replacement: resolved });
  }
  if (missing.length > 0) {
    throw new Error(
      `registry demos import dependencies missing from apps/web/package.json: ${missing.join(", ")}. ` +
        `Install them with pnpm (versions must match packages/registry-env).`,
    );
  }
  return aliases;
}

/** Demo + component + lib sources whose bare imports must resolve. */
function demoSourceFiles(): string[] {
  const files: string[] = [];
  const pushIfFile = (path: string): void => {
    if (existsSync(path)) files.push(path);
  };
  let categories: string[] = [];
  try {
    categories = readdirSync(join(registryRoot, "components"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return files;
  }
  for (const category of categories) {
    let slugs: string[] = [];
    try {
      slugs = readdirSync(join(registryRoot, "components", category), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }
    for (const slug of slugs) {
      const dir = join(registryRoot, "components", category, slug);
      pushIfFile(join(dir, "demo.tsx"));
      pushIfFile(join(dir, `${slug}.tsx`));
    }
  }
  let libs: string[] = [];
  try {
    libs = readdirSync(join(registryRoot, "lib"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return files;
  }
  for (const slug of libs) {
    pushIfFile(join(registryRoot, "lib", slug, `${slug}.ts`));
  }
  return files;
}

/** Static `from "x"` / `import("x")` / `import "x"` specifiers that are bare package imports. */
function scanBareSpecifiers(file: string): string[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const found: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const spec = match[1];
      if (spec === undefined) continue;
      if (
        spec.startsWith(".") ||
        spec.startsWith("/") ||
        spec.startsWith("@/") ||
        spec.startsWith("node:")
      ) {
        continue;
      }
      found.push(spec);
    }
  }
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default defineConfig({
  plugins: [tailwindcss()],
  envDir: "../..",
  publicDir: ".registry",
  resolve: {
    alias: registryAliases(),
  },
  // Explicit transform config: demos live outside the app root, where
  // Vite's per-file tsconfig discovery resolves a non-existent
  // `packages/config/tsconfig.json` (via the root tsconfig `references`)
  // and fails the build. The STRING form skips file discovery entirely
  // (an object would still be merged with the discovered file and throw).
  // Flags mirror the app tsconfig (react-jsx, ES2022).
  esbuild: {
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        target: "ES2022",
        useDefineForClassFields: true,
      },
    }),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          icons: ["lucide-react"],
          motion: ["motion/react"],
          react: ["react", "react-dom", "react/jsx-runtime"],
          validation: ["zod"],
        },
        // Keep the heavy dependencies of lazy demos and the hero ballpit in
        // optional chunks. The shared animated footer uses Motion on every page.
        onlyExplicitManualChunks: true,
      },
    },
  },
  server: {
    port: 5173,
    // Demos live outside the app root (sibling `registry/` dir): allow the
    // dev server to serve them. Production builds inline them into chunks.
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    port: 4173,
  },
});

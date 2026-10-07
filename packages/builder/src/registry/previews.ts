import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { PreviewWebpSchema } from "@framebits/shared";
import { chromium, type Browser } from "playwright";
import { createServer, normalizePath, type AliasOptions, type ViteDevServer } from "vite";
import type { Diagnostic, RegistryItemModel } from "./types.js";

export interface PreviewTarget {
  slug: string;
  hash: string;
  demoPath: string;
  cachePath: string;
  outputPath: string;
}

export interface PreviewPlan {
  targets: PreviewTarget[];
  missing: PreviewTarget[];
  reused: PreviewTarget[];
  diagnostics: Diagnostic[];
  assets: Map<string, Uint8Array>;
}

function hashHex(hash: string): string {
  return hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
}

export function previewCacheName(slug: string, hash: string): string {
  return `${slug}@${hashHex(hash)}.webp`;
}

export function previewTargets(
  registryRoot: string,
  cacheDir: string,
  items: readonly RegistryItemModel[],
): PreviewTarget[] {
  return items
    .filter((item) => item.meta.type === "component")
    .map((item) => ({
      slug: item.slug,
      hash: item.hash,
      demoPath: join(registryRoot, "components", item.meta.category, item.slug, "demo.tsx"),
      cachePath: join(cacheDir, previewCacheName(item.slug, item.hash)),
      outputPath: `previews/${item.slug}.webp`,
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export async function planPreviewAssets(
  registryRoot: string,
  cacheDir: string,
  items: readonly RegistryItemModel[],
): Promise<PreviewPlan> {
  const targets = previewTargets(registryRoot, cacheDir, items);
  const missing: PreviewTarget[] = [];
  const reused: PreviewTarget[] = [];
  const diagnostics: Diagnostic[] = [];
  const assets = new Map<string, Uint8Array>();

  for (const target of targets) {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(target.cachePath);
    } catch {
      missing.push(target);
      continue;
    }
    const parsed = PreviewWebpSchema.safeParse(bytes);
    if (!parsed.success) {
      diagnostics.push({
        severity: "error",
        code: "PREVIEW_INVALID",
        file: toDisplayPath(registryRoot, target.cachePath),
        message: parsed.error.issues[0]?.message ?? "cached preview is invalid",
        hint: "delete the invalid file and regenerate previews",
      });
      continue;
    }
    reused.push(target);
    assets.set(target.outputPath, bytes);
  }

  return { targets, missing, reused, diagnostics, assets };
}

function toDisplayPath(registryRoot: string, path: string): string {
  const rel = relative(registryRoot, path);
  return rel === "" || rel.startsWith(`..${sep}`) || rel === ".."
    ? normalizePath(path)
    : normalizePath(rel);
}

function registryAlias(
  root: string,
  item: RegistryItemModel,
): { find: string; replacement: string } {
  const find =
    item.meta.type === "component"
      ? `@/components/ui/${item.slug}`
      : item.meta.type === "lib"
        ? `@/lib/${item.slug}`
        : `@/hooks/${item.slug}`;
  const replacement =
    item.meta.type === "component"
      ? join(root, "src", "demos", item.slug, `${item.slug}.tsx`)
      : join(root, "src", "registry", item.files[0]?.path ?? "missing.ts");
  return { find, replacement };
}

function dependencyAliases(
  registryEnvRoot: string,
  items: readonly RegistryItemModel[],
): Array<{ find: string; replacement: string }> {
  const names = new Set<string>(["react", "react-dom"]);
  for (const item of items) {
    for (const name of Object.keys(item.dependencies)) {
      if (!name.startsWith("@types/")) names.add(name);
    }
  }
  return [...names]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
    .map((name) => ({ find: name, replacement: join(registryEnvRoot, "node_modules", ...name.split("/")) }));
}

function previewEntry(targets: readonly PreviewTarget[]): string {
  const imports = targets.map(
    (target, index) =>
      `import Demo${String(index)} from ${JSON.stringify(`./demos/${target.slug}/demo.tsx`)};`,
  );
  const entries = targets.map(
    (target, index) => `${JSON.stringify(target.slug)}: Demo${String(index)}`,
  );
  return `${imports.join("\n")}
import { createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const demos: Record<string, ComponentType> = { ${entries.join(", ")} };
const slug = new URLSearchParams(window.location.search).get("slug") ?? "";
const Demo = demos[slug];
const root = document.getElementById("preview-root");
if (root === null) throw new Error("preview root is missing");
if (Demo === undefined) throw new Error("unknown preview slug: " + slug);
createRoot(root).render(createElement(Demo));
window.setTimeout(() => {
  document.body.dataset["previewReady"] = "true";
}, 1200);
`;
}

function previewCss(): string {
  return `@import "tailwindcss";
@source "./";

:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
html, body { width: 100%; min-height: 100%; margin: 0; background: #080809; }
body { overflow: hidden; }
#preview-frame {
  width: 1200px;
  height: 675px;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #f7f5f2;
  background:
    radial-gradient(circle at 50% 42%, rgba(255, 92, 42, 0.12), transparent 42%),
    #0b0b0d;
}
#preview-root { width: 100%; height: 100%; display: grid; place-items: center; }
#preview-root > * { max-width: 100%; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
}
`;
}

function resolveRegistryEnvRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "registry-env");
}

function resolveRepoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}

async function createPreviewServer(
  root: string,
  items: readonly RegistryItemModel[],
): Promise<ViteDevServer> {
  const registryEnvRoot = resolveRegistryEnvRoot();
  const aliases: AliasOptions = [
    ...items.map((item) => {
      const alias = registryAlias(root, item);
      return { find: alias.find, replacement: alias.replacement };
    }),
    ...dependencyAliases(registryEnvRoot, items),
  ];
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    plugins: [tailwindcss()],
    esbuild: {
      tsconfigRaw: {
        compilerOptions: {
          jsx: "react-jsx",
          target: "ES2022",
          useDefineForClassFields: true,
        },
      },
    },
    resolve: { alias: aliases },
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      fs: { allow: [root, resolveRepoRoot()] },
    },
  });
  await server.listen();
  return server;
}

async function materializePreviewSources(
  root: string,
  targets: readonly PreviewTarget[],
  items: readonly RegistryItemModel[],
): Promise<void> {
  const targetBySlug = new Map(targets.map((target) => [target.slug, target]));
  for (const item of items) {
    if (item.meta.type === "component") {
      const dir = join(root, "src", "demos", item.slug);
      await mkdir(dir, { recursive: true });
      for (const file of item.files) {
        await writeFile(join(dir, basename(file.path)), file.content, "utf8");
      }
      const target = targetBySlug.get(item.slug);
      if (target === undefined) throw new Error(`preview target is missing for ${item.slug}`);
      await writeFile(join(dir, "demo.tsx"), await readFile(target.demoPath, "utf8"), "utf8");
      continue;
    }
    for (const file of item.files) {
      const path = join(root, "src", "registry", ...file.path.split("/"));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.content, "utf8");
    }
  }
}

function previewBaseUrl(server: ViteDevServer): string {
  const local = server.resolvedUrls?.local[0];
  if (local === undefined) throw new Error("preview server did not expose a local URL");
  return local;
}

async function writeCacheFile(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${String(process.pid)}`;
  await writeFile(temp, bytes);
  await rename(temp, path);
}

async function captureTarget(
  browser: Browser,
  baseUrl: string,
  target: PreviewTarget,
): Promise<Uint8Array> {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 675 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${baseUrl}?slug=${encodeURIComponent(target.slug)}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await page.waitForFunction("document.body.dataset.previewReady === 'true'", undefined, {
      timeout: 15_000,
    });
    if (errors.length > 0) {
      throw new Error(`browser errors: ${errors.join(" | ")}`);
    }
    const bytes = await page.locator("#preview-frame").screenshot({ type: "webp", quality: 90 });
    const parsed = PreviewWebpSchema.safeParse(bytes);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid WebP capture");
    return bytes;
  } finally {
    await context.close();
  }
}

/** Render trusted in-repo demos only; the production web app receives images, never source execution. */
export async function generatePreviewAssets(
  registryRoot: string,
  cacheDir: string,
  items: readonly RegistryItemModel[],
  targets: readonly PreviewTarget[],
): Promise<void> {
  if (targets.length === 0) return;
  const root = await mkdtemp(join(tmpdir(), "framebits-previews-"));
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "index.html"),
      '<!doctype html><html><head><meta charset="UTF-8"><link rel="icon" href="data:,"></head><body><main id="preview-frame"><div id="preview-root"></div></main><script type="module" src="/src/entry.tsx"></script></body></html>\n',
      "utf8",
    );
    const allTargets = previewTargets(registryRoot, cacheDir, items);
    await materializePreviewSources(root, allTargets, items);
    await writeFile(join(root, "src", "entry.tsx"), previewEntry(allTargets), "utf8");
    await writeFile(join(root, "src", "styles.css"), previewCss(), "utf8");
    await writeFile(
      join(root, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { jsx: "react-jsx", target: "ES2022", module: "ESNext", moduleResolution: "Bundler" } }, null, 2)}\n`,
      "utf8",
    );
    server = await createPreviewServer(root, items);
    try {
      browser = await chromium.launch({ channel: "chromium", headless: true });
    } catch (error) {
      throw new Error(
        `Chromium is required to generate previews. Run \`pnpm preview:install\`. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const baseUrl = previewBaseUrl(server);
    for (const target of targets) {
      const bytes = await captureTarget(browser, baseUrl, target);
      await writeCacheFile(target.cachePath, bytes);
    }
  } finally {
    await browser?.close();
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
}

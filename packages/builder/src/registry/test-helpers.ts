import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Build a temp registry from a path->content map (string content is written as
 * UTF-8; Uint8Array is written raw for encoding tests). Returns the root.
 * Callers remove it with `rmRegistry` (or register cleanup themselves).
 */
export async function makeRegistry(files: Record<string, string | Uint8Array>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "registry-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    await mkdir(join(abs, ".."), { recursive: true });
    if (typeof content === "string") {
      await writeFile(abs, content, "utf8");
    } else {
      await writeFile(abs, content);
    }
  }
  return root;
}

export async function rmRegistry(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

const BASE_META = {
  title: "T",
  type: "component",
  category: "buttons",
  tags: [],
  description: "A long enough description here.",
  dependencies: {},
  registryDependencies: [],
  difficulty: "easy",
  performance: "light",
  status: "published",
  addedAt: "2026-10-05",
} as const;

export function metaJson(slug: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...BASE_META, slug, ...overrides }, null, 2);
}

export const SIMPLE_TSX = `export function Widget() {
  return null;
}
`;

export const SIMPLE_DEMO = `import { Widget } from "./ok-widget";

export default function Demo() {
  return null;
}
`;

/** Demo importing the given slug (keeps fixtures consistent per item). */
export function demoTsx(slug: string): string {
  return `import { Widget } from "./${slug}";

export default function Demo() {
  return null;
}
`;
}

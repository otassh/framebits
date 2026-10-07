import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RegistryItemModel } from "./types.js";
import { planPreviewAssets, previewCacheName, previewTargets } from "./previews.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function component(hash = `sha256:${"a".repeat(64)}`): RegistryItemModel {
  return {
    slug: "framebits-logo-3d",
    meta: {
      slug: "framebits-logo-3d",
      title: "FrameBits Logo 3D",
      type: "component",
      category: "3d",
      tags: ["3d"],
      description: "Interactive FrameBits logo preview.",
      dependencies: {},
      registryDependencies: [],
      difficulty: "hard",
      performance: "heavy",
      status: "published",
      addedAt: "2026-10-06",
    },
    files: [],
    dependencies: {},
    registryDependencies: [],
    hash,
  };
}

function webpBytes(): Uint8Array {
  return new TextEncoder().encode("RIFF0000WEBPVP8 ");
}

describe("preview cache", () => {
  it("keys cached images by slug and component hash", () => {
    const hash = `sha256:${"b".repeat(64)}`;
    expect(previewCacheName("aurora-text", hash)).toBe(`aurora-text@${"b".repeat(64)}.webp`);
  });

  it("derives the trusted demo and public output paths", () => {
    const [target] = previewTargets("/registry", "/cache", [component()]);
    expect(target).toMatchObject({
      slug: "framebits-logo-3d",
      demoPath: join("/registry", "components", "3d", "framebits-logo-3d", "demo.tsx"),
      outputPath: "previews/framebits-logo-3d.webp",
    });
  });

  it("reuses a valid cached WebP and reports a hash change as missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-cache-test-"));
    roots.push(root);
    const registryRoot = join(root, "registry");
    const cacheDir = join(registryRoot, "previews");
    await mkdir(cacheDir, { recursive: true });
    const initial = component();
    await writeFile(join(cacheDir, previewCacheName(initial.slug, initial.hash)), webpBytes());

    const reused = await planPreviewAssets(registryRoot, cacheDir, [initial]);
    expect(reused.reused.map((target) => target.slug)).toEqual(["framebits-logo-3d"]);
    expect(reused.missing).toEqual([]);
    expect([...new Uint8Array(reused.assets.get("previews/framebits-logo-3d.webp") ?? [])]).toEqual([
      ...webpBytes(),
    ]);

    const changed = await planPreviewAssets(
      registryRoot,
      cacheDir,
      [component(`sha256:${"c".repeat(64)}`)],
    );
    expect(changed.reused).toEqual([]);
    expect(changed.missing.map((target) => target.slug)).toEqual(["framebits-logo-3d"]);
  });

  it("rejects malformed cached content", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-invalid-test-"));
    roots.push(root);
    const registryRoot = join(root, "registry");
    const cacheDir = join(registryRoot, "previews");
    await mkdir(cacheDir, { recursive: true });
    const item = component();
    await writeFile(join(cacheDir, previewCacheName(item.slug, item.hash)), "not-webp", "utf8");
    const planned = await planPreviewAssets(registryRoot, cacheDir, [item]);
    expect(planned.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["PREVIEW_INVALID"]);
  });
});

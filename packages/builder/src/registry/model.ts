import { computeItemHash, normalizeContent } from "@framebits/shared";
import type { ComponentStyles, Meta, Playground } from "@framebits/shared";
import type { ModelFile, RegistryItemModel } from "./types.js";

export interface ModelInputs {
  meta: Meta;
  /** Raw source text of `<slug>.tsx` / `<slug>.ts`. */
  sourceText: string;
  /** Raw `<slug>.css` text (components only). */
  cssText: string | undefined;
  styles: ComponentStyles | undefined;
  /** Validated playground (attached for emit; never hashed). */
  playground: Playground | undefined;
}

/**
 * Build the in-memory item model (D9). Content is source text passed through
 * shared `normalizeContent` ONLY — the builder never rewrites imports (D8).
 * `files[].type` always equals the item type (the RegistryItem enum cannot and
 * need not express anything else: a css file belongs to a component item).
 */
export function buildItemModel(input: ModelInputs): RegistryItemModel {
  const { meta } = input;
  const files: ModelFile[] = [
    {
      path: targetPath(meta),
      content: normalizeContent(input.sourceText),
      type: meta.type,
      variant: "ts-tw",
    },
  ];
  if (input.cssText !== undefined && meta.type === "component") {
    files.push({
      path: `components/ui/${meta.slug}.css`,
      content: normalizeContent(input.cssText),
      type: meta.type,
      variant: "ts-tw",
    });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const model: RegistryItemModel = {
    slug: meta.slug,
    meta,
    files,
    dependencies: { ...meta.dependencies },
    registryDependencies: [...meta.registryDependencies],
    hash: "",
  };
  if (input.styles?.tailwind !== undefined) model.tailwind = input.styles.tailwind;
  if (input.styles?.cssVars !== undefined) model.cssVars = input.styles.cssVars;
  if (input.playground !== undefined) model.playground = input.playground;
  // computeItemHash takes no version (ItemHashInput has none), so no placeholder
  // is needed: the hash covers exactly the included fields, nothing else.
  model.hash = computeItemHash({
    type: meta.type,
    dependencies: model.dependencies,
    registryDependencies: model.registryDependencies,
    files: model.files.map((file) => ({
      path: file.path,
      content: file.content,
      type: file.type,
      variant: file.variant,
    })),
    ...(model.tailwind !== undefined ? { tailwind: model.tailwind } : {}),
    ...(model.cssVars !== undefined ? { cssVars: model.cssVars } : {}),
  });
  return model;
}

function targetPath(meta: Meta): string {
  if (meta.type === "component") return `components/ui/${meta.slug}.tsx`;
  if (meta.type === "lib") return `lib/${meta.slug}.ts`;
  return `hooks/${meta.slug}.ts`;
}

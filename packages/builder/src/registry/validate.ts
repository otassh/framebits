import {
  ComponentStylesSchema,
  MetaSchema,
  type ComponentStyles,
  type Meta,
} from "@algorithco-ui/shared";
import type { DiscoveredFile, DiscoveredItem } from "./discover.js";
import type { Diagnostic } from "./types.js";
function err(diagnostics: Diagnostic[], diagnostic: Diagnostic): void {
  diagnostics.push(diagnostic);
}

export interface ValidatedItem {
  dirRel: string;
  meta: Meta | undefined;
  filesByName: Map<string, DiscoveredFile>;
  styles: ComponentStyles | undefined;
}

/** Parse meta.json. META_INVALID covers unreadable JSON and schema failures. */
export function parseItemMeta(
  item: DiscoveredItem,
  diagnostics: Diagnostic[],
): { meta: Meta | undefined; metaText: string | undefined } {
  const direct = item.files.find((file) => file.relPath === `${item.dirRel}/meta.json`);
  if (direct === undefined || direct.text === undefined) {
    return { meta: undefined, metaText: undefined };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(direct.text) as unknown;
  } catch (error) {
    err(diagnostics, {
      severity: "error",
      code: "META_INVALID",
      file: direct.relPath,
      message: `meta.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { meta: undefined, metaText: direct.text };
  }
  const parsed = MetaSchema.safeParse(raw);
  if (!parsed.success) {
    err(diagnostics, {
      severity: "error",
      code: "META_INVALID",
      file: direct.relPath,
      message: `meta.json is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`,
    });
    return { meta: undefined, metaText: direct.text };
  }
  return { meta: parsed.data, metaText: direct.text };
}

/** Parse styles.json when present. STYLES_INVALID on any failure. */
export function parseItemStyles(
  item: DiscoveredItem,
  diagnostics: Diagnostic[],
): ComponentStyles | undefined {
  const direct = item.files.find((file) => file.relPath === `${item.dirRel}/styles.json`);
  if (direct === undefined) return undefined;
  if (direct.text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(direct.text) as unknown;
  } catch (error) {
    err(diagnostics, {
      severity: "error",
      code: "STYLES_INVALID",
      file: direct.relPath,
      message: `styles.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
  const parsed = ComponentStylesSchema.safeParse(raw);
  if (!parsed.success) {
    err(diagnostics, {
      severity: "error",
      code: "STYLES_INVALID",
      file: direct.relPath,
      message: `styles.json is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`,
    });
    return undefined;
  }
  return parsed.data;
}

interface Location {
  kind: "components" | "lib" | "other";
  category: string | undefined;
  folder: string | undefined;
}

function locate(dirRel: string): Location {
  const parts = dirRel.split("/");
  if (parts.length === 3 && parts[0] === "components") {
    return { kind: "components", category: parts[1], folder: parts[2] };
  }
  if (parts.length === 2 && parts[0] === "lib") {
    return { kind: "lib", category: undefined, folder: parts[1] };
  }
  return { kind: "other", category: undefined, folder: undefined };
}

/**
 * Validate directory layout (D4): folder == slug, parent == category (components),
 * meta.type matches the location, required/optional file set (anything else is
 * UNEXPECTED_FILE). Name-based checks need a parsed meta; the location shape is
 * always checked.
 */
export function validateLayout(
  item: DiscoveredItem,
  meta: Meta | undefined,
  diagnostics: Diagnostic[],
): void {
  const location = locate(item.dirRel);
  const metaRel = `${item.dirRel}/meta.json`;
  const names = new Set(item.files.map((file) => file.relPath.slice(item.dirRel.length + 1)));

  if (location.kind === "other") {
    err(diagnostics, {
      severity: "error",
      code: "LAYOUT_INVALID",
      file: metaRel,
      message: `item directory "${item.dirRel}" must be registry/components/<category>/<slug>/ or registry/lib/<slug>/`,
    });
    return;
  }
  if (meta === undefined) return;

  if (location.kind === "components" && (meta.type === "lib" || meta.type === "hook")) {
    err(diagnostics, {
      severity: "error",
      code: "LAYOUT_INVALID",
      file: metaRel,
      message: `type "${meta.type}" must live under registry/lib/, not registry/components/`,
    });
    return;
  }
  if (location.kind === "lib" && meta.type === "component") {
    err(diagnostics, {
      severity: "error",
      code: "LAYOUT_INVALID",
      file: metaRel,
      message: `type "component" must live under registry/components/<category>/, not registry/lib/`,
    });
    return;
  }

  if (location.folder !== meta.slug) {
    err(diagnostics, {
      severity: "error",
      code: "SLUG_FOLDER_MISMATCH",
      file: metaRel,
      message: `folder "${location.folder ?? ""}" does not match slug "${meta.slug}"`,
    });
  }
  if (location.kind === "components" && location.category !== meta.category) {
    err(diagnostics, {
      severity: "error",
      code: "CATEGORY_FOLDER_MISMATCH",
      file: metaRel,
      message: `parent folder "${location.category ?? ""}" does not match category "${meta.category}"`,
    });
  }

  const source = meta.type === "component" ? `${meta.slug}.tsx` : `${meta.slug}.ts`;
  if (!names.has(source)) {
    err(diagnostics, {
      severity: "error",
      code: "MISSING_SOURCE",
      file: metaRel,
      message: `missing source file "${source}"`,
    });
  }
  const allowed = new Set<string>(["meta.json", source]);
  if (meta.type === "component") {
    allowed.add("demo.tsx");
    allowed.add(`${meta.slug}.css`);
    allowed.add("styles.json");
    if (!names.has("demo.tsx")) {
      err(diagnostics, {
        severity: "error",
        code: "MISSING_DEMO",
        file: metaRel,
        message: 'missing "demo.tsx" (required for type "component")',
      });
    }
  }
  for (const name of [...names].sort()) {
    if (!allowed.has(name)) {
      err(diagnostics, {
        severity: "error",
        code: "UNEXPECTED_FILE",
        file: `${item.dirRel}/${name}`,
        message: `unexpected file "${name}" in item directory`,
        hint: "Remove it or, for components, keep only <slug>.tsx, demo.tsx, meta.json, <slug>.css, styles.json.",
      });
    }
  }
}

/** Same slug in more than one item directory (across components and lib). */
export function checkDuplicateSlugs(
  metas: Array<{ item: DiscoveredItem; meta: Meta }>,
  diagnostics: Diagnostic[],
): void {
  const bySlug = new Map<string, string[]>();
  for (const { item, meta } of metas) {
    const dirs = bySlug.get(meta.slug) ?? [];
    dirs.push(item.dirRel);
    bySlug.set(meta.slug, dirs);
  }
  for (const [slug, dirs] of [...bySlug].sort()) {
    if (dirs.length > 1) {
      for (const dir of dirs) {
        err(diagnostics, {
          severity: "error",
          code: "DUPLICATE_SLUG",
          file: `${dir}/meta.json`,
          message: `slug "${slug}" is defined in ${String(dirs.length)} places (${dirs.join(", ")})`,
        });
      }
    }
  }
}

export interface DepTarget {
  status: "draft" | "published" | "deprecated";
}

/**
 * Published/deprecated items must not depend on draft or missing items
 * (REGISTRY_DEP_DRAFT / REGISTRY_DEP_MISSING). Drafts are fully validated too.
 */
export function checkRegistryDeps(
  metas: Array<{ item: DiscoveredItem; meta: Meta }>,
  diagnostics: Diagnostic[],
): void {
  const known = new Map<string, DepTarget>();
  for (const { meta } of metas) {
    known.set(meta.slug, { status: meta.status });
  }
  for (const { item, meta } of metas) {
    const dirRel = item.dirRel;
    for (const dep of [...meta.registryDependencies].sort()) {
      const target = known.get(dep);
      if (target === undefined) {
        err(diagnostics, {
          severity: "error",
          code: "REGISTRY_DEP_MISSING",
          file: `${dirRel}/meta.json`,
          message: `registryDependency "${dep}" does not exist`,
          hint: "Add the item or remove it from registryDependencies.",
        });
      } else if (target.status === "draft") {
        err(diagnostics, {
          severity: "error",
          code: "REGISTRY_DEP_DRAFT",
          file: `${dirRel}/meta.json`,
          message: `"${meta.slug}" (${meta.status}) depends on draft item "${dep}"`,
          hint: "Published and deprecated items must only depend on published items.",
        });
      }
    }
  }
}

/**
 * Report dependency cycles with the full path (`a -> b -> c -> a`).
 * Edges to unknown slugs are ignored here (REGISTRY_DEP_MISSING covers them).
 */
export function checkCycles(
  metas: Array<{ item: DiscoveredItem; meta: Meta }>,
  diagnostics: Diagnostic[],
): void {
  const edges = new Map<string, string[]>();
  for (const { meta } of metas) {
    edges.set(meta.slug, [...meta.registryDependencies].sort());
  }
  const known = new Set(edges.keys());
  const seen = new Set<string>();
  const cycles: string[][] = [];

  for (const start of [...known].sort()) {
    const stack: string[] = [];
    const onStack = new Set<string>();
    const visit = (node: string): void => {
      stack.push(node);
      onStack.add(node);
      for (const next of edges.get(node) ?? []) {
        if (!known.has(next)) continue;
        if (onStack.has(next)) {
          const at = stack.indexOf(next);
          cycles.push([...stack.slice(at), next]);
        } else if (!seen.has(next)) {
          visit(next);
        }
      }
      stack.pop();
      onStack.delete(node);
      seen.add(node);
    };
    if (!seen.has(start)) visit(start);
  }

  const unique = new Map<string, string[]>();
  for (const cycle of cycles) {
    const key = [...cycle].sort().join("|");
    if (!unique.has(key)) unique.set(key, cycle);
  }
  for (const cycle of [...unique.values()].sort((a, b) => (a.join("") < b.join("") ? -1 : 1))) {
    const first = cycle[0] as string;
    const holder = metas.find((m) => m.meta.slug === first);
    err(diagnostics, {
      severity: "error",
      code: "REGISTRY_DEP_CYCLE",
      file: `${holder?.item.dirRel ?? ""}/meta.json`,
      message: `dependency cycle: ${cycle.join(" -> ")}`,
    });
  }
}

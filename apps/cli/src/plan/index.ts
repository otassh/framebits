/**
 * Plan-then-apply: build the COMPLETE plan before writing anything (C11, E2).
 */
import type { RegistryItem } from "@framebits/shared";
import { integrityError } from "../errors.js";
import { MAX_TOTAL_BYTES, MAX_TOTAL_FILES } from "../resolve/verify.js";
import { rewriteImports, type AliasPrefixes } from "../rewrite/index.js";
import { detectCollision, scanMarkers } from "../styles/patch.js";
import { generateBlock, generateBlockInner, type TailwindMajor } from "../styles/generate.js";
import { validateStyles, type ValidatedStyles } from "../styles/validate.js";

export type FileAction = "create" | "unchanged" | "conflict";

export interface PlannedFile {
  itemSlug: string;
  itemVersion: string;
  registryPath: string;
  targetAbs: string;
  targetRel: string;
  action: FileAction;
  content: string;
  caseCollisionWith: string | undefined;
}

export interface ManualSteps {
  installCommand: string;
  missingDeps: string[];
  tailwindSnippet: string;
}

export type CssPlanAction = "create" | "unchanged" | "conflict" | "skip";

export interface CssBlockPlan {
  slug: string;
  itemVersion: string;
  cssAbs: string;
  cssRel: string;
  action: CssPlanAction;
  /** Full marker block with LF endings (exact text for dry-run). */
  block: string;
  blockInner: string;
  /** Set when action is skip: why + exact manual snippet. */
  skipReason: string | undefined;
  manualSnippet: string | undefined;
}

export interface MalformedCss {
  cssAbs: string;
  cssRel: string;
  slug: string;
  reason: string;
  manualSnippet: string;
}

export interface StylesPlanContext {
  tailwindVersion: TailwindMajor | undefined;
  cssAbs: string | undefined;
  cssRel: string | undefined;
  /** Undefined when the CSS entry is missing on disk. */
  cssContent: string | undefined;
  noStyles: boolean;
}

export interface BuildPlanInput {
  items: readonly RegistryItem[];
  aliases: AliasPrefixes;
  aliasDirs: { components: string; lib: string; hooks: string };
  projectRoot: string;
  /** Existing file contents keyed by absolute path (LF-normalized by caller). */
  existing: ReadonlyMap<string, string>;
  /** All existing absolute paths (for case-collision detection). */
  existingPaths: readonly string[];
  installed: Record<string, { version: string; hash: string }>;
  installCommandFor: (specs: ReadonlyArray<{ name: string; range: string }>) => string;
  styles?: StylesPlanContext | undefined;
}

export interface ItemPlanStatus {
  slug: string;
  status: "install" | "already-installed";
}

export interface BuildPlan {
  files: PlannedFile[];
  statuses: ItemPlanStatus[];
  manual: ManualSteps;
  conflicts: PlannedFile[];
  css: CssBlockPlan[];
  cssConflicts: CssBlockPlan[];
  malformedCss: MalformedCss[];
}

function normalizeLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function joinAbs(dir: string, rel: string): string {
  const cleanDir = dir.replace(/\/+$/, "");
  const cleanRel = rel.replace(/^\/+/, "");
  return `${cleanDir}/${cleanRel}`;
}

function relativePosix(root: string, abs: string): string {
  const cleanRoot = root.replace(/\/+$/, "");
  if (abs === cleanRoot) return ".";
  if (abs.startsWith(`${cleanRoot}/`)) return abs.slice(cleanRoot.length + 1);
  return abs;
}

export function mapRegistryPath(
  registryPath: string,
  aliasDirs: { components: string; lib: string; hooks: string },
): string {
  if (registryPath.startsWith("components/ui/")) {
    return joinAbs(aliasDirs.components, registryPath.slice("components/ui/".length));
  }
  if (registryPath.startsWith("lib/")) {
    return joinAbs(aliasDirs.lib, registryPath.slice("lib/".length));
  }
  if (registryPath.startsWith("hooks/")) {
    return joinAbs(aliasDirs.hooks, registryPath.slice("hooks/".length));
  }
  throw integrityError(
    `registry file path "${registryPath}" has an unknown prefix`,
    "report the registry content; only components/ui, lib and hooks are supported",
  );
}

/**
 * NOTE (snapshot freshness): `existing`/`existingPaths` are a point-in-time
 * snapshot. The plan is complete before any write, but disk may change
 * between planning and applying — applyPlan re-checks every target
 * (create-must-still-be-absent, unchanged-must-still-match) and aborts on
 * drift instead of clobbering.
 */
export function buildPlan(input: BuildPlanInput): BuildPlan {
  const seen = new Map<string, string>();
  const seenLower = new Map<string, string>();
  const files: PlannedFile[] = [];
  const lowerIndex = new Map<string, string>();
  for (const existing of input.existingPaths) {
    const lower = existing.toLowerCase();
    if (!lowerIndex.has(lower)) lowerIndex.set(lower, existing);
  }
  let totalBytes = 0;

  for (const item of input.items) {
    for (const file of [...item.files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      const targetAbs = mapRegistryPath(file.path, input.aliasDirs);
      const owner = seen.get(targetAbs);
      if (owner !== undefined) {
        throw integrityError(
          `two items target the same path "${relativePosix(input.projectRoot, targetAbs)}" (${owner} and ${item.slug})`,
          "report the registry content",
        );
      }
      // Case-insensitive duplicate detection across the whole plan (exit 4):
      // on case-insensitive filesystems two targets differing only by case
      // would clobber each other. This covers both two planned files and a
      // planned file shadowing an earlier planned target via lowerIndex.
      const lowerTarget = targetAbs.toLowerCase();
      const priorOwner = seenLower.get(lowerTarget);
      if (priorOwner !== undefined && priorOwner !== item.slug) {
        throw integrityError(
          `two items target the same path case-insensitively "${relativePosix(input.projectRoot, targetAbs)}" (${priorOwner} and ${item.slug})`,
          "report the registry content; paths must differ beyond case",
        );
      }
      const shadowedPlan = lowerIndex.get(lowerTarget);
      if (
        shadowedPlan !== undefined && shadowedPlan !== targetAbs &&
        seen.has(shadowedPlan)
      ) {
        throw integrityError(
          `two planned files collide case-insensitively "${relativePosix(input.projectRoot, targetAbs)}"`,
          "report the registry content; paths must differ beyond case",
        );
      }
      seen.set(targetAbs, item.slug);
      if (!seenLower.has(lowerTarget)) seenLower.set(lowerTarget, item.slug);
      // Re-seed: later planned files must see earlier planned targets as
      // occupied (case-insensitive), not just pre-existing disk paths.
      if (!lowerIndex.has(lowerTarget)) lowerIndex.set(lowerTarget, targetAbs);
      const rewritten = rewriteImports(file.content, input.aliases);
      const content = normalizeLF(rewritten.content).endsWith("\n")
        ? normalizeLF(rewritten.content)
        : `${normalizeLF(rewritten.content)}\n`;
      totalBytes += Buffer.byteLength(content, "utf8");
      if (files.length + 1 > MAX_TOTAL_FILES) {
        throw integrityError(
          `plan exceeds ${String(MAX_TOTAL_FILES)} files total`,
          "the dependency graph is too large; report it",
        );
      }
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw integrityError(
          `plan exceeds ${String(MAX_TOTAL_BYTES)} bytes total`,
          "the registry response is too large; report it",
        );
      }
      const existing = input.existing.get(targetAbs);
      let action: FileAction;
      let caseCollisionWith: string | undefined;
      if (existing !== undefined) {
        action = normalizeLF(existing) === content ? "unchanged" : "conflict";
      } else {
        const collision = lowerIndex.get(targetAbs.toLowerCase());
        if (collision !== undefined && collision !== targetAbs) {
          action = "conflict";
          caseCollisionWith = collision;
        } else {
          action = "create";
        }
      }
      files.push({
        itemSlug: item.slug,
        itemVersion: item.version,
        registryPath: file.path,
        targetAbs,
        targetRel: relativePosix(input.projectRoot, targetAbs),
        action,
        content,
        caseCollisionWith,
      });
    }
  }

  files.sort((a, b) => (a.targetAbs < b.targetAbs ? -1 : 1));

  const styled = planStyles(input);
  const css = styled.plans;
  const bySlugCss = new Map(css.map((entry) => [entry.slug, entry]));

  const statuses: ItemPlanStatus[] = input.items.map((item) => {
    const recorded = input.installed[item.slug];
    if (recorded !== undefined && recorded.hash === item.hash) {
      const itemFiles = files.filter((file) => file.itemSlug === item.slug);
      const cssEntry = bySlugCss.get(item.slug);
      const cssOk = cssEntry === undefined || cssEntry.action === "unchanged";
      if (itemFiles.length > 0 && itemFiles.every((file) => file.action === "unchanged") && cssOk) {
        return { slug: item.slug, status: "already-installed" };
      }
    }
    return { slug: item.slug, status: "install" };
  });

  const missing: Array<{ name: string; range: string }> = [];
  const seenMissing = new Set<string>();
  for (const item of input.items) {
    for (const [name, range] of Object.entries(item.dependencies)) {
      if (!seenMissing.has(name)) {
        seenMissing.add(name);
        missing.push({ name, range });
      }
    }
  }
  missing.sort((a, b) => (a.name < b.name ? -1 : 1));
  const installCommand = missing.length > 0 ? input.installCommandFor(missing) : "";

  const manual: ManualSteps = {
    installCommand,
    missingDeps: missing.map((spec) => spec.name),
    tailwindSnippet: css
      .filter((entry) => entry.action !== "unchanged")
      .map((entry) => entry.block)
      .join("\n"),
  };
  return {
    files,
    statuses,
    manual,
    conflicts: files.filter((file) => file.action === "conflict"),
    css,
    cssConflicts: css.filter((entry) => entry.action === "conflict"),
    malformedCss: styled.malformed,
  };
}

function styledItems(
  items: readonly RegistryItem[],
): Array<{ slug: string; version: string; tailwind: unknown; cssVars: unknown }> {
  return items
    .filter((item) => item.tailwind !== undefined || item.cssVars !== undefined)
    .map((item) => ({
      slug: item.slug,
      version: item.version,
      tailwind: item.tailwind,
      cssVars: item.cssVars,
    }));
}

function toJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** Manual snippet for skipped styles: known version form, or both forms. */
function manualSnippetFor(
  slug: string,
  validated: ValidatedStyles,
  version: TailwindMajor | undefined,
): string {
  if (version !== undefined) return generateBlock(slug, validated, version);
  return [
    "v3 form:",
    generateBlock(slug, validated, 3),
    "",
    "v4 form:",
    generateBlock(slug, validated, 4),
  ].join("\n");
}

function planStyles(input: BuildPlanInput): { plans: CssBlockPlan[]; malformed: MalformedCss[] } {
  const out: CssBlockPlan[] = [];
  const malformed: MalformedCss[] = [];
  const styled = styledItems(input.items);
  if (styled.length === 0) return { plans: out, malformed };
  // Validate ALL styled items first (exit 4 before anything is generated).
  const validated = new Map<string, ValidatedStyles>();
  for (const item of styled) {
    const tailwind = toJsonRecord(item.tailwind);
    const cssVars = toJsonRecord(item.cssVars);
    validated.set(
      item.slug,
      validateStyles(
        item.slug,
        tailwind === undefined
          ? undefined
          : {
            keyframes: toJsonRecord(tailwind["keyframes"]),
            animation: toJsonRecord(tailwind["animation"]),
          },
        cssVars === undefined
          ? undefined
          : { light: toJsonRecord(cssVars["light"]), dark: toJsonRecord(cssVars["dark"]) },
      ),
    );
  }

  // Total ≤500 declarations per CSS entry (exit 4): per-item caps (50) are
  // enforced in validateStyles; this bounds the sum across all styled items
  // targeting the same file.
  const MAX_TOTAL_CSS_DECLARATIONS = 500;
  let totalDeclarations = 0;
  for (const item of styled) {
    const entry = validated.get(item.slug);
    if (entry !== undefined) {
      totalDeclarations += entry.declarationCount;
      if (totalDeclarations > MAX_TOTAL_CSS_DECLARATIONS) {
        throw integrityError(
          `styled items exceed ${String(MAX_TOTAL_CSS_DECLARATIONS)} declarations total for the CSS entry`,
          "report the registry content; style data is too large",
        );
      }
    }
  }

  const context = input.styles;
  for (const item of styled) {
    const itemValidated = validated.get(item.slug) as ValidatedStyles;
    const skip = (
      reason: string,
      version: TailwindMajor | undefined,
    ): CssBlockPlan => ({
      slug: item.slug,
      itemVersion: item.version,
      cssAbs: context?.cssAbs ?? "",
      cssRel: context?.cssRel ?? "",
      action: "skip",
      block: "",
      blockInner: "",
      skipReason: reason,
      manualSnippet: manualSnippetFor(item.slug, itemValidated, version),
    });
    if (context === undefined || context.noStyles) {
      out.push(skip(context?.noStyles === true ? "--no-styles: styles patching disabled" : "styles planning disabled", context?.tailwindVersion));
      continue;
    }
    if (context.tailwindVersion === undefined) {
      out.push(skip("no Tailwind version detected", undefined));
      continue;
    }
    if (context.cssAbs === undefined || context.cssContent === undefined) {
      out.push(skip("CSS entry not set or missing on disk", context.tailwindVersion));
      continue;
    }
    const version = context.tailwindVersion;
    const blockInner = generateBlockInner(itemValidated, version);
    const block = generateBlock(item.slug, itemValidated, version);
    const cssRel = context.cssRel ?? context.cssAbs;
    const scan = scanMarkers(context.cssContent);
    if (scan.malformed !== undefined) {
      malformed.push({
        cssAbs: context.cssAbs,
        cssRel,
        slug: item.slug,
        reason: scan.malformed,
        manualSnippet: block,
      });
      continue;
    }
    const existing = scan.blocks.find((found) => found.slug === item.slug);
    if (existing !== undefined) {
      const normalize = (text: string): string => text.replace(/\r\n/g, "\n");
      if (normalize(existing.inner) === `\n${normalize(blockInner)}\n`) {
        out.push({
          slug: item.slug,
          itemVersion: item.version,
          cssAbs: context.cssAbs,
          cssRel: context.cssRel ?? context.cssAbs,
          action: "unchanged",
          block,
          blockInner,
          skipReason: undefined,
          manualSnippet: undefined,
        });
        continue;
      }
      out.push({
        slug: item.slug,
        itemVersion: item.version,
        cssAbs: context.cssAbs,
        cssRel: context.cssRel ?? context.cssAbs,
        action: "conflict",
        block,
        blockInner,
        skipReason: undefined,
        manualSnippet: undefined,
      });
      continue;
    }
    const names = {
      keyframes: itemValidated.keyframes.map((frame) => frame.name),
      animations: itemValidated.animations.map((anim) => anim.name),
    };
    const collision = detectCollision(
      context.cssContent,
      scan.blocks,
      item.slug,
      names,
      (haystack, kind, name) => definitionPresent(haystack, kind, name, itemValidated, version),
    );
    // Cross-item collision within this same plan: two new blocks defining the
    // same keyframe/animation name would both be "create" — search the blocks
    // already planned in this run too (all blocks, not just disk).
    let plannedCollision: string | undefined;
    for (const planned of out) {
      if (planned.action !== "create" && planned.action !== "conflict") continue;
      const plannedValidated = validated.get(planned.slug);
      if (plannedValidated === undefined) continue;
      for (const name of names.keyframes) {
        if (plannedValidated.keyframes.some((frame) => frame.name === name)) {
          plannedCollision =
            `keyframe "${name}" is also defined by "${planned.slug}" in this run (manual merge required)`;
          break;
        }
      }
      if (plannedCollision === undefined) {
        for (const name of names.animations) {
          if (plannedValidated.animations.some((anim) => anim.name === name)) {
            plannedCollision =
              `animation "${name}" is also defined by "${planned.slug}" in this run (manual merge required)`;
            break;
          }
        }
      }
      if (plannedCollision !== undefined) break;
    }
    const effectiveCollision = collision ?? plannedCollision;
    if (effectiveCollision !== undefined) {
      out.push({
        slug: item.slug,
        itemVersion: item.version,
        cssAbs: context.cssAbs,
        cssRel: context.cssRel ?? context.cssAbs,
        action: "skip",
        block,
        blockInner,
        skipReason: effectiveCollision,
        manualSnippet: block,
      });
      continue;
    }
    out.push({
      slug: item.slug,
      itemVersion: item.version,
      cssAbs: context.cssAbs,
      cssRel: context.cssRel ?? context.cssAbs,
      action: "create",
      block,
      blockInner,
      skipReason: undefined,
      manualSnippet: undefined,
    });
  }
  out.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  malformed.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  return { plans: out, malformed };
}

function definitionPresent(
  haystack: string,
  kind: "keyframe" | "animate-var" | "animate-class",
  name: string,
  validated: ValidatedStyles,
  version: TailwindMajor,
): boolean {
  if (kind === "keyframe") {
    const frame = validated.keyframes.find((entry) => entry.name === name);
    if (frame === undefined) return false;
    const [first] = frame.frames;
    if (first === undefined) return false;
    const decl = first.declarations[0];
    if (decl === undefined) return true;
    return haystack.includes(`${decl.property}: ${decl.value};`);
  }
  const anim = validated.animations.find((entry) => entry.name === name);
  if (anim === undefined) return false;
  if (version === 4 || kind === "animate-var") {
    return haystack.includes(`--animate-${name}: ${anim.value};`);
  }
  return haystack.includes(`animation: ${anim.value};`);
}

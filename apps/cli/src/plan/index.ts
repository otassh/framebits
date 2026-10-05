/**
 * Plan-then-apply: build the COMPLETE plan before writing anything (C11).
 */
import type { RegistryItem } from "@algorithco-ui/shared";
import { integrityError } from "../errors.js";
import { rewriteImports, type AliasPrefixes } from "../rewrite/index.js";

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
  installCommandFor: (deps: readonly string[]) => string;
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

export function buildPlan(input: BuildPlanInput): BuildPlan {
  const seen = new Map<string, string>();
  const files: PlannedFile[] = [];
  const lowerIndex = new Map<string, string>();
  for (const existing of input.existingPaths) {
    const lower = existing.toLowerCase();
    if (!lowerIndex.has(lower)) lowerIndex.set(lower, existing);
  }

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
      seen.set(targetAbs, item.slug);
      const rewritten = rewriteImports(file.content, input.aliases);
      const content = normalizeLF(rewritten.content).endsWith("\n")
        ? normalizeLF(rewritten.content)
        : `${normalizeLF(rewritten.content)}\n`;
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

  const statuses: ItemPlanStatus[] = input.items.map((item) => {
    const recorded = input.installed[item.slug];
    if (recorded !== undefined && recorded.hash === item.hash) {
      const itemFiles = files.filter((file) => file.itemSlug === item.slug);
      if (itemFiles.length > 0 && itemFiles.every((file) => file.action === "unchanged")) {
        return { slug: item.slug, status: "already-installed" };
      }
    }
    return { slug: item.slug, status: "install" };
  });

  const missing = new Map<string, string>();
  for (const item of input.items) {
    for (const [name, range] of Object.entries(item.dependencies)) {
      if (!missing.has(name)) missing.set(name, range);
    }
  }
  const missingNames = [...missing.keys()].sort();
  const installCommand = missingNames.length > 0
    ? input.installCommandFor(missingNames)
    : "";

  const tailwindParts: string[] = [];
  for (const item of input.items) {
    if (item.tailwind !== undefined) {
      tailwindParts.push(
        `// ${item.slug}: tailwind fragment ${JSON.stringify(item.tailwind)}`,
      );
    }
    if (item.cssVars !== undefined) {
      tailwindParts.push(`// ${item.slug}: cssVars ${JSON.stringify(item.cssVars)}`);
    }
  }
  const manual: ManualSteps = {
    installCommand,
    missingDeps: missingNames,
    tailwindSnippet: tailwindParts.join("\n"),
  };
  return {
    files,
    statuses,
    manual,
    conflicts: files.filter((file) => file.action === "conflict"),
  };
}

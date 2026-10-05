import ts from "typescript";
import type { ComponentStyles, Meta } from "@algorithco-ui/shared";
import { discoverRegistry, type DiscoveredItem } from "./discover.js";
import {
  analyzeSource,
  checkImports,
  type ImportCheckContext,
} from "./imports.js";
import { buildItemModel } from "./model.js";
import { scanSecurity } from "./security.js";
import { runTypecheck, type TypecheckItem } from "./typecheck.js";
import {
  checkCycles,
  checkDuplicateSlugs,
  checkRegistryDeps,
  parseItemMeta,
  parseItemStyles,
  validateLayout,
} from "./validate.js";
import {
  compareDiagnostics,
  type Diagnostic,
  type LoadRegistryOptions,
  type LoadRegistryResult,
  type RegistryItemModel,
  type RegistrySummary,
} from "./types.js";

export { compareDiagnostics };
export type {
  Diagnostic,
  LoadRegistryOptions,
  LoadRegistryResult,
  ModelFile,
  RegistryItemModel,
  RegistrySummary,
} from "./types.js";

/**
 * Load and validate the whole registry (Task 4a: discovery, validation, import
 * analysis, security scan, hashing). Collects ALL diagnostics, never stops at
 * the first, and returns them in deterministic order. Sources are only parsed
 * as text with the TypeScript compiler API — never executed or imported.
 */
export async function loadRegistry(options: LoadRegistryOptions): Promise<LoadRegistryResult> {
  const registryRoot = options.registryRoot;
  const diagnostics: Diagnostic[] = [];

  const discovery = await discoverRegistry(registryRoot);
  diagnostics.push(...discovery.diagnostics);

  interface Record {
    item: DiscoveredItem;
    meta: Meta | undefined;
    styles: ComponentStyles | undefined;
  }
  const records: Record[] = discovery.items.map((item) => {
    const { meta } = parseItemMeta(item, diagnostics);
    validateLayout(item, meta, diagnostics);
    const styles = parseItemStyles(item, diagnostics);
    return { item, meta, styles };
  });

  interface ParsedRecord {
    item: DiscoveredItem;
    meta: Meta;
    styles: ComponentStyles | undefined;
  }
  const parsed: ParsedRecord[] = [];
  for (const record of records) {
    if (record.meta !== undefined) {
      parsed.push({ item: record.item, meta: record.meta, styles: record.styles });
    }
  }

  checkDuplicateSlugs(parsed, diagnostics);
  checkRegistryDeps(parsed, diagnostics);
  checkCycles(parsed, diagnostics);

  const knownItems = new Map<string, "component" | "lib" | "hook">();
  for (const { meta } of parsed) knownItems.set(meta.slug, meta.type);

  const items: RegistryItemModel[] = [];
  for (const record of parsed) {
    checkItemContent(record.item, record.meta, knownItems, diagnostics);
    if (record.meta.status === "draft") continue;
    if (hasErrors(record.item.dirRel, diagnostics)) continue;
    const model = buildModel(record);
    if (model !== undefined) items.push(model);
  }

  if (options.skipTypecheck !== true) {
    const tcItems: TypecheckItem[] = [];
    for (const record of parsed) {
      const tc = toTypecheckItem(record.item, record.meta);
      if (tc !== undefined) tcItems.push(tc);
    }
    const typed = await runTypecheck(tcItems);
    diagnostics.push(...typed.diagnostics);
  }

  items.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  diagnostics.sort(compareDiagnostics);

  const summary: RegistrySummary = {
    discovered: parsed.length,
    modeled: items.length,
    byType: { component: 0, lib: 0, hook: 0 },
    byStatus: { draft: 0, published: 0, deprecated: 0 },
    draftSlugs: [],
  };
  for (const { meta } of parsed) {
    summary.byType[meta.type] += 1;
    summary.byStatus[meta.status] += 1;
    if (meta.status === "draft") summary.draftSlugs.push(meta.slug);
  }
  summary.draftSlugs.sort();
  return { registryRoot, items, diagnostics, summary };
}

function hasErrors(dirRel: string, diagnostics: Diagnostic[]): boolean {
  const prefix = `${dirRel}/`;
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.file === dirRel || diagnostic.file.startsWith(prefix)),
  );
}

function ownSourceName(meta: Meta): string {
  return meta.type === "component" ? `${meta.slug}.tsx` : `${meta.slug}.ts`;
}

function checkItemContent(
  item: DiscoveredItem,
  meta: Meta,
  knownItems: ReadonlyMap<string, "component" | "lib" | "hook">,
  diagnostics: Diagnostic[],
): void {
  const byName = new Map(item.files.map((file) => [file.relPath.slice(item.dirRel.length + 1), file]));
  const sourceName = ownSourceName(meta);

  const usedPackages = new Set<string>();
  const usedRegistryDeps = new Set<string>();

  const checkFile = (name: string | undefined, demo: boolean): void => {
    if (name === undefined) return;
    const file = byName.get(name);
    if (file?.text === undefined) return;
    const { imports, syntaxErrors } = analyzeSource(file.text, name);
    for (const syntax of syntaxErrors) {
      diagnostics.push({
        severity: "error",
        code: "PARSE_ERROR",
        file: file.relPath,
        line: syntax.line,
        column: syntax.column,
        message: `syntax error: ${syntax.message}`,
      });
    }
    const ctx: ImportCheckContext = {
      file: file.relPath,
      declaredDeps: meta.dependencies,
      registryDeps: meta.registryDependencies,
      knownItems,
      ownSource: sourceName,
      demo,
    };
    const checked = checkImports(imports, ctx);
    diagnostics.push(...checked.diagnostics);
    for (const name of checked.usedPackages) usedPackages.add(name);
    for (const name of checked.usedRegistryDeps) usedRegistryDeps.add(name);

    for (const issue of scanSecurity(file.text, name)) {
      diagnostics.push({
        severity: issue.severity,
        code: issue.code,
        file: file.relPath,
        line: issue.line,
        column: issue.column,
        message: issue.message,
      });
    }
  };

  checkFile(sourceName, false);
  if (meta.type === "component") {
    const demo = byName.get("demo.tsx");
    if (demo?.text !== undefined) {
      checkFile("demo.tsx", true);
      if (!hasDefaultExport(demo.text)) {
        diagnostics.push({
          severity: "error",
          code: "DEMO_NO_DEFAULT_EXPORT",
          file: demo.relPath,
          message: "demo.tsx must have a default export",
        });
      }
    }
  }

  const metaRel = `${item.dirRel}/meta.json`;
  for (const name of Object.keys(meta.dependencies).sort()) {
    if (!usedPackages.has(name)) {
      diagnostics.push({
        severity: "warning",
        code: "DEP_UNUSED",
        file: metaRel,
        message: `dependency "${name}" is declared but never imported`,
      });
    }
  }
  for (const dep of [...meta.registryDependencies].sort()) {
    if (!usedRegistryDeps.has(dep)) {
      diagnostics.push({
        severity: "warning",
        code: "REGISTRY_DEP_UNUSED",
        file: metaRel,
        message: `registryDependency "${dep}" is listed but never imported`,
      });
    }
  }
}

/** `export default ...` (expression, function, or class) or `export { X as default }`. */
export function hasDefaultExport(text: string): boolean {
  const source = ts.createSourceFile("demo.tsx", text, ts.ScriptTarget.Latest, false);
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) return true;
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      hasDefaultModifier(statement)
    ) {
      return true;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some((element) => element.name.text === "default")
    ) {
      return true;
    }
  }
  return false;
}

function hasDefaultModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) === true;
}

/** Collect the materializable files for type-checking; undefined when skipped. */
function toTypecheckItem(
  item: DiscoveredItem,
  meta: Meta,
): TypecheckItem | undefined {
  const byName = new Map(item.files.map((file) => [file.relPath.slice(item.dirRel.length + 1), file]));
  const sourceName = ownSourceName(meta);
  const source = byName.get(sourceName);
  if (source?.text === undefined) return undefined;
  const files: Record<string, string> = {};
  const target =
    meta.type === "component"
      ? `components/ui/${meta.slug}.tsx`
      : meta.type === "lib"
        ? `lib/${meta.slug}.ts`
        : `hooks/${meta.slug}.ts`;
  files[target] = source.text;
  if (meta.type === "component") {
    const css = byName.get(`${meta.slug}.css`);
    if (css?.text !== undefined) files[`components/ui/${meta.slug}.css`] = css.text;
  }
  const demo = byName.get("demo.tsx");
  return { meta, files, demoText: demo?.text };
}

function buildModel(record: {
  item: DiscoveredItem;
  meta: Meta;
  styles: ComponentStyles | undefined;
}): RegistryItemModel | undefined {
  const { item, meta, styles } = record;
  const byName = new Map(item.files.map((file) => [file.relPath.slice(item.dirRel.length + 1), file]));
  const source = byName.get(ownSourceName(meta));
  if (source?.text === undefined) return undefined;
  const cssName = meta.type === "component" ? `${meta.slug}.css` : undefined;
  const css = cssName === undefined ? undefined : byName.get(cssName);
  if (cssName !== undefined && css !== undefined && css.text === undefined) return undefined;

  const stylesPresent = item.files.some((file) => file.relPath.endsWith("/styles.json"));
  if (stylesPresent && styles === undefined) return undefined;
  return buildItemModel({
    meta,
    sourceText: source.text,
    cssText: css?.text,
    styles,
  });
}

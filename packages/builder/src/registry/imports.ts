import { builtinModules } from "node:module";
import ts from "typescript";
import type { Diagnostic } from "./types.js";

/**
 * Import analysis with the TypeScript compiler API (parse only — sources are
 * NEVER executed or imported). Covers static imports, `import type`,
 * `export ... from`, dynamic `import()`, and `require`.
 */

export type ImportKind = "static" | "type" | "export-from" | "dynamic" | "require";

export interface ImportRef {
  kind: ImportKind;
  /** Literal specifier, or undefined for non-literal dynamic arguments. */
  specifier: string | undefined;
  line: number;
  column: number;
}

export interface SourceSyntaxError {
  line: number;
  column: number;
  message: string;
}

const BUILTINS: ReadonlySet<string> = new Set(builtinModules);
const PEERS = ["react", "react-dom"] as const;
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const DRIVE_PATTERN = /^[A-Za-z]:[\\/]/;

function position(source: ts.SourceFile, pos: number): { line: number; column: number } {
  const { line, character } = source.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, column: character + 1 };
}

/** Collect import references and syntax errors from source text. */
export function analyzeSource(text: string, fileName = "file.tsx"): {
  imports: ImportRef[];
  syntaxErrors: SourceSyntaxError[];
} {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const imports: ImportRef[] = [];
  const syntaxErrors: SourceSyntaxError[] = [];
  // fileName matters: .tsx enables JSX parsing, without it every component fails.
  const transpiled = ts.transpileModule(text, { reportDiagnostics: true, fileName });
  const reported = transpiled.diagnostics ?? [];
  for (const diagnostic of reported) {
    const start = typeof diagnostic.start === "number" ? diagnostic.start : 0;
    const { line, column } = position(source, start);
    syntaxErrors.push({
      line,
      column,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    });
  }

  function literalSpecifier(expression: ts.Expression | undefined): string | undefined {
    if (expression !== undefined && ts.isStringLiteralLike(expression)) return expression.text;
    return undefined;
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const specifier = literalSpecifier(node.moduleSpecifier);
      if (specifier !== undefined) {
        const { line, column } = position(source, node.getStart(source));
        imports.push({
          kind: node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword ? "type" : "static",
          specifier,
          line,
          column,
        });
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      const specifier = literalSpecifier(node.moduleSpecifier);
      if (specifier !== undefined) {
        const { line, column } = position(source, node.getStart(source));
        imports.push({ kind: "export-from", specifier, line, column });
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const first = node.arguments[0];
        const { line, column } = position(source, node.getStart(source));
        imports.push({ kind: "dynamic", specifier: literalSpecifier(first), line, column });
      } else if (ts.isIdentifier(callee) && callee.text === "require") {
        const { line, column } = position(source, node.getStart(source));
        imports.push({ kind: "require", specifier: undefined, line, column });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { imports, syntaxErrors };
}

/** npm package name of a bare specifier (`motion/react` -> `motion`, `@scope/name/x` -> `@scope/name`). */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    const scope = parts[0];
    const name = parts[1];
    return scope !== undefined && name !== undefined ? `${scope}/${name}` : specifier;
  }
  return parts[0] ?? specifier;
}

export function isPeerSpecifier(specifier: string): boolean {
  return PEERS.some((peer) => specifier === peer || specifier.startsWith(`${peer}/`));
}

export function isBuiltinSpecifier(specifier: string): boolean {
  return specifier.startsWith("node:") || BUILTINS.has(specifier);
}

export interface ImportCheckContext {
  /** Repo-relative POSIX path of the importing file (for diagnostics). */
  file: string;
  /** Declared meta.dependencies. */
  declaredDeps: Readonly<Record<string, string>>;
  /** Slugs listed in meta.registryDependencies. */
  registryDeps: readonly string[];
  /** Every known slug -> item type (for alias target checks). */
  knownItems: ReadonlyMap<string, "component" | "lib" | "hook">;
  /** Basename of the item's own source file, e.g. "aurora-text.tsx" (demo may import it). */
  ownSource: string;
  /** When true (demo.tsx), aliases are forbidden and relatives narrow to ownSource. */
  demo: boolean;
}

function diag(
  severity: "error" | "warning",
  code: string,
  ctx: ImportCheckContext,
  ref: ImportRef,
  message: string,
  hint?: string,
): Diagnostic {
  return {
    severity,
    code,
    file: ctx.file,
    line: ref.line,
    column: ref.column,
    message,
    hint,
  };
}

/**
 * Classify every collected import per D6. Returns diagnostics and the sets of
 * used package / registry-dependency names (for DEP_UNUSED warnings).
 */
export function checkImports(
  refs: ImportRef[],
  ctx: ImportCheckContext,
): { diagnostics: Diagnostic[]; usedPackages: Set<string>; usedRegistryDeps: Set<string> } {
  const diagnostics: Diagnostic[] = [];
  const usedPackages = new Set<string>();
  const usedRegistryDeps = new Set<string>();

  for (const ref of refs) {
    if (ref.kind === "require") {
      diagnostics.push(
        diag("error", "IMPORT_REQUIRE_FORBIDDEN", ctx, ref, "`require()` calls are forbidden; use static ESM imports."),
      );
      continue;
    }
    if (ref.specifier === undefined) {
      diagnostics.push(
        diag(
          "error",
          "IMPORT_DYNAMIC_NONLITERAL",
          ctx,
          ref,
          "dynamic import() with a non-literal argument is forbidden",
          "Use a static import with a literal specifier.",
        ),
      );
      continue;
    }
    const specifier = ref.specifier;
    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === ".." || DRIVE_PATTERN.test(specifier)) {
      checkRelative(ref, specifier, ctx, diagnostics);
      continue;
    }
    if (specifier === "@/lib" || specifier.startsWith("@/lib/") || specifier === "@/hooks" || specifier.startsWith("@/hooks/") || specifier === "@/components" || specifier.startsWith("@/components/")) {
      checkAlias(ref, ctx, diagnostics, usedRegistryDeps, specifier);
      continue;
    }
    if (specifier.startsWith("@/")) {
      diagnostics.push(
        diag("error", "IMPORT_UNKNOWN_ALIAS", ctx, ref, `unknown alias "${specifier}"`, 'Use "@/lib/<name>", "@/hooks/<name>" or "@/components/ui/<name>".'),
      );
      continue;
    }
    if (isBuiltinSpecifier(specifier)) {
      diagnostics.push(
        diag("error", "IMPORT_NODE_BUILTIN", ctx, ref, `Node builtin import "${specifier}" is forbidden in registry sources`),
      );
      continue;
    }
    if (SCHEME_PATTERN.test(specifier)) {
      diagnostics.push(
        diag("error", "IMPORT_URL_FORBIDDEN", ctx, ref, `URL import "${specifier}" is forbidden in registry sources`),
      );
      continue;
    }
    const name = packageNameOf(specifier);
    if (isPeerSpecifier(specifier)) continue;
    if (Object.hasOwn(ctx.declaredDeps, name)) {
      usedPackages.add(name);
      continue;
    }
    diagnostics.push(
      diag(
        "error",
        "IMPORT_UNDECLARED_PACKAGE",
        ctx,
        ref,
        `imports "${specifier}" but it is not in meta.dependencies`,
        "Add it to meta.json (it must be on the allowlist).",
      ),
    );
  }
  return { diagnostics, usedPackages, usedRegistryDeps };
}

function checkRelative(
  ref: ImportRef,
  specifier: string,
  ctx: ImportCheckContext,
  diagnostics: Diagnostic[],
): void {
  // Allowed: the item's own source file (demo -> ./<slug>, css reference) with or
  // without an explicit extension.
  const ownBase = ctx.ownSource.replace(/\.(tsx|ts|css)$/, "");
  const normalized = specifier.replace(/^\.\//, "").replace(/\.(tsx|ts|css)$/, "");
  // The only allowed relative target is the item's own source file
  // (demo -> ./<slug>; component -> ./<slug>.css), extension optional.
  if (normalized !== ownBase) {
    diagnostics.push(
      diag(
        "error",
        "IMPORT_RELATIVE_FORBIDDEN",
        ctx,
        ref,
        `relative import "${specifier}" escapes the item's own files`,
        "Only the item's own shipped files may be imported relatively.",
      ),
    );
  }
}

function checkAlias(
  ref: ImportRef,
  ctx: ImportCheckContext,
  diagnostics: Diagnostic[],
  usedRegistryDeps: Set<string>,
  specifier: string,
): void {
  let expectedType: "component" | "lib" | "hook" | undefined;
  let slug: string | undefined;
  if (specifier === "@/lib" || specifier.startsWith("@/lib/")) {
    expectedType = "lib";
    slug = specifier.slice("@/lib/".length) || undefined;
  } else if (specifier === "@/hooks" || specifier.startsWith("@/hooks/")) {
    expectedType = "hook";
    slug = specifier.slice("@/hooks/".length) || undefined;
  } else if (specifier.startsWith("@/components/ui/")) {
    expectedType = "component";
    slug = specifier.slice("@/components/ui/".length) || undefined;
  }
  if (expectedType === undefined || slug === undefined || slug.includes("/")) {
    diagnostics.push(
      diag("error", "IMPORT_UNKNOWN_ALIAS", ctx, ref, `unknown alias "${specifier}"`, 'Use "@/lib/<name>", "@/hooks/<name>" or "@/components/ui/<name>".'),
    );
    return;
  }
  if (ctx.demo) {
    diagnostics.push(
      diag(
        "error",
        "IMPORT_ALIAS_NOT_DECLARED",
        ctx,
        ref,
        `demo files must not use aliases (found "${specifier}")`,
        "Import the component relatively instead (./<slug>).",
      ),
    );
    return;
  }
  const actual = ctx.knownItems.get(slug);
  if (actual === undefined || actual !== expectedType) {
    diagnostics.push(
      diag(
        "error",
        "IMPORT_ALIAS_TARGET_MISSING",
        ctx,
        ref,
        actual === undefined
          ? `alias target "${slug}" does not exist (expected type "${expectedType}")`
          : `alias target "${slug}" is type "${actual}", expected "${expectedType}"`,
      ),
    );
    return;
  }
  usedRegistryDeps.add(slug);
  if (!ctx.registryDeps.includes(slug)) {
    diagnostics.push(
      diag(
        "error",
        "IMPORT_ALIAS_NOT_DECLARED",
        ctx,
        ref,
        `alias import "${specifier}" is not listed in meta.registryDependencies`,
        "Add the target slug to registryDependencies.",
      ),
    );
  }
}

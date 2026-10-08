import ts from "typescript";
import { PlaygroundSchema, type Meta, type Playground } from "@framebits/shared";
import type { DiscoveredItem } from "./discover.js";
import type { Diagnostic } from "./types.js";

/**
 * Playground validation (`playground.json`, components only).
 *
 * A playground declares the live-tweakable props of one component. Every
 * control `key` must name a prop DECLARED in the component's own source:
 * a member of an exported (or local) `*Props` interface / type literal
 * (following `extends` clauses within the same file), or a destructured
 * parameter of an exported component function. Props inherited from
 * EXTERNAL types (e.g. `Omit<ComponentProps<typeof motion.span>, ...>`)
 * are not enumerable without a full type-checker program, so controls must
 * target props the component declares itself — PR 3 shapes components
 * exactly this way. This check is a typo-guard (e.g. `druation`), not a
 * boundary; human review of the component PR remains the control.
 *
 * Defaults are compared against destructured initializers where they are
 * statically determinable (string/number/boolean/array-of-literal). Anything
 * else (identifiers, expressions) is skipped silently: a mismatch there is
 * reported as a WARNING only when both sides are known literals.
 */

function err(diagnostics: Diagnostic[], diagnostic: Diagnostic): void {
  diagnostics.push(diagnostic);
}

/** Parse playground.json when present. PLAYGROUND_INVALID on any failure. */
export function parseItemPlayground(
  item: DiscoveredItem,
  diagnostics: Diagnostic[],
): Playground | undefined {
  const direct = item.files.find((file) => file.relPath === `${item.dirRel}/playground.json`);
  if (direct === undefined) return undefined;
  if (direct.text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(direct.text) as unknown;
  } catch (error) {
    err(diagnostics, {
      severity: "error",
      code: "PLAYGROUND_INVALID",
      file: direct.relPath,
      message: `playground.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
  const parsed = PlaygroundSchema.safeParse(raw);
  if (!parsed.success) {
    err(diagnostics, {
      severity: "error",
      code: "PLAYGROUND_INVALID",
      file: direct.relPath,
      message: `playground.json is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`,
    });
    return undefined;
  }
  return parsed.data;
}

export interface DeclaredProps {
  /** Prop names from `*Props` interfaces/type literals (+ same-file extends). */
  names: Set<string>;
  /** Destructured defaults, present only when statically determinable. */
  defaults: Map<string, unknown>;
}

function memberName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function literalValue(expression: ts.Expression): { known: true; value: unknown } | { known: false } {
  if (ts.isStringLiteralLike(expression)) return { known: true, value: expression.text };
  if (ts.isNumericLiteral(expression)) return { known: true, value: Number(expression.text) };
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { known: true, value: true };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { known: true, value: false };
  if (ts.isArrayLiteralExpression(expression)) {
    const values: unknown[] = [];
    for (const element of expression.elements) {
      if (ts.isOmittedExpression(element)) return { known: false };
      const parsed = literalValue(element);
      if (!parsed.known) return { known: false };
      values.push(parsed.value);
    }
    return { known: true, value: values };
  }
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const parsed = literalValue(expression.operand);
    if (parsed.known && typeof parsed.value === "number") {
      return { known: true, value: -parsed.value };
    }
  }
  return { known: false };
}

/**
 * Extract declared prop names + determinable destructured defaults from a
 * component source (parse only — the source is never executed or imported).
 */
export function extractDeclaredProps(sourceText: string): DeclaredProps {
  const source = ts.createSourceFile("component.tsx", sourceText, ts.ScriptTarget.Latest, false);
  const interfaces = new Map<string, { members: string[]; extends: string[] }>();
  const aliases = new Map<string, string[]>();

  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      const members: string[] = [];
      for (const member of statement.members) {
        if (ts.isPropertySignature(member)) {
          const name = memberName(member.name);
          if (name !== undefined) members.push(name);
        }
      }
      const extendsNames: string[] = [];
      for (const heritage of statement.heritageClauses ?? []) {
        if (heritage.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const type of heritage.types) {
          if (ts.isIdentifier(type.expression)) extendsNames.push(type.expression.text);
        }
      }
      interfaces.set(statement.name.text, { members, extends: extendsNames });
    } else if (
      ts.isTypeAliasDeclaration(statement) &&
      ts.isTypeLiteralNode(statement.type)
    ) {
      const members: string[] = [];
      for (const member of statement.type.members) {
        if (ts.isPropertySignature(member)) {
          const name = memberName(member.name);
          if (name !== undefined) members.push(name);
        }
      }
      aliases.set(statement.name.text, members);
    }
  }

  const names = new Set<string>();
  const visitInterface = (name: string, seen: Set<string>): void => {
    if (seen.has(name)) return;
    seen.add(name);
    const declared = interfaces.get(name);
    if (declared === undefined) return;
    for (const member of declared.members) names.add(member);
    for (const parent of declared.extends) visitInterface(parent, seen);
  };
  for (const name of interfaces.keys()) {
    if (name.endsWith("Props")) visitInterface(name, new Set());
  }
  for (const [name, members] of aliases) {
    if (name.endsWith("Props")) {
      for (const member of members) names.add(member);
    }
  }

  const defaults = new Map<string, unknown>();
  const visitBinding = (pattern: ts.ObjectBindingPattern): void => {
    for (const element of pattern.elements) {
      if (!ts.isIdentifier(element.name)) continue;
      const key = element.name.text;
      names.add(key);
      if (element.initializer !== undefined) {
        const parsed = literalValue(element.initializer);
        if (parsed.known) defaults.set(key, parsed.value);
      }
    }
  };
  const visitParameters = (parameters: readonly ts.ParameterDeclaration[]): void => {
    const first = parameters[0];
    if (first !== undefined && ts.isObjectBindingPattern(first.name)) {
      visitBinding(first.name);
    }
  };
  for (const statement of source.statements) {
    const isExported =
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
    if (!isExported) continue;
    if (ts.isFunctionDeclaration(statement)) {
      visitParameters(statement.parameters);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (
          initializer !== undefined &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
        ) {
          visitParameters(initializer.parameters);
        }
      }
    }
  }
  return { names, defaults };
}

function defaultsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

/**
 * Check a parsed playground against its component source: every control key
 * must name a declared prop (PLAYGROUND_UNKNOWN_PROP), and literal defaults
 * must match the component's destructured defaults where both are known
 * (PLAYGROUND_DEFAULT_MISMATCH, warning). Drafts are checked too; a missing
 * source is layout's job (MISSING_SOURCE), not ours.
 */
export function checkPlayground(
  item: DiscoveredItem,
  meta: Meta,
  playground: Playground | undefined,
  diagnostics: Diagnostic[],
): void {
  if (playground === undefined || meta.type !== "component") return;
  const rel = `${item.dirRel}/playground.json`;
  const sourceName = `${meta.slug}.tsx`;
  const source = item.files.find((file) => file.relPath === `${item.dirRel}/${sourceName}`);
  if (source?.text === undefined) return;
  const declared = extractDeclaredProps(source.text);
  for (const control of playground.controls) {
    if (!declared.names.has(control.key)) {
      err(diagnostics, {
        severity: "error",
        code: "PLAYGROUND_UNKNOWN_PROP",
        file: rel,
        message: `control key "${control.key}" is not a declared prop of ${meta.slug} (expected a member of its *Props type or a destructured parameter)`,
        hint: "Fix the typo, or declare the prop on the component first.",
      });
      continue;
    }
    const known = declared.defaults.get(control.key);
    const baseline: unknown = Array.isArray(control.default)
      ? [...control.default]
      : control.default;
    if (known !== undefined && !defaultsEqual(known, baseline)) {
      err(diagnostics, {
        severity: "warning",
        code: "PLAYGROUND_DEFAULT_MISMATCH",
        file: rel,
        message: `control "${control.key}" default ${JSON.stringify(baseline)} does not match the component default ${JSON.stringify(known)}`,
        hint: "Playground defaults must match the component's real defaults (the site shows CURRENT look as defaults).",
      });
    }
  }
}

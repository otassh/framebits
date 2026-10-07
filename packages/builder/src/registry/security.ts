import ts from "typescript";

/**
 * AST-based security scan (D7 + Task 4b hardening). Errors, no escape hatch, except
 * where noted: STORAGE is a warning. This scan is a guard against
 * mistakes, NOT a security boundary — human review of every component PR is the
 * control (see CONTRIBUTING.md).
 *
 * Syntactic detection on identifier/member names, including common indirection
 * shapes (aliases, `(0, eval)`, element access, destructuring, `.call`/`.bind`).
 */

export type SecurityCode =
  | "SECURITY_EVAL"
  | "SECURITY_COOKIE"
  | "SECURITY_NETWORK"
  | "SECURITY_INNER_HTML"
  | "SECURITY_STORAGE";

export interface SecurityIssue {
  code: SecurityCode;
  severity: "error" | "warning";
  line: number;
  column: number;
  message: string;
}

/** Scan source text; pure function of the text (needs no registry context). */
export function scanSecurity(text: string, fileName = "file.tsx"): SecurityIssue[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const issues: SecurityIssue[] = [];
  const fetchAliases = new Set<string>();
  const evalAliases = new Set<string>();
  const globalAliases = new Set<string>();

  function at(node: ts.Node): { line: number; column: number } {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { line: line + 1, column: character + 1 };
  }

  function error(
    code: "SECURITY_EVAL" | "SECURITY_COOKIE" | "SECURITY_NETWORK" | "SECURITY_INNER_HTML",
    node: ts.Node,
    message: string,
  ): void {
    issues.push({ code, severity: "error", ...at(node), message });
  }

  function warning(code: "SECURITY_STORAGE", node: ts.Node, message: string): void {
    issues.push({ code, severity: "warning", ...at(node), message });
  }

  function isIdentifier(node: ts.Node, name: string): node is ts.Identifier {
    return ts.isIdentifier(node) && node.text === name;
  }

  /** Names that mean "the global scope" (`window`, `globalThis`, `self`, `global`). */
  function isGlobalName(name: string): boolean {
    return (
      name === "window" ||
      name === "globalThis" ||
      name === "self" ||
      name === "global" ||
      globalAliases.has(name)
    );
  }

  /** Strip parentheses and `(0, x)` comma-sequence wrappers. */
  function unwrap(expression: ts.Expression): ts.Expression {
    let current = expression;
    for (;;) {
      if (ts.isParenthesizedExpression(current)) {
        current = current.expression;
        continue;
      }
      if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
        current = current.right;
        continue;
      }
      return current;
    }
  }

  /** `{ object, name }` for `obj.name` and `obj["name"]` ("" when not statically known). */
  function accessParts(access: ts.PropertyAccessExpression | ts.ElementAccessExpression): {
    object: string | undefined;
    name: string;
  } {
    const object = ts.isIdentifier(access.expression) ? access.expression.text : undefined;
    const name = ts.isPropertyAccessExpression(access)
      ? access.name.text
      : ts.isStringLiteralLike(access.argumentExpression)
        ? access.argumentExpression.text
        : "";
    return { object, name };
  }

  /** True for `eval` itself, an eval alias, or `window.eval`/`g.eval` member forms. */
  function isEvalRef(expression: ts.Expression): boolean {
    const target = unwrap(expression);
    if (ts.isIdentifier(target)) {
      return target.text === "eval" || evalAliases.has(target.text);
    }
    if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
      const { object, name } = accessParts(target);
      return object !== undefined && name === "eval" && isGlobalName(object);
    }
    return false;
  }

  /** True for `Function` itself, an alias, or `globalThis.Function` member forms. */
  function isFunctionRef(expression: ts.Expression): boolean {
    const target = unwrap(expression);
    if (ts.isIdentifier(target)) return target.text === "Function";
    if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
      const { object, name } = accessParts(target);
      return object !== undefined && name === "Function" && isGlobalName(object);
    }
    return false;
  }

  // First pass: alias collection (`const f = fetch`, `const e = eval`,
  // `const g = globalThis`, `const { fetch } = window`, `const f = window.fetch`).
  function collectAliases(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const init = unwrap(node.initializer);
      if (ts.isIdentifier(init)) {
        if (init.text === "fetch") fetchAliases.add(node.name.text);
        if (init.text === "eval") evalAliases.add(node.name.text);
        if (
          init.text === "window" ||
          init.text === "globalThis" ||
          init.text === "self" ||
          init.text === "global"
        ) {
          globalAliases.add(node.name.text);
        }
      } else if (ts.isPropertyAccessExpression(init) || ts.isElementAccessExpression(init)) {
        const { object, name } = accessParts(init);
        if (object !== undefined && isGlobalName(object)) {
          if (name === "fetch") fetchAliases.add(node.name.text);
          if (name === "eval") evalAliases.add(node.name.text);
        }
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined
    ) {
      const init = unwrap(node.initializer);
      if (ts.isIdentifier(init) && isGlobalName(init.text)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const source = element.propertyName;
          const key =
            source === undefined
              ? element.name.text
              : ts.isIdentifier(source)
                ? source.text
                : ts.isStringLiteralLike(source)
                  ? source.text
                  : "";
          if (key === "fetch") fetchAliases.add(element.name.text);
          if (key === "eval") evalAliases.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(source);

  function isFetchCallee(callee: ts.Expression): boolean {
    const target = unwrap(callee);
    if (ts.isIdentifier(target)) {
      return target.text === "fetch" || fetchAliases.has(target.text);
    }
    if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
      const { object, name } = accessParts(target);
      return object !== undefined && name === "fetch" && isGlobalName(object);
    }
    return false;
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (isEvalRef(callee) || isFunctionRef(callee)) {
        error(
          "SECURITY_EVAL",
          node,
          isFunctionRef(callee)
            ? "`Function()` (including globalThis.Function) is forbidden in registry sources"
            : "`eval()` (including aliases and (0, eval) indirection) is forbidden in registry sources",
        );
      } else if (isFetchCallee(callee)) {
        error("SECURITY_NETWORK", node, "fetch() is forbidden in registry sources");
      } else if (
        ts.isPropertyAccessExpression(unwrap(callee)) ||
        ts.isElementAccessExpression(unwrap(callee))
      ) {
        const access = unwrap(callee) as
          | ts.PropertyAccessExpression
          | ts.ElementAccessExpression;
        const { object, name } = accessParts(access);
        if (
          object !== undefined &&
          (object === "fetch" || fetchAliases.has(object)) &&
          (name === "call" || name === "apply" || name === "bind")
        ) {
          error("SECURITY_NETWORK", node, "fetch.call()/apply()/bind() is forbidden in registry sources");
        } else if (object !== undefined && name === "sendBeacon" && object === "navigator") {
          error("SECURITY_NETWORK", node, "`navigator.sendBeacon()` is forbidden in registry sources");
        } else if (
          object !== undefined &&
          (name === "setTimeout" || name === "setInterval") &&
          isGlobalName(object) &&
          node.arguments[0] !== undefined &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          error(
            "SECURITY_EVAL",
            node,
            "setTimeout()/setInterval() with a string argument is forbidden (implicit eval)",
          );
        } else if (object !== undefined && name === "insertAdjacentHTML") {
          error("SECURITY_INNER_HTML", node, "`insertAdjacentHTML()` is forbidden in registry sources");
        } else if (
          object !== undefined &&
          (name === "write" || name === "writeln") &&
          object === "document"
        ) {
          error("SECURITY_INNER_HTML", node, "`document.write()/writeln()` is forbidden in registry sources");
        } else if (object !== undefined && name === "createContextualFragment") {
          error(
            "SECURITY_INNER_HTML",
            node,
            "`createContextualFragment()` is forbidden in registry sources",
          );
        } else if (object !== undefined && name === "parseFromString") {
          error(
            "SECURITY_INNER_HTML",
            node,
            "`DOMParser.parseFromString()` is forbidden in registry sources",
          );
        } else if (object !== undefined && name === "setHTML") {
          error("SECURITY_INNER_HTML", node, "`setHTML()` is forbidden in registry sources");
        } else if (
          object !== undefined &&
          isGlobalName(object) &&
          (name === "WebSocket" || name === "EventSource")
        ) {
          error(
            "SECURITY_NETWORK",
            node,
            `\`${object}.${name}()\` without new is forbidden in registry sources`,
          );
        }
      } else if (ts.isIdentifier(callee)) {
        if (callee.text === "importScripts") {
          error("SECURITY_NETWORK", node, "`importScripts()` is forbidden in registry sources");
        } else if (callee.text === "setTimeout" || callee.text === "setInterval") {
          const first = node.arguments[0];
          if (first !== undefined && ts.isStringLiteralLike(first)) {
            error(
              "SECURITY_EVAL",
              node,
              "setTimeout()/setInterval() with a string argument is forbidden (implicit eval)",
            );
          }
        } else if (callee.text === "WebSocket" || callee.text === "EventSource") {
          error(
            "SECURITY_NETWORK",
            node,
            `\`${callee.text}()\` without new is forbidden in registry sources`,
          );
        }
      }
      // Reflect.apply(eval, ...) / Reflect.construct(Function, ...) indirection.
      const reflected = unwrap(callee);
      if (
        (ts.isPropertyAccessExpression(reflected) || ts.isElementAccessExpression(reflected)) &&
        accessParts(reflected).object === "Reflect" &&
        (accessParts(reflected).name === "apply" || accessParts(reflected).name === "construct")
      ) {
        const smuggled = node.arguments.some(
          (argument) =>
            (ts.isIdentifier(argument) &&
              (argument.text === "eval" ||
                argument.text === "Function" ||
                evalAliases.has(argument.text))) ||
            isEvalRef(argument) ||
            isFunctionRef(argument),
        );
        if (smuggled) {
          error(
            "SECURITY_EVAL",
            node,
            "`Reflect.apply()/construct()` with eval/Function is forbidden in registry sources",
          );
        }
      }
    } else if (ts.isNewExpression(node)) {
      const target = unwrap(node.expression);
      if (isFunctionRef(target)) {
        error("SECURITY_EVAL", node, "`new Function()` is forbidden in registry sources");
      } else if (ts.isIdentifier(target)) {
        if (target.text === "XMLHttpRequest") {
          error("SECURITY_NETWORK", node, "`XMLHttpRequest` is forbidden in registry sources");
        } else if (target.text === "WebSocket") {
          error("SECURITY_NETWORK", node, "`WebSocket` is forbidden in registry sources");
        } else if (target.text === "EventSource") {
          error("SECURITY_NETWORK", node, "`EventSource` is forbidden in registry sources");
        } else if (target.text === "Worker") {
          error("SECURITY_NETWORK", node, "`new Worker()` is forbidden in registry sources");
        } else if (target.text === "DOMParser") {
          error("SECURITY_INNER_HTML", node, "`DOMParser` is forbidden in registry sources");
        }
      } else if (
        ts.isPropertyAccessExpression(target) ||
        ts.isElementAccessExpression(target)
      ) {
        const { object, name } = accessParts(target);
        if (
          object !== undefined &&
          isGlobalName(object) &&
          (name === "XMLHttpRequest" ||
            name === "WebSocket" ||
            name === "EventSource" ||
            name === "Worker")
        ) {
          error(
            "SECURITY_NETWORK",
            node,
            `\`new ${object}.${name}()\` is forbidden in registry sources`,
          );
        } else if (object !== undefined && isGlobalName(object) && name === "Function") {
          error("SECURITY_EVAL", node, "`new Function()` is forbidden in registry sources");
        } else if (object !== undefined && isGlobalName(object) && name === "DOMParser") {
          error("SECURITY_INNER_HTML", node, "`DOMParser` is forbidden in registry sources");
        }
      }
    } else if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const { object, name } = accessParts(node);
      if (object === "document" && name === "cookie") {
        error("SECURITY_COOKIE", node, "`document.cookie` access is forbidden in registry sources");
      } else if (object === "cookieStore") {
        error("SECURITY_COOKIE", node, "`cookieStore` access is forbidden in registry sources");
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = unwrap(node.left);
      if (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) {
        const { name } = accessParts(left);
        if (name === "innerHTML" || name === "outerHTML") {
          error(
            "SECURITY_INNER_HTML",
            node,
            `\`${name}\` assignment is forbidden in registry sources`,
          );
        }
      }
    } else if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "dangerouslySetInnerHTML"
    ) {
      error(
        "SECURITY_INNER_HTML",
        node,
        "`dangerouslySetInnerHTML` is forbidden in registry sources (XSS surface)",
      );
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const prop = node.name.text;
      if (prop === "dangerouslySetInnerHTML") {
        error(
          "SECURITY_INNER_HTML",
          node,
          "`dangerouslySetInnerHTML` is forbidden in registry sources (XSS surface)",
        );
      } else if (prop === "localStorage" || prop === "sessionStorage" || prop === "indexedDB") {
        warning(
          "SECURITY_STORAGE",
          node,
          `browser storage "${prop}" should be avoided in registry components`,
        );
      }
    } else if (
      isIdentifier(node, "localStorage") ||
      isIdentifier(node, "sessionStorage") ||
      isIdentifier(node, "indexedDB")
    ) {
      warning(
        "SECURITY_STORAGE",
        node,
        `browser storage "${node.text}" should be avoided in registry components`,
      );
    } else if (isIdentifier(node, "cookieStore")) {
      error("SECURITY_COOKIE", node, "`cookieStore` access is forbidden in registry sources");
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  // Dedupe exact (code, line, column) repeats: overlapping shapes (e.g. an
  // identifier that is also part of a flagged member expression) report once.
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${String(issue.line)}:${String(issue.column)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import ts from "typescript";

/**
 * AST-based security scan (D7 + Task 4b hardening). Errors, no escape hatch, except
 * where noted: INNER_HTML and STORAGE are warnings. This scan is a guard against
 * mistakes, NOT a security boundary — human review of every component PR is the
 * control (see CONTRIBUTING.md).
 *
 * Syntactic detection on identifier/member names.
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

  function at(node: ts.Node): { line: number; column: number } {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { line: line + 1, column: character + 1 };
  }

  function error(
    code: "SECURITY_EVAL" | "SECURITY_COOKIE" | "SECURITY_NETWORK",
    node: ts.Node,
    message: string,
  ): void {
    issues.push({ code, severity: "error", ...at(node), message });
  }

  function warning(
    code: "SECURITY_INNER_HTML" | "SECURITY_STORAGE",
    node: ts.Node,
    message: string,
  ): void {
    issues.push({ code, severity: "warning", ...at(node), message });
  }

  function isIdentifier(node: ts.Node, name: string): node is ts.Identifier {
    return ts.isIdentifier(node) && node.text === name;
  }

  // First pass: `const f = fetch` style aliases (only fetch is tracked).
  function collectAliases(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isIdentifier(node.initializer, "fetch")
    ) {
      fetchAliases.add(node.name.text);
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(source);

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (isIdentifier(callee, "eval") || isIdentifier(callee, "Function")) {
        error(
          "SECURITY_EVAL",
          node,
          callee.text === "eval"
            ? "`eval()` is forbidden in registry sources"
            : "`Function()` without new is forbidden in registry sources",
        );
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        (isIdentifier(callee.expression, "window") || isIdentifier(callee.expression, "globalThis")) &&
        callee.name.text === "eval"
      ) {
        error("SECURITY_EVAL", node, "window.eval()/globalThis.eval() is forbidden in registry sources");
      } else if (ts.isIdentifier(callee) && (callee.text === "fetch" || fetchAliases.has(callee.text))) {
        error("SECURITY_NETWORK", node, "fetch() is forbidden in registry sources");
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        (isIdentifier(callee.expression, "window") ||
          isIdentifier(callee.expression, "globalThis") ||
          isIdentifier(callee.expression, "self")) &&
        callee.name.text === "fetch"
      ) {
        error(
          "SECURITY_NETWORK",
          node,
          "window.fetch()/globalThis.fetch()/self.fetch() is forbidden in registry sources",
        );
      } else if (
        isIdentifier(callee, "importScripts") ||
        isIdentifier(callee, "setTimeout") ||
        isIdentifier(callee, "setInterval")
      ) {
        const first = node.arguments[0];
        if (callee.text === "importScripts") {
          error("SECURITY_NETWORK", node, "`importScripts()` is forbidden in registry sources");
        } else if (first !== undefined && ts.isStringLiteralLike(first)) {
          error(
            "SECURITY_EVAL",
            node,
            "setTimeout()/setInterval() with a string argument is forbidden (implicit eval)",
          );
        }
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        isIdentifier(callee.expression, "navigator") &&
        callee.name.text === "sendBeacon"
      ) {
        error("SECURITY_NETWORK", node, "`navigator.sendBeacon()` is forbidden in registry sources");
      }
    } else if (ts.isNewExpression(node)) {
      const target = node.expression;
      if (isIdentifier(target, "Function")) {
        error("SECURITY_EVAL", node, "`new Function()` is forbidden in registry sources");
      } else if (isIdentifier(target, "XMLHttpRequest")) {
        error("SECURITY_NETWORK", node, "`XMLHttpRequest` is forbidden in registry sources");
      } else if (isIdentifier(target, "WebSocket")) {
        error("SECURITY_NETWORK", node, "`WebSocket` is forbidden in registry sources");
      } else if (isIdentifier(target, "EventSource")) {
        error("SECURITY_NETWORK", node, "`EventSource` is forbidden in registry sources");
      } else if (isIdentifier(target, "Worker")) {
        error("SECURITY_NETWORK", node, "`new Worker()` is forbidden in registry sources");
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      isIdentifier(node.expression, "document") &&
      node.name.text === "cookie"
    ) {
      error("SECURITY_COOKIE", node, "`document.cookie` access is forbidden in registry sources");
    } else if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "dangerouslySetInnerHTML"
    ) {
      warning(
        "SECURITY_INNER_HTML",
        node,
        "`dangerouslySetInnerHTML` needs reviewer approval (XSS surface)",
      );
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const prop = node.name.text;
      if (prop === "dangerouslySetInnerHTML") {
        warning(
          "SECURITY_INNER_HTML",
          node,
          "`dangerouslySetInnerHTML` needs reviewer approval (XSS surface)",
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
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return issues;
}

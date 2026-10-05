import ts from "typescript";

/**
 * AST-based security scan (D7). Errors, no escape hatch: registry components
 * must never phone home. Syntactic detection on identifier/member names.
 */

export interface SecurityIssue {
  code: "SECURITY_EVAL" | "SECURITY_COOKIE" | "SECURITY_NETWORK";
  line: number;
  column: number;
  message: string;
}

/** Scan source text; pure function of the text (needs no registry context). */
export function scanSecurity(text: string, fileName = "file.tsx"): SecurityIssue[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const issues: SecurityIssue[] = [];

  function at(node: ts.Node): { line: number; column: number } {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { line: line + 1, column: character + 1 };
  }

  function isIdentifier(node: ts.Node, name: string): node is ts.Identifier {
    return ts.isIdentifier(node) && node.text === name;
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (isIdentifier(callee, "eval") || isIdentifier(callee, "importScripts")) {
        issues.push({
          code: callee.text === "eval" ? "SECURITY_EVAL" : "SECURITY_NETWORK",
          ...at(node),
          message:
            callee.text === "eval"
              ? "`eval()` is forbidden in registry sources"
              : "`importScripts()` is forbidden in registry sources",
        });
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        isIdentifier(callee.expression, "navigator") &&
        callee.name.text === "sendBeacon"
      ) {
        issues.push({
          code: "SECURITY_NETWORK",
          ...at(node),
          message: "`navigator.sendBeacon()` is forbidden in registry sources",
        });
      } else if (isIdentifier(callee, "fetch")) {
        issues.push({
          code: "SECURITY_NETWORK",
          ...at(node),
          message: "`fetch()` is forbidden in registry sources",
        });
      }
    } else if (ts.isNewExpression(node)) {
      const target = node.expression;
      if (isIdentifier(target, "Function")) {
        issues.push({
          code: "SECURITY_EVAL",
          ...at(node),
          message: "`new Function()` is forbidden in registry sources",
        });
      } else if (isIdentifier(target, "XMLHttpRequest")) {
        issues.push({
          code: "SECURITY_NETWORK",
          ...at(node),
          message: "`XMLHttpRequest` is forbidden in registry sources",
        });
      } else if (isIdentifier(target, "WebSocket")) {
        issues.push({
          code: "SECURITY_NETWORK",
          ...at(node),
          message: "`WebSocket` is forbidden in registry sources",
        });
      } else if (isIdentifier(target, "EventSource")) {
        issues.push({
          code: "SECURITY_NETWORK",
          ...at(node),
          message: "`EventSource` is forbidden in registry sources",
        });
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      isIdentifier(node.expression, "document") &&
      node.name.text === "cookie"
    ) {
      issues.push({
        code: "SECURITY_COOKIE",
        ...at(node),
        message: "`document.cookie` access is forbidden in registry sources",
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return issues;
}

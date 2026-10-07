/**
 * Builder-side CSS validation for `<slug>.css` (and any shipped stylesheet).
 *
 * The shared schemas validate the SHAPE of styles.json; raw `.css` files pass
 * through `normalizeContent` untouched, so dangerous constructs must be caught
 * here, before the content is hashed and shipped to users' stylesheets:
 *
 * - `@import` (`SECURITY_CSS_IMPORT`): pulls remote stylesheets at build time.
 * - `url(...)` (`SECURITY_CSS_URL`): exfiltration / remote-asset vector; the
 *   registry has no asset pipeline, so no legitimate use exists.
 * - `expression(...)`, `behavior:`, `-moz-binding`
 *   (`SECURITY_CSS_EXPRESSION`): script-execution vectors (legacy IE / XBL).
 *
 * Matching is case-insensitive over comment-stripped text (stripping first
 * also defeats `ex/* *\/pression(` smuggling). All findings are errors.
 */

export type CssSecurityCode =
  | "SECURITY_CSS_IMPORT"
  | "SECURITY_CSS_URL"
  | "SECURITY_CSS_EXPRESSION";

export interface CssSecurityIssue {
  code: CssSecurityCode;
  severity: "error";
  line: number;
  column: number;
  message: string;
}

const IMPORT_PATTERN = /@import\b/i;
const URL_PATTERN = /\burl\s*\(/i;
const EXPRESSION_PATTERN = /expression\s*\(/i;
const BEHAVIOR_PATTERN = /behavior\s*:/i;
const MOZ_BINDING_PATTERN = /-moz-binding/i;

/** Remove `/* ... *\/` comments so payloads cannot hide inside them. */
export function stripCssComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ""),
  );
}

function lineColumn(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

/** Scan CSS text; pure function of the text (needs no registry context). */
export function scanCssSecurity(text: string): CssSecurityIssue[] {
  const issues: CssSecurityIssue[] = [];
  const stripped = stripCssComments(text);
  const checks: Array<{
    code: CssSecurityCode;
    pattern: RegExp;
    message: string;
  }> = [
    {
      code: "SECURITY_CSS_IMPORT",
      pattern: new RegExp(IMPORT_PATTERN.source, "gi"),
      message: "`@import` is forbidden in registry CSS (it pulls remote stylesheets)",
    },
    {
      code: "SECURITY_CSS_URL",
      pattern: new RegExp(URL_PATTERN.source, "gi"),
      message: "`url(...)` is forbidden in registry CSS (no remote assets)",
    },
    {
      code: "SECURITY_CSS_EXPRESSION",
      pattern: new RegExp(EXPRESSION_PATTERN.source, "gi"),
      message: "`expression(...)` is forbidden in registry CSS (script execution)",
    },
    {
      code: "SECURITY_CSS_EXPRESSION",
      pattern: new RegExp(BEHAVIOR_PATTERN.source, "gi"),
      message: "`behavior:` is forbidden in registry CSS (script execution)",
    },
    {
      code: "SECURITY_CSS_EXPRESSION",
      pattern: new RegExp(MOZ_BINDING_PATTERN.source, "gi"),
      message: "`-moz-binding` is forbidden in registry CSS (script execution)",
    },
  ];
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = check.pattern.exec(stripped)) !== null) {
      const { line, column } = lineColumn(stripped, match.index);
      issues.push({ code: check.code, severity: "error", line, column, message: check.message });
      // Guard against zero-length matches looping forever (none expected here).
      if (match[0].length === 0) check.pattern.lastIndex += 1;
    }
  }
  issues.sort((a, b) => a.line - b.line || a.column - b.column || (a.code < b.code ? -1 : 1));
  return issues;
}

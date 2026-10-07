import { describe, expect, it } from "vitest";
import { scanCssSecurity, stripCssComments } from "./css.js";

describe("stripCssComments", () => {
  it("removes comments but keeps line numbers stable", () => {
    const stripped = stripCssComments("a { color: red; }\n/* @import \"x\"; */\nb {}");
    expect(stripped).not.toContain("@import");
    expect(stripped.split("\n").length).toBe(3);
  });
});

describe("scanCssSecurity", () => {
  it("passes plain CSS", () => {
    expect(scanCssSecurity(".ok {\n  color: red;\n}\n")).toEqual([]);
  });

  it("flags @import, url(), expression(), behavior, and -moz-binding", () => {
    const cases: Array<{ css: string; code: string }> = [
      { css: `@import url("https://evil.example/x.css");\n`, code: "SECURITY_CSS_IMPORT" },
      { css: `@import "local.css";\n`, code: "SECURITY_CSS_IMPORT" },
      { css: `.a { background: url(/x.png); }\n`, code: "SECURITY_CSS_URL" },
      { css: `.a { background: URL("https://evil.example/x.png"); }\n`, code: "SECURITY_CSS_URL" },
      { css: `.a { width: expression(alert(1)); }\n`, code: "SECURITY_CSS_EXPRESSION" },
      { css: `.a { behavior: url(x.htc); }\n`, code: "SECURITY_CSS_EXPRESSION" },
      { css: `.a { -moz-binding: url(x.xml#y); }\n`, code: "SECURITY_CSS_EXPRESSION" },
    ];
    for (const { css, code } of cases) {
      const issues = scanCssSecurity(css);
      expect(issues.map((issue) => issue.code)).toContain(code);
      expect(issues[0]?.severity).toBe("error");
      expect(issues[0]?.line).toBe(1);
    }
  });

  it("sees through comment smuggling", () => {
    const issues = scanCssSecurity(`.a { width: ex/*x*/pression(alert(1)); }\n`);
    expect(issues.map((issue) => issue.code)).toContain("SECURITY_CSS_EXPRESSION");
  });

  it("reports positions", () => {
    const issues = scanCssSecurity(".ok { color: red; }\n@import \"x\";\n");
    expect(issues[0]).toMatchObject({ code: "SECURITY_CSS_IMPORT", line: 2 });
  });
});

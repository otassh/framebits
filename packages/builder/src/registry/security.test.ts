import { describe, expect, it } from "vitest";
import { scanSecurity } from "./security.js";

describe("scanSecurity", () => {
  it("passes clean sources", () => {
    expect(
      scanSecurity(`export function Widget() {\n  return null;\n}\n`),
    ).toEqual([]);
  });

  const cases: Array<{ name: string; code: string; expectCode: string }> = [
    { name: "eval", code: `eval("x");\n`, expectCode: "SECURITY_EVAL" },
    { name: "new Function", code: `const f = new Function("x");\n`, expectCode: "SECURITY_EVAL" },
    { name: "document.cookie", code: `const c = document.cookie;\n`, expectCode: "SECURITY_COOKIE" },
    { name: "fetch", code: `await fetch("/api");\n`, expectCode: "SECURITY_NETWORK" },
    {
      name: "XMLHttpRequest",
      code: `const r = new XMLHttpRequest();\n`,
      expectCode: "SECURITY_NETWORK",
    },
    {
      name: "sendBeacon",
      code: `navigator.sendBeacon("/x");\n`,
      expectCode: "SECURITY_NETWORK",
    },
    { name: "WebSocket", code: `const s = new WebSocket("wss://x");\n`, expectCode: "SECURITY_NETWORK" },
    { name: "EventSource", code: `const e = new EventSource("/x");\n`, expectCode: "SECURITY_NETWORK" },
    { name: "importScripts", code: `importScripts("/x.js");\n`, expectCode: "SECURITY_NETWORK" },
  ];

  it.each(cases)("$name is forbidden", ({ code, expectCode }) => {
    const issues = scanSecurity(code);
    expect(issues.map((issue) => issue.code)).toContain(expectCode);
    expect(issues[0]?.line).toBe(1);
  });

  it("finds violations nested in functions", () => {
    const issues = scanSecurity(
      `export function Widget() {\n  async function load() {\n    await fetch("/api");\n  }\n  return load;\n}\n`,
    );
    expect(issues.map((issue) => issue.code)).toEqual(["SECURITY_NETWORK"]);
    expect(issues[0]).toMatchObject({ line: 3 });
  });

  it("flags eval-adjacent forms", () => {
    const cases: Array<{ name: string; code: string; expectCode: string }> = [
      { name: "Function call", code: `const f = Function("x");\n`, expectCode: "SECURITY_EVAL" },
      { name: "window.eval", code: `window.eval("x");\n`, expectCode: "SECURITY_EVAL" },
      { name: "globalThis.eval", code: `globalThis.eval("x");\n`, expectCode: "SECURITY_EVAL" },
      {
        name: "setTimeout string",
        code: `setTimeout("alert(1)", 100);\n`,
        expectCode: "SECURITY_EVAL",
      },
      {
        name: "setInterval string",
        code: `setInterval("tick()", 1000);\n`,
        expectCode: "SECURITY_EVAL",
      },
    ];
    for (const { code, expectCode } of cases) {
      expect(scanSecurity(code).map((issue) => issue.code)).toContain(expectCode);
    }
    expect(scanSecurity(`setTimeout(() => {}, 100);\n`)).toEqual([]);
  });

  it("flags scoped fetch forms", () => {
    for (const code of [
      `window.fetch("/api");\n`,
      `globalThis.fetch("/api");\n`,
      `self.fetch("/api");\n`,
      `const f = fetch;\nf("/api");\n`,
    ]) {
      expect(scanSecurity(code).map((issue) => issue.code)).toContain("SECURITY_NETWORK");
    }
  });

  it("warns (not errors) on inner HTML and storage", () => {
    const html = scanSecurity(`export const x = <div dangerouslySetInnerHTML={{ __html: s }} />;\n`);
    expect(html.map((issue) => issue.code)).toEqual(["SECURITY_INNER_HTML"]);
    expect(html[0]?.severity).toBe("warning");

    for (const code of [
      `localStorage.getItem("k");\n`,
      `window.sessionStorage.setItem("k", "v");\n`,
      `const db = indexedDB.open("x");\n`,
    ]) {
      const issues = scanSecurity(code);
      expect(issues.map((issue) => issue.code)).toContain("SECURITY_STORAGE");
      expect(issues[0]?.severity).toBe("warning");
    }
  });

  it("flags new Worker", () => {
    expect(scanSecurity(`const w = new Worker("/w.js");\n`).map((i) => i.code)).toContain(
      "SECURITY_NETWORK",
    );
  });
});

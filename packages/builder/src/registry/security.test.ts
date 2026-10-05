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
});

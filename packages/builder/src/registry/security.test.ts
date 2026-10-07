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

  it("errors (not warns) on inner HTML and still warns on storage", () => {
    const html = scanSecurity(`export const x = <div dangerouslySetInnerHTML={{ __html: s }} />;\n`);
    expect(html.map((issue) => issue.code)).toEqual(["SECURITY_INNER_HTML"]);
    expect(html[0]?.severity).toBe("error");

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

  it("flags eval indirection", () => {
    const cases: Array<{ name: string; code: string }> = [
      { name: "alias", code: `const e = eval;\ne("x");\n` },
      { name: "comma sequence", code: `(0, eval)("x");\n` },
      { name: "Reflect.apply", code: `Reflect.apply(eval, null, ["x"]);\n` },
      { name: "Reflect.construct", code: `Reflect.construct(Function, ["x"]);\n` },
      { name: "element access", code: `window["eval"]("x");\n` },
      { name: "globalThis alias", code: `const g = globalThis;\ng.eval("x");\n` },
      { name: "globalThis.Function", code: `const f = globalThis.Function("x");\n` },
      { name: "new globalThis.Function", code: `const f = new globalThis.Function("x");\n` },
      { name: "window.setTimeout string", code: `window.setTimeout("alert(1)", 100);\n` },
      { name: "window setTimeout element", code: `window["setTimeout"]("alert(1)", 100);\n` },
    ];
    for (const { code } of cases) {
      expect(scanSecurity(code).map((issue) => issue.code)).toContain("SECURITY_EVAL");
    }
    expect(scanSecurity(`window.setTimeout(() => {}, 100);\n`)).toEqual([]);
  });

  it("flags network indirection", () => {
    const cases: Array<{ name: string; code: string }> = [
      { name: "window element fetch", code: `window["fetch"]("/api");\n` },
      { name: "destructured fetch", code: `const { fetch } = window;\nfetch("/api");\n` },
      { name: "renamed fetch", code: `const { fetch: f } = window;\nf("/api");\n` },
      { name: "member fetch alias", code: `const f = window.fetch;\nf("/api");\n` },
      { name: "fetch.call", code: `fetch.call(null, "/api");\n` },
      { name: "fetch.bind", code: `const b = fetch.bind(null);\n` },
      { name: "new globalThis.WebSocket", code: `const s = new globalThis.WebSocket("wss://x");\n` },
      { name: "new window.Worker", code: `const w = new window.Worker("/w.js");\n` },
      { name: "bare WebSocket call", code: `const s = WebSocket("wss://x");\n` },
      { name: "bare EventSource call", code: `const e = EventSource("/x");\n` },
    ];
    for (const { code } of cases) {
      expect(scanSecurity(code).map((issue) => issue.code)).toContain("SECURITY_NETWORK");
    }
  });

  it("flags cookie indirection", () => {
    for (const code of [
      `const c = document["cookie"];\n`,
      `const c = await cookieStore.get("x");\n`,
    ]) {
      expect(scanSecurity(code).map((issue) => issue.code)).toContain("SECURITY_COOKIE");
    }
  });

  it("flags the innerHTML family as errors", () => {
    const cases: Array<{ name: string; code: string }> = [
      { name: "innerHTML", code: `el.innerHTML = user;\n` },
      { name: "outerHTML", code: `el.outerHTML = user;\n` },
      { name: "element innerHTML", code: `el["innerHTML"] = user;\n` },
      { name: "insertAdjacentHTML", code: `el.insertAdjacentHTML("beforeend", user);\n` },
      { name: "document.write", code: `document.write(user);\n` },
      { name: "document.writeln", code: `document.writeln(user);\n` },
      { name: "createContextualFragment", code: `range.createContextualFragment(user);\n` },
      { name: "DOMParser", code: `const d = new DOMParser().parseFromString(user, "text/html");\n` },
      { name: "setHTML", code: `el.setHTML(user);\n` },
    ];
    for (const { code } of cases) {
      const issues = scanSecurity(code);
      expect(issues.map((issue) => issue.code)).toContain("SECURITY_INNER_HTML");
      expect(issues[0]?.severity).toBe("error");
    }
  });

  it("flags new Worker", () => {
    expect(scanSecurity(`const w = new Worker("/w.js");\n`).map((i) => i.code)).toContain(
      "SECURITY_NETWORK",
    );
  });
});

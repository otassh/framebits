import { describe, expect, it } from "vitest";
import { beginMarker, endMarker } from "./generate.js";
import {
  appendBlock,
  computePatched,
  detectCollision,
  detectEol,
  outsideBlocks,
  scanMarkers,
  stripComments,
  validatedNames,
} from "./patch.js";
import { validateStyles } from "./validate.js";

const INNER = "@keyframes shimmer {\n  from {\n    opacity: 0;\n  }\n}";

function fullBlock(slug: string, inner: string): string {
  return `${beginMarker(slug)}\n${inner}\n${endMarker(slug)}`;
}

describe("detectEol", () => {
  it("detects dominant endings", () => {
    expect(detectEol("")).toBe("\n");
    expect(detectEol("a\nb\n")).toBe("\n");
    expect(detectEol("a\r\nb\r\n")).toBe("\r\n");
    expect(detectEol("a\r\nb\nc\n")).toBe("\n");
  });
});

describe("scanMarkers", () => {
  it("finds blocks", () => {
    const text = `a\n${fullBlock("x", "body")}\n${fullBlock("y", "other")}\n`;
    const scan = scanMarkers(text);
    expect(scan.malformed).toBeUndefined();
    expect(scan.blocks.map((block) => block.slug)).toEqual(["x", "y"]);
  });

  it.each([
    ["begin without end", `${beginMarker("x")}\nbody\n`],
    ["end without begin", `body\n${endMarker("x")}\n`],
    ["duplicate begin", `${beginMarker("x")}\n${beginMarker("x")}\n${endMarker("x")}\n`],
    ["nested", `${beginMarker("x")}\n${beginMarker("y")}\n${endMarker("y")}\n${endMarker("x")}\n`],
    ["crossed", `${beginMarker("x")}\n${beginMarker("y")}\n${endMarker("x")}\n${endMarker("y")}\n`],
  ])("flags malformed: %s", (_label, text) => {
    expect(scanMarkers(text).malformed).toBeDefined();
  });
});

describe("appendBlock", () => {
  it("appends with one blank line, LF file", () => {
    expect(appendBlock("a\n", fullBlock("x", INNER), "\n")).toBe(`a\n\n${fullBlock("x", INNER)}\n`);
  });

  it("terminates missing final newlines with CRLF", () => {
    expect(appendBlock("a", fullBlock("x", INNER), "\r\n")).toBe(
      `a\r\n\r\n${fullBlock("x", INNER).split("\n").join("\r\n")}\r\n`,
    );
  });

  it("handles empty files", () => {
    expect(appendBlock("", fullBlock("x", INNER), "\n")).toBe(`${fullBlock("x", INNER)}\n`);
  });
});

describe("computePatched", () => {
  it("is idempotent (unchanged on re-run)", () => {
    const once = computePatched({ current: "a\n", slug: "x", blockInner: INNER, overwrite: false });
    expect(once.action).toBe("create");
    const twice = computePatched({ current: once.next, slug: "x", blockInner: INNER, overwrite: false });
    expect(twice.action).toBe("unchanged");
    expect(twice.next).toBe(once.next);
  });

  it("reports conflict without overwrite and replaces only markers with it", () => {
    const first = computePatched({ current: "a\n", slug: "x", blockInner: INNER, overwrite: false });
    const other = `${INNER}\n  /* extra */`;
    const conflicted = computePatched({ current: first.next, slug: "x", blockInner: other, overwrite: false });
    expect(conflicted.action).toBe("conflict");
    expect(conflicted.next).toBe(first.next);
    const replaced = computePatched({ current: first.next, slug: "x", blockInner: other, overwrite: true });
    expect(replaced.next).toContain("/* extra */");
    // Only the x block changed: prefix before begin marker is intact.
    expect(replaced.next.startsWith("a\n\n")).toBe(true);
  });

  it("never touches other slugs' blocks", () => {
    const withY = appendBlock("a\n", fullBlock("y", "keep"), "\n");
    const patched = computePatched({ current: withY, slug: "x", blockInner: INNER, overwrite: false });
    expect(patched.next).toContain(fullBlock("y", "keep"));
    const before = withY.slice(0, withY.indexOf(beginMarker("y")));
    const after = patched.next.slice(0, patched.next.indexOf(beginMarker("y")));
    expect(after).toBe(before);
  });
});

describe("detectCollision", () => {
  const validated = validateStyles(
    "x",
    { keyframes: { shimmer: { from: { opacity: "0" } } }, animation: { shimmer: "shimmer 1s linear infinite" } },
    undefined,
  );
  const names = validatedNames(validated);
  const present = (haystack: string, kind: "keyframe" | "animate-var" | "animate-class", name: string): boolean => {
    if (kind === "keyframe") return haystack.includes("opacity: 0;");
    if (kind === "animate-var") return haystack.includes(`--animate-${name}: shimmer 1s linear infinite;`);
    return haystack.includes(`.animate-${name} {`);
  };

  it("flags keyframes outside markers", () => {
    const current = "@keyframes shimmer {\n  from {\n    opacity: 0;\n  }\n}\n";
    expect(detectCollision(current, [], "x", names, present)).toContain("shimmer");
  });

  it("ignores names inside comments", () => {
    const current = "/* @keyframes shimmer { } */\n.a { color: red; }\n";
    expect(detectCollision(current, [], "x", names, present)).toBeUndefined();
  });

  it("flags different definitions in another slug's block", () => {
    const other = fullBlock("y", "@keyframes shimmer {\n  from {\n    opacity: 1;\n  }\n}");
    const scan = scanMarkers(other);
    expect(detectCollision(other, scan.blocks, "x", names, present)).toContain("differently");
  });

  it("accepts identical definitions in another slug's block", () => {
    const other = fullBlock("y", "@keyframes shimmer {\n  from {\n    opacity: 0;\n  }\n}");
    const scan = scanMarkers(other);
    // Same keyframe definition text as ours is present.
    const same = (haystack: string): boolean => haystack.includes("opacity: 0;");
    expect(detectCollision(other, scan.blocks, "x", names, (haystack) => same(haystack))).toBeUndefined();
  });

  it("stripComments and outsideBlocks behave", () => {
    expect(stripComments("a /* x */ b")).toBe("a  b");
    const text = `a\n${fullBlock("x", INNER)}\nb`;
    expect(outsideBlocks(text, scanMarkers(text).blocks)).toBe("a\n\nb");
  });
});

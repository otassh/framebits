import { describe, expect, it } from "vitest";
import { MAX_PATH_LENGTH, MAX_PATH_SEGMENTS, RelativePathSchema } from "./paths.js";

describe("RelativePathSchema", () => {
  const tenSegments = [...Array<string>(MAX_PATH_SEGMENTS - 1).fill("s"), "f.tsx"];
  const elevenSegments = [...Array<string>(MAX_PATH_SEGMENTS).fill("s"), "f.tsx"];

  describe("passing samples", () => {
    it.each([
      "components/ui/aurora-text.tsx",
      "lib/cn.ts",
      "hooks/use-reduced-motion.ts",
      "a.tsx",
      "Uppercase/Allowed.tsx",
      "deep/nested/dir/file.css",
      "demo.tsx",
      "x".repeat(MAX_PATH_LENGTH),
      tenSegments.join("/"),
    ])("accepts %s", (value) => {
      expect(RelativePathSchema.safeParse(value).success).toBe(true);
    });
  });

  describe("rule matrix (one failing sample per rule)", () => {
    const cases: Array<[string, string]> = [
      ["empty", ""],
      ["absolute (leading /)", "/abs/path.tsx"],
      ["drive letter", "C:/win/path.tsx"],
      ["bare drive", "C:"],
      ["lowercase drive", "c:/win.tsx"],
      ["backslash", "a\\b.tsx"],
      ["parent segment", "a/../b.tsx"],
      ["current segment", "a/./b.tsx"],
      ["bare ..", ".."],
      ["bare .", "."],
      ["empty segment (//)", "a//b.tsx"],
      ["trailing slash", "a/b.tsx/"],
      ["null byte", "a/b.tsx\0"],
      ["control character", "a/b\x01c.tsx"],
      ["leading space", " a.tsx"],
      ["trailing space", "a.tsx "],
      ["spaced segment", "a/ b.tsx"],
      ["reserved CON", "CON.tsx"],
      ["reserved nul lowercase", "nul"],
      ["reserved COM1 in subdir", "a/COM1.tsx"],
      ["reserved with extension", "lib/aux.ts"],
      ["colon in segment", "a/b:c.tsx"],
      ["colon splits segments", "a:b/c.tsx"],
      ["angle bracket <", "a/b<c.tsx"],
      ["angle bracket >", "a/b>c.tsx"],
      ["double quote", 'a/b"c.tsx'],
      ["pipe", "a/b|c.tsx"],
      ["question mark", "a/b?c.tsx"],
      ["asterisk", "a/b*c.tsx"],
      ["segment ending with dot", "a/foo./b.tsx"],
      ["trailing dot file", "a/file."],
      ["too long", `${"x".repeat(MAX_PATH_LENGTH + 1 - 4)}.tsx`],
      ["too many segments", elevenSegments.join("/")],
    ];
    it.each(cases)("rejects %s", (_rule, value) => {
      const result = RelativePathSchema.safeParse(value);
      expect(result.success).toBe(false);
    });
  });

  it("collects an issue (not a throw) for bad input", () => {
    const result = RelativePathSchema.safeParse("../evil.ts");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

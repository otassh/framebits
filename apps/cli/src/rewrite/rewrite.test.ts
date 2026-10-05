import { describe, expect, it } from "vitest";
import { rewriteImports } from "./index.js";

const DEFAULTS = { components: "@/components/ui", lib: "@/lib", hooks: "@/hooks" };
const CUSTOM = { components: "~/components/ui", lib: "~/lib", hooks: "~/hooks" };

describe("rewriteImports", () => {
  it("leaves content untouched when aliases match", () => {
    const input = 'import { cn } from "@/lib/cn";\n';
    expect(rewriteImports(input, DEFAULTS).content).toBe(input);
  });

  it("rewrites single-line and multi-line imports, type imports, side-effect and dynamic", () => {
    const input = [
      'import { cn } from "@/lib/cn";',
      'import type { X } from "@/hooks/use-x";',
      'import "@/components/ui/aurora-text";',
      'import {',
      '  AuroraText,',
      '} from "@/components/ui/aurora-text";',
      'export { Y } from "@/lib/y";',
      'const m = await import("@/lib/lazy");',
      "",
    ].join("\n");
    const result = rewriteImports(input, CUSTOM);
    expect(result.content).toContain('"~/lib/cn"');
    expect(result.content).toContain('"~/hooks/use-x"');
    expect(result.content).toContain('"~/components/ui/aurora-text"');
    expect(result.content).toContain('"~/lib/y"');
    expect(result.content).toContain('"~/lib/lazy"');
    expect(result.content).not.toContain("@/lib/");
  });

  it("never rewrites comments, strings, or JSX text", () => {
    const input = [
      '// import { cn } from "@/lib/cn";',
      '/* from "@/lib/cn" */',
      'const s = "@/lib/cn";',
      'export function C() { return <span>@/lib/cn is text</span>; }',
      'import { real } from "@/lib/real";',
      "",
    ].join("\n");
    const result = rewriteImports(input, CUSTOM);
    expect(result.content).toContain('// import { cn } from "@/lib/cn";');
    expect(result.content).toContain('const s = "@/lib/cn";');
    expect(result.content).toContain("@/lib/cn is text");
    expect(result.content).toContain('"~/lib/real"');
  });

  it("warns with line numbers when shipped aliases remain", () => {
    const input = 'import { real } from "@/lib/real";\n// leftover "@/lib/old"\n';
    const result = rewriteImports(input, CUSTOM);
    expect(result.remaining.length).toBeGreaterThan(0);
    expect(result.remaining).toContain(2);
  });

  it("always outputs LF", () => {
    const result = rewriteImports('import { a } from "@/lib/a";\r\n', CUSTOM);
    expect(result.content.includes("\r")).toBe(false);
  });
});

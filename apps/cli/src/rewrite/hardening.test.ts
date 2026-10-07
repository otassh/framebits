import { describe, expect, it } from "vitest";
import { rewriteImports } from "./index.js";

const CUSTOM = { components: "~/components/ui", lib: "~/lib", hooks: "~/hooks" };

describe("rewrite hardening", () => {
  it("rewrites require, require.resolve and jest.mock when alias differs", () => {
    const input = [
      'const cn = require("@/lib/cn");',
      'const p = require.resolve("@/lib/cn");',
      'jest.mock("@/lib/cn", () => ({}));',
      "",
    ].join("\n");
    const result = rewriteImports(input, CUSTOM);
    expect(result.content).toContain('require("~/lib/cn")');
    expect(result.content).toContain('require.resolve("~/lib/cn")');
    expect(result.content).toContain('jest.mock("~/lib/cn"');
  });

  it("never rewrites statement-looking text inside plain string literals", () => {
    const input = 'const s = "require(\\"@/lib/cn\\")";\nimport { real } from "@/lib/real";\n';
    const result = rewriteImports(input, CUSTOM);
    expect(result.content).toContain("@/lib/cn");
    expect(result.content).toContain('"~/lib/real"');
  });
});

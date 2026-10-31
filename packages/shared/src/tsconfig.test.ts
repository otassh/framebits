import { describe, expect, it } from "vitest";
import { TsconfigSchema } from "./tsconfig.js";

describe("TsconfigSchema", () => {
  it("validates the detection fields and ignores unrelated compiler options", () => {
    expect(
      TsconfigSchema.parse({
        extends: ["./base.json", "./overrides.json"],
        compilerOptions: { strict: true, paths: { "@/*": ["./src/*"] } },
        references: [{ path: "./tsconfig.app.json" }],
      }),
    ).toEqual({
      extends: ["./base.json", "./overrides.json"],
      compilerOptions: { paths: { "@/*": ["./src/*"] } },
      references: [{ path: "./tsconfig.app.json" }],
    });
  });

  it.each([
    { extends: 42 },
    { compilerOptions: { paths: { "@/*": "./src/*" } } },
    { compilerOptions: { paths: { "@/*": [] } } },
    { references: [{ path: null }] },
  ])("rejects malformed configuration: %j", (value) => {
    expect(TsconfigSchema.safeParse(value).success).toBe(false);
  });

  it("rejects prototype-polluting path maps", () => {
    const value: unknown = JSON.parse('{"compilerOptions":{"paths":{"__proto__":["./src/*"]}}}');
    expect(TsconfigSchema.safeParse(value).success).toBe(false);
  });
});

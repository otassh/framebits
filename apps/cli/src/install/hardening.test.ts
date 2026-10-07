import { describe, expect, it } from "vitest";
import { computeMissing } from "./compute.js";
import { IGNORE_SCRIPTS_HINT, pmBinaryCaution } from "./command.js";
import { redactSecrets, tailLines } from "./run.js";

const EMPTY = { dependencies: {}, devDependencies: {}, peerDependencies: {} };

describe("install hardening", () => {
  it("surfaces a PATH caution and an --ignore-scripts review hint", () => {
    expect(pmBinaryCaution("pnpm")).toContain("PATH");
    expect(IGNORE_SCRIPTS_HINT).toContain("--ignore-scripts");
  });

  it("warns when declared and needed ranges do not intersect", () => {
    const { decisions, warnings } = computeMissing({
      needed: [{ name: "motion", range: ">=14.0.0 <15.0.0" }],
      declared: { ...EMPTY, dependencies: { motion: ">=15.0.0 <16.0.0" } },
      installed: new Map(),
    });
    expect(decisions[0]?.action).toBe("warn-manual");
    expect(warnings.some((w) => w.includes("does not intersect"))).toBe(true);
  });

  it("redacts secrets from tails", () => {
    const tail = tailLines("ok\ntoken=npm_abcdef1234567890\nBearer abc.def.ghi", 10);
    expect(tail).not.toContain("npm_abcdef1234567890");
    expect(tail).not.toContain("Bearer abc.def.ghi");
    expect(redactSecrets("npm_abcdef1234567890")).toBe("***");
  });
});

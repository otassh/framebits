import { describe, expect, it } from "vitest";
import { computeMissing } from "./compute.js";

const EMPTY = { dependencies: {}, devDependencies: {}, peerDependencies: {} };

describe("computeMissing", () => {
  it("installs undeclared packages with the item range", () => {
    const { decisions, warnings } = computeMissing({
      needed: [{ name: "motion", range: "^14.0.0" }],
      declared: EMPTY,
      installed: new Map(),
    });
    expect(decisions).toEqual([{ name: "motion", action: "install", range: "^14.0.0" }]);
    expect(warnings).toEqual([]);
  });

  it("skips declared+installed satisfying ranges", () => {
    const { decisions } = computeMissing({
      needed: [{ name: "motion", range: "^14.0.0" }],
      declared: { ...EMPTY, dependencies: { motion: "^14.0.0" } },
      installed: new Map([["motion", "14.2.0"]]),
    });
    expect(decisions[0]?.action).toBe("skip");
  });

  it("skips declared-subset ranges without node_modules", () => {
    const { decisions } = computeMissing({
      needed: [{ name: "motion", range: "^14.0.0" }],
      declared: { ...EMPTY, dependencies: { motion: "14.1.0" } },
      installed: new Map(),
    });
    expect(decisions[0]?.action).toBe("skip");
  });

  it("warns (no touch) on declared-but-unsatisfied", () => {
    const installed = computeMissing({
      needed: [{ name: "motion", range: "^14.0.0" }],
      declared: { ...EMPTY, dependencies: { motion: "^13.0.0" } },
      installed: new Map([["motion", "13.5.0"]]),
    });
    expect(installed.decisions[0]?.action).toBe("warn-manual");
    const detail = (installed.decisions[0] as { detail: string }).detail;
    expect(detail).toContain("13.5.0");

    const declared = computeMissing({
      needed: [{ name: "motion", range: "^14.0.0" }],
      declared: { ...EMPTY, devDependencies: { motion: "^13.0.0" } },
      installed: new Map(),
    });
    expect(declared.decisions[0]?.action).toBe("warn-manual");
  });

  it("reads peerDependencies too", () => {
    const { decisions } = computeMissing({
      needed: [{ name: "clsx", range: "^2.0.0" }],
      declared: { ...EMPTY, peerDependencies: { clsx: "2.1.1" } },
      installed: new Map([["clsx", "2.1.1"]]),
    });
    expect(decisions[0]?.action).toBe("skip");
  });

  it("installs once with the first range; warns on non-intersecting later ranges", () => {
    const { decisions, warnings } = computeMissing({
      needed: [
        { name: "motion", range: "^14.0.0" },
        { name: "motion", range: "^15.0.0" },
      ],
      declared: EMPTY,
      installed: new Map(),
    });
    expect(decisions).toEqual([{ name: "motion", action: "install", range: "^14.0.0" }]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("^15.0.0");
  });

  it("sorts packages deterministically", () => {
    const { decisions } = computeMissing({
      needed: [
        { name: "motion", range: "^14.0.0" },
        { name: "clsx", range: "^2.0.0" },
      ],
      declared: EMPTY,
      installed: new Map(),
    });
    expect(decisions.map((decision) => decision.name)).toEqual(["clsx", "motion"]);
  });
});

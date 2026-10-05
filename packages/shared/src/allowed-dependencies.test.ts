import { describe, expect, it } from "vitest";
import {
  ALLOWED_DEPENDENCIES,
  AllowedDependencySchema,
  isAllowedDependency,
} from "./allowed-dependencies.js";

describe("isAllowedDependency", () => {
  it("accepts every allowlisted package", () => {
    for (const name of ALLOWED_DEPENDENCIES) {
      expect(isAllowedDependency(name)).toBe(true);
    }
  });

  it.each(["react", "MOTION", "motion ", "", "lodash"])("rejects %s", (name) => {
    expect(isAllowedDependency(name)).toBe(false);
  });
});

describe("AllowedDependencySchema", () => {
  it("accepts allowlisted packages", () => {
    expect(AllowedDependencySchema.safeParse("motion").success).toBe(true);
    expect(AllowedDependencySchema.safeParse("clsx").success).toBe(true);
  });

  it("rejects unknown packages", () => {
    const result = AllowedDependencySchema.safeParse("left-pad");
    expect(result.success).toBe(false);
  });
});

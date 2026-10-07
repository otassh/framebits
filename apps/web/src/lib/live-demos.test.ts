import { describe, expect, it } from "vitest";
import { demoSlugFromPath, findDemoLoader } from "./live-demos.js";

function fakeLoader(): Promise<{ default: () => null }> {
  return Promise.resolve({ default: () => null });
}

describe("demoSlugFromPath", () => {
  it("extracts the slug from a globbed demo path", () => {
    expect(
      demoSlugFromPath("../../../../registry/components/text-animations/aurora-text/demo.tsx"),
    ).toBe("aurora-text");
    expect(demoSlugFromPath("../../../../registry/components/3d/framebits-logo-3d/demo.tsx")).toBe(
      "framebits-logo-3d",
    );
  });

  it("rejects non-demo paths and non-kebab slugs", () => {
    expect(
      demoSlugFromPath("../../../../registry/components/buttons/shimmer-button/shimmer-button.tsx"),
    ).toBeUndefined();
    expect(demoSlugFromPath("../../../../registry/components/buttons/OK/demo.tsx")).toBeUndefined();
    expect(demoSlugFromPath("../../../../registry/components/buttons//demo.tsx")).toBeUndefined();
    expect(demoSlugFromPath("")).toBeUndefined();
    expect(demoSlugFromPath("/etc/passwd")).toBeUndefined();
  });
});

describe("findDemoLoader", () => {
  const modules = {
    "../../../../registry/components/text-animations/aurora-text/demo.tsx": fakeLoader,
    "../../../../registry/components/buttons/shimmer-button/demo.tsx": fakeLoader,
  };

  it("returns the loader whose path slug matches", () => {
    expect(findDemoLoader("aurora-text", modules)).toBe(fakeLoader);
    expect(findDemoLoader("shimmer-button", modules)).toBe(fakeLoader);
  });

  it("returns undefined for unknown slugs", () => {
    expect(findDemoLoader("nope", modules)).toBeUndefined();
    expect(findDemoLoader("aurora", modules)).toBeUndefined();
    expect(findDemoLoader("", modules)).toBeUndefined();
  });

  it("returns undefined for an empty module set", () => {
    expect(findDemoLoader("aurora-text", {})).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { PreviewAssetPathSchema, PreviewWebpSchema, RegistryPreviewsSchema } from "./preview.js";

describe("preview schemas", () => {
  it("accepts a safe public preview path", () => {
    expect(
      RegistryPreviewsSchema.parse({ image: "/previews/framebits-logo-3d.webp" }),
    ).toEqual({ image: "/previews/framebits-logo-3d.webp" });
  });

  it.each([
    "previews/aurora-text.webp",
    "/previews/../secret.webp",
    "/previews/Aurora.webp",
    "/previews/aurora-text.png",
  ])("rejects unsafe preview path %s", (path) => {
    expect(PreviewAssetPathSchema.safeParse(path).success).toBe(false);
  });

  it("accepts only RIFF WebP bytes", () => {
    const valid = new TextEncoder().encode("RIFF0000WEBPVP8 ");
    expect(PreviewWebpSchema.safeParse(valid).success).toBe(true);
    expect(PreviewWebpSchema.safeParse(new TextEncoder().encode("not a webp file")).success).toBe(
      false,
    );
  });
});

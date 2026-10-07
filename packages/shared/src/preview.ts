import { z } from "zod";
import { SlugSchema } from "./meta.js";

/** Public path emitted for a generated component preview. */
export const PreviewAssetPathSchema = z
  .string()
  .regex(/^\/previews\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/, "invalid preview asset path")
  .refine((path) => {
    const slug = path.slice("/previews/".length, -".webp".length);
    return SlugSchema.safeParse(slug).success;
  }, "preview asset path must contain a valid component slug");

export const RegistryPreviewsSchema = z
  .object({
    image: PreviewAssetPathSchema,
  })
  .strict();

/** Minimal structural validation for cached WebP input before it is published. */
export const PreviewWebpSchema = z.instanceof(Uint8Array).superRefine((bytes, ctx) => {
  const ascii = (offset: number, length: number): string =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length < 16 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") {
    ctx.addIssue({ code: "custom", message: "preview must be a RIFF WebP image" });
  }
});

export type RegistryPreviews = z.infer<typeof RegistryPreviewsSchema>;

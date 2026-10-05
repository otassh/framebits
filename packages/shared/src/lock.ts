import { z } from "zod";
import { SlugSchema } from "./meta.js";
import { SemverVersionSchema } from "./semver.js";
import { Sha256HashSchema } from "./hashable-json.js";

/** `registry/registry.lock.json`: slug -> { version, hash } (MASTER_PROMPT Section 3). */
export const LockEntrySchema = z
  .object({
    version: SemverVersionSchema,
    hash: Sha256HashSchema,
  })
  .strict();

export type LockEntry = z.infer<typeof LockEntrySchema>;

export const RegistryLockSchema = z
  .object({
    version: z.literal(1),
    components: z.record(z.string(), LockEntrySchema).superRefine((components, ctx) => {
      for (const slug of Object.keys(components)) {
        if (!SlugSchema.safeParse(slug).success) {
          ctx.addIssue({
            code: "custom",
            message: `lock key "${slug}" is not a valid slug`,
            path: [slug],
          });
        }
      }
    }),
  })
  .strict();

export type RegistryLock = z.infer<typeof RegistryLockSchema>;

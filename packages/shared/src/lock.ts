import { z } from "zod";
import { guardedRecord, rejectDangerousKeys } from "./hashable-json.js";
import { SlugSchema } from "./meta.js";
import { SemverVersionSchema } from "./semver.js";
import { Sha256HashSchema } from "./hashable-json.js";

/** Max components tracked by the lock file (DoS guard on registry scale). */
export const MAX_LOCK_COMPONENTS = 1000;

/** `registry/registry.lock.json`: slug -> { version, hash }. */
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
    components: guardedRecord(LockEntrySchema).superRefine((components, ctx) => {
      rejectDangerousKeys(components, ctx);
      if (Object.keys(components).length > MAX_LOCK_COMPONENTS) {
        ctx.addIssue({
          code: "custom",
          message: `lock must track at most ${String(MAX_LOCK_COMPONENTS)} components`,
        });
      }
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

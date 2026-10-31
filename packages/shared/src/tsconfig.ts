import { z } from "zod";
import { guardedRecord } from "./hashable-json.js";

export const MAX_TSCONFIG_DEPTH = 5;
export const MAX_TSCONFIG_FILES = 32;

const ConfigPathSchema = z.string().min(1).max(1024);

/** Only the TypeScript fields used for detection; unrelated compiler options are ignored. */
export const TsconfigSchema = z.object({
  extends: z.union([ConfigPathSchema, z.array(ConfigPathSchema).max(5)]).optional(),
  compilerOptions: z
    .object({
      baseUrl: z.string().max(1024).optional(),
      paths: guardedRecord(z.array(ConfigPathSchema).min(1).max(10)).optional(),
    })
    .optional(),
  references: z
    .array(z.object({ path: ConfigPathSchema }))
    .max(100)
    .optional(),
});

export type Tsconfig = z.infer<typeof TsconfigSchema>;

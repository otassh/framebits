import { z } from "zod";
import { SlugSchema } from "./meta.js";
import { SCHEMA_VERSION } from "./registry-item.js";
import { SemverVersionSchema } from "./semver.js";
import { Sha256HashSchema } from "./hashable-json.js";

/** One entry of the `installed` map in `framebits.json`. */
export const InstalledEntrySchema = z
  .object({
    version: SemverVersionSchema,
    hash: Sha256HashSchema,
  })
  .strict();

export type InstalledEntry = z.infer<typeof InstalledEntrySchema>;

/**
 * `framebits.json` in the user's project root (MASTER_PROMPT Section 4.5).
 *
 * `registry` must be `https://` (with `http://localhost` / `127.0.0.1` allowed for
 * development). URL *syntax* is validated here; reachability is a CLI runtime concern.
 */
export const CliConfigSchema = z
  .object({
    $schema: z.url().optional(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    registry: z
      .url("registry must be a valid URL")
      .refine(
        (url) =>
          url.startsWith("https://") ||
          url.startsWith("http://localhost") ||
          url.startsWith("http://127.0.0.1"),
        "registry must be https:// (http://localhost and 127.0.0.1 are allowed for development)",
      ),
    framework: z.enum(["next", "vite", "remix", "other"]),
    typescript: z.boolean(),
    tailwind: z
      .object({
        version: z.union([z.literal(3), z.literal(4)]),
        config: z.string().min(1).optional(),
        css: z.string().min(1).optional(),
      })
      .strict(),
    aliases: z
      .object({
        components: z.string().min(1, "alias must not be empty"),
        lib: z.string().min(1, "alias must not be empty"),
        hooks: z.string().min(1, "alias must not be empty"),
      })
      .strict(),
    /**
     * Per-request network timeout in **milliseconds** (1-300 s).
     * Optional; when absent the CLI default (10 s) applies. Overridden by the
     * `FRAMEBITS_TIMEOUT_MS` env var and the `--timeout <seconds>` flag.
     */
    timeoutMs: z
      .number()
      .int("timeoutMs must be an integer number of milliseconds")
      .min(1000, "timeoutMs must be at least 1000 (1s)")
      .max(300000, "timeoutMs must be at most 300000 (300s)")
      .optional(),
    installed: z.record(z.string(), InstalledEntrySchema).default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    for (const slug of Object.keys(config.installed)) {
      if (!SlugSchema.safeParse(slug).success) {
        ctx.addIssue({
          code: "custom",
          message: `installed key "${slug}" is not a valid slug`,
          path: ["installed", slug],
        });
      }
    }
  });

export type CliConfig = z.infer<typeof CliConfigSchema>;

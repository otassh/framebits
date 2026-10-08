import { z } from "zod";
import { guardedRecord, rejectDangerousKeys } from "./hashable-json.js";
import { SlugSchema } from "./meta.js";
import { RelativePathSchema } from "./paths.js";
import { SCHEMA_VERSION } from "./registry-item.js";
import { SemverVersionSchema } from "./semver.js";
import { Sha256HashSchema } from "./hashable-json.js";

/** Max entries of the `installed` map (DoS guard on untrusted config files). */
export const MAX_INSTALLED_ENTRIES = 1000;

/** One entry of the `installed` map in `framebits.json`. */
export const InstalledEntrySchema = z
  .object({
    version: SemverVersionSchema,
    hash: Sha256HashSchema,
  })
  .strict();

export type InstalledEntry = z.infer<typeof InstalledEntrySchema>;

/**
 * `framebits.json` in the user's project root.
 *
 * `registry` must be `https://` without credentials (with `http://localhost`,
 * `http://127.0.0.1`, and `http://[::1]` — also without credentials — allowed for
 * development). The check parses with `new URL()` and compares origin parts;
 * prefix matching (`startsWith`) is deliberately NOT used (it accepts
 * `https://evil.com` lookalikes and smuggled userinfo). URL *syntax* is
 * validated here; reachability is a CLI runtime concern.
 *
 * Alias and tailwind paths reuse `RelativePathSchema` (no absolute paths, drive
 * letters, or `..` segments); the CLI additionally confines them with realpath
 * containment before writing.
 */
export const CliConfigSchema = z
  .object({
    $schema: z.url().optional(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    registry: z.url("registry must be a valid URL").superRefine((raw, ctx) => {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        ctx.addIssue({ code: "custom", message: "registry must be a valid URL" });
        return;
      }
      const hasUserinfo = parsed.username !== "" || parsed.password !== "";
      if (parsed.protocol === "https:") {
        if (hasUserinfo) {
          ctx.addIssue({
            code: "custom",
            message: "registry https URL must not contain credentials",
          });
        }
        return;
      }
      if (parsed.protocol === "http:") {
        const hostname = parsed.hostname.toLowerCase();
        const bare =
          hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
        if (bare !== "localhost" && bare !== "127.0.0.1" && bare !== "::1") {
          ctx.addIssue({
            code: "custom",
            message:
              "registry must be https:// (http is allowed only for localhost, 127.0.0.1, and ::1)",
          });
          return;
        }
        if (hasUserinfo) {
          ctx.addIssue({
            code: "custom",
            message: "registry http URL must not contain credentials",
          });
        }
        return;
      }
      ctx.addIssue({
        code: "custom",
        message:
          "registry must be https:// (http is allowed only for localhost, 127.0.0.1, and ::1)",
      });
    }),
    framework: z.enum(["next", "vite", "remix", "other"]),
    typescript: z.boolean(),
    tailwind: z
      .object({
        version: z.union([z.literal(3), z.literal(4)]),
        config: RelativePathSchema.optional(),
        css: RelativePathSchema.optional(),
      })
      .strict(),
    aliases: z
      .object({
        components: RelativePathSchema,
        lib: RelativePathSchema,
        hooks: RelativePathSchema,
      })
      .strict(),
    /**
     * Per-request network timeout in **seconds** (1-300).
     * Optional; when absent the CLI default (10 s) applies. Overridden by the
     * `FRAMEBITS_TIMEOUT` env var and the `--timeout <seconds>` flag.
     */
    timeoutSeconds: z
      .number()
      .int("timeoutSeconds must be an integer number of seconds")
      .min(1, "timeoutSeconds must be at least 1")
      .max(300, "timeoutSeconds must be at most 300")
      .optional(),
    installed: guardedRecord(InstalledEntrySchema).default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    rejectDangerousKeys(config.installed, ctx);
    if (Object.keys(config.installed).length > MAX_INSTALLED_ENTRIES) {
      ctx.addIssue({
        code: "custom",
        message: `installed must have at most ${String(MAX_INSTALLED_ENTRIES)} entries`,
        path: ["installed"],
      });
    }
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

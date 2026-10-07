/**
 * CLI config load/write (C7). Validated with CliConfigSchema, 2-space indent,
 * LF, trailing newline, atomic temp+rename.
 */
import { CliConfigSchema, type CliConfig } from "@framebits/shared";
import { randomUUID } from "node:crypto";
import { configError } from "../errors.js";

export const CONFIG_FILE_NAME = "framebits.json";

export interface ConfigFs {
  readFile(path: string): Promise<string | undefined>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  statMode?(path: string): Promise<number | undefined>;
  chmod?(path: string, mode: number): Promise<void>;
}

function joinPosix(dir: string, file: string): string {
  return `${dir.replace(/\/+$/, "")}/${file}`;
}

export function configPath(projectRoot: string): string {
  return joinPosix(projectRoot, CONFIG_FILE_NAME);
}

export function parseConfig(text: string, file: string): CliConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw configError(
      `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      "fix the JSON syntax or re-run init",
    );
  }
  const parsed = CliConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw configError(`${file} is invalid: ${details}`, "fix the config or re-run init");
  }
  return parsed.data;
}

export async function loadConfig(
  projectRoot: string,
  fs: ConfigFs,
): Promise<{ path: string; config: CliConfig } | undefined> {
  const path = configPath(projectRoot);
  const text = await fs.readFile(path);
  if (text === undefined) return undefined;
  return { path, config: parseConfig(text, CONFIG_FILE_NAME) };
}

export function serializeConfig(config: CliConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function writeConfigAtomic(
  projectRoot: string,
  config: CliConfig,
  fs: ConfigFs,
): Promise<string> {
  const path = configPath(projectRoot);
  const content = serializeConfig(config).replace(/\r\n/g, "\n");
  // Preserve the existing file mode (e.g. 0600) across the atomic replace.
  let existingMode: number | undefined;
  try {
    existingMode = await fs.statMode?.(path);
  } catch {
    existingMode = undefined;
  }
  const staging = `${path}.tmp-${randomUUID()}`;
  await fs.writeFile(staging, content);
  if (existingMode !== undefined) {
    try {
      await fs.chmod?.(staging, existingMode);
    } catch {
      // Best-effort.
    }
  }
  await fs.rename(staging, path);
  return path;
}

export interface InitConfigInput {
  registry: string;
  framework: "next" | "vite" | "remix" | "other";
  typescript: boolean;
  tailwind: { version: 3 | 4; config?: string | undefined; css?: string | undefined } | {
    version: 3 | 4;
    config?: undefined;
    css?: undefined;
  };
  aliases: { components: string; lib: string; hooks: string };
}

export function mergeInitConfig(
  existing: CliConfig | undefined,
  detected: InitConfigInput,
  options: { yes: boolean; registryFlag: string | undefined },
): CliConfig {
  const registry = options.registryFlag ?? existing?.registry ?? detected.registry;
  if (existing === undefined) {
    return {
      $schema: "https://framebits.dev/schema/config.json",
      schemaVersion: 1,
      registry,
      framework: detected.framework,
      typescript: detected.typescript,
      tailwind: {
        version: detected.tailwind.version,
        ...(detected.tailwind.config !== undefined ? { config: detected.tailwind.config } : {}),
        ...(detected.tailwind.css !== undefined ? { css: detected.tailwind.css } : {}),
      },
      aliases: { ...detected.aliases },
      installed: {},
    };
  }
  if (options.yes) {
    return {
      ...existing,
      registry,
      framework: existing.framework,
      typescript: existing.typescript,
      tailwind: existing.tailwind,
      aliases: existing.aliases,
    };
  }
  return {
    ...existing,
    registry,
    framework: detected.framework,
    typescript: detected.typescript,
    tailwind: {
      version: detected.tailwind.version,
      ...(detected.tailwind.config !== undefined ? { config: detected.tailwind.config } : {}),
      ...(detected.tailwind.css !== undefined ? { css: detected.tailwind.css } : {}),
    },
    aliases: { ...detected.aliases },
  };
}

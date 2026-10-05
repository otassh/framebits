/**
 * Version injected at build time (C1).
 * tsup defines `process.env.CLI_VERSION` from package.json; dev/test falls back.
 */
declare const __FRAMEBITS_VERSION__: string | undefined;

function readInjected(): string | undefined {
  try {
    const value =
      typeof __FRAMEBITS_VERSION__ !== "undefined" ? __FRAMEBITS_VERSION__ : undefined;
    if (typeof value === "string" && value !== "") return value;
  } catch {
    // Ignore: the define is absent in dev/test.
  }
  const fromEnv = process.env["CLI_VERSION"];
  if (typeof fromEnv === "string" && fromEnv !== "") return fromEnv;
  return undefined;
}

export const CLI_VERSION: string = readInjected() ?? "0.0.0-dev";

export const CLI_PACKAGE_NAME = "framebits";

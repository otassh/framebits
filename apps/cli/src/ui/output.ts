/**
 * All printing through here (C3). No `console.*` anywhere else.
 * Respects NO_COLOR and non-TTY (no ANSI when piped).
 */
import picocolors from "picocolors";

export interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
  readonly isTTY: boolean;
  readonly supportsColor: boolean;
}

export interface OutputOptions {
  stdoutTTY: boolean;
  stderrTTY: boolean;
  noColorEnv: string | undefined;
}

export function supportsColor(options: OutputOptions): boolean {
  if (options.noColorEnv !== undefined && options.noColorEnv !== "") return false;
  return options.stdoutTTY && options.stderrTTY;
}

export function createNodeOutput(): Output {
  const noColorEnv = process.env["NO_COLOR"];
  const stdoutTTY = process.stdout.isTTY;
  const stderrTTY = process.stderr.isTTY;
  const color = supportsColor({ stdoutTTY, stderrTTY, noColorEnv });
  return {
    stdout(text: string): void {
      process.stdout.write(text);
    },
    stderr(text: string): void {
      process.stderr.write(text);
    },
    isTTY: stdoutTTY,
    supportsColor: color,
  };
}

export function createBufferedOutput(options?: Partial<OutputOptions>): Output & {
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const stdoutTTY = options?.stdoutTTY ?? false;
  const stderrTTY = options?.stderrTTY ?? false;
  const color = supportsColor({
    stdoutTTY,
    stderrTTY,
    noColorEnv: options?.noColorEnv,
  });
  return {
    out,
    err,
    stdout(text: string): void {
      out.push(text);
    },
    stderr(text: string): void {
      err.push(text);
    },
    isTTY: stdoutTTY,
    supportsColor: color,
  };
}

function colorize(output: Output, colorizeFn: (text: string) => string, text: string): string {
  if (!output.supportsColor) return text;
  return colorizeFn(text);
}

export function printLine(output: Output, text: string): void {
  output.stdout(`${text}\n`);
}

export function printError(output: Output, text: string): void {
  output.stderr(`${colorize(output, picocolors.red, text)}\n`);
}

export function printWarning(output: Output, text: string): void {
  const prefix = colorize(output, picocolors.yellow, "warning");
  output.stdout(`${prefix}: ${text}\n`);
}

export function printSuccess(output: Output, text: string): void {
  output.stdout(`${colorize(output, picocolors.green, text)}\n`);
}

export function printHint(output: Output, hint: string): void {
  output.stdout(`Hint: ${hint}\n`);
}

export interface InteractiveOptions {
  stdinTTY: boolean;
  stdoutTTY: boolean;
  ciEnv: boolean;
  yes: boolean;
}

/**
 * Interactive = stdin.isTTY && stdout.isTTY && !CI env && !--yes (C3).
 * Pure: all inputs are parameters so tests never touch process globals.
 */
export function isInteractive(options: InteractiveOptions): boolean {
  if (options.yes) return false;
  if (options.ciEnv) return false;
  return options.stdinTTY && options.stdoutTTY;
}

export function readCiEnv(env: NodeJS.ProcessEnv): boolean {
  const ci = env["CI"];
  if (ci !== undefined && ci !== "" && ci !== "false" && ci !== "0") return true;
  if (env["CONTINUOUS_INTEGRATION"] !== undefined) return true;
  if (env["BUILD_NUMBER"] !== undefined) return true;
  return false;
}

export function isInteractiveProcess(yes: boolean): boolean {
  return isInteractive({
    stdinTTY: process.stdin.isTTY,
    stdoutTTY: process.stdout.isTTY,
    ciEnv: readCiEnv(process.env),
    yes,
  });
}

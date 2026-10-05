/**
 * Installer runner (E4+E5). cross-spawn (no shell:true) so .cmd shims work on
 * Windows. cwd = project root, 10-minute timeout. stdio is inherited only in
 * interactive/--debug mode, otherwise captured and the tail is reported.
 */
import spawn from "cross-spawn";

export const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
export const INSTALL_TAIL_LINES = 20;

export interface RunCommand {
  program: string;
  args: string[];
  cwd: string;
}

export interface InstallOutcome {
  exitCode: number | undefined;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export type SpawnFn = (
  program: string,
  args: readonly string[],
  options: { cwd: string; timeout: number; capture: boolean },
) => Promise<InstallOutcome>;

export function tailLines(text: string, maxLines: number): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines.slice(Math.max(lines.length - maxLines, 0)).join("\n");
}

export const nodeSpawn: SpawnFn = (program, args, options) =>
  new Promise<InstallOutcome>((resolvePromise) => {
    const child = spawn(program, [...args], {
      cwd: options.cwd,
      timeout: options.timeout,
      stdio: options.capture ? "pipe" : "inherit",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (error: Error) => {
      resolvePromise({ exitCode: undefined, timedOut, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code: number | null) => {
      resolvePromise({ exitCode: code ?? undefined, timedOut, stdout, stderr });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      resolvePromise({ exitCode: undefined, timedOut: true, stdout, stderr });
    }, options.timeout);
    if (typeof timer.unref === "function") timer.unref();
  });

export interface Installer {
  run(command: RunCommand, interactive: boolean, debug: boolean): Promise<InstallOutcome>;
}

export function createInstaller(spawnFn: SpawnFn): Installer {
  return {
    run: (command, interactive, debug) => {
      const capture = !(interactive || debug);
      return spawnFn(command.program, command.args, {
        cwd: command.cwd,
        timeout: INSTALL_TIMEOUT_MS,
        capture,
      });
    },
  };
}

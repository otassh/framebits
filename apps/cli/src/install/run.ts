/**
 * Installer runner (E4+E5). cross-spawn (no shell:true) so .cmd shims work on
 * Windows. cwd = project root, 10-minute timeout. stdio is inherited only in
 * interactive/--debug mode, otherwise captured and the tail is reported.
 */
import spawn from "cross-spawn";

export const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
export const INSTALL_TAIL_LINES = 20;
/** Max buffered installer output per stream (1 MB): truncate + kill on exceed. */
export const MAX_INSTALL_OUTPUT_BYTES = 1_048_576;

const SECRET_PATTERNS: RegExp[] = [
  /\bnpm_[A-Za-z0-9_-]{10,}/g,
  /\bghp_[A-Za-z0-9]{10,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{10,}/g,
  /\bgho_[A-Za-z0-9]{10,}/g,
  /\bxox[bpas]-[A-Za-z0-9-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/-]+/gi,
  /_authToken\s*=\s*[^\s;]+/gi,
  /\/\/[^/\s]+\/:_authToken\s*=\s*[^\s]+/gi,
];

/**
 * Redact secrets from installer output tails before printing. Masks npm/GitHub
 * tokens, Bearer credentials, and registry auth tokens; never prints raw
 * tail bytes that could echo a credential from the environment.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "***");
  }
  // Generic `token=...` / `token: ...` fallback (short, after specific ones).
  out = out.replace(/\btoken\s*[:=]\s*[^\s;]+/gi, "token=***");
  return out;
}

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
  const redacted = redactSecrets(text);
  const lines = redacted.replace(/\r\n/g, "\n").split("\n");
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
    let bufferExceeded = false;
    const onData = (target: "stdout" | "stderr", chunk: Buffer | string): void => {
      const text = String(chunk);
      if (target === "stdout") {
        stdout += text;
        if (stdout.length > MAX_INSTALL_OUTPUT_BYTES) {
          stdout = stdout.slice(-MAX_INSTALL_OUTPUT_BYTES);
          bufferExceeded = true;
        }
      } else {
        stderr += text;
        if (stderr.length > MAX_INSTALL_OUTPUT_BYTES) {
          stderr = stderr.slice(-MAX_INSTALL_OUTPUT_BYTES);
          bufferExceeded = true;
        }
      }
      // Max-buffer guard: kill on exceed so a verbose installer cannot blow
      // memory; the truncated tail is reported by the caller.
      if (bufferExceeded) {
        try {
          child.kill();
        } catch {
          // Ignore kill failures.
        }
      }
    };
    child.stdout?.on("data", (chunk: Buffer | string) => {
      onData("stdout", chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      onData("stderr", chunk);
    });
    child.on("error", (error: Error) => {
      resolvePromise({
        exitCode: undefined,
        timedOut,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(`${stderr}${error.message}`),
      });
    });
    child.on("close", (code: number | null) => {
      const truncatedNote = bufferExceeded
        ? "\n[installer output truncated at 1 MB]"
        : "";
      resolvePromise({
        exitCode: bufferExceeded ? (code ?? 1) : (code ?? undefined),
        timedOut,
        stdout: redactSecrets(`${stdout}${truncatedNote}`),
        stderr: redactSecrets(`${stderr}${truncatedNote}`),
      });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      resolvePromise({
        exitCode: undefined,
        timedOut: true,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
      });
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

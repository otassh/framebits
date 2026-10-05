/**
 * Typed CLI errors mapped to exit codes (C4).
 *
 * 0 success, 1 failure/conflict, 2 usage/config/project-detection error,
 * 3 network error, 4 integrity/security failure.
 */

export type ExitCode = 0 | 1 | 2 | 3 | 4;

export const EXIT_SUCCESS = 0 as const;
export const EXIT_FAILURE = 1 as const;
export const EXIT_USAGE = 2 as const;
export const EXIT_NETWORK = 3 as const;
export const EXIT_INTEGRITY = 4 as const;

export type CliErrorCode =
  | "USAGE"
  | "CONFIG"
  | "DETECTION"
  | "CONFLICT"
  | "NETWORK"
  | "INTEGRITY";

export class CliError extends Error {
  readonly exitCode: ExitCode;
  readonly errorCode: CliErrorCode;
  readonly hint: string | undefined;

  constructor(
    message: string,
    options: { exitCode: ExitCode; errorCode: CliErrorCode; hint?: string | undefined; cause?: unknown },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.exitCode = options.exitCode;
    this.errorCode = options.errorCode;
    this.hint = options.hint;
  }
}

export function usageError(message: string, hint?: string  ): CliError {
  return new CliError(message, { exitCode: EXIT_USAGE, errorCode: "USAGE", hint });
}

export function configError(message: string, hint?: string  ): CliError {
  return new CliError(message, { exitCode: EXIT_USAGE, errorCode: "CONFIG", hint });
}

export function detectionError(message: string, hint?: string  ): CliError {
  return new CliError(message, { exitCode: EXIT_USAGE, errorCode: "DETECTION", hint });
}

export function conflictError(message: string, hint?: string  ): CliError {
  return new CliError(message, { exitCode: EXIT_FAILURE, errorCode: "CONFLICT", hint });
}

export function networkError(message: string, hint?: string  ): CliError {
  return new CliError(message, { exitCode: EXIT_NETWORK, errorCode: "NETWORK", hint });
}

export function integrityError(message: string, hint?: string  ): CliError {
  return new CliError(message, { exitCode: EXIT_INTEGRITY, errorCode: "INTEGRITY", hint });
}

export function exitCodeFor(error: unknown): ExitCode {
  if (error instanceof CliError) return error.exitCode;
  return EXIT_FAILURE;
}

export interface FormattedError {
  message: string;
  hint: string | undefined;
  stack: string | undefined;
}

export function formatError(error: unknown, debug: boolean): FormattedError {
  if (error instanceof CliError) {
    return {
      message: `${error.errorCode.toLowerCase()}[${error.errorCode}]: ${error.message}`,
      hint: error.hint,
      stack: debug ? (error.stack ?? undefined) : undefined,
    };
  }
  if (error instanceof Error) {
    return {
      message: `error: ${error.message}`,
      hint: undefined,
      stack: debug ? (error.stack ?? undefined) : undefined,
    };
  }
  return {
    message: `error: ${String(error)}`,
    hint: undefined,
    stack: undefined,
  };
}

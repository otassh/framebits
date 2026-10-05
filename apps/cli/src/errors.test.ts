import { describe, expect, it } from "vitest";
import {
  conflictError,
  configError,
  detectionError,
  exitCodeFor,
  formatError,
  integrityError,
  networkError,
  usageError,
  CliError,
} from "./errors.js";

describe("errors", () => {
  it("maps to exit codes per C4", () => {
    expect(usageError("x").exitCode).toBe(2);
    expect(configError("x").exitCode).toBe(2);
    expect(detectionError("x").exitCode).toBe(2);
    expect(conflictError("x").exitCode).toBe(1);
    expect(networkError("x").exitCode).toBe(3);
    expect(integrityError("x").exitCode).toBe(4);
  });

  it("exitCodeFor handles unknown errors as 1", () => {
    expect(exitCodeFor(new Error("boom"))).toBe(1);
    expect(exitCodeFor("string")).toBe(1);
    expect(exitCodeFor(usageError("u"))).toBe(2);
  });

  it("formatError hides stacks unless debug", () => {
    const error = conflictError("conflict here", "use --overwrite");
    const concise = formatError(error, false);
    expect(concise.message).toContain("conflict here");
    expect(concise.hint).toBe("use --overwrite");
    expect(concise.stack).toBeUndefined();
    const debug = formatError(error, true);
    expect(debug.stack).toBeDefined();
  });

  it("CliError carries code and hint", () => {
    const error = new CliError("msg", { exitCode: 2, errorCode: "USAGE", hint: "h" });
    expect(error.errorCode).toBe("USAGE");
    expect(error.hint).toBe("h");
  });
});

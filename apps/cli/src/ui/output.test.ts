import { describe, expect, it } from "vitest";
import {
  createBufferedOutput,
  isInteractive,
  readCiEnv,
  supportsColor,
} from "./output.js";

describe("output", () => {
  it("supportsColor respects NO_COLOR and TTY", () => {
    expect(supportsColor({ stdoutTTY: true, stderrTTY: true, noColorEnv: "1" })).toBe(false);
    expect(supportsColor({ stdoutTTY: true, stderrTTY: true, noColorEnv: undefined })).toBe(true);
    expect(supportsColor({ stdoutTTY: false, stderrTTY: true, noColorEnv: undefined })).toBe(false);
  });

  it("buffered output collects writes", () => {
    const output = createBufferedOutput();
    output.stdout("hello\n");
    output.stderr("oops\n");
    expect(output.out).toEqual(["hello\n"]);
    expect(output.err).toEqual(["oops\n"]);
  });

  it("isInteractive requires both TTYs, no CI, no --yes", () => {
    expect(isInteractive({ stdinTTY: true, stdoutTTY: true, ciEnv: false, yes: false })).toBe(true);
    expect(isInteractive({ stdinTTY: true, stdoutTTY: true, ciEnv: true, yes: false })).toBe(false);
    expect(isInteractive({ stdinTTY: true, stdoutTTY: true, ciEnv: false, yes: true })).toBe(false);
    expect(isInteractive({ stdinTTY: false, stdoutTTY: true, ciEnv: false, yes: false })).toBe(false);
  });

  it("readCiEnv detects CI markers", () => {
    expect(readCiEnv({ CI: "true" })).toBe(true);
    expect(readCiEnv({})).toBe(false);
    expect(readCiEnv({ CONTINUOUS_INTEGRATION: "1" })).toBe(true);
  });
});

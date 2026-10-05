import { describe, expect, it } from "vitest";
import { createInstaller, tailLines, type InstallOutcome } from "./run.js";

describe("tailLines", () => {
  it("returns the last N lines", () => {
    expect(tailLines("a\nb\nc\nd", 2)).toBe("c\nd");
    expect(tailLines("a", 20)).toBe("a");
    expect(tailLines("a\r\nb\r\nc", 1)).toBe("c");
  });
});

describe("createInstaller", () => {
  it("captures in non-interactive mode, inherits otherwise", async () => {
    const seen: boolean[] = [];
    const installer = createInstaller((program, _args, options) => {
      seen.push(options.capture);
      const outcome: InstallOutcome = { exitCode: 0, timedOut: false, stdout: program, stderr: "" };
      return Promise.resolve(outcome);
    });
    await installer.run({ program: "npm", args: ["install"], cwd: "/proj" }, false, false);
    await installer.run({ program: "npm", args: ["install"], cwd: "/proj" }, true, false);
    await installer.run({ program: "npm", args: ["install"], cwd: "/proj" }, false, true);
    expect(seen).toEqual([true, false, false]);
  });

  it("propagates failures for the caller to roll back", async () => {
    const installer = createInstaller(() =>
      Promise.resolve({ exitCode: 1, timedOut: false, stdout: "out", stderr: "boom" }),
    );
    const outcome = await installer.run({ program: "npm", args: ["install", "x"], cwd: "/proj" }, false, false);
    expect(outcome.exitCode).toBe(1);
  });
});

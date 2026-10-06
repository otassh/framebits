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
    const outcome = await installer.run(
      { program: "npm", args: ["install", "x"], cwd: "/proj" },
      false,
      false,
    );
    expect(outcome.exitCode).toBe(1);
  });

  it("forwards program + args as separate argv entries (no shell interpolation)", async () => {
    const seen: Array<{ program: string; args: readonly string[] }> = [];
    const installer = createInstaller((program, args) => {
      seen.push({ program, args: [...args] });
      return Promise.resolve({ exitCode: 0, timedOut: false, stdout: "", stderr: "" });
    });
    // A malicious-looking spec must stay a single argv element, never joined
    // into a shell string. nodeSpawn (run.ts) calls cross-spawn as
    // spawn(program, [...args], { cwd, timeout, stdio }) with no `shell`
    // option, so no shell ever interprets these entries.
    await installer.run(
      { program: "pnpm", args: ["add", "motion@^14.0.0", "clsx@^2.0.0; rm -rf /"], cwd: "/proj" },
      false,
      false,
    );
    expect(seen).toHaveLength(1);
    const call = seen[0];
    if (call === undefined) expect.unreachable();
    else {
      expect(call.program).toBe("pnpm");
      expect(call.args).toEqual(["add", "motion@^14.0.0", "clsx@^2.0.0; rm -rf /"]);
      expect(call.args).toHaveLength(3);
    }
  });
});

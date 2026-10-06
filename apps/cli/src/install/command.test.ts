import { describe, expect, it } from "vitest";
import { assertInstallable, buildInstallCommand, renderCommand } from "./command.js";

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

describe("buildInstallCommand", () => {
  it("builds exact argv per package manager (never -D)", () => {
    expect(buildInstallCommand("pnpm", [{ name: "motion", range: "^14.0.0" }])).toEqual({
      program: "pnpm",
      args: ["add", "motion@^14.0.0"],
    });
    expect(buildInstallCommand("yarn", [{ name: "clsx", range: "^2.0.0" }])).toEqual({
      program: "yarn",
      args: ["add", "clsx@^2.0.0"],
    });
    expect(buildInstallCommand("npm", [{ name: "clsx", range: "^2.0.0" }])).toEqual({
      program: "npm",
      args: ["install", "clsx@^2.0.0"],
    });
    expect(buildInstallCommand("bun", [{ name: "clsx", range: "^2.0.0" }])).toEqual({
      program: "bun",
      args: ["add", "clsx@^2.0.0"],
    });
    expect(buildInstallCommand("npm", [])).toBeUndefined();
  });

  it("keeps each package as a separate argv entry (no shell joining)", () => {
    const command = buildInstallCommand("pnpm", [
      { name: "motion", range: "^14.0.0" },
      { name: "clsx", range: "^2.0.0" },
    ]);
    expect(command).toEqual({
      program: "pnpm",
      args: ["add", "motion@^14.0.0", "clsx@^2.0.0"],
    });
    // Display rendering is for humans only; execution always uses argv.
    if (command !== undefined) {
      expect(command.args).toHaveLength(3);
      expect(command.args[1]).toBe("motion@^14.0.0");
    } else {
      expect.unreachable();
    }
  });

  it("rejects injection attempts in names and ranges (exit 4)", () => {
    const bad: Array<{ name: string; range: string }> = [
      { name: "motion; rm -rf /", range: "^14.0.0" },
      { name: "--save-dev", range: "^14.0.0" },
      { name: "motion", range: "1.0.0; evil()" },
      { name: "motion", range: "*" },
      { name: "motion", range: ">=1.0.0" },
      { name: "left-pad", range: "^1.0.0" },
      { name: "motion", range: "latest" },
      { name: "motion", range: "https://example.com/motion.tgz" },
      { name: "motion", range: "git+https://github.com/user/repo.git" },
      { name: "motion", range: "github:user/repo" },
      { name: "motion", range: "file:../foo" },
      { name: "motion", range: "workspace:*" },
      { name: "motion", range: "npm:motion@^14.0.0" },
      { name: "motion", range: "" },
    ];
    for (const spec of bad) {
      try {
        assertInstallable(spec);
        expect.unreachable();
      } catch (error) {
        expect(exitCodeOf(error)).toBe(4);
      }
    }
  });

  it("renders display commands with quoting", () => {
    expect(renderCommand({ program: "npm", args: ["install", "a@>=1.0.0 <2.0.0"] })).toBe(
      'npm install "a@>=1.0.0 <2.0.0"',
    );
    expect(renderCommand({ program: "pnpm", args: ["add", "motion@^14.0.0"] })).toBe(
      "pnpm add motion@^14.0.0",
    );
  });
});

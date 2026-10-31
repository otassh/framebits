import { describe, expect, it } from "vitest";
import { resolveAliasesFromConfig } from "./index.js";

function fsOf(files: Record<string, string>): { readFile(path: string): string | undefined } {
  return {
    readFile(path: string): string | undefined {
      const rel = path.replace(/^\/+/, "").replace(/^proj\//, "");
      if (files[rel] !== undefined) return files[rel];
      const absolute = path.replace(/\\/g, "/");
      for (const [key, value] of Object.entries(files)) {
        if (absolute.endsWith(`/${key}`) || absolute === key) return value;
      }
      return undefined;
    },
  };
}

describe("aliases", () => {
  it("resolves @/* -> ./src/* defaults", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      }),
      isVite: false,
    });
    expect(resolved.components).toBe("@/components/ui");
    expect(resolved.dirs.lib).toBe("/proj/src/lib");
  });

  it("honors baseUrl and wildcard mappings", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@/components/ui/*": ["./custom/ui/*"],
              "@/lib/*": ["./custom/lib/*"],
              "@/hooks/*": ["./custom/hooks/*"],
            },
          },
        }),
      }),
      isVite: false,
    });
    expect(resolved.dirs.components).toBe("/proj/custom/ui");
  });

  it("follows extends chains (relative only, depth 5)", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ extends: "./base.json" }),
        "base.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      }),
      isVite: false,
    });
    expect(resolved.dirs.lib).toBe("/proj/src/lib");
  });

  it("ignores non-relative extends", () => {
    try {
      resolveAliasesFromConfig({
        projectRoot: "/proj",
        configDir: "/proj",
        configFile: "tsconfig.json",
        fs: fsOf({ "tsconfig.json": JSON.stringify({ extends: "@repo/tsconfig" }) }),
        isVite: false,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as { exitCode?: number }).exitCode).toBe(2);
    }
  });

  it("falls back to referenced configs (Vite templates)", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ references: [{ path: "./tsconfig.app.json" }] }),
        "tsconfig.app.json": JSON.stringify({
          compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
        }),
      }),
      isVite: true,
    });
    expect(resolved.dirs.components).toBe("/proj/src/components/ui");
  });

  it("supports custom ~/ prefix", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "~/*": ["./src/*"] } } }),
      }),
      isVite: false,
    });
    expect(resolved.lib).toBe("~/lib");
    expect(resolved.dirs.lib).toBe("/proj/src/lib");
  });

  it.each([
    { compilerOptions: { paths: { "@/*": ["../src/*"] } } },
    { compilerOptions: { baseUrl: "..", paths: { "@/*": ["src/*"] } } },
  ])("resolves inherited paths relative to their declaring config: %j", (base) => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ extends: "./config/base.json" }),
        "config/base.json": JSON.stringify(base),
      }),
      isVite: false,
    });
    expect(resolved.dirs.lib).toBe("/proj/src/lib");
  });

  it("resolves nested referenced config paths in that config's directory", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ references: [{ path: "./config/app.json" }] }),
        "config/app.json": JSON.stringify({ compilerOptions: { paths: { "~/*": ["../src/*"] } } }),
      }),
      isVite: true,
    });
    expect(resolved.lib).toBe("~/lib");
    expect(resolved.dirs.lib).toBe("/proj/src/lib");
  });

  it("applies later extends configurations and replaces inherited paths", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ extends: ["./first.json", "./second.json"] }),
        "first.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./old/*"] } } }),
        "second.json": JSON.stringify({ compilerOptions: { paths: { "~/*": ["./src/*"] } } }),
      }),
      isVite: false,
    });
    expect(resolved.lib).toBe("~/lib");
    expect(resolved.dirs.lib).toBe("/proj/src/lib");
  });

  it("does not invent an @ alias from baseUrl alone", () => {
    expect(() =>
      resolveAliasesFromConfig({
        projectRoot: "/proj",
        configDir: "/proj",
        configFile: "tsconfig.json",
        fs: fsOf({ "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: "./src" } }) }),
        isVite: true,
      }),
    ).toThrow("no usable import alias");
  });

  it("honors specific aliases alongside a wildcard base", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            paths: {
              "@/*": ["./src/*"],
              "@/lib/*": ["./shared/*"],
            },
          },
        }),
      }),
      isVite: true,
    });
    expect(resolved.dirs.components).toBe("/proj/src/components/ui");
    expect(resolved.dirs.lib).toBe("/proj/shared");
  });

  it("resolves directory project references", () => {
    const resolved = resolveAliasesFromConfig({
      projectRoot: "/proj",
      configDir: "/proj",
      configFile: "tsconfig.json",
      fs: fsOf({
        "tsconfig.json": JSON.stringify({ references: [{ path: "./config" }] }),
        "config/tsconfig.json": JSON.stringify({
          compilerOptions: { paths: { "@/*": ["../src/*"] } },
        }),
      }),
      isVite: true,
    });
    expect(resolved.dirs.lib).toBe("/proj/src/lib");
  });

  it("rejects cyclic extends instead of recursing indefinitely", () => {
    expect(() =>
      resolveAliasesFromConfig({
        projectRoot: "/proj",
        configDir: "/proj",
        configFile: "tsconfig.json",
        fs: fsOf({ "tsconfig.json": JSON.stringify({ extends: "./tsconfig.json" }) }),
        isVite: true,
      }),
    ).toThrow("cyclic or too-deep");
  });

  it("throws with instructions when no alias exists", () => {
    try {
      resolveAliasesFromConfig({
        projectRoot: "/proj",
        configDir: "/proj",
        configFile: "tsconfig.json",
        fs: fsOf({ "tsconfig.json": JSON.stringify({ compilerOptions: {} }) }),
        isVite: true,
      });
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("no usable import alias");
    }
  });
});

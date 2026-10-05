import { describe, expect, it } from "vitest";
import {
  createSnapshot,
  detectFramework,
  detectPackageManager,
  detectProject,
  detectSrcDir,
  detectTailwind,
  detectTypeScript,
  installCommand,
} from "./index.js";

function pkg(overrides: Record<string, unknown> = {}): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
} {
  return {
    dependencies: {},
    devDependencies: {},
    ...(overrides as object),
  };
}

describe("detectPackageManager", () => {
  it("prefers the packageManager field", () => {
    const snapshot = createSnapshot("/proj", {}, []);
    expect(detectPackageManager(snapshot, pkg({ packageManager: "pnpm@10.0.0" }))).toBe("pnpm");
    expect(detectPackageManager(snapshot, pkg({ packageManager: "yarn@4.0.0" }))).toBe("yarn");
    expect(detectPackageManager(snapshot, pkg({ packageManager: "bun@1.0.0" }))).toBe("bun");
  });

  it("falls back to lockfiles, then npm", () => {
    expect(detectPackageManager(createSnapshot("/p", {}, []), pkg())).toBe("npm");
    const cases: Array<[string, "pnpm" | "yarn" | "npm" | "bun"]> = [
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["package-lock.json", "npm"],
      ["bun.lockb", "bun"],
      ["bun.lock", "bun"],
    ];
    for (const [lock, expected] of cases) {
      const snapshot = createSnapshot("/p", { [lock]: "" }, []);
      expect(detectPackageManager(snapshot, pkg())).toBe(expected);
    }
  });
});

describe("detectFramework", () => {
  it("detects next app vs pages router", () => {
    const nextPkg = pkg({ dependencies: { next: "^15.0.0", react: "^19.0.0" } });
    const app = createSnapshot("/p", {}, ["app", "src/app"]);
    expect(detectFramework(app, nextPkg)).toEqual({ framework: "next", nextRouter: "app" });
    const pages = createSnapshot("/p", {}, ["pages"]);
    expect(detectFramework(pages, nextPkg)).toEqual({ framework: "next", nextRouter: "pages" });
  });

  it("detects vite, remix, other", () => {
    expect(
      detectFramework(createSnapshot("/p", {}, []), pkg({ devDependencies: { vite: "^6.0.0" } })).framework,
    ).toBe("vite");
    expect(
      detectFramework(
        createSnapshot("/p", {}, []),
        pkg({ dependencies: { "@remix-run/node": "^2.0.0" } }),
      ).framework,
    ).toBe("remix");
    expect(detectFramework(createSnapshot("/p", {}, []), pkg()).framework).toBe("other");
  });
});

describe("detectTypeScript and srcDir", () => {
  it("tsconfig presence and src dir", () => {
    expect(detectTypeScript(createSnapshot("/p", { "tsconfig.json": "{}" }, []))).toBe(true);
    expect(detectTypeScript(createSnapshot("/p", {}, []))).toBe(false);
    expect(detectSrcDir(createSnapshot("/p", {}, ["src"]))).toBe(true);
    expect(detectSrcDir(createSnapshot("/p", {}, []))).toBe(false);
  });
});

describe("detectTailwind", () => {
  it("reads installed major version", () => {
    const snapshot = createSnapshot(
      "/p",
      { "node_modules/tailwindcss/package.json": JSON.stringify({ version: "4.1.0" }) },
      [],
    );
    expect(detectTailwind(snapshot, pkg()).version).toBe(4);
  });

  it("detects v4 from CSS import and v3 from config", () => {
    const v4 = createSnapshot(
      "/p",
      { "src/app/globals.css": '@import "tailwindcss";\n' },
      [],
    );
    expect(detectTailwind(v4, pkg()).version).toBe(4);
    expect(detectTailwind(v4, pkg()).css).toBe("src/app/globals.css");

    const v3 = createSnapshot("/p", { "tailwind.config.ts": "export default {};" }, []);
    expect(detectTailwind(v3, pkg()).version).toBe(3);
    expect(detectTailwind(v3, pkg()).config).toBe("tailwind.config.ts");
  });

  it("finds CSS by content scan", () => {
    const snapshot = createSnapshot("/p", { "custom/site.css": "@tailwind base;\n" }, []);
    const result = detectTailwind(snapshot, pkg());
    expect(result.css).toBe("custom/site.css");
    expect(result.version).toBe(3);
  });
});

describe("detectProject", () => {
  it("throws exit 2 without package.json", () => {
    const snapshot = createSnapshot("/p", {}, []);
    try {
      detectProject(snapshot, undefined);
      expect.unreachable();
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect((error as { exitCode?: number }).exitCode).toBe(2);
    }
  });

  it("throws exit 2 without TypeScript", () => {
    const snapshot = createSnapshot("/p", {}, []);
    try {
      detectProject(snapshot, pkg());
      expect.unreachable();
    } catch (error) {
      expect((error as { exitCode?: number }).exitCode).toBe(2);
    }
  });

  it("warns on missing tailwind but continues", () => {
    const snapshot = createSnapshot("/p", { "tsconfig.json": "{}" }, []);
    const result = detectProject(snapshot, pkg());
    expect(result.tailwind.version).toBeUndefined();
    expect(result.typescript).toBe(true);
  });
});

describe("installCommand", () => {
  it("emits per-manager commands", () => {
    expect(installCommand("pnpm", ["clsx"])).toBe("pnpm add clsx");
    expect(installCommand("yarn", ["a", "b"])).toBe("yarn add a b");
    expect(installCommand("npm", ["x"])).toBe("npm install x");
    expect(installCommand("bun", ["x"])).toBe("bun add x");
    expect(installCommand("npm", [])).toBe("");
  });
});

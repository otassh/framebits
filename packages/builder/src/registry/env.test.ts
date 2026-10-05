import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOWED_DEPENDENCIES } from "@algorithco-ui/shared";

/**
 * The type-check env must pin every allowlisted package (exact versions, no ranges).
 * Adding to the allowlist without updating the env fails CI here.
 */
describe("registry-env coverage", () => {
  it("pins every ALLOWED_DEPENDENCIES name exactly", async () => {
    const pkgPath = fileURLToPath(new URL("../../../registry-env/package.json", import.meta.url));
    const raw: unknown = JSON.parse(await readFile(pkgPath, "utf8"));
    expect(typeof raw).toBe("object");
    const devDeps = (raw as { devDependencies: Record<string, string> }).devDependencies;
    for (const name of ALLOWED_DEPENDENCIES) {
      const pinned = devDeps[name];
      expect(pinned, `${name} must be pinned in registry-env`).toBeDefined();
      expect(pinned?.startsWith("^") === true || pinned?.startsWith("~") === true).toBe(false);
    }
  });

  it("pins react, react-dom, and their types", async () => {
    const pkgPath = fileURLToPath(new URL("../../../registry-env/package.json", import.meta.url));
    const raw: unknown = JSON.parse(await readFile(pkgPath, "utf8"));
    const devDeps = (raw as { devDependencies: Record<string, string> }).devDependencies;
    for (const name of ["react", "react-dom", "@types/react", "@types/react-dom"]) {
      expect(devDeps[name], `${name} must be pinned in registry-env`).toBeDefined();
    }
  });
});

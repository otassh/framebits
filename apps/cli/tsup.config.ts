import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg: { version: string } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  entry: ["src/cli.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node20",
  bundle: true,
  external: ["cross-spawn"],
  // cross-spawn is the single runtime (external) dependency: its dynamic
  // require("child_process") cannot be bundled into an ESM file (the build
  // succeeds but the CLI crashes at startup). Everything else is bundled.
  splitting: false,
  sourcemap: false,
  minify: false,
  shims: false,
  banner: { js: "#!/usr/bin/env node" },
  define: {
    __ALGORITHCO_UI_VERSION__: JSON.stringify(pkg.version),
  },
  outExtension: () => ({ js: ".js" }),
});

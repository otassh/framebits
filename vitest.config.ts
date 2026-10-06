import { defineConfig } from "vitest/config";

// Root projects configuration (replaces the deprecated vitest.workspace.ts
// file; vitest >= 3.2 warns on workspace files). Each matched directory uses
// its own vitest.config.ts; directories without one run with defaults.
// `pnpm test` (turbo) still runs each package's suite directly.
export default defineConfig({
  test: {
    projects: ["apps/*", "packages/*"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Registry tests spin full TS programs and subprocess CLIs; generous per-test
    // budget so parallel load (turbo runs all packages at once) cannot flake them.
    testTimeout: 60000,
  },
});

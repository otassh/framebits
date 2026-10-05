import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Integration tests build the real registry and serve it over HTTP;
    // generous budget so parallel load (turbo runs all packages at once) cannot flake them.
    testTimeout: 120000,
  },
});

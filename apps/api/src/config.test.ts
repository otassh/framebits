import { describe, expect, it } from "vitest";
import { readConfig } from "./config.js";

const development = { DATABASE_URL: "postgres://framebits:local@localhost:5432/framebits" };
const production = {
  ...development,
  NODE_ENV: "production",
  WEB_ORIGIN: "https://framebits.dev",
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret-for-unit-tests",
  RATE_LIMIT_SECRET: "unit-test-rate-limit-secret-32-characters",
};

describe("API configuration", () => {
  it("uses local defaults with OAuth disabled", () => {
    expect(readConfig(development)).toMatchObject({
      webOrigin: "http://localhost:5173",
      port: 3001,
      trustedProxyCount: 0,
      secureCookies: false,
      github: null,
    });
    expect(readConfig(development).rateLimitSecret.length).toBeGreaterThanOrEqual(32);
  });

  it("builds the callback from the configured HTTPS origin", () => {
    expect(readConfig(production)).toMatchObject({
      secureCookies: true,
      github: { callbackUrl: "https://framebits.dev/api/auth/github/callback" },
    });
  });

  it.each([
    { DATABASE_URL: "" },
    { DATABASE_URL: "https://example.com/db" },
    { WEB_ORIGIN: "http://example.com" },
    { WEB_ORIGIN: "https://example.com/path" },
    { WEB_ORIGIN: "https://example.com/" },
    { WEB_ORIGIN: "https://user:pass@example.com" },
    { PORT: "0" },
    { PORT: "65536" },
    { PORT: "1.5" },
    { TRUSTED_PROXY_COUNT: "6" },
    { TRUSTED_PROXY_COUNT: "-1" },
    { GITHUB_CLIENT_ID: "test-client-id" },
    { RATE_LIMIT_SECRET: "short" },
  ])("rejects invalid development settings: %j", (settings) => {
    expect(() => readConfig({ ...development, ...settings })).toThrow();
  });

  it.each([
    { WEB_ORIGIN: "http://localhost:5173" },
    { WEB_ORIGIN: "" },
    { DATABASE_URL: "postgres://framebits:changeme@localhost/framebits" },
    { GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" },
    { RATE_LIMIT_SECRET: "" },
    { RATE_LIMIT_SECRET: "placeholder-secret-that-is-long-enough" },
  ])("rejects unsafe production settings: %j", (settings) => {
    expect(() => readConfig({ ...production, ...settings })).toThrow();
  });
});

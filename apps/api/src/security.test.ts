import { describe, expect, it } from "vitest";
import {
  TOKEN_PATTERN,
  clientAddress,
  csrfToken,
  equalToken,
  hashToken,
  pkceChallenge,
  randomToken,
  rateLimitKey,
  safeReturnTo,
} from "./security.js";

describe("OAuth and session security", () => {
  it("creates unique bearer tokens and stores only a fixed-size hash", () => {
    const first = randomToken();
    expect(first).toMatch(TOKEN_PATTERN);
    expect(randomToken()).not.toBe(first);
    expect(hashToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(first)).not.toContain(first);
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("binds CSRF tokens to the session and safely rejects malformed comparisons", () => {
    const session = randomToken();
    const csrf = csrfToken(session);
    expect(equalToken(csrf, csrfToken(session))).toBe(true);
    expect(equalToken(csrf, csrfToken(randomToken()))).toBe(false);
    expect(equalToken(undefined, csrf)).toBe(false);
    expect(equalToken("short", csrf)).toBe(false);
    expect(equalToken(csrf, "short")).toBe(false);
  });

  it("keeps local return paths and removes stale authentication errors", () => {
    expect(
      safeReturnTo("/components?q=aurora&auth_error=old#source", "https://framebits.dev"),
    ).toBe("/components?q=aurora#source");
  });

  it.each([
    undefined,
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/%2f%2fattacker.example",
    "/%5cattacker.example",
    "/%0aheader",
    "/bad%",
    "/api",
    "/api/auth/github",
    "/components/../api/auth/github",
    `/${"x".repeat(2048)}`,
  ])("rejects unsafe return paths: %s", (path) => {
    expect(safeReturnTo(path, "https://framebits.dev")).toBe("/");
  });

  it("ignores forwarded addresses unless the exact proxy depth is trusted", () => {
    expect(clientAddress("127.0.0.1", "203.0.113.9", 0)).toBe("127.0.0.1");
    expect(clientAddress("127.0.0.1", "198.51.100.8, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientAddress("127.0.0.1", "198.51.100.8, 203.0.113.9", 2)).toBe("198.51.100.8");
    expect(clientAddress("127.0.0.1", "invalid, 203.0.113.9", 1)).toBe("127.0.0.1");
    expect(clientAddress(undefined, undefined, 0)).toBe("unknown");
    expect(clientAddress("::1", "203.0.113.9", 2)).toBe("::1");
  });

  it("isolates rate limits by secret, bucket and address without exposing the IP", () => {
    const key = rateLimitKey("secret", "login", "203.0.113.9");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toBe(rateLimitKey("other", "login", "203.0.113.9"));
    expect(key).not.toBe(rateLimitKey("secret", "callback", "203.0.113.9"));
    expect(key).not.toBe(rateLimitKey("secret", "login", "203.0.113.10"));
  });
});

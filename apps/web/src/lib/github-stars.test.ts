import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStarCount, formatStarCount, readStarCache } from "./github-stars.js";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub stars", () => {
  it("reads the real repository count, including zero", async () => {
    for (const count of [0, 3, 12045]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              full_name: "otassh/framebits",
              stargazers_count: count,
            }),
          ),
        ),
      );
      expect((await fetchStarCount(new AbortController().signal)).count).toBe(count);
    }
  });

  it("rejects rate limits instead of returning a fabricated zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    await expect(fetchStarCount(new AbortController().signal)).rejects.toThrow("unavailable");
  });

  it("rejects malformed counts and a different repository", async () => {
    for (const data of [
      { full_name: "otassh/framebits", stargazers_count: -1 },
      { full_name: "otassh/framebits", stargazers_count: "3" },
      { full_name: "other/repo", stargazers_count: 3 },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
      await expect(fetchStarCount(new AbortController().signal)).rejects.toThrow("Invalid");
    }
  });

  it("accepts a recent genuine cached count and rejects invalid or expired storage", () => {
    const now = 100_000_000;
    expect(readStarCache(JSON.stringify({ count: 0, fetchedAt: now - 1000 }), now)).toEqual({
      count: 0,
      fetchedAt: now - 1000,
    });
    for (const raw of [
      null,
      "broken",
      "{}",
      JSON.stringify({ count: -1, fetchedAt: now }),
      JSON.stringify({ count: 3, fetchedAt: now + 1 }),
      JSON.stringify({ count: 3, fetchedAt: now - 86_400_001 }),
    ]) {
      expect(readStarCache(raw, now)).toBeNull();
    }
  });

  it("keeps small counts exact and large counts compact", () => {
    expect(formatStarCount(0)).toBe("0");
    expect(formatStarCount(999)).toBe("999");
    expect(formatStarCount(12500)).toBe("12.5K");
  });
});

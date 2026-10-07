import { describe, expect, it, vi } from "vitest";
import {
  backoffMs,
  describeRegistrySource,
  fetchJsonText,
  fetchIndexSlugs,
  parseJsonGuarded,
  redactUrl,
  resolveRegistryUrl,
} from "./index.js";

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code: unknown = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

function jsonStreamResponse(
  body: string,
  options?: { status?: number; url?: string; headers?: Record<string, string> },
): Response {
  const headers = new Headers({
    "content-type": "application/json",
    ...(options?.headers ?? {}),
  });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  const response = new Response(stream, { status: options?.status ?? 200, headers });
  Object.defineProperty(response, "url", { value: options?.url ?? "https://x/r/cn.json" });
  return response;
}

describe("registry hardening", () => {
  it("redactUrl strips userinfo without echoing secrets", () => {
    expect(redactUrl("https://user:pass@example.com/r")).not.toContain("user");
    expect(redactUrl("https://user:pass@example.com/r")).not.toContain("pass");
    expect(redactUrl("https://user:pass@example.com/r")).toContain("***");
    expect(redactUrl("https://example.com/r")).toBe("https://example.com/r");
  });

  it("resolveRegistryUrl rejects userinfo and non-localhost http (exit 2)", () => {
    for (const bad of [
      "https://user:pass@example.com/r",
      "http://example.com/r",
      "http://user@example.com/r",
      "ftp://example.com/r",
      "not-a-url",
    ]) {
      try {
        resolveRegistryUrl({ flag: bad, env: undefined, config: undefined });
        expect.unreachable(`should reject ${bad}`);
      } catch (error) {
        expect(exitCodeOf(error)).toBe(2);
      }
    }
    expect(
      resolveRegistryUrl({ flag: "http://localhost:3000/r", env: undefined, config: undefined }),
    ).toBe("http://localhost:3000/r");
  });

  it("describeRegistrySource never echoes the URL value", () => {
    const label = describeRegistrySource("env");
    expect(label).toContain("env");
    expect(label).not.toContain("https://");
  });

  it("backoff is jittered and clamped 500ms..10s", () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      for (let i = 0; i < 20; i++) {
        const wait = backoffMs(attempt);
        expect(wait).toBeGreaterThanOrEqual(500);
        expect(wait).toBeLessThanOrEqual(10000);
      }
    }
  });

  it("Retry-After clamps 500ms..10s", async () => {
    const fetchFn = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        jsonStreamResponse("{}", { status: 429, headers: { "retry-after": "0" } }),
      )
      .mockResolvedValueOnce(jsonStreamResponse('{"ok":true}'));
    const sleeps: number[] = [];
    await fetchJsonText("https://x/r/cn.json", {
      fetchFn,
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    expect(sleeps.length).toBe(1);
    const first = sleeps[0] ?? 0;
    expect(first).toBeGreaterThanOrEqual(500);
    expect(first).toBeLessThanOrEqual(10000);
  });

  it("throws on null body instead of buffering blindly (exit 4)", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    const response = new Response(null, { status: 200, headers });
    Object.defineProperty(response, "url", { value: "https://x/r/cn.json" });
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(response),
    );
    try {
      await fetchJsonText("https://x/r/cn.json", {
        fetchFn,
        sleep: () => Promise.resolve(),
      });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("follows same-origin redirects, blocks cross-origin and downgrades (exit 4)", async () => {
    const redirect = (location: string): Response =>
      jsonStreamResponse("", {
        status: 302,
        url: "https://x/r/cn.json",
        headers: { location },
      });
    // Same-origin follow succeeds.
    const sameOrigin = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(redirect("/r/cn.json?v=2"))
      .mockResolvedValueOnce(jsonStreamResponse('{"ok":true}', { url: "https://x/r/cn.json?v=2" }));
    const ok = await fetchJsonText("https://x/r/cn.json", {
      fetchFn: sameOrigin,
      sleep: () => Promise.resolve(),
    });
    expect(ok.text).toBe('{"ok":true}');
    expect(sameOrigin).toHaveBeenCalledTimes(2);

    // Cross-origin blocked.
    const cross = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(redirect("https://evil.com/r/cn.json")),
    );
    try {
      await fetchJsonText("https://x/r/cn.json", {
        fetchFn: cross,
        sleep: () => Promise.resolve(),
      });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }

    // Downgrade blocked.
    const downgrade = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(
        jsonStreamResponse("", {
          status: 302,
          url: "https://x/r/cn.json",
          headers: { location: "http://x/r/cn.json" },
        }),
      ),
    );
    try {
      await fetchJsonText("https://x/r/cn.json", {
        fetchFn: downgrade,
        sleep: () => Promise.resolve(),
      });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("parseJsonGuarded throws integrity errors (exit 4)", () => {
    try {
      parseJsonGuarded("not json", "cn");
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("fetchIndexSlugs throws on malformed JSON (exit 4, no silent [])", async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonStreamResponse("not-json", { url: "https://x/r/index.json" })),
    );
    try {
      await fetchIndexSlugs("https://x/r", { fetchFn, sleep: () => Promise.resolve() });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });
});

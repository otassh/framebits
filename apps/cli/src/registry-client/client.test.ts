import { describe, expect, it, vi } from "vitest";
import {
  FETCH_MAX_BYTES,
  assertAllowedRegistryUrl,
  isAllowedRegistryUrl,
  itemUrl,
  parseSlugArg,
  resolveRegistryUrl,
  fetchJsonText,
} from "./index.js";

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

describe("registry-client urls", () => {
  it("resolves precedence flag > env > config > default", () => {
    expect(
      resolveRegistryUrl({ flag: "https://a/r", env: "https://b/r", config: "https://c/r" }),
    ).toBe("https://a/r");
    expect(resolveRegistryUrl({ flag: undefined, env: "https://b/r", config: "https://c/r" })).toBe(
      "https://b/r",
    );
    expect(resolveRegistryUrl({ flag: undefined, env: undefined, config: "https://c/r" })).toBe(
      "https://c/r",
    );
    expect(resolveRegistryUrl({ flag: undefined, env: undefined, config: undefined })).toContain(
      "https://",
    );
  });

  it("enforces https except localhost", () => {
    expect(isAllowedRegistryUrl("https://example.com/r")).toBe(true);
    expect(isAllowedRegistryUrl("http://localhost:3000/r")).toBe(true);
    expect(isAllowedRegistryUrl("http://127.0.0.1:8080/r")).toBe(true);
    expect(isAllowedRegistryUrl("http://[::1]:3000/r")).toBe(true);
    expect(isAllowedRegistryUrl("http://example.com/r")).toBe(false);
    try {
      assertAllowedRegistryUrl("http://example.com/r", "registry URL");
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(2);
    }
  });

  it("parses slug@version and validates slugs before requests", () => {
    expect(parseSlugArg("aurora-text")).toEqual({ slug: "aurora-text", version: undefined });
    expect(parseSlugArg("cn@1.0.0")).toEqual({ slug: "cn", version: "1.0.0" });
    try {
      parseSlugArg("BAD_SLUG!!!");
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(2);
    }
    expect(itemUrl("https://x/r", "cn", "1.0.0")).toBe("https://x/r/cn@1.0.0.json");
    expect(itemUrl("https://x/r", "cn")).toBe("https://x/r/cn.json");
  });
});

function jsonResponse(
  body: string,
  options?: {
    status?: number;
    contentType?: string;
    url?: string;
    headers?: Record<string, string>;
  },
): Response {
  const headers = new Headers({
    "content-type": options?.contentType ?? "application/json",
    ...(options?.headers ?? {}),
  });
  const response = new Response(body, { status: options?.status ?? 200, headers });
  Object.defineProperty(response, "url", { value: options?.url ?? "https://x/r/cn.json" });
  return response;
}

function makeSleep(): { sleep: (ms: number) => Promise<void>; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    sleep: (ms: number): Promise<void> => {
      calls.push(ms);
      return Promise.resolve();
    },
  };
}

describe("fetchJsonText", () => {
  it("retries 5xx then succeeds", async () => {
    const fetchFn = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse("{}", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse('{"ok":true}'));
    const { sleep, calls } = makeSleep();
    const result = await fetchJsonText("https://x/r/cn.json", { fetchFn, sleep });
    expect(result.text).toBe('{"ok":true}');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(calls.length).toBe(1);
  });

  it("honors Retry-After on 429 (capped at 10s)", async () => {
    const fetchFn = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse("{}", { status: 429, headers: { "retry-after": "120" } }))
      .mockResolvedValueOnce(jsonResponse('{"ok":true}'));
    const { sleep, calls } = makeSleep();
    await fetchJsonText("https://x/r/cn.json", { fetchFn, sleep });
    expect(calls.length).toBe(1);
    const first = calls[0] ?? 0;
    expect(first).toBeLessThanOrEqual(10000);
  });

  it("rejects redirect to http with exit 4", async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse("{}", { url: "http://evil.com/r/cn.json" })),
    );
    try {
      await fetchJsonText("https://x/r/cn.json", { fetchFn, sleep: makeSleep().sleep });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("enforces the 2 MB cap via Content-Length", async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(
        jsonResponse("{}", { headers: { "content-length": String(FETCH_MAX_BYTES + 1) } }),
      ),
    );
    try {
      await fetchJsonText("https://x/r/cn.json", { fetchFn, sleep: makeSleep().sleep });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("maps network failures to exit 3", async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.reject(new TypeError("fetch failed")),
    );
    try {
      await fetchJsonText("https://x/r/cn.json", { fetchFn, sleep: makeSleep().sleep });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(3);
    }
  });
});

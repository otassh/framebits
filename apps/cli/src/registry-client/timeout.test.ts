import { describe, expect, it, vi } from "vitest";
import {
  FETCH_TIMEOUT_MS,
  fetchJsonText,
  formatTimeoutMs,
  parseTimeoutEnv,
  parseTimeoutFlag,
  resolveTimeoutMs,
} from "./index.js";

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

function jsonResponse(body: string): Response {
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(response, "url", { value: "https://x/r/cn.json" });
  return response;
}

describe("parseTimeoutFlag (--timeout <seconds>)", () => {
  it("converts valid seconds to milliseconds", () => {
    expect(parseTimeoutFlag(undefined)).toBe(undefined);
    expect(parseTimeoutFlag("1")).toBe(1000);
    expect(parseTimeoutFlag("30")).toBe(30000);
    expect(parseTimeoutFlag("300")).toBe(300000);
  });

  it.each(["0", "301", "abc", "1.5", "", " 30", "-5"])(
    "rejects %s with usage error (exit 2)",
    (raw) => {
      try {
        parseTimeoutFlag(raw);
        expect.unreachable();
      } catch (error) {
        expect(exitCodeOf(error)).toBe(2);
      }
    },
  );
});

describe("parseTimeoutEnv (FRAMEBITS_TIMEOUT_MS)", () => {
  it("converts valid milliseconds and treats empty as unset", () => {
    expect(parseTimeoutEnv(undefined)).toBe(undefined);
    expect(parseTimeoutEnv("")).toBe(undefined);
    expect(parseTimeoutEnv("1000")).toBe(1000);
    expect(parseTimeoutEnv("15000")).toBe(15000);
    expect(parseTimeoutEnv("300000")).toBe(300000);
  });

  it.each(["999", "300001", "abc", "1.5", "30s"])(
    "rejects %s with usage error (exit 2)",
    (raw) => {
      try {
        parseTimeoutEnv(raw);
        expect.unreachable();
      } catch (error) {
        expect(exitCodeOf(error)).toBe(2);
      }
    },
  );
});

describe("resolveTimeoutMs", () => {
  it("applies precedence flag > env > config > default", () => {
    expect(
      resolveTimeoutMs({ flag: "30", env: "15000", configMs: 20000 }),
    ).toBe(30000);
    expect(
      resolveTimeoutMs({ flag: undefined, env: "15000", configMs: 20000 }),
    ).toBe(15000);
    expect(
      resolveTimeoutMs({ flag: undefined, env: undefined, configMs: 20000 }),
    ).toBe(20000);
    expect(
      resolveTimeoutMs({ flag: undefined, env: undefined, configMs: undefined }),
    ).toBe(FETCH_TIMEOUT_MS);
  });

  it("leaves the default at 10s", () => {
    expect(FETCH_TIMEOUT_MS).toBe(10000);
  });

  it.each([
    ["bad flag wins over good env", { flag: "0", env: "15000", configMs: 20000 }],
    ["bad env wins over good config", { flag: undefined, env: "500", configMs: 20000 }],
    ["bad config", { flag: undefined, env: undefined, configMs: 999 }],
  ])("rejects %s with usage error (exit 2)", (_label, input) => {
    try {
      resolveTimeoutMs(input);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(2);
    }
  });
});

describe("formatTimeoutMs", () => {
  it("prints whole seconds as Ns and the rest as Nms", () => {
    expect(formatTimeoutMs(10000)).toBe("10s");
    expect(formatTimeoutMs(5000)).toBe("5s");
    expect(formatTimeoutMs(1500)).toBe("1500ms");
  });
});

describe("fetchJsonText timeout", () => {
  it("reports the real timeout value instead of a hardcoded 10s", async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.reject(new DOMException("The operation was aborted.", "TimeoutError"))
    );
    try {
      await fetchJsonText("https://x/r/cn.json", {
        fetchFn,
        sleep: () => Promise.resolve(),
        timeoutMs: 5000,
      });
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(3);
      expect((error as Error).message).toContain("timed out after 5s");
    }
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("keeps the 10s message for the default timeout", async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.reject(new DOMException("The operation was aborted.", "TimeoutError"))
    );
    try {
      await fetchJsonText("https://x/r/cn.json", {
        fetchFn,
        sleep: () => Promise.resolve(),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("timed out after 10s");
    }
  });

  it("passes the resolved timeout to the abort signal and keeps retry/backoff", async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    const fetchFn = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockImplementationOnce((_url, init) => {
        seen.push(init.signal);
        return Promise.resolve(
          new Response("{}", { status: 500, headers: { "content-type": "application/json" } }),
        );
      })
      .mockImplementationOnce((_url, init) => {
        seen.push(init.signal);
        return Promise.resolve(jsonResponse('{"ok":true}'));
      });
    const sleeps: number[] = [];
    const result = await fetchJsonText("https://x/r/cn.json", {
      fetchFn,
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      timeoutMs: 45000,
    });
    expect(result.text).toBe('{"ok":true}');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleeps.length).toBe(1);
    for (const signal of seen) {
      expect(signal instanceof AbortSignal).toBe(true);
    }
  });
});

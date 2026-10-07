import { describe, expect, it } from "vitest";
import { computeItemHash } from "@framebits/shared";
import { resolveClosure } from "./index.js";
import type { FetchFn } from "../registry-client/index.js";
import { assertClosureLimits, verifyItem } from "./verify.js";

function validPayload(overrides: Record<string, unknown> = {}): string {
  const path = "components/ui/aurora-text.tsx";
  const content = "export {};\n";
  const base: Record<string, unknown> = {
    schemaVersion: 1,
    slug: "aurora-text",
    type: "component",
    title: "Aurora Text",
    version: "1.0.0",
    dependencies: {},
    registryDependencies: [],
    files: [{ path, content, type: "component", variant: "ts-tw" }],
  };
  const merged = { ...base, ...overrides };
  const files = merged["files"];
  const fileList = Array.isArray(files) ? files : [];
  const hash = computeItemHash({
    type: "component",
    dependencies: (merged["dependencies"] ?? {}) as Record<string, string>,
    registryDependencies: (merged["registryDependencies"] ?? []) as string[],
    files: fileList.map((entry) => {
      const record = entry as { path: string; content: string; type: "component" };
      return { path: record.path, content: record.content, type: record.type };
    }),
  });
  return JSON.stringify({ ...merged, hash });
}

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code: unknown = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

function hintOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "hint" in error) {
    const hint: unknown = error.hint;
    return typeof hint === "string" ? hint : String(hint);
  }
  return "";
}

describe("verify hardening", () => {
  it("handles string/invalid schemaVersion with an update hint", () => {
    for (const bad of ["1", 2, null, "99"]) {
      try {
        verifyItem(validPayload({ schemaVersion: bad }), "aurora-text");
        expect.unreachable(`should reject schemaVersion ${String(bad)}`);
      } catch (error) {
        expect(exitCodeOf(error)).toBe(4);
        expect(hintOf(error)).toContain("update framebits");
      }
    }
  });

  it("points hash-mismatch and allowlist errors at docs/SECURITY.md", () => {
    const original = JSON.parse(validPayload()) as { hash: string };
    const tampered = JSON.parse(
      validPayload({
        files: [
          {
            path: "components/ui/aurora-text.tsx",
            content: "tampered\n",
            type: "component",
            variant: "ts-tw",
          },
        ],
      }),
    ) as Record<string, unknown>;
    tampered["hash"] = original.hash;
    try {
      verifyItem(JSON.stringify(tampered), "aurora-text");
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
      expect(hintOf(error)).toContain("docs/SECURITY.md");
    }
  });

  it("enforces closure totals (500 files / 5 MB)", () => {
    const big = {
      schemaVersion: 1,
      slug: "big",
      type: "component",
      title: "big",
      version: "1.0.0",
      hash: `sha256:${"a".repeat(64)}`,
      dependencies: {},
      registryDependencies: [],
      files: [{ path: "components/ui/big.tsx", content: "export {};\n", type: "component" as const, variant: "ts-tw" as const }],
    };
    try {
      assertClosureLimits([
        big as unknown as Parameters<typeof assertClosureLimits>[0][number],
      ]);
    } catch {
      expect.unreachable("single small item must pass");
    }
    const many = Array.from({ length: 501 }, () => big) as unknown as Parameters<
      typeof assertClosureLimits
    >[0];
    try {
      assertClosureLimits(many);
      expect.unreachable();
    } catch (error) {
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("keeps pinned and latest cache keys separate with a shadowing warning", async () => {
    const payload = (version: string): string => {
      const content = `// cn ${version}\nexport {};\n`;
      const hash = computeItemHash({
        type: "lib",
        dependencies: {},
        registryDependencies: [],
        files: [{ path: "lib/cn.ts", content, type: "lib" }],
      });
      return JSON.stringify({
        schemaVersion: 1,
        slug: "cn",
        type: "lib",
        title: "cn",
        version,
        hash,
        dependencies: {},
        registryDependencies: [],
        files: [{ path: "lib/cn.ts", content, type: "lib", variant: "ts-tw" }],
      });
    };
    const calls: string[] = [];
    const fetchFn: FetchFn = (url: string): Promise<Response> => {
      calls.push(url);
      const text = url.includes("@1.0.0") ? payload("1.0.0") : payload("2.0.0");
      return Promise.resolve(
        new Response(text, { status: 200, headers: { "content-type": "application/json" } }),
      );
    };
    const closure = await resolveClosure(
      [
        { slug: "cn", version: "1.0.0" },
        { slug: "cn", version: undefined },
      ],
      {
        registry: "https://x/r",
        fetchFn,
        sleep: () => Promise.resolve(),
        indexSlugs: () => Promise.resolve(["cn"]),
      },
    );
    // One fetch per key (pinned + latest), no cross-contamination.
    expect(calls.filter((url) => url.includes("cn@1.0.0")).length).toBe(1);
    expect(calls.filter((url) => url.endsWith("/cn.json")).length).toBe(1);
    expect(closure.warnings.some((warning) => warning.includes("shadows"))).toBe(true);
  });
});

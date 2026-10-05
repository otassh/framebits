import { describe, expect, it } from "vitest";
import { computeItemHash } from "@algorithco-ui/shared";
import { resolveClosure } from "./index.js";
import type { FetchFn } from "../registry-client/index.js";

function itemText(slug: string, deps: string[], path: string): string {
  const hash = computeItemHash({
    type: "component",
    dependencies: {},
    registryDependencies: deps,
    files: [{ path, content: `// ${slug}\nexport {};\n`, type: "component" }],
  });
  return JSON.stringify({
    schemaVersion: 1,
    slug,
    type: "component",
    title: slug,
    version: "1.0.0",
    hash,
    dependencies: {},
    registryDependencies: deps,
    files: [{ path, content: `// ${slug}\nexport {};\n`, type: "component", variant: "ts-tw" }],
  });
}

function fetchFor(store: Record<string, string>): { fetchFn: FetchFn; calls: string[] } {
  const calls: string[] = [];
  const fetchFn: FetchFn = (url: string): Promise<Response> => {
    calls.push(url);
    const last = url.split("/").pop() ?? "";
    const slug = last.replace(".json", "").split("@")[0] ?? "";
    const text = store[slug];
    if (text === undefined) {
      return Promise.resolve(
        new Response("not found", { status: 404, headers: { "content-type": "application/json" } }),
      );
    }
    return Promise.resolve(
      new Response(text, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };
  return { fetchFn, calls };
}

function noSleep(): { sleep: (ms: number) => Promise<void> } {
  return {
    sleep: (): Promise<void> => Promise.resolve(),
  };
}

describe("resolveClosure", () => {
  it("resolves diamonds once, dependencies first", async () => {
    const store: Record<string, string> = {
      "aurora-text": itemText("aurora-text", ["cn"], "components/ui/aurora-text.tsx"),
      cn: JSON.stringify(cnPayload()),
      shimmer: itemText("shimmer", ["cn"], "components/ui/shimmer.tsx"),
    };
    const { fetchFn, calls } = fetchFor(store);
    const closure = await resolveClosure(
      [{ slug: "aurora-text", version: undefined }, { slug: "shimmer", version: undefined }],
      {
        registry: "https://x/r",
        fetchFn,
        sleep: noSleep().sleep,
        indexSlugs: () => Promise.resolve(["aurora-text", "cn", "shimmer"]),
      },
    );
    expect(closure.items.map((entry) => entry.slug)).toEqual(["cn", "aurora-text", "shimmer"]);
    expect(calls.filter((url) => url.includes("/cn.json")).length).toBe(1);
  });

  it("reports cycles with the full path (exit 4)", async () => {
    const store: Record<string, string> = {
      aa: itemText("aa", ["bb"], "components/ui/aa.tsx"),
      bb: itemText("bb", ["aa"], "components/ui/bb.tsx"),
    };
    const { fetchFn } = fetchFor(store);
    try {
      await resolveClosure([{ slug: "aa", version: undefined }], {
        registry: "https://x/r",
        fetchFn,
        sleep: noSleep().sleep,
        indexSlugs: () => Promise.resolve(["aa", "bb"]),
      });
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("aa -> bb -> aa");
      expect(exitCodeOf(error)).toBe(4);
    }
  });

  it("processes explicit slugs in argument order", async () => {
    const store: Record<string, string> = {
      "zeta-item": itemText("zeta-item", [], "components/ui/zeta-item.tsx"),
      "alpha-item": itemText("alpha-item", [], "components/ui/alpha-item.tsx"),
    };
    const { fetchFn } = fetchFor(store);
    const closure = await resolveClosure(
      [{ slug: "zeta-item", version: undefined }, { slug: "alpha-item", version: undefined }],
      {
        registry: "https://x/r",
        fetchFn,
        sleep: noSleep().sleep,
        indexSlugs: () => Promise.resolve(["zeta-item", "alpha-item"]),
      },
    );
    expect(closure.items.map((entry) => entry.slug)).toEqual(["zeta-item", "alpha-item"]);
  });
});

function cnPayload(): Record<string, unknown> {
  const content = "// cn\nexport {};\n";
  const hash = computeItemHash({
    type: "lib",
    dependencies: {},
    registryDependencies: [],
    files: [{ path: "lib/cn.ts", content, type: "lib" }],
  });
  return {
    schemaVersion: 1,
    slug: "cn",
    type: "lib",
    title: "cn",
    version: "1.0.0",
    hash,
    dependencies: {},
    registryDependencies: [],
    files: [{ path: "lib/cn.ts", content, type: "lib", variant: "ts-tw" }],
  };
}

function exitCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "exitCode" in error) {
    const code = error.exitCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

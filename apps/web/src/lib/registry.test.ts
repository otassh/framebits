import { computeItemHash } from "@framebits/shared/src/hash.js";
import { describe, expect, it } from "vitest";
import {
  MAX_JSON_BYTES,
  createRegistryClient,
  redactUrl,
  RegistryClientError,
} from "./registry.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INDEX_ITEM = {
  slug: "aurora-text",
  type: "component",
  title: "Aurora Text",
  category: "text-animations",
  tags: ["gradient"],
  description: "Animated aurora gradient text for registry tests.",
  version: "1.0.0",
  hash: `sha256:${"0".repeat(64)}`,
  performance: "light",
  difficulty: "easy",
  addedAt: "2026-10-05",
  previews: { image: "/previews/aurora-text.webp" },
};

const INDEX = {
  schemaVersion: 1,
  generatedAt: "2026-10-06T08:00:00.000Z",
  items: [INDEX_ITEM],
};

const ITEM_BASE = {
  schemaVersion: 1,
  slug: "aurora-text",
  type: "component",
  title: "Aurora Text",
  version: "1.0.0",
  dependencies: { motion: "^14.0.0" },
  registryDependencies: ["cn"],
  files: [
    {
      path: "components/ui/aurora-text.tsx",
      content: "export function AuroraText() { return null; }\n",
      type: "component",
      variant: "ts-tw",
    },
  ],
} as const;

function validItem(): typeof ITEM_BASE & { hash: string } {
  const hash = computeItemHash({
    type: "component",
    dependencies: { motion: "^14.0.0" },
    registryDependencies: ["cn"],
    files: [
      {
        path: "components/ui/aurora-text.tsx",
        content: "export function AuroraText() { return null; }\n",
        type: "component",
        variant: "ts-tw",
      },
    ],
  });
  return { ...ITEM_BASE, hash };
}

describe("createRegistryClient", () => {
  it("loads and validates the real index contract", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = (input) => {
      requests.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      return Promise.resolve(jsonResponse(INDEX));
    };
    const client = createRegistryClient({ baseUrl: "https://registry.test/r/", fetcher });

    await expect(client.loadIndex()).resolves.toMatchObject({
      schemaVersion: 1,
      items: [{ previews: { image: "/previews/aurora-text.webp" } }],
    });
    expect(requests).toEqual(["https://registry.test/r/index.json"]);
  });

  it("loads and hash-verifies registry items", async () => {
    const item = validItem();
    const fetcher: typeof fetch = () => Promise.resolve(jsonResponse(item));
    const client = createRegistryClient({ baseUrl: "/r", fetcher });

    await expect(client.loadItem("aurora-text")).resolves.toMatchObject({
      slug: "aurora-text",
      files: [{ path: "components/ui/aurora-text.tsx" }],
    });
  });

  it("refuses tampered items with an integrity error and writes nothing", async () => {
    const item = {
      ...validItem(),
      files: [
        {
          path: "components/ui/aurora-text.tsx",
          content: "export const pwned = true;\n",
          type: "component",
          variant: "ts-tw",
        },
      ],
    };
    const fetcher: typeof fetch = () => Promise.resolve(jsonResponse(item));
    const client = createRegistryClient({ fetcher });

    await expect(client.loadItem("aurora-text")).rejects.toThrow(/integrity check failed/);
  });

  it("rejects schema-invalid payloads instead of trusting registry data", async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(jsonResponse({ ...INDEX, unexpected: true }));
    const client = createRegistryClient({ fetcher });

    await expect(client.loadIndex()).rejects.toThrow(/failed validation/);
  });

  it("reports HTTP failures without treating their bodies as data", async () => {
    const fetcher: typeof fetch = () => Promise.resolve(jsonResponse({ error: "down" }, 503));
    const client = createRegistryClient({ fetcher });

    await expect(client.loadIndex()).rejects.toBeInstanceOf(RegistryClientError);
    await expect(client.loadIndex()).rejects.toThrow(/503/);
  });

  it("refuses an empty registry URL", () => {
    expect(() => createRegistryClient({ baseUrl: "  " })).toThrow(/must not be empty/);
  });

  it("rejects javascript:/data: URLs, credentials, and non-localhost http", () => {
    expect(() => createRegistryClient({ baseUrl: "javascript:alert(1)" })).toThrow();
    expect(() => createRegistryClient({ baseUrl: "data:application/json,{}" })).toThrow();
    expect(() =>
      createRegistryClient({ baseUrl: "https://user:pass@registry.test/r" }),
    ).toThrow(/credentials/);
    expect(() => createRegistryClient({ baseUrl: "http://evil.test/r" })).toThrow(
      /localhost/,
    );
  });

  it("allows https, localhost http, and same-origin /r", () => {
    const fetcher: typeof fetch = () => Promise.resolve(jsonResponse(INDEX));
    expect(() =>
      createRegistryClient({ baseUrl: "https://registry.test/r", fetcher }),
    ).not.toThrow();
    expect(() =>
      createRegistryClient({ baseUrl: "http://localhost:3000/r", fetcher }),
    ).not.toThrow();
    expect(() =>
      createRegistryClient({ baseUrl: "http://127.0.0.1:8080/r", fetcher }),
    ).not.toThrow();
    expect(() => createRegistryClient({ baseUrl: "/r", fetcher })).not.toThrow();
  });

  it("enforces the 2MB JSON cap via content-length before parsing", async () => {
    const big = "x".repeat(64);
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, big }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(MAX_JSON_BYTES + 1),
          },
        }),
      );
    const client = createRegistryClient({ fetcher });
    await expect(client.loadIndex()).rejects.toThrow(/exceeds.*byte limit/);
  });

  it("redacts userinfo from URLs in errors", () => {
    expect(redactUrl("https://user:secret@registry.test/r")).not.toContain("secret");
    expect(redactUrl("https://user:secret@registry.test/r")).toContain("registry.test");
    expect(redactUrl("/r")).toBe("/r");
  });

  it("applies a 10s timeout signal to every request", async () => {
    let seenSignal: AbortSignal | undefined;
    const fetcher: typeof fetch = (_input, init) => {
      seenSignal = init?.signal as AbortSignal | undefined;
      return Promise.resolve(jsonResponse(INDEX));
    };
    const client = createRegistryClient({ fetcher });
    await client.loadIndex();
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });
});

import { describe, expect, it } from "vitest";
import { createRegistryClient, RegistryClientError } from "./registry.js";

const HASH = `sha256:${"0".repeat(64)}`;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INDEX = {
  schemaVersion: 1,
  generatedAt: "2026-10-06T08:00:00.000Z",
  items: [
    {
      slug: "aurora-text",
      type: "component",
      title: "Aurora Text",
      category: "text-animations",
      tags: ["gradient"],
      description: "Animated aurora gradient text for registry tests.",
      version: "1.0.0",
      hash: HASH,
      performance: "light",
      difficulty: "easy",
      addedAt: "2026-10-05",
    },
  ],
};

const ITEM = {
  schemaVersion: 1,
  slug: "aurora-text",
  type: "component",
  title: "Aurora Text",
  version: "1.0.0",
  hash: HASH,
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
};

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

    await expect(client.loadIndex()).resolves.toMatchObject({ schemaVersion: 1 });
    expect(requests).toEqual(["https://registry.test/r/index.json"]);
  });

  it("loads and validates registry item files", async () => {
    const fetcher: typeof fetch = () => Promise.resolve(jsonResponse(ITEM));
    const client = createRegistryClient({ baseUrl: "/r", fetcher });

    await expect(client.loadItem("aurora-text")).resolves.toMatchObject({
      slug: "aurora-text",
      files: [{ path: "components/ui/aurora-text.tsx" }],
    });
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
});

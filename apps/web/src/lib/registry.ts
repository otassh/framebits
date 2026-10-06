import { RegistryIndexSchema, type RegistryIndex } from "@framebits/shared/src/registry-index.js";
import { RegistryItemSchema, type RegistryItem } from "@framebits/shared/src/registry-item.js";
import type { ZodType } from "zod";

export class RegistryClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RegistryClientError";
  }
}

export interface RegistryClient {
  loadIndex(signal?: AbortSignal): Promise<RegistryIndex>;
  loadItem(slug: string, signal?: AbortSignal): Promise<RegistryItem>;
}

interface RegistryClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized === "") {
    throw new RegistryClientError("Registry URL must not be empty");
  }
  return normalized;
}

async function fetchValidated<T>(
  fetcher: typeof fetch,
  url: string,
  schema: ZodType<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw new RegistryClientError(`Registry request failed (${String(response.status)}): ${url}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RegistryClientError(`Registry returned invalid JSON: ${url}`);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue === undefined ? "unknown schema error" : issue.message;
    throw new RegistryClientError(`Registry payload failed validation: ${detail}`);
  }
  return parsed.data;
}

export function createRegistryClient(options: RegistryClientOptions = {}): RegistryClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "/r");
  const fetcher = options.fetcher ?? fetch;

  return {
    loadIndex: (signal) =>
      fetchValidated(fetcher, `${baseUrl}/index.json`, RegistryIndexSchema, signal),
    loadItem: (slug, signal) =>
      fetchValidated(
        fetcher,
        `${baseUrl}/${encodeURIComponent(slug)}.json`,
        RegistryItemSchema,
        signal,
      ),
  };
}

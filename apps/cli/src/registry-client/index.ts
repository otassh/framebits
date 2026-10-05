/**
 * Registry HTTP client (C8). URL precedence, https/localhost rule, timeout,
 * retries with backoff, size cap, slug@version URLs, 404 suggestions.
 */
import { DEFAULT_REGISTRY_URL, SlugSchema } from "@framebits/shared";
import {
  conflictError,
  integrityError,
  networkError,
  usageError,
  type CliError,
} from "../errors.js";
import { didYouMean } from "../levenshtein.js";
import { CLI_VERSION } from "../version.js";

export const FETCH_TIMEOUT_MS = 10000;
export const FETCH_MAX_RETRIES = 2;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const RETRY_AFTER_CAP_MS = 10000;

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RegistryUrlInput {
  flag: string | undefined;
  env: string | undefined;
  config: string | undefined;
}

export function resolveRegistryUrl(input: RegistryUrlInput): string {
  const raw = input.flag ?? input.env ?? input.config ?? DEFAULT_REGISTRY_URL;
  return raw.replace(/\/+$/, "");
}

const LOCALHOST_PATTERNS = [
  /^http:\/\/localhost(?::\d+)?(\/|$)/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?(\/|$)/,
  /^http:\/\/\[::1\](?::\d+)?(\/|$)/,
];

export function isAllowedRegistryUrl(url: string): boolean {
  if (url.startsWith("https://")) return true;
  return LOCALHOST_PATTERNS.some((pattern) => pattern.test(url));
}

export function assertAllowedRegistryUrl(url: string, what: string): void {
  if (!isAllowedRegistryUrl(url)) {
    throw usageError(
      `${what} must be https:// (http://localhost, 127.0.0.1 and [::1] are allowed for development)`,
      "pass --registry https://... or set FRAMEBITS_REGISTRY_URL",
    );
  }
}

export function parseSlugArg(arg: string): { slug: string; version: string | undefined } {
  const at = arg.lastIndexOf("@");
  const rawSlug = at === -1 ? arg : arg.slice(0, at);
  const rawVersion = at === -1 ? undefined : arg.slice(at + 1);
  const parsed = SlugSchema.safeParse(rawSlug);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "bad slug";
    throw usageError(
      `invalid slug ${JSON.stringify(arg)}: ${detail}`,
      "slugs are kebab-case, 2-64 chars (e.g. aurora-text)",
    );
  }
  if (rawVersion !== undefined && rawVersion !== "") {
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(rawVersion)) {
      throw usageError(
        `invalid version in ${JSON.stringify(arg)} (expected x.y.z)`,
        "use e.g. cn@1.0.0",
      );
    }
    return { slug: parsed.data, version: rawVersion };
  }
  return { slug: parsed.data, version: undefined };
}

export function itemUrl(registry: string, slug: string, version?: string): string {
  if (version !== undefined) return `${registry}/${slug}@${version}.json`;
  return `${registry}/${slug}.json`;
}

export function indexUrl(registry: string): string {
  return `${registry}/index.json`;
}

function retryAfterMs(header: string | null): number | undefined {
  if (header === null || header === "") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1000, 0), RETRY_AFTER_CAP_MS);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), RETRY_AFTER_CAP_MS);
  }
  return undefined;
}

export interface FetchJsonOptions {
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
}

interface HttpStatusError extends Error {
  status: number;
}

function httpStatusError(status: number): HttpStatusError {
  const error = new Error(`HTTP ${String(status)}`) as HttpStatusError;
  error.status = status;
  return error;
}

function isHttpStatusError(error: unknown): error is HttpStatusError {
  return error instanceof Error && "status" in error &&
    typeof (error as { status: unknown }).status === "number";
}

function isCliLike(error: unknown): boolean {
  return error instanceof Error &&
    (error.name === "CliError" || "exitCode" in error);
}

function classifyNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|abort/i.test(message)) return "timed out after 10s";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return "DNS lookup failed (offline?)";
  if (/ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(message)) return "connection refused (offline?)";
  if (/fetch failed/i.test(message)) return "fetch failed (offline?)";
  return message;
}

export function fetchJsonText(
  url: string,
  options: FetchJsonOptions,
): Promise<{ text: string; finalUrl: string }> {
  assertAllowedRegistryUrl(url, "registry URL");
  let attempt = 0;
  let lastError: unknown;
  const run = (): Promise<{ text: string; finalUrl: string }> => {
    return options
      .fetchFn(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": `framebits/${CLI_VERSION}`,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      })
      .then((response) => handleResponse(response, url, attempt, options, run))
      .catch((error: unknown): Promise<{ text: string; finalUrl: string }> => {
        if (isHttpStatusError(error)) throw error;
        if (isCliLike(error)) throw error;
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          /timeout|abort|fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|429|5\d\d/i.test(
            message,
          );
        if (retryable && attempt < FETCH_MAX_RETRIES) {
          attempt += 1;
          return options.sleep(500 * attempt).then(() => run());
        }
        throw networkError(
          `network error fetching ${url}: ${classifyNetworkError(error)}`,
          "check your connection and retry",
        );
      });
  };
  return run().catch((error: unknown): Promise<{ text: string; finalUrl: string }> => {
    if (isHttpStatusError(error) || isCliLike(error)) throw error;
    throw networkError(
      `network error fetching ${url}: ${classifyNetworkError(lastError ?? error)}`,
      "check your connection and retry",
    );
  });
}

function handleResponse(
  response: Response,
  url: string,
  attempt: number,
  options: FetchJsonOptions,
  retry: () => Promise<{ text: string; finalUrl: string }>,
): Promise<{ text: string; finalUrl: string }> {
  const finalUrl = response.url !== "" ? response.url : url;
  if (!isAllowedRegistryUrl(finalUrl)) {
    throw integrityError(
      `registry redirected to disallowed URL ${finalUrl}`,
      "registries must stay on https:// (localhost allowed for development)",
    );
  }
  if (response.status === 429) {
    const wait = retryAfterMs(response.headers.get("retry-after")) ?? 1000 * (attempt + 1);
    if (attempt < FETCH_MAX_RETRIES) {
      return options.sleep(wait).then(() => retry());
    }
    throw networkError(`registry rate-limited us (429) at ${url}`, "wait a minute and retry");
  }
  if (response.status >= 500 && response.status <= 599) {
    if (attempt < FETCH_MAX_RETRIES) {
      return options.sleep(500 * (attempt + 1)).then(() => retry());
    }
    throw networkError(
      `registry error ${String(response.status)} at ${url}`,
      "retry later; if it persists the registry may be down",
    );
  }
  if (!response.ok) {
    throw httpStatusError(response.status);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/application\/json|\+json|text\/json/i.test(contentType) && contentType !== "") {
    throw integrityError(
      `registry returned unexpected content-type ${JSON.stringify(contentType)}`,
      "the registry must serve JSON",
    );
  }
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null && Number(lengthHeader) > FETCH_MAX_BYTES) {
    throw integrityError(
      `registry response exceeds the 2 MB cap (content-length ${lengthHeader})`,
      "the registry response is too large",
    );
  }
  return readWithCap(response, FETCH_MAX_BYTES).then((text) => ({ text, finalUrl }));
}

function readWithCap(response: Response, cap: number): Promise<string> {
  if (response.body === null) {
    return response.text().then((text) => {
      if (Buffer.byteLength(text, "utf8") > cap) {
        throw integrityError(
          "registry response exceeds the 2 MB cap",
          "the registry response is too large",
        );
      }
      return text;
    });
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const pump = (): Promise<string> => {
    return reader.read().then(({ done, value }): Promise<string> => {
      if (done) {
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return Promise.resolve(new TextDecoder().decode(combined));
      }
      if (value instanceof Uint8Array) {
        total += value.byteLength;
        if (total > cap) {
          return reader.cancel().then(
            (): Promise<string> => {
              throw integrityError(
                "registry response exceeds the 2 MB cap",
                "the registry response is too large",
              );
            },
            (): Promise<string> => {
              throw integrityError(
                "registry response exceeds the 2 MB cap",
                "the registry response is too large",
              );
            },
          );
        }
        chunks.push(value);
      }
      return pump();
    });
  };
  return pump();
}

interface IndexPayload {
  items: unknown[];
}

function isIndexPayload(raw: unknown): raw is IndexPayload {
  return typeof raw === "object" && raw !== null && "items" in raw &&
    Array.isArray(raw.items);
}

function isSlugEntry(entry: unknown): entry is { slug: string } {
  return typeof entry === "object" && entry !== null && "slug" in entry &&
    typeof entry.slug === "string";
}

export function fetchIndexSlugs(
  registry: string,
  options: FetchJsonOptions,
): Promise<string[]> {
  return fetchJsonText(indexUrl(registry), options).then(({ text }) => {
    try {
      const raw: unknown = JSON.parse(text);
      if (isIndexPayload(raw)) {
        const slugs: string[] = [];
        for (const entry of raw.items) {
          if (isSlugEntry(entry)) slugs.push(entry.slug);
        }
        return slugs;
      }
      return [];
    } catch {
      return [];
    }
  });
}

export function notFoundError(
  slug: string,
  candidates: readonly string[],
  registry: string,
): CliError {
  const suggestion = didYouMean(slug, candidates);
  const hint = suggestion !== undefined
    ? `did you mean "${suggestion}"?`
    : `check the slug spelling or browse ${registry}`;
  return conflictError(`component not found: ${slug}`, hint);
}

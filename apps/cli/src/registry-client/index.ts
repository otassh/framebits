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
/** Default is 10 s; valid range everywhere is 1-300 s. */
export const TIMEOUT_MIN_S = 1;
export const TIMEOUT_MAX_S = 300;
export const TIMEOUT_ENV_VAR = "FRAMEBITS_TIMEOUT";
export const REGISTRY_ENV_VAR = "FRAMEBITS_REGISTRY_URL";
export const FETCH_MAX_RETRIES = 2;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const RETRY_AFTER_CAP_MS = 10000;
/** Retry-After / backoff floor: never sleep less than 500 ms on 429/5xx. */
export const RETRY_AFTER_MIN_MS = 500;
/** Max manual redirect hops (same-origin only). */
export const MAX_REDIRECTS = 3;

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export type RegistrySource = "flag" | "env" | "config" | "default";

/**
 * Redact credentials from a URL for logs/errors/hints. Never echo userinfo.
 * Unparseable input is scrubbed with a regex fallback (no secret echo).
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username !== "" || parsed.password !== "") {
      parsed.username = "***";
      parsed.password = "";
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/[^@/]*@/, "://***@");
  }
}

function isLocalHostname(hostname: string): boolean {
  const bare = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1";
}

/** Parse + validate a registry base URL. Throws usageError (exit 2) on violation. */
function validateRegistryUrl(raw: string, what: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw usageError(
      `${what} is not a valid URL (${redactUrl(trimmed)})`,
      "pass --registry https://... or set FRAMEBITS_REGISTRY_URL",
    );
  }
  const hasUserinfo = parsed.username !== "" || parsed.password !== "";
  if (parsed.protocol === "https:") {
    if (hasUserinfo) {
      throw usageError(
        `${what} must not contain credentials (${redactUrl(trimmed)})`,
        "remove userinfo from the registry URL",
      );
    }
    return trimmed;
  }
  if (parsed.protocol === "http:") {
    if (!isLocalHostname(parsed.hostname)) {
      throw usageError(
        `${what} must be https:// (http://localhost, 127.0.0.1 and [::1] are allowed for development)`,
        "pass --registry https://... or set FRAMEBITS_REGISTRY_URL",
      );
    }
    if (hasUserinfo) {
      throw usageError(
        `${what} must not contain credentials (${redactUrl(trimmed)})`,
        "remove userinfo from the registry URL",
      );
    }
    return trimmed;
  }
  throw usageError(
    `${what} must be https:// (http://localhost, 127.0.0.1 and [::1] are allowed for development)`,
    "pass --registry https://... or set FRAMEBITS_REGISTRY_URL",
  );
}

export interface RegistryUrlInput {
  flag: string | undefined;
  env: string | undefined;
  config: string | undefined;
}

export function resolveRegistryUrlWithSource(input: RegistryUrlInput): {
  url: string;
  source: RegistrySource;
} {
  let raw: string;
  let source: RegistrySource;
  let what: string;
  if (input.flag !== undefined) {
    raw = input.flag;
    source = "flag";
    what = "--registry";
  } else if (input.env !== undefined) {
    raw = input.env;
    source = "env";
    what = REGISTRY_ENV_VAR;
  } else if (input.config !== undefined) {
    raw = input.config;
    source = "config";
    what = "registry in framebits.json";
  } else {
    raw = DEFAULT_REGISTRY_URL;
    source = "default";
    what = "default registry";
  }
  return { url: validateRegistryUrl(raw, what), source };
}

export function resolveRegistryUrl(input: RegistryUrlInput): string {
  return resolveRegistryUrlWithSource(input).url;
}

/**
 * Debug-only label for the effective registry source. Returns the source
 * name only (never the URL value) so no secret is ever echoed. Callers must
 * only print this when `--debug` is set.
 */
export function describeRegistrySource(source: RegistrySource): string {
  return `registry source: ${source}`;
}

export function isAllowedRegistryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hasUserinfo = parsed.username !== "" || parsed.password !== "";
    if (hasUserinfo) return false;
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") return isLocalHostname(parsed.hostname);
    return false;
  } catch {
    return false;
  }
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
    return Math.min(Math.max(seconds * 1000, RETRY_AFTER_MIN_MS), RETRY_AFTER_CAP_MS);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), RETRY_AFTER_MIN_MS), RETRY_AFTER_CAP_MS);
  }
  return undefined;
}

/** Jittered backoff for 5xx/network retries, clamped 500 ms..10 s. */
export function backoffMs(attempt: number): number {
  const base = 500 * (attempt + 1);
  const jittered = base * (0.5 + Math.random() * 0.5);
  return Math.min(Math.max(Math.round(jittered), RETRY_AFTER_MIN_MS), RETRY_AFTER_CAP_MS);
}

export interface FetchJsonOptions {
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  /**
   * Per-request timeout in milliseconds. Optional for backwards
   * compatibility; defaults to {@link FETCH_TIMEOUT_MS}. Prefer passing the
   * value from {@link resolveTimeoutMs} so `--timeout`/env/config apply.
   */
  timeoutMs?: number | undefined;
}

/** Render a timeout for messages: whole seconds as `10s`, else `1500ms`. */
export function formatTimeoutMs(timeoutMs: number): string {
  if (Number.isInteger(timeoutMs / 1000)) return `${String(timeoutMs / 1000)}s`;
  return `${String(timeoutMs)}ms`;
}

/**
 * Parse `--timeout <seconds>` (integer seconds, 1-300). Throws a usage error
 * (exit 2) on bad input. Returns undefined when the flag was not given.
 */
export function parseTimeoutFlag(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) {
    throw usageError(
      `invalid --timeout ${JSON.stringify(raw)}: expected an integer 1-300 (seconds)`,
      "use e.g. --timeout 30",
    );
  }
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds < TIMEOUT_MIN_S || seconds > TIMEOUT_MAX_S) {
    throw usageError(
      `invalid --timeout ${JSON.stringify(raw)}: expected an integer 1-300 (seconds)`,
      "use e.g. --timeout 30",
    );
  }
  return seconds * 1000;
}

/**
 * Parse `FRAMEBITS_TIMEOUT` (integer seconds, 1-300). Throws a usage error
 * (exit 2) on bad input. Returns undefined when unset/empty.
 */
export function parseTimeoutEnv(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!/^\d+$/.test(raw)) {
    throw usageError(
      `invalid ${TIMEOUT_ENV_VAR} ${JSON.stringify(raw)}: expected an integer 1-300 (seconds)`,
      "use e.g. FRAMEBITS_TIMEOUT=30 for 30s, or unset it",
    );
  }
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds < TIMEOUT_MIN_S || seconds > TIMEOUT_MAX_S) {
    throw usageError(
      `invalid ${TIMEOUT_ENV_VAR} ${JSON.stringify(raw)}: expected an integer 1-300 (seconds)`,
      "use e.g. FRAMEBITS_TIMEOUT=30 for 30s, or unset it",
    );
  }
  return seconds * 1000;
}

export interface TimeoutInput {
  /** Raw `--timeout <seconds>` value from the CLI. */
  flag: string | undefined;
  /** Raw `FRAMEBITS_TIMEOUT` value (seconds). */
  env: string | undefined;
  /** Validated `timeoutSeconds` from `framebits.json` (seconds). */
  configSeconds: number | undefined;
}

/**
 * Resolve the effective timeout in milliseconds.
 * Precedence: `--timeout` flag > `FRAMEBITS_TIMEOUT` env >
 * `timeoutSeconds` in `framebits.json` > default (10 s).
 * Throws a usage error (exit 2) on any invalid input.
 */
export function resolveTimeoutMs(input: TimeoutInput): number {
  const fromFlag = parseTimeoutFlag(input.flag);
  if (fromFlag !== undefined) return fromFlag;
  const fromEnv = parseTimeoutEnv(input.env);
  if (fromEnv !== undefined) return fromEnv;
  if (input.configSeconds !== undefined) {
    if (
      !Number.isInteger(input.configSeconds) ||
      input.configSeconds < TIMEOUT_MIN_S ||
      input.configSeconds > TIMEOUT_MAX_S
    ) {
      throw usageError(
        `invalid timeoutSeconds ${JSON.stringify(input.configSeconds)} in framebits.json: expected an integer 1-300 (seconds)`,
        "fix timeoutSeconds or remove it to use the 10s default",
      );
    }
    return input.configSeconds * 1000;
  }
  return FETCH_TIMEOUT_MS;
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

function classifyNetworkError(error: unknown, timeoutMs: number): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|abort/i.test(message)) {
    return `timed out after ${formatTimeoutMs(timeoutMs)}`;
  }
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
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  // Global deadline across retries + redirect hops: per-attempt timeout is
  // bounded by the remaining budget so retries cannot extend forever.
  const deadline = Date.now() + timeoutMs * (FETCH_MAX_RETRIES + 1);
  let attempt = 0;
  let lastError: unknown;
  const remainingMs = (): number => Math.max(deadline - Date.now(), 0);

  const run = (currentUrl: string, redirects: number): Promise<{ text: string; finalUrl: string }> => {
    const budget = remainingMs();
    if (budget <= 0) {
      throw networkError(
        `network error fetching ${redactUrl(currentUrl)}: timed out after ${formatTimeoutMs(timeoutMs)} (global deadline)`,
        "check your connection and retry",
      );
    }
    const perAttempt = Math.min(timeoutMs, budget);
    return options
      .fetchFn(currentUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": `framebits/${CLI_VERSION}`,
        },
        signal: AbortSignal.timeout(perAttempt),
        // Automatic following disabled (redirect:"error" semantics): we follow
        // same-origin hops manually below so every hop is re-validated. The
        // "manual" mode exposes the 3xx Location for inspection; "error" would
        // reject without it. Either way no cross-origin auto-follow happens.
        redirect: "manual",
      })
      .then((response) =>
        handleResponse(response, currentUrl, redirects, attempt, options, (next, nextRedirects) =>
          run(next, nextRedirects),
        ),
      )
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
          const waitBudget = remainingMs();
          if (waitBudget <= 0) {
            throw networkError(
              `network error fetching ${redactUrl(currentUrl)}: timed out after ${formatTimeoutMs(timeoutMs)} (global deadline)`,
              "check your connection and retry",
            );
          }
          attempt += 1;
          const wait = Math.min(backoffMs(attempt), waitBudget);
          return options.sleep(wait).then(() => run(currentUrl, redirects));
        }
        throw networkError(
          `network error fetching ${redactUrl(currentUrl)}: ${classifyNetworkError(error, timeoutMs)}`,
          "check your connection and retry",
        );
      });
  };
  return run(url, 0).catch((error: unknown): Promise<{ text: string; finalUrl: string }> => {
    if (isHttpStatusError(error) || isCliLike(error)) throw error;
    throw networkError(
      `network error fetching ${redactUrl(url)}: ${classifyNetworkError(lastError ?? error, timeoutMs)}`,
      "check your connection and retry",
    );
  });
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function handleResponse(
  response: Response,
  url: string,
  redirects: number,
  attempt: number,
  options: FetchJsonOptions,
  retry: (next: string, nextRedirects: number) => Promise<{ text: string; finalUrl: string }>,
): Promise<{ text: string; finalUrl: string }> {
  // Manual same-origin redirect follow (max MAX_REDIRECTS, re-validate each hop).
  if (isRedirectStatus(response.status)) {
    const location = response.headers.get("location");
    if (location === null || location === "") {
      throw integrityError(
        `registry redirect at ${redactUrl(url)} missing a Location header`,
        "registries must stay on https:// (localhost allowed for development)",
      );
    }
    let next: string;
    try {
      next = new URL(location, url).toString();
    } catch {
      throw integrityError(
        `registry redirect at ${redactUrl(url)} has an invalid Location`,
        "registries must stay on https:// (localhost allowed for development)",
      );
    }
    if (!isAllowedRegistryUrl(next)) {
      throw integrityError(
        `registry redirected to disallowed URL ${redactUrl(next)}`,
        "registries must stay on https:// (localhost allowed for development)",
      );
    }
    if (!isSameOrigin(url, next)) {
      throw integrityError(
        `registry redirected cross-origin to ${redactUrl(next)} (only same-origin redirects are followed)`,
        "registries must stay on the same origin; report it if this persists",
      );
    }
    // Downgrade guard: https must never fall back to http.
    try {
      const from = new URL(url);
      const to = new URL(next);
      if (from.protocol === "https:" && to.protocol !== "https:") {
        throw integrityError(
          `registry redirect downgrades https to ${to.protocol} at ${redactUrl(next)}`,
          "registries must stay on https://",
        );
      }
    } catch (error) {
      if (isCliLike(error)) throw error;
    }
    if (redirects >= MAX_REDIRECTS) {
      throw integrityError(
        `registry redirected too many times at ${redactUrl(url)} (max ${String(MAX_REDIRECTS)})`,
        "report it if this persists",
      );
    }
    return retry(next, redirects + 1);
  }
  const finalUrl = response.url !== "" ? response.url : url;
  if (!isAllowedRegistryUrl(finalUrl)) {
    throw integrityError(
      `registry redirected to disallowed URL ${redactUrl(finalUrl)}`,
      "registries must stay on https:// (localhost allowed for development)",
    );
  }
  if (finalUrl !== url && !isSameOrigin(url, finalUrl)) {
    throw integrityError(
      `registry redirected cross-origin to ${redactUrl(finalUrl)} (only same-origin redirects are followed)`,
      "registries must stay on the same origin; report it if this persists",
    );
  }
  if (response.status === 429) {
    const wait = retryAfterMs(response.headers.get("retry-after")) ??
      backoffMs(attempt + 1);
    if (attempt < FETCH_MAX_RETRIES) {
      return options.sleep(wait).then(() => retry(url, redirects));
    }
    throw networkError(
      `registry rate-limited us (429) at ${redactUrl(url)}`,
      "wait a minute and retry",
    );
  }
  if (response.status >= 500 && response.status <= 599) {
    if (attempt < FETCH_MAX_RETRIES) {
      return options.sleep(backoffMs(attempt + 1)).then(() => retry(url, redirects));
    }
    throw networkError(
      `registry error ${String(response.status)} at ${redactUrl(url)}`,
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
  // Streaming-only 2 MB cap: a null body (already-buffered response) is
  // rejected instead of falling back to response.text(), which would buffer
  // unboundedly. The byte count below is post-decompression (fetch
  // decompresses gzip/deflate before exposing the stream), so it bounds the
  // actual JSON we parse.
  if (response.body === null) {
    throw integrityError(
      "registry response has no streaming body (refusing to buffer blindly)",
      "the registry response is too large or malformed; retry, and report it if it persists",
    );
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

/**
 * Parse JSON with an integrity guard (exit 4). The streaming cap above bounds
 * the decompressed bytes; this guard turns any malformed payload into a
 * clear integrity error instead of an uncaught SyntaxError.
 */
export function parseJsonGuarded(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw integrityError(
      `registry returned invalid JSON for ${what}`,
      error instanceof Error ? error.message : "the registry response is not valid JSON",
    );
  }
}

export function fetchIndexSlugs(
  registry: string,
  options: FetchJsonOptions,
): Promise<string[]> {
  return fetchJsonText(indexUrl(registry), options).then(({ text }) => {
    const raw: unknown = parseJsonGuarded(text, "index.json");
    if (isIndexPayload(raw)) {
      const slugs: string[] = [];
      for (const entry of raw.items) {
        if (isSlugEntry(entry)) slugs.push(entry.slug);
      }
      return slugs;
    }
    throw integrityError(
      `registry index at ${redactUrl(registry)} has an unexpected shape`,
      "the registry response is malformed; report it if it persists",
    );
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
    : `check the slug spelling or browse ${redactUrl(registry)}`;
  return conflictError(`component not found: ${slug}`, hint);
}

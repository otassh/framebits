import { canonicalize } from "@framebits/shared/src/canonical.js";
import { RegistryIndexSchema, type RegistryIndex } from "@framebits/shared/src/registry-index.js";
import {
  SCHEMA_VERSION,
  type RegistryItem,
} from "@framebits/shared/src/registry-item.js";
import { RegistryItemSchema } from "@framebits/shared/src/registry-item.js";
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

/** Hard cap for any single registry JSON payload (header-declared or streamed). */
export const MAX_JSON_BYTES = 2_000_000;

/** Per-request network timeout applied to every registry fetch. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Strip credentials from a URL for display in errors and UI.
 * Never echoes userinfo; unparseable input maps to a fixed placeholder
 * (never the raw string, which could itself contain secrets).
 */
export function redactUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "[unparseable registry URL]";
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized === "") {
    throw new RegistryClientError("Registry URL must not be empty");
  }
  if (/[\s\\]/.test(normalized)) {
    throw new RegistryClientError("Registry URL must not contain whitespace or backslashes");
  }
  if (normalized.startsWith("/")) {
    if (normalized.startsWith("//")) {
      throw new RegistryClientError("Registry URL must be a same-origin path like /r");
    }
    return normalized;
  }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new RegistryClientError(`Registry URL is invalid: ${redactUrl(normalized)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RegistryClientError(
      `Registry URL must use https (rejected ${url.protocol}): ${redactUrl(normalized)}`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new RegistryClientError(
      `Registry URL must not contain credentials: ${redactUrl(normalized)}`,
    );
  }
  if (url.protocol === "http:") {
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      throw new RegistryClientError(
        `Registry URL over http is only allowed for localhost: ${redactUrl(normalized)}`,
      );
    }
  }
  return normalized;
}

/** Combine the caller's signal with the mandatory request timeout. */
function timeoutSignalFor(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (signal === undefined) return timeout;
  return AbortSignal.any([signal, timeout]);
}

async function readBoundedText(response: Response, shownUrl: string): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsedLength = Number(declared.trim());
    if (Number.isFinite(parsedLength) && parsedLength > MAX_JSON_BYTES) {
      throw new RegistryClientError(
        `Registry response exceeds the ${String(MAX_JSON_BYTES)}-byte limit: ${shownUrl}`,
      );
    }
  }
  const body = response.body;
  if (body === null) {
    const text = await response.text();
    if (text.length > MAX_JSON_BYTES) {
      throw new RegistryClientError(
        `Registry response exceeds the ${String(MAX_JSON_BYTES)}-byte limit: ${shownUrl}`,
      );
    }
    return text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new RegistryClientError(
          `Registry response exceeds the ${String(MAX_JSON_BYTES)}-byte limit: ${shownUrl}`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(merged);
  if (text.length > MAX_JSON_BYTES) {
    throw new RegistryClientError(
      `Registry response exceeds the ${String(MAX_JSON_BYTES)}-byte limit: ${shownUrl}`,
    );
  }
  return text;
}

/**
 * LF/BOM/trailing-newline normalization, mirroring shared `normalizeContent`.
 * Implemented locally (instead of importing `@framebits/shared` hash utils)
 * because those pull in `node:crypto`, which cannot ship in the browser SPA
 * bundle. Equivalence with `normalizeItemForHash` is pinned by unit tests.
 * Mirrors: strip ALL leading BOMs, normalize NEL/LS/PS + CRLF/CR to LF,
 * ensure a trailing newline unless empty.
 */
function normalizeContentLocal(content: string): string {
  const BOM = String.fromCharCode(0xfeff);
  let withoutBom = content;
  while (withoutBom.startsWith(BOM)) withoutBom = withoutBom.slice(1);
  const NEL = String.fromCharCode(0x85);
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const unified = withoutBom.split(NEL).join("\n").split(LS).join("\n").split(PS).join("\n");
  const lf = unified.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (lf !== "" && !lf.endsWith("\n")) return `${lf}\n`;
  return lf;
}

/**
 * Hash-input size caps mirroring shared `MAX_FILE_CONTENT_BYTES` (1 MiB per
 * file) and `MAX_TOTAL_CONTENT_BYTES` (5 MiB total). Duplicated (not imported)
 * because `packages/shared/src/hash.ts` pulls in `node:crypto` + `Buffer`,
 * which cannot ship in the browser bundle. Values must stay in sync;
 * `registry.test.ts` pins `verifyItemHash` parity including the fail-closed
 * limit behavior.
 */
export const MAX_FILE_CONTENT_BYTES = 1_048_576;
export const MAX_TOTAL_CONTENT_BYTES = 5_242_880;

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function exceedsContentLimitsBrowser(item: RegistryItem): boolean {
  let total = 0;
  for (const file of item.files) {
    const bytes = utf8ByteLength(file.content);
    if (bytes > MAX_FILE_CONTENT_BYTES) return true;
    total += bytes;
    if (total > MAX_TOTAL_CONTENT_BYTES) return true;
  }
  return false;
}

/**
 * Canonical hash-input serialization, mirroring shared `normalizeItemForHash`
 * (schemaVersion + sorted dependencies, sorted registryDependencies, files
 * sorted by path with default variant, optional tailwind/cssVars passthrough).
 * The resulting string is byte-identical to the builder/CLI canonical form,
 * so the SHA-256 digest below equals `computeItemHash`. A legacy form without
 * `schemaVersion` is also verified, mirroring shared `verifyItemHash`, so
 * blobs hashed before the `schemaVersion` inclusion keep verifying.
 */
function toCanonicalString(item: RegistryItem): string {
  const dependencies: Record<string, string> = {};
  for (const key of Object.keys(item.dependencies).sort()) {
    const value = item.dependencies[key];
    if (value !== undefined) dependencies[key] = value;
  }
  const files = item.files
    .map((file) => ({
      path: file.path,
      content: normalizeContentLocal(file.content),
      type: file.type,
      variant: file.variant,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const payload: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    type: item.type,
    dependencies,
    registryDependencies: [...item.registryDependencies].sort(),
    files,
  };
  if (item.tailwind !== undefined) payload["tailwind"] = item.tailwind;
  if (item.cssVars !== undefined) payload["cssVars"] = item.cssVars;
  return canonicalize(payload);
}

function toCanonicalStringLegacy(item: RegistryItem): string {
  const dependencies: Record<string, string> = {};
  for (const key of Object.keys(item.dependencies).sort()) {
    const value = item.dependencies[key];
    if (value !== undefined) dependencies[key] = value;
  }
  const files = item.files
    .map((file) => ({
      path: file.path,
      content: normalizeContentLocal(file.content),
      type: file.type,
      variant: file.variant,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const payload: Record<string, unknown> = {
    type: item.type,
    dependencies,
    registryDependencies: [...item.registryDependencies].sort(),
    files,
  };
  if (item.tailwind !== undefined) payload["tailwind"] = item.tailwind;
  if (item.cssVars !== undefined) payload["cssVars"] = item.cssVars;
  return canonicalize(payload);
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto
    ?.subtle;
  if (subtle === undefined) {
    throw new RegistryClientError(
      "Registry integrity check is unavailable in this browser context; refusing to render",
    );
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hashesEqual(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) {
    diff |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

async function verifyItemHashBrowser(item: RegistryItem, slug: string): Promise<void> {
  if (exceedsContentLimitsBrowser(item)) {
    throw new RegistryClientError(
      `Registry integrity check failed for "${slug}": content exceeds hash-input limits; refusing to render`,
    );
  }
  const actual = `sha256:${await sha256Hex(toCanonicalString(item))}`;
  const legacy = `sha256:${await sha256Hex(toCanonicalStringLegacy(item))}`;
  if (!hashesEqual(actual, item.hash) && !hashesEqual(legacy, item.hash)) {
    throw new RegistryClientError(
      `Registry integrity check failed for "${slug}": hash mismatch; refusing to render`,
    );
  }
}

async function fetchValidated<T>(
  fetcher: typeof fetch,
  url: string,
  schema: ZodType<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  const shownUrl = redactUrl(url);
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    signal: timeoutSignalFor(signal),
  });

  if (!response.ok) {
    throw new RegistryClientError(`Registry request failed (${String(response.status)}): ${shownUrl}`);
  }

  const text = await readBoundedText(response, shownUrl);

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new RegistryClientError(`Registry returned invalid JSON: ${shownUrl}`);
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
    loadItem: async (slug, signal) => {
      const item = await fetchValidated(
        fetcher,
        `${baseUrl}/${encodeURIComponent(slug)}.json`,
        RegistryItemSchema,
        signal,
      );
      await verifyItemHashBrowser(item, slug);
      return item;
    },
  };
}

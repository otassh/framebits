/**
 * Dependency closure resolution (C10): recursive, de-duplicated, cycle-safe,
 * deterministic topological order (dependencies first). Exactly one fetch
 * per slug (cached).
 */
import type { RegistryItem } from "@framebits/shared";
import { integrityError } from "../errors.js";
import {
  fetchJsonText,
  itemUrl,
  notFoundError,
  redactUrl,
  type FetchJsonOptions,
} from "../registry-client/index.js";
import { assertClosureLimits, verifyItem } from "./verify.js";

export const MAX_CLOSURE_ITEMS = 100;

export interface ResolverOptions extends FetchJsonOptions {
  registry: string;
  indexSlugs: () => Promise<readonly string[]>;
}

export interface ResolveRequest {
  slug: string;
  version: string | undefined;
}

interface ResolveCache {
  /** Latest items keyed by bare slug. */
  latest: Map<string, RegistryItem>;
  /** Pinned items keyed by slug@version. Never shadows latest. */
  pinned: Map<string, RegistryItem>;
}

async function fetchVerified(
  registry: string,
  request: ResolveRequest,
  options: ResolverOptions,
  cache: ResolveCache,
  warnings: string[],
): Promise<RegistryItem> {
  if (request.version !== undefined) {
    const pinnedKey = `${request.slug}@${request.version}`;
    const cachedPinned = cache.pinned.get(pinnedKey);
    if (cachedPinned !== undefined) return cachedPinned;
    const url = itemUrl(registry, request.slug, request.version);
    let text: string;
    try {
      const result = await fetchJsonText(url, options);
      text = result.text;
    } catch (error) {
      if (
        error instanceof Error && "status" in error &&
        (error as { status?: unknown }).status === 404
      ) {
        const candidates = await options.indexSlugs().catch(() => [] as readonly string[]);
        throw notFoundError(request.slug, candidates, redactUrl(registry));
      }
      throw error;
    }
    const item = verifyItem(text, request.slug, request.version);
    cache.pinned.set(pinnedKey, item);
    // Shadowing guard: a pinned fetch must never populate the latest slot.
    // Warn when both a pinned and a latest copy of the same slug are in play
    // with different versions so the caller can surface it.
    const latestSeen = cache.latest.get(request.slug);
    if (latestSeen !== undefined && latestSeen.version !== item.version) {
      warnings.push(
        `pinned ${pinnedKey} shadows latest ${request.slug}@${latestSeen.version}; using each where requested`,
      );
    }
    return item;
  }
  const cachedLatest = cache.latest.get(request.slug);
  if (cachedLatest !== undefined) return cachedLatest;
  const url = itemUrl(registry, request.slug, undefined);
  let text: string;
  try {
    const result = await fetchJsonText(url, options);
    text = result.text;
  } catch (error) {
    if (
      error instanceof Error && "status" in error &&
      (error as { status?: unknown }).status === 404
    ) {
      const candidates = await options.indexSlugs().catch(() => [] as readonly string[]);
      throw notFoundError(request.slug, candidates, redactUrl(registry));
    }
    throw error;
  }
  const item = verifyItem(text, request.slug, undefined);
  cache.latest.set(request.slug, item);
  for (const [pinnedKey, pinnedItem] of cache.pinned) {
    if (pinnedItem.slug === request.slug && pinnedItem.version !== item.version) {
      warnings.push(
        `pinned ${pinnedKey} shadows latest ${request.slug}@${item.version}; using each where requested`,
      );
      break;
    }
  }
  return item;
}

export interface ResolvedClosure {
  /** Topologically ordered: dependencies before dependents. */
  items: RegistryItem[];
  /** Explicit slugs in argument order (for reporting). */
  explicit: string[];
  /** Non-fatal warnings (e.g. pinned-vs-latest shadowing). */
  warnings: string[];
}

/**
 * Resolve explicit slugs (argument order) plus transitive
 * registryDependencies (latest). Cycles report the full path (exit 4).
 */
export async function resolveClosure(
  explicit: ResolveRequest[],
  options: ResolverOptions,
): Promise<ResolvedClosure> {
  const cache: ResolveCache = { latest: new Map(), pinned: new Map() };
  const warnings: string[] = [];
  const ordered: RegistryItem[] = [];
  const visited = new Set<string>();
  const stack: string[] = [];

  async function visit(slug: string, version: string | undefined): Promise<void> {
    const identity = version === undefined ? slug : `${slug}@${version}`;
    if (visited.has(identity)) return;
    if (stack.includes(slug)) {
      const cycle = [...stack.slice(stack.indexOf(slug)), slug].join(" -> ");
      throw integrityError(
        `dependency cycle detected: ${cycle}`,
        "report the registry content; cycles are never valid",
      );
    }
    stack.push(slug);
    const item = await fetchVerified(options.registry, { slug, version }, options, cache, warnings);
    for (const dep of [...item.registryDependencies].sort()) {
      await visit(dep, undefined);
    }
    stack.pop();
    if (!visited.has(identity)) {
      visited.add(identity);
      if (!ordered.some((entry) => entry.slug === item.slug && entry.version === item.version)) {
        ordered.push(item);
      }
    }
    if (ordered.length > MAX_CLOSURE_ITEMS) {
      throw integrityError(
        `resolution closure exceeds ${String(MAX_CLOSURE_ITEMS)} items`,
        "the dependency graph is too large; report it",
      );
    }
  }

  for (const request of explicit) {
    await visit(request.slug, request.version);
  }
  assertClosureLimits(ordered);
  return {
    items: ordered,
    explicit: explicit.map((request) => request.slug),
    warnings: [...new Set(warnings)].sort(),
  };
}

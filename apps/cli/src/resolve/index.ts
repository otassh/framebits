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
  type FetchJsonOptions,
} from "../registry-client/index.js";
import { verifyItem } from "./verify.js";

export const MAX_CLOSURE_ITEMS = 100;

export interface ResolverOptions extends FetchJsonOptions {
  registry: string;
  indexSlugs: () => Promise<readonly string[]>;
}

export interface ResolveRequest {
  slug: string;
  version: string | undefined;
}

async function fetchVerified(
  registry: string,
  request: ResolveRequest,
  options: ResolverOptions,
  cache: Map<string, RegistryItem>,
): Promise<RegistryItem> {
  const key = request.version === undefined ? request.slug : `${request.slug}@${request.version}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
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
      throw notFoundError(request.slug, candidates, registry);
    }
    throw error;
  }
  const item = verifyItem(text, request.slug, request.version);
  cache.set(key, item);
  const latestKey = item.slug;
  if (!cache.has(latestKey)) cache.set(latestKey, item);
  return item;
}

export interface ResolvedClosure {
  /** Topologically ordered: dependencies before dependents. */
  items: RegistryItem[];
  /** Explicit slugs in argument order (for reporting). */
  explicit: string[];
}

/**
 * Resolve explicit slugs (argument order) plus transitive
 * registryDependencies (latest). Cycles report the full path (exit 4).
 */
export async function resolveClosure(
  explicit: ResolveRequest[],
  options: ResolverOptions,
): Promise<ResolvedClosure> {
  const cache = new Map<string, RegistryItem>();
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
    const item = await fetchVerified(options.registry, { slug, version }, options, cache);
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
  return { items: ordered, explicit: explicit.map((request) => request.slug) };
}

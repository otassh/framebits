export const GITHUB_REPO_URL = "https://github.com/otassh/framebits";
export const STARS_CACHE_KEY = "framebits:github-stars:v1";
export const STARS_REFRESH_MS = 5 * 60 * 1000;

export interface StarSnapshot {
  count: number;
  fetchedAt: number;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function readStarCache(raw: string | null, now = Date.now()): StarSnapshot | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      typeof value !== "object" ||
      value === null ||
      !("count" in value) ||
      !validCount(value.count) ||
      !("fetchedAt" in value) ||
      typeof value.fetchedAt !== "number" ||
      !Number.isFinite(value.fetchedAt) ||
      value.fetchedAt > now ||
      now - value.fetchedAt > 24 * 60 * 60 * 1000
    )
      return null;
    return { count: value.count, fetchedAt: value.fetchedAt };
  } catch {
    return null;
  }
}

export async function fetchStarCount(signal: AbortSignal): Promise<StarSnapshot> {
  const response = await fetch("https://api.github.com/repos/otassh/framebits", {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!response.ok) throw new Error("GitHub stars are unavailable");
  const data: unknown = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("full_name" in data) ||
    data.full_name !== "otassh/framebits" ||
    !("stargazers_count" in data) ||
    !validCount(data.stargazers_count)
  )
    throw new Error("Invalid GitHub repository response");
  return { count: data.stargazers_count, fetchedAt: Date.now() };
}

export function formatStarCount(count: number): string {
  return new Intl.NumberFormat("en", {
    notation: count >= 1000 ? "compact" : "standard",
    maximumFractionDigits: count >= 1000 ? 1 : 0,
  }).format(count);
}

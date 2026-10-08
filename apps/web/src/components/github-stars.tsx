import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchStarCount,
  formatStarCount,
  GITHUB_REPO_URL,
  readStarCache,
  STARS_CACHE_KEY,
  STARS_REFRESH_MS,
  type StarSnapshot,
} from "../lib/github-stars.js";

export function GitHubStars(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<StarSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let disposed = false;
    let cached: StarSnapshot | null = null;
    let controller: AbortController | null = null;
    let lastAttempt = 0;
    try {
      cached = readStarCache(localStorage.getItem(STARS_CACHE_KEY));
    } catch {
      /* Storage can be disabled; the live request still works. */
    }
    if (cached !== null) {
      setSnapshot(cached);
      setStatus("ready");
    }

    const refresh = async (): Promise<void> => {
      const now = Date.now();
      if (
        document.hidden ||
        controller !== null ||
        (cached !== null && now - cached.fetchedAt < STARS_REFRESH_MS) ||
        now - lastAttempt < STARS_REFRESH_MS
      )
        return;
      lastAttempt = now;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 8000);
      try {
        const result = await fetchStarCount(controller.signal);
        if (disposed) return;
        cached = result;
        setSnapshot(result);
        setStatus("ready");
        try {
          localStorage.setItem(STARS_CACHE_KEY, JSON.stringify(result));
        } catch {
          /* A storage failure should never hide a real count. */
        }
      } catch {
        if (!disposed) setStatus("unavailable");
      } finally {
        window.clearTimeout(timeout);
        controller = null;
      }
    };
    const onVisible = (): void => {
      void refresh();
    };
    void refresh();
    const interval = window.setInterval(onVisible, STARS_REFRESH_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const exactCount = snapshot?.count.toLocaleString("en") ?? "";
  const title =
    snapshot !== null
      ? `${exactCount} GitHub ${snapshot.count === 1 ? "star" : "stars"} · ${status === "unavailable" ? "Last checked" : "Updated"} ${new Date(snapshot.fetchedAt).toLocaleTimeString()} · View repository`
      : status === "loading"
        ? "Loading GitHub stars · View repository"
        : "Star count unavailable · View repository";

  return (
    <a
      className="github-stars"
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={`Framebits on GitHub${snapshot !== null ? `, ${exactCount} stars` : ""} (opens in a new tab)`}
    >
      <Star className="github-stars-icon" size={16} aria-hidden="true" />
      <span className="github-stars-label">GitHub</span>
      <span
        className={`github-stars-count${status === "loading" ? " is-loading" : ""}`}
        aria-hidden="true"
      >
        {snapshot !== null ? formatStarCount(snapshot.count) : status === "loading" ? "…" : "—"}
      </span>
    </a>
  );
}

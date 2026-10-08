#!/usr/bin/env node
/**
 * Changelog site renderer for the Framebits GitHub Pages changelog.
 *
 * Pure functions only (exported for unit tests): parses the Keep-a-Changelog
 * `CHANGELOG.md` subset the repo actually uses (headings, unordered lists
 * with wrapped continuation lines, blockquotes, links, inline code, bold)
 * and renders a single self-contained `index.html` (inline CSS + a tiny
 * client-side filter; no external requests, no dependencies).
 *
 * Anything unrecognized degrades to escaped text — markup can never inject
 * HTML.
 */

// Keep-a-Changelog section names we style as badges. Unknown `###` headings
// still render, with a neutral badge.
export const KNOWN_SECTIONS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];

const BADGE_CLASS = {
  Added: "badge-added",
  Changed: "badge-changed",
  Deprecated: "badge-deprecated",
  Removed: "badge-removed",
  Fixed: "badge-fixed",
  Security: "badge-security",
};

/**
 * @param {string} text
 * @returns {string} the text with `&<>"'` escaped.
 */
export function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render one logical line without links.
 *
 * @param {string} text already-escaped text with no code spans in it.
 * @returns {string} safe inline HTML.
 */
function renderRichText(text) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/**
 * Render inline markdown: `code`, [links](url) (http/https only), **bold**.
 * Code spans are split out first so markup inside them stays literal.
 * Everything else is escaped text.
 *
 * @param {string} text a single logical line (no newlines expected).
 * @returns {string} safe inline HTML.
 */
export function renderInline(text) {
  return escapeHtml(text)
    .split(/(`[^`]*`)/g)
    .map((part) => {
      if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
        return `<code>${part.slice(1, -1)}</code>`;
      }
      return renderRichText(part);
    })
    .join("");
}

/**
 * @param {string} version e.g. "0.1.0" or "Unreleased".
 * @returns {string} a URL-fragment-safe id, e.g. "v0-1-0".
 */
export function slugifyVersion(version) {
  const slug = version
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "version" : `v${slug}`;
}

/**
 * Parse the changelog subset into structured data.
 *
 * @param {string} markdown the raw CHANGELOG.md text (LF or CRLF).
 * @returns {{ title: string, intro: string[], releases: Array<{ version: string, id: string, date: string | null, unreleased: boolean, sections: Array<{ name: string, items: string[] }> }> }}
 */
export function parseChangelog(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  let title = "Changelog";
  const intro = [];
  const releases = [];
  let current = null;
  let section = null;
  let seenRelease = false;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      const parsed = line.slice(2).trim();
      if (parsed !== "") title = parsed;
      continue;
    }
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      const bracketed = /^\[([^\]]+)\](?:\s*-\s*(.+))?$/.exec(heading);
      const version = bracketed?.[1]?.trim() ?? heading;
      const date = bracketed?.[2]?.trim() ?? null;
      const unreleased = version.toLowerCase() === "unreleased";
      current = {
        version,
        id: unreleased ? "unreleased" : slugifyVersion(version),
        date,
        unreleased,
        sections: [],
      };
      releases.push(current);
      section = null;
      seenRelease = true;
      continue;
    }
    if (line.startsWith("### ") && current !== null) {
      section = { name: line.slice(4).trim(), items: [] };
      current.sections.push(section);
      continue;
    }
    if (line.startsWith("- ") && current !== null && section !== null) {
      section.items.push(line.slice(2).trim());
      continue;
    }
    if (
      (line.startsWith("  ") || line.startsWith("\t")) &&
      current !== null &&
      section !== null &&
      section.items.length > 0 &&
      line.trim() !== ""
    ) {
      const last = section.items.length - 1;
      const prev = section.items[last] ?? "";
      section.items[last] = `${prev} ${line.trim()}`;
      continue;
    }
    if (line.trim() === "") continue;
    if (!seenRelease) intro.push(line.trim());
    // Text inside a release but outside a section/list is ignored: the curated
    // changelog only documents changes as sectioned list items.
  }
  return { title, intro, releases };
}

/**
 * @param {{ title: string, intro: string[], releases: Array<{ version: string, id: string, date: string | null, unreleased: boolean, sections: Array<{ name: string, items: string[] }> }> }} data
 * @param {{ generatedAt: string }} meta
 * @returns {string} the complete `index.html` document.
 */
export function renderSite(data, meta) {
  const navItems = data.releases
    .map((release) => {
      const date =
        release.date === null ? "" : ` <span class="nav-date">${escapeHtml(release.date)}</span>`;
      return `<li><a href="#${release.id}">${escapeHtml(release.version)}${date}</a></li>`;
    })
    .join("\n");

  const sections = data.releases
    .map((release) => {
      const badge = release.unreleased
        ? `<span class="badge badge-unreleased">Unreleased</span>`
        : `<span class="badge badge-version">${escapeHtml(release.version)}</span>`;
      const date =
        release.date === null ? "" : `<time class="release-date">${escapeHtml(release.date)}</time>`;
      const body =
        release.sections.length === 0
          ? `<p class="empty">No documented changes yet.</p>`
          : release.sections
              .map((sec) => {
                const cls = BADGE_CLASS[sec.name] ?? "badge-neutral";
                const items = sec.items.map((item) => `<li>${renderInline(item)}</li>`).join("\n");
                return `<h3><span class="badge ${cls}">${escapeHtml(sec.name)}</span></h3>\n<ul>\n${items}\n</ul>`;
              })
              .join("\n");
      return `<section class="release" id="${release.id}" data-version="${escapeHtml(release.version.toLowerCase())}">\n<header class="release-head">${badge}${date}<a class="anchor" href="#${release.id}" aria-label="Link to this version">#</a></header>\n${body}\n</section>`;
    })
    .join("\n");

  const intro =
    data.intro.length === 0
      ? ""
      : data.intro
          .map((line) => {
            if (line.startsWith(">")) {
              return `<blockquote><p>${renderInline(line.replace(/^>\s?/, ""))}</p></blockquote>`;
            }
            return `<p>${renderInline(line)}</p>`;
          })
          .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="Framebits changelog — every release of the curated animated React components." />
<title>${escapeHtml(data.title)} — Framebits</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --bg-soft: #f6f8fa;
  --border: #d0d7de;
  --text: #1f2328;
  --muted: #59636e;
  --link: #0969da;
  --badge-text: #ffffff;
  --added: #1a7f37;
  --changed: #0969da;
  --deprecated: #9a6700;
  --removed: #cf222e;
  --fixed: #8250df;
  --security: #82071e;
  --neutral: #59636e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --bg-soft: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #9198a1;
    --link: #4493f8;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  line-height: 1.6;
}
a { color: var(--link); }
.site-header {
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}
.site-header .wrap {
  max-width: 1080px;
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  align-items: baseline;
}
.site-header h1 { font-size: 1.25rem; margin: 0; }
.site-header nav { margin-left: auto; display: flex; gap: 1rem; font-size: 0.9rem; }
.layout {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 2.5rem;
}
.sidebar { position: sticky; top: 0; align-self: start; padding-top: 2rem; max-height: 100vh; overflow: auto; }
.sidebar input {
  width: 100%;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
}
.sidebar ul { list-style: none; margin: 0; padding: 0; font-size: 0.9rem; }
.sidebar li a { display: block; padding: 0.25rem 0.5rem; border-radius: 6px; text-decoration: none; }
.sidebar li a:hover { background: var(--bg-soft); }
.nav-date { color: var(--muted); font-size: 0.8em; }
main { min-width: 0; padding-top: 2rem; }
.lede { color: var(--muted); }
blockquote { border-left: 0.25rem solid var(--border); margin: 1rem 0; padding: 0 1rem; color: var(--muted); }
.release { border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem 1.5rem; margin: 1.5rem 0; }
.release-head { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.release-date { color: var(--muted); font-size: 0.9rem; }
.anchor { text-decoration: none; opacity: 0; font-size: 0.9rem; }
.release:hover .anchor, .anchor:focus { opacity: 1; }
.badge {
  display: inline-block;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--badge-text);
  background: var(--neutral);
}
.badge-version { font-size: 1rem; }
.badge-unreleased { background: var(--deprecated); font-size: 1rem; }
.badge-added { background: var(--added); }
.badge-changed { background: var(--changed); }
.badge-deprecated { background: var(--deprecated); }
.badge-removed { background: var(--removed); }
.badge-fixed { background: var(--fixed); }
.badge-security { background: var(--security); }
.badge-neutral { background: var(--neutral); }
.empty { color: var(--muted); font-style: italic; }
.site-footer {
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.85rem;
}
.site-footer .wrap { max-width: 1080px; margin: 0 auto; padding: 1.5rem; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { position: static; max-height: none; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto; }
}
</style>
</head>
<body>
<header class="site-header"><div class="wrap">
<h1>Framebits Changelog</h1>
<nav><a href="https://github.com/otassh/framebits">Repository</a><a href="https://github.com/otassh/framebits/releases">GitHub Releases</a><a href="https://framebits.dev/r/index.json">Registry</a></nav>
</div></header>
<div class="layout">
<aside class="sidebar">
<input id="filter" type="search" placeholder="Filter versions…" aria-label="Filter versions" />
<ul id="version-list">
${navItems}
</ul>
</aside>
<main>
<p class="lede">Every release of <strong>@framebits/cli</strong> and the component registry. Versions follow <a href="https://semver.org/spec/v2.0.0.html">Semantic Versioning</a>; entries follow <a href="https://keepachangelog.com/en/1.1.0/">Keep a Changelog</a>.</p>
${intro}
${sections}
</main>
</div>
<footer class="site-footer"><div class="wrap">
<p>Generated ${escapeHtml(meta.generatedAt)} from <a href="https://github.com/otassh/framebits/blob/main/CHANGELOG.md">CHANGELOG.md</a>. GitHub Releases are authoritative for complete per-version notes.</p>
</div></footer>
<script>
(function () {
  var input = document.getElementById("filter");
  var list = document.getElementById("version-list");
  if (!input || !list) return;
  var links = Array.prototype.slice.call(list.getElementsByTagName("a"));
  var sections = Array.prototype.slice.call(document.getElementsByClassName("release"));
  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    links.forEach(function (a) {
      var show = q === "" || a.textContent.toLowerCase().indexOf(q) !== -1;
      a.parentElement.style.display = show ? "" : "none";
    });
    sections.forEach(function (s) {
      var hay = (s.getAttribute("data-version") || "") + " " + s.textContent.toLowerCase();
      s.style.display = q === "" || hay.indexOf(q) !== -1 ? "" : "none";
    });
  });
})();
</script>
</body>
</html>
`;
}

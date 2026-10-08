import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  escapeHtml,
  parseChangelog,
  renderInline,
  renderSite,
  slugifyVersion,
} from "../../../../scripts/changelog/render.mjs";
import { parseBuildArgs as parseBuildScriptArgs } from "../../../../scripts/changelog/build.mjs";

const SAMPLE = `# Changelog

All notable changes, documented here.

> A blockquote intro with a [link](https://example.com/docs).

## [Unreleased]

## [0.1.0] - 2026-10-06

### Added

- Initial release of \`framebits\` with **hash verification**.
- Wrapped item that continues
  on the next line with a [guide](https://example.com/guide).

### Fixed

- Nothing yet.
`;

describe("escapeHtml", () => {
  it("escapes tag-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

describe("renderInline", () => {
  it("renders code, links, and bold", () => {
    expect(renderInline("Use `framebits add` for **speed**: [docs](https://example.com/d)")).toBe(
      'Use <code>framebits add</code> for <strong>speed</strong>: <a href="https://example.com/d" rel="noopener">docs</a>',
    );
  });

  it("keeps markup inside code spans literal and escapes HTML", () => {
    expect(renderInline("`<b>**x**</b>` and <i>y</i>")).toBe(
      "<code>&lt;b&gt;**x**&lt;/b&gt;</code> and &lt;i&gt;y&lt;/i&gt;",
    );
  });

  it("rejects non-http(s) link targets", () => {
    expect(renderInline("[evil](javascript:alert(1))")).toBe("[evil](javascript:alert(1))");
  });
});

describe("slugifyVersion", () => {
  it("produces fragment-safe ids", () => {
    expect(slugifyVersion("0.1.0")).toBe("v0-1-0");
    expect(slugifyVersion("10.20.30")).toBe("v10-20-30");
    expect(slugifyVersion("")).toBe("version");
  });
});

describe("parseChangelog", () => {
  it("extracts title, intro, releases, sections, and wrapped lines", () => {
    const data = parseChangelog(SAMPLE);
    expect(data.title).toBe("Changelog");
    expect(data.intro).toHaveLength(2);
    expect(data.releases).toHaveLength(2);

    const [unreleased, first] = data.releases;
    expect(unreleased).toMatchObject({ version: "Unreleased", id: "unreleased", unreleased: true });
    expect(first).toMatchObject({ version: "0.1.0", id: "v0-1-0", date: "2026-10-06" });
    expect(first?.sections.map((s) => s.name)).toEqual(["Added", "Fixed"]);
    expect(first?.sections[0]?.items).toEqual([
      "Initial release of `framebits` with **hash verification**.",
      "Wrapped item that continues on the next line with a [guide](https://example.com/guide).",
    ]);
  });

  it("accepts CRLF input", () => {
    const data = parseChangelog("# T\r\n\r\n## [Unreleased]\r\n");
    expect(data.releases).toHaveLength(1);
  });
});

describe("renderSite", () => {
  it("renders nav anchors, badges, filter, and escaped content", () => {
    const html = renderSite(parseChangelog(SAMPLE), { generatedAt: "2026-10-08T00:00:00.000Z" });
    expect(html).toContain('id="unreleased"');
    expect(html).toContain('href="#v0-1-0"');
    expect(html).toContain('id="filter"');
    expect(html).toContain('<span class="badge badge-added">Added</span>');
    expect(html).toContain("<code>framebits</code>");
    expect(html).toContain("2026-10-08T00:00:00.000Z");
    expect(html).not.toContain("<script>alert");
  });
});

describe("parseBuildArgs", () => {
  it("defaults the output dir and accepts --out", () => {
    expect(parseBuildScriptArgs([])).toEqual({ outDir: join("dist", "changelog-site") });
    expect(parseBuildScriptArgs(["--out", "public"])).toEqual({ outDir: "public" });
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseBuildScriptArgs(["--bogus"])).toThrow(/Unknown argument/);
    expect(() => parseBuildScriptArgs(["--out"])).toThrow(/Missing value/);
  });
});

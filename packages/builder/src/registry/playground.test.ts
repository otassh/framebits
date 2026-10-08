import { describe, expect, it } from "vitest";
import type { Meta, Playground } from "@framebits/shared";
import type { DiscoveredItem } from "./discover.js";
import type { Diagnostic } from "./types.js";
import { buildTree } from "./emit.js";
import { loadRegistry } from "./index.js";
import { checkPlayground, extractDeclaredProps, parseItemPlayground } from "./playground.js";
import { makeRegistry, metaJson, rmRegistry, demoTsx } from "./test-helpers.js";

function item(dirRel: string, files: Record<string, string | undefined>): DiscoveredItem {
  return {
    dirRel,
    dirAbs: `/tmp/root/${dirRel}`,
    files: Object.entries(files)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([name, text]) => ({
        relPath: `${dirRel}/${name}`,
        absPath: `/tmp/root/${dirRel}/${name}`,
        size: text.length,
        text,
      })),
  };
}

function codes(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

const SOURCE = `export interface BaseProps {
  paused: boolean;
}

export interface WidgetProps extends BaseProps {
  text: string;
  duration?: number;
}

export function Widget({ text, duration = 6, theme = DEFAULT_THEME }: WidgetProps) {
  return null;
}

export const Helper = ({ on = false }: { on?: boolean }) => null;
`;

const PLAYGROUND: Playground = {
  controls: [
    { kind: "text", key: "text", label: "Text", default: "Hello" },
    { kind: "duration", key: "duration", label: "Duration", default: 6, min: 0.5, max: 30 },
    { kind: "boolean", key: "paused", label: "Paused", default: false },
  ],
};

describe("parseItemPlayground", () => {
  it("returns undefined when absent, parses when present", () => {
    const diagnostics: Diagnostic[] = [];
    expect(
      parseItemPlayground(item("components/buttons/ok", { "meta.json": "{}" }), diagnostics),
    ).toBeUndefined();
    expect(
      parseItemPlayground(
        item("components/buttons/ok", {
          "meta.json": "{}",
          "playground.json": JSON.stringify(PLAYGROUND),
        }),
        diagnostics,
      ),
    ).toEqual(PLAYGROUND);
    expect(diagnostics).toEqual([]);
  });

  it("reports PLAYGROUND_INVALID for bad JSON and bad schemas", () => {
    for (const content of ["{ nope", JSON.stringify({ controls: [] })]) {
      const diagnostics: Diagnostic[] = [];
      expect(
        parseItemPlayground(
          item("components/buttons/ok", { "meta.json": "{}", "playground.json": content }),
          diagnostics,
        ),
      ).toBeUndefined();
      expect(codes(diagnostics)).toEqual(["PLAYGROUND_INVALID"]);
    }
  });
});

describe("extractDeclaredProps", () => {
  it("collects interface members, same-file extends, and destructured params", () => {
    const declared = extractDeclaredProps(SOURCE);
    expect([...declared.names].sort()).toEqual(["duration", "on", "paused", "text", "theme"]);
    expect(declared.defaults.get("duration")).toBe(6);
    // Non-literal initializers are not determinable and stay absent.
    expect(declared.defaults.has("theme")).toBe(false);
  });

  it("supports type-literal Props aliases and ignores unexported functions", () => {
    const declared = extractDeclaredProps(`export type CardProps = {
  title: string;
};

function Hidden({ secret = 1 }: { secret?: number }) {
  return null;
}
`);
    expect([...declared.names].sort()).toEqual(["title"]);
    expect(declared.defaults.size).toBe(0);
  });
});

describe("checkPlayground", () => {
  const meta = { slug: "ok-widget", type: "component" } as Meta;

  function check(sourceText: string | undefined, playground: Playground | undefined) {
    const diagnostics: Diagnostic[] = [];
    const files: Record<string, string | undefined> = {
      "meta.json": "{}",
      "ok-widget.tsx": sourceText,
      "playground.json": playground === undefined ? undefined : JSON.stringify(playground),
    };
    checkPlayground(item("components/buttons/ok-widget", files), meta, playground, diagnostics);
    return diagnostics;
  }

  it("accepts keys that name declared props", () => {
    expect(check(SOURCE, PLAYGROUND)).toEqual([]);
  });

  it("skips missing playgrounds, non-components, and missing sources", () => {
    expect(check(SOURCE, undefined)).toEqual([]);
    const libMeta = { slug: "ok", type: "lib" } as Meta;
    const diagnostics: Diagnostic[] = [];
    checkPlayground(item("lib/ok", { "meta.json": "{}" }), libMeta, PLAYGROUND, diagnostics);
    expect(diagnostics).toEqual([]);
    expect(check(undefined, PLAYGROUND)).toEqual([]);
  });

  it("reports PLAYGROUND_UNKNOWN_PROP for undeclared keys", () => {
    const diagnostics = check(SOURCE, {
      controls: [{ kind: "number", key: "druation", label: "Duration", default: 1 }],
    });
    expect(codes(diagnostics)).toEqual(["PLAYGROUND_UNKNOWN_PROP"]);
    expect(diagnostics[0]?.message).toContain('"druation"');
  });

  it("warns PLAYGROUND_DEFAULT_MISMATCH only when both sides are known", () => {
    const mismatch = check(SOURCE, {
      controls: [{ kind: "duration", key: "duration", label: "Duration", default: 3 }],
    });
    expect(codes(mismatch)).toEqual(["PLAYGROUND_DEFAULT_MISMATCH"]);

    const dynamic = check(SOURCE, {
      controls: [{ kind: "text", key: "theme", label: "Theme", default: "dark" }],
    });
    expect(dynamic).toEqual([]);
  });
});

describe("playground end to end", () => {
  const dir = "components/buttons/ok-widget";
  const source = `export interface OkWidgetProps {
  text: string;
  duration?: number;
  paused?: boolean;
}

export function OkWidget({ text, duration = 6, paused = false }: OkWidgetProps) {
  return null;
}
`;

  async function fixture(extra: Record<string, string> = {}) {
    return makeRegistry({
      [`${dir}/meta.json`]: metaJson("ok-widget"),
      [`${dir}/ok-widget.tsx`]: source,
      [`${dir}/demo.tsx`]: demoTsx("ok-widget"),
      ...extra,
    });
  }

  it("models the playground, keeps the hash, and emits the sidecar", async () => {
    const root = await fixture({ [`${dir}/playground.json`]: JSON.stringify(PLAYGROUND) });
    try {
      const loaded = await loadRegistry({ registryRoot: root, skipTypecheck: true });
      expect(loaded.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(loaded.items).toHaveLength(1);
      expect(loaded.items[0]?.playground).toEqual(PLAYGROUND);

      const without = await loadRegistry({
        registryRoot: await fixture(),
        skipTypecheck: true,
      });
      // Playground config is website UX, not installed code: it must not move the hash.
      expect(loaded.items[0]?.hash).toBe(without.items[0]?.hash);

      const tree = buildTree(
        loaded.items,
        [
          {
            slug: "ok-widget",
            version: "1.0.0",
            previousVersion: undefined,
            hash: loaded.items[0]?.hash ?? "",
            change: "new" as const,
          },
        ],
        "abc",
        "2026-10-08T00:00:00.000Z",
        "0.0.0-test",
      );
      const sidecar = tree.files.get("playground/ok-widget.json");
      expect(sidecar).toBeDefined();
      expect(JSON.parse(sidecar as string)).toEqual(PLAYGROUND);
      expect(tree.files.has("schema/playground.json")).toBe(true);
      // The hashed install payload carries no playground field (old CLIs stay compatible).
      expect(JSON.parse(tree.files.get("r/ok-widget.json") as string)).not.toHaveProperty("playground");
    } finally {
      await rmRegistry(root);
    }
  });

  it("blocks modeling on unknown control keys and allows the layout file", async () => {
    const root = await fixture({
      [`${dir}/playground.json`]: JSON.stringify({
        controls: [{ kind: "number", key: "nope", label: "Nope", default: 1 }],
      }),
    });
    try {
      const loaded = await loadRegistry({ registryRoot: root, skipTypecheck: true });
      expect(codes(loaded.diagnostics)).toContain("PLAYGROUND_UNKNOWN_PROP");
      expect(loaded.items).toHaveLength(0);
    } finally {
      await rmRegistry(root);
    }
  });
});

import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonical.js";
import {
  computeItemHash,
  normalizeContent,
  normalizeItemForHash,
  verifyItemHash,
  type ItemHashInput,
} from "./hash.js";
import { RegistryItemSchema } from "./registry-item.js";
import { validItem } from "./registry-item.test.js";

const baseInput: ItemHashInput = {
  type: "component",
  dependencies: { motion: "^11.0.0" },
  registryDependencies: ["cn"],
  files: [
    {
      path: "components/ui/aurora-text.tsx",
      content: "export const x = 1;\n",
      type: "component",
    },
  ],
};

describe("normalizeContent", () => {
  it("leaves clean content alone", () => {
    expect(normalizeContent("a\nb\n")).toBe("a\nb\n");
  });

  it("normalizes CRLF and CR", () => {
    expect(normalizeContent("a\r\nb\r\n")).toBe("a\nb\n");
    expect(normalizeContent("a\rb\r")).toBe("a\nb\n");
  });

  it("strips a leading BOM", () => {
    expect(normalizeContent("\uFEFFconst x = 1;\n")).toBe("const x = 1;\n");
  });

  it("ensures a trailing newline but keeps empty empty", () => {
    expect(normalizeContent("no-newline")).toBe("no-newline\n");
    expect(normalizeContent("")).toBe("");
  });
});

describe("normalizeItemForHash", () => {
  it("materializes the variant default", () => {
    expect(normalizeItemForHash(baseInput).files[0]?.variant).toBe("ts-tw");
  });

  it("sorts files by path and keeps content attached", () => {
    const normalized = normalizeItemForHash({
      ...baseInput,
      files: [
        { path: "b.ts", content: "b\n", type: "component" },
        { path: "a.ts", content: "a\n", type: "component" },
      ],
    });
    expect(normalized.files.map((file) => file.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("omits absent optionals instead of nulling them", () => {
    const normalized = normalizeItemForHash(baseInput);
    expect("tailwind" in normalized).toBe(false);
    expect("cssVars" in normalized).toBe(false);
  });
});

describe("computeItemHash", () => {
  it("is deterministic", () => {
    expect(computeItemHash(baseInput)).toBe(computeItemHash(baseInput));
  });

  it('has the "sha256:<hex>" format', () => {
    expect(computeItemHash(baseInput)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is key-order independent (dependencies object order)", () => {
    const a: ItemHashInput = {
      ...baseInput,
      dependencies: { motion: "^11.0.0", clsx: "^2.0.0" },
    };
    const b: ItemHashInput = {
      ...baseInput,
      dependencies: { clsx: "^2.0.0", motion: "^11.0.0" },
    };
    expect(computeItemHash(a)).toBe(computeItemHash(b));
  });

  it("is input file-order independent", () => {
    const a: ItemHashInput = {
      ...baseInput,
      files: [
        { path: "b.ts", content: "b\n", type: "component" },
        { path: "a.ts", content: "a\n", type: "component" },
      ],
    };
    const b: ItemHashInput = {
      ...baseInput,
      files: [
        { path: "a.ts", content: "a\n", type: "component" },
        { path: "b.ts", content: "b\n", type: "component" },
      ],
    };
    expect(computeItemHash(a)).toBe(computeItemHash(b));
  });

  it("is registryDependencies-order independent", () => {
    const a: ItemHashInput = { ...baseInput, registryDependencies: ["cn", "motion-x"] };
    const b: ItemHashInput = { ...baseInput, registryDependencies: ["motion-x", "cn"] };
    expect(computeItemHash(a)).toBe(computeItemHash(b));
  });

  it("treats explicit variant default like an absent one", () => {
    const explicit: ItemHashInput = {
      ...baseInput,
      files: [{ path: "a.ts", content: "a\n", type: "component", variant: "ts-tw" }],
    };
    const absent: ItemHashInput = {
      ...baseInput,
      files: [{ path: "a.ts", content: "a\n", type: "component" }],
    };
    expect(computeItemHash(explicit)).toBe(computeItemHash(absent));
  });

  it("treats CRLF/BOM/missing-newline content like normalized content", () => {
    const variants = ["a\n", "a\r\n", "\uFEFFa\n", "a"];
    const hashes = new Set(variants.map((content) => computeItemHash({ ...baseInput, files: [{ path: "a.ts", content, type: "component" }] })));
    expect(hashes.size).toBe(1);
  });

  const includedFieldCases: Array<{ name: string; item: ItemHashInput }> = [
    { name: "type", item: { ...baseInput, type: "lib" } },
    { name: "dependency version", item: { ...baseInput, dependencies: { motion: "^12.0.0" } } },
    { name: "added registryDependency", item: { ...baseInput, registryDependencies: ["cn", "extra"] } },
    {
      name: "file content",
      item: {
        ...baseInput,
        files: [{ path: "a.ts", content: "CHANGED\n", type: "component" }],
      },
    },
    {
      name: "file path",
      item: {
        ...baseInput,
        files: [{ path: "moved.ts", content: "a\n", type: "component" }],
      },
    },
    {
      name: "variant",
      item: {
        ...baseInput,
        files: [{ path: "a.ts", content: "a\n", type: "component", variant: "js" }],
      },
    },
    { name: "tailwind", item: { ...baseInput, tailwind: { keyframes: { k: "v" } } } },
    { name: "cssVars", item: { ...baseInput, cssVars: { light: { "--x": "1" } } } },
  ];
  it.each(includedFieldCases)("changes when included field changes ($name)", ({ item }) => {
    expect(computeItemHash(item)).not.toBe(computeItemHash(baseInput));
  });

  it("ignores excluded fields (version, hash, title)", () => {
    const one = RegistryItemSchema.parse({ ...validItem, version: "1.0.0" });
    const two = RegistryItemSchema.parse({
      ...validItem,
      version: "1.0.1",
      title: "Renamed",
      hash: `sha256:${"f".repeat(64)}`,
    });
    expect(computeItemHash(one)).toBe(computeItemHash(two));
  });
});

/**
 * GOLDEN VECTORS — hardcoded input -> canonical form -> hash triples that lock the algorithm.
 *
 * Derivation (independent of the test assertions): each canonical string below was
 * eyeball-verified field-by-field against the spec (sorted keys at every level,
 * LF-normalized content, materialized variant, absent optionals omitted), written to
 * exact bytes, and hashed with Windows certutil (independent SHA-256 implementation).
 * The `simple` vector additionally matched a hand-built node:crypto hash. All three
 * external hashes equal the hardcoded expectations. Changing any hash later must be
 * a conscious schemaVersion bump (see docs/CONTRACTS.md "Hash algorithm versioning").
 */
describe("golden vectors", () => {
  const simple: ItemHashInput = {
    type: "component",
    dependencies: { motion: "^11.0.0" },
    registryDependencies: ["cn"],
    files: [
      {
        path: "components/ui/aurora-text.tsx",
        content: "export function AuroraText() {\n  return null;\n}\n",
        type: "component",
      },
    ],
  };
  const SIMPLE_CANONICAL =
    '{"dependencies":{"motion":"^11.0.0"},"files":[{"content":"export function AuroraText() {\\n  return null;\\n}\\n","path":"components/ui/aurora-text.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":["cn"],"type":"component"}';

  const unicode: ItemHashInput = {
    type: "component",
    dependencies: {},
    registryDependencies: [],
    files: [
      {
        path: "components/ui/grusse.tsx",
        content: "export const greeting = \"Grüße ☃ — café\";\n",
        type: "component",
        variant: "ts-tw",
      },
    ],
  };
  const UNICODE_CANONICAL =
    '{"dependencies":{},"files":[{"content":"export const greeting = \\"Grüße ☃ — café\\";\\n","path":"components/ui/grusse.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":[],"type":"component"}';

  const styled: ItemHashInput = {
    type: "component",
    dependencies: { motion: "^11.0.0", clsx: "^2.0.0" },
    registryDependencies: ["cn"],
    files: [
      {
        path: "components/ui/fade-in.tsx",
        content: "export function FadeIn() {\n  return null;\n}\n",
        type: "component",
      },
    ],
    tailwind: {
      keyframes: { fade: { from: { opacity: "0" }, to: { opacity: "1" } } },
      animation: { fade: "fade 1s ease" },
    },
    cssVars: { light: { "--fade": "red" }, dark: { "--fade": "blue" } },
  };
  const STYLED_CANONICAL =
    '{"cssVars":{"dark":{"--fade":"blue"},"light":{"--fade":"red"}},"dependencies":{"clsx":"^2.0.0","motion":"^11.0.0"},"files":[{"content":"export function FadeIn() {\\n  return null;\\n}\\n","path":"components/ui/fade-in.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":["cn"],"tailwind":{"animation":{"fade":"fade 1s ease"},"keyframes":{"fade":{"from":{"opacity":"0"},"to":{"opacity":"1"}}}},"type":"component"}';

  const grin = String.fromCodePoint(0x1f600);
  const fullwidthTilde = String.fromCharCode(0xff5e);
  const astral: ItemHashInput = {
    type: "component",
    dependencies: {},
    registryDependencies: [],
    files: [
      {
        path: "components/ui/emoji.tsx",
        content: `export const smile = "${grin}";\n`,
        type: "component",
      },
    ],
    tailwind: { keyframes: { [fullwidthTilde]: { from: { opacity: "0" } } } },
  };
  const ASTRAL_CANONICAL =
    '{"dependencies":{},"files":[{"content":"export const smile = \\"😀\\";\\n","path":"components/ui/emoji.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":[],"tailwind":{"keyframes":{"～":{"from":{"opacity":"0"}}}},"type":"component"}';

  const goldenCases: Array<{ name: string; input: ItemHashInput; canonical: string; hash: string }> = [
    { name: "simple", input: simple, canonical: SIMPLE_CANONICAL, hash: "sha256:d0881be01768b5f4bed82053199810ede99cd512d25d52707e37ab9d76af45d7" },
    { name: "unicode", input: unicode, canonical: UNICODE_CANONICAL, hash: "sha256:257aa23878409971523312b58bf0ffb3061874893b17f36e50b3974a2e872322" },
    { name: "styled", input: styled, canonical: STYLED_CANONICAL, hash: "sha256:65c0b9606e0752d3313c981771da3aa38fef2d12e3f2110bf271d6e6354e8f12" },
    { name: "astral", input: astral, canonical: ASTRAL_CANONICAL, hash: "sha256:4d948857df1c7b61ff28924547c7427a2f4f7809ce861169d9a00b740d857424" },
  ];
  it.each(goldenCases)("$name vector: canonical form and hash", ({ input, canonical, hash }) => {
    expect(canonicalize(normalizeItemForHash(input))).toBe(canonical);
    expect(computeItemHash(input)).toBe(hash);
  });
});

describe("verifyItemHash", () => {
  it("accepts the true hash", () => {
    expect(verifyItemHash(baseInput, computeItemHash(baseInput))).toBe(true);
  });

  it("rejects tampered content and wrong hashes", () => {
    const good = computeItemHash(baseInput);
    expect(verifyItemHash({ ...baseInput, type: "lib" }, good)).toBe(false);
    expect(verifyItemHash(baseInput, `sha256:${"0".repeat(64)}`)).toBe(false);
    expect(verifyItemHash(baseInput, "not-a-hash")).toBe(false);
    expect(verifyItemHash(baseInput, good.toUpperCase())).toBe(false);
  });
});

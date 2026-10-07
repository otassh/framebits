import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonical.js";
import {
  MAX_FILE_CONTENT_BYTES,
  MAX_TOTAL_CONTENT_BYTES,
  PAYLOAD_VERSION,
  computeItemHash,
  exceedsContentLimits,
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

  it("strips ALL leading BOMs, not just one", () => {
    expect(normalizeContent("\uFEFF\uFEFF\uFEFFconst x = 1;\n")).toBe("const x = 1;\n");
  });

  it("keeps a BOM past the leading run (only the prefix is stripped)", () => {
    expect(normalizeContent("a\uFEFFb\n")).toBe("a\uFEFFb\n");
  });

  it("normalizes NEL, LS, and PS to LF", () => {
    expect(normalizeContent("a\u0085b\u2028c\u2029d\n")).toBe("a\nb\nc\nd\n");
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
 * eyeball-verified field-by-field against the spec (schemaVersion first-block key,
 * sorted keys at every level, LF-normalized content, materialized variant, absent
 * optionals omitted), produced by the implementation, and hashed with node:crypto.
 * Changing any hash later must be a conscious PAYLOAD_VERSION bump with a legacy
 * verifier (see `verifyItemHash`): the `legacy fallback` test below pins that old
 * blobs keep verifying.
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
    '{"dependencies":{"motion":"^11.0.0"},"files":[{"content":"export function AuroraText() {\\n  return null;\\n}\\n","path":"components/ui/aurora-text.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":["cn"],"schemaVersion":1,"type":"component"}';

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
    '{"dependencies":{},"files":[{"content":"export const greeting = \\"Grüße ☃ — café\\";\\n","path":"components/ui/grusse.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":[],"schemaVersion":1,"type":"component"}';

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
    '{"cssVars":{"dark":{"--fade":"blue"},"light":{"--fade":"red"}},"dependencies":{"clsx":"^2.0.0","motion":"^11.0.0"},"files":[{"content":"export function FadeIn() {\\n  return null;\\n}\\n","path":"components/ui/fade-in.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":["cn"],"schemaVersion":1,"tailwind":{"animation":{"fade":"fade 1s ease"},"keyframes":{"fade":{"from":{"opacity":"0"},"to":{"opacity":"1"}}}},"type":"component"}';

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
    '{"dependencies":{},"files":[{"content":"export const smile = \\"😀\\";\\n","path":"components/ui/emoji.tsx","type":"component","variant":"ts-tw"}],"registryDependencies":[],"schemaVersion":1,"tailwind":{"keyframes":{"～":{"from":{"opacity":"0"}}}},"type":"component"}';

  const goldenCases: Array<{ name: string; input: ItemHashInput; canonical: string; hash: string }> = [
    { name: "simple", input: simple, canonical: SIMPLE_CANONICAL, hash: "sha256:38ce73a4c973f3e7ca327879b27471852d44abf1a4ba81548d97674128cd8fd9" },
    { name: "unicode", input: unicode, canonical: UNICODE_CANONICAL, hash: "sha256:073cbaa84b2b7685da0531eec4bf275ffd7a441c675ecb85150be443a34c8ef6" },
    { name: "styled", input: styled, canonical: STYLED_CANONICAL, hash: "sha256:1a31accdc75a81081449ba62b9eb2caf30283864cd7a7b1159368d7464866acc" },
    { name: "astral", input: astral, canonical: ASTRAL_CANONICAL, hash: "sha256:85015892c03d7c097c564ca4fd2528ccba57bcb1a06223f6cf01aaa7a716ad00" },
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

  it("embeds PAYLOAD_VERSION as schemaVersion in the normalized payload", () => {
    expect(PAYLOAD_VERSION).toBe(1);
    expect(normalizeItemForHash(baseInput).schemaVersion).toBe(PAYLOAD_VERSION);
  });

  it("still verifies blobs hashed before schemaVersion existed (legacy fallback)", () => {
    // Pre-hardening golden hash of the `simple` vector (payload without
    // schemaVersion). Must keep verifying after the payload change.
    const legacyInput: ItemHashInput = {
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
    const legacyHash =
      "sha256:d0881be01768b5f4bed82053199810ede99cd512d25d52707e37ab9d76af45d7";
    expect(computeItemHash(legacyInput)).not.toBe(legacyHash);
    expect(verifyItemHash(legacyInput, legacyHash)).toBe(true);
  });

  it("returns false without hashing when content exceeds the size caps", () => {
    const oversizeFile = {
      path: "big.ts",
      content: "x\n".padStart(MAX_FILE_CONTENT_BYTES + 8, "x"),
      type: "component",
    } as const;
    const oversize: ItemHashInput = { ...baseInput, files: [oversizeFile] };
    expect(exceedsContentLimits(oversize)).toBe(true);
    expect(verifyItemHash(oversize, computeItemHash(baseInput))).toBe(false);

    const each = "y\n".repeat(400_000);
    const total: ItemHashInput = {
      ...baseInput,
      files: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
        path: `f${String(n)}.ts`,
        content: each,
        type: "component" as const,
      })),
    };
    expect(each.length).toBeLessThan(MAX_FILE_CONTENT_BYTES);
    expect(each.length * 8).toBeGreaterThan(MAX_TOTAL_CONTENT_BYTES);
    expect(exceedsContentLimits(total)).toBe(true);
    expect(verifyItemHash(total, computeItemHash(baseInput))).toBe(false);
  });

  it("accepts content within the size caps", () => {
    expect(exceedsContentLimits(baseInput)).toBe(false);
    expect(verifyItemHash(baseInput, computeItemHash(baseInput))).toBe(true);
  });
});

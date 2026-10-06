import { describe, expect, it } from "vitest";
import { DescriptionSchema, MetaSchema, SlugSchema, TagSchema, TitleSchema } from "./meta.js";

export const validMeta = {
  slug: "aurora-text",
  title: "Aurora Text",
  type: "component",
  category: "text-animations",
  tags: ["gradient", "text"],
  description: "Animated aurora gradient text.",
  dependencies: { motion: "^11.0.0" },
  registryDependencies: ["cn"],
  difficulty: "easy",
  performance: "light",
  status: "published",
  addedAt: "2026-10-04",
} as const;

describe("SlugSchema", () => {
  it.each(["ab", "aurora-text", "a1-b2-c3", "x".repeat(64)])("accepts %s", (slug) => {
    expect(SlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    ["too short", "a"],
    ["too long", "x".repeat(65)],
    ["empty", ""],
    ["uppercase", "Aurora"],
    ["underscore", "a_b"],
    ["double hyphen", "a--b"],
    ["leading hyphen", "-ab"],
    ["trailing hyphen", "ab-"],
    ["space", "a b"],
    ["dot", "a.b"],
    ["slash", "a/b"],
  ])("rejects %s", (_rule, slug) => {
    expect(SlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe("TitleSchema", () => {
  it("accepts normal titles and trims", () => {
    expect(TitleSchema.safeParse("Aurora Text").success).toBe(true);
    expect(TitleSchema.parse("  Padded  ")).toBe("Padded");
  });

  it("rejects empty and overlong titles", () => {
    expect(TitleSchema.safeParse("").success).toBe(false);
    expect(TitleSchema.safeParse("   ").success).toBe(false);
    expect(TitleSchema.safeParse("x".repeat(121)).success).toBe(false);
    expect(TitleSchema.safeParse("x".repeat(120)).success).toBe(true);
  });
});

describe("TagSchema", () => {
  it("accepts kebab tags", () => {
    expect(TagSchema.safeParse("gradient").success).toBe(true);
  });

  it("rejects bad tags", () => {
    expect(TagSchema.safeParse("").success).toBe(false);
    expect(TagSchema.safeParse("Has Space").success).toBe(false);
    expect(TagSchema.safeParse("x".repeat(49)).success).toBe(false);
  });
});

describe("DescriptionSchema", () => {
  it("accepts 10-200 chars", () => {
    expect(DescriptionSchema.safeParse("x".repeat(10)).success).toBe(true);
    expect(DescriptionSchema.safeParse("x".repeat(200)).success).toBe(true);
  });

  it("rejects 9 and 201 chars", () => {
    expect(DescriptionSchema.safeParse("x".repeat(9)).success).toBe(false);
    expect(DescriptionSchema.safeParse("x".repeat(201)).success).toBe(false);
  });
});

describe("MetaSchema", () => {
  it("accepts the master-prompt example", () => {
    const result = MetaSchema.safeParse({ ...validMeta });
    expect(result.success).toBe(true);
  });

  it("applies defaults (type, dependencies, registryDependencies)", () => {
    const withoutDefaults: Record<string, unknown> = { ...validMeta };
    delete withoutDefaults["type"];
    delete withoutDefaults["dependencies"];
    delete withoutDefaults["registryDependencies"];
    const parsed = MetaSchema.parse(withoutDefaults);
    expect(parsed.type).toBe("component");
    expect(parsed.dependencies).toEqual({});
    expect(parsed.registryDependencies).toEqual([]);
  });

  it("accepts lib/hook types and an empty tag/dependency set", () => {
    expect(
      MetaSchema.safeParse({
        ...validMeta,
        type: "lib",
        tags: [],
        dependencies: {},
        registryDependencies: [],
        bump: "minor",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys (.strict())", () => {
    expect(MetaSchema.safeParse({ ...validMeta, extra: 1 }).success).toBe(false);
  });

  it.each([
    ["bad slug", { slug: "Bad_Slug" }],
    ["unknown category", { category: "nope" }],
    ["non-kebab category", { category: "TextAnims" }],
    ["too many tags", { tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }],
    ["duplicate tags", { tags: ["x", "x"] }],
    ["bad tag", { tags: ["ok", "Has Space"] }],
    ["short description", { description: "short" }],
    ["unknown dependency", { dependencies: { lodash: "^4.0.0" } }],
    ["bad semver range", { dependencies: { motion: "banana" } }],
    ["unbounded dependency range", { dependencies: { motion: "*" } }],
    ["open-ended dependency range", { dependencies: { motion: ">=0.0.0" } }],
    ["dist-tag dependency range", { dependencies: { motion: "latest" } }],
    ["url dependency range", { dependencies: { motion: "https://example.com/motion.tgz" } }],
    ["git dependency range", { dependencies: { motion: "git+https://github.com/user/repo.git" } }],
    ["file dependency range", { dependencies: { motion: "file:../foo" } }],
    ["workspace dependency range", { dependencies: { motion: "workspace:*" } }],
    ["npm-alias dependency range", { dependencies: { motion: "npm:motion@^14.0.0" } }],
    ["unknown registryDependency type", { registryDependencies: ["ok", 7] }],
    ["self reference", { registryDependencies: ["aurora-text"] }],
    ["duplicate registryDependencies", { registryDependencies: ["cn", "cn"] }],
    ["bad difficulty", { difficulty: "trivial" }],
    ["bad performance", { performance: "feather" }],
    ["bad status", { status: "archived" }],
    ["bad date", { addedAt: "04-10-2026" }],
    ["impossible date", { addedAt: "2026-13-01" }],
    ["bad bump", { bump: "patch" }],
    ["missing title", { title: undefined }],
  ])("rejects %s", (_rule, override) => {
    expect(MetaSchema.safeParse({ ...validMeta, ...override }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { MetaSchema } from "@framebits/shared";
import {
  MOTION_RANGE,
  buildMeta,
  defaultDescription,
  resolveScaffoldRequest,
  serializeMeta,
} from "./request.js";

describe("resolveScaffoldRequest", () => {
  it("resolves a full component request", () => {
    expect(
      resolveScaffoldRequest({
        slug: "aurora-text",
        category: "text-animations",
        title: "Custom",
        description: "A custom description here.",
        type: "component",
      }),
    ).toEqual({
      slug: "aurora-text",
      title: "Custom",
      description: "A custom description here.",
      type: "component",
      category: "text-animations",
    });
  });

  it("defaults type to component and requires its category", () => {
    expect(() => resolveScaffoldRequest({ slug: "aurora-text" })).toThrow(
      /missing required --category/,
    );
  });

  it("defaults category to utilities for lib and hook", () => {
    expect(resolveScaffoldRequest({ slug: "cn", type: "lib" }).category).toBe("utilities");
    expect(resolveScaffoldRequest({ slug: "use-x", type: "hook" }).category).toBe("utilities");
  });

  it("defaults title and description", () => {
    const resolved = resolveScaffoldRequest({ slug: "aurora-text", category: "buttons" });
    expect(resolved.title).toBe("Aurora Text");
    expect(resolved.description).toContain("Aurora Text");
  });

  it("rejects bad slugs, types, and categories", () => {
    expect(() => resolveScaffoldRequest({ slug: "Bad", category: "buttons" })).toThrow(/invalid slug/);
    expect(() =>
      resolveScaffoldRequest({ slug: "ok-slug", category: "buttons", type: "widget" }),
    ).toThrow(/invalid type/);
    expect(() => resolveScaffoldRequest({ slug: "ok-slug", category: "nope" })).toThrow(
      /unknown category/,
    );
  });

  it("prints valid categories on category error", () => {
    expect(() => resolveScaffoldRequest({ slug: "ok-slug", category: "nope" })).toThrow(
      /text-animations/,
    );
  });
});

describe("defaultDescription", () => {
  it("satisfies the schema length rule and signals a placeholder", () => {
    const text = defaultDescription("Aurora Text");
    expect(text.length).toBeGreaterThanOrEqual(10);
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text).toContain("TODO");
  });
});

describe("buildMeta + serializeMeta", () => {
  it("builds a schema-valid component meta with the motion dependency", () => {
    const meta = buildMeta(
      resolveScaffoldRequest({ slug: "aurora-text", category: "text-animations" }),
      "2026-10-05",
    );
    expect(MetaSchema.safeParse(meta).success).toBe(true);
    expect(meta.status).toBe("draft");
    expect(meta.addedAt).toBe("2026-10-05");
    expect(meta.dependencies).toEqual({ motion: MOTION_RANGE });
    expect(meta.tags).toEqual([]);
    expect(meta.registryDependencies).toEqual([]);
  });

  it("builds lib meta without dependencies", () => {
    const meta = buildMeta(resolveScaffoldRequest({ slug: "cn", type: "lib" }), "2026-10-05");
    expect(meta.type).toBe("lib");
    expect(meta.category).toBe("utilities");
    expect(meta.dependencies).toEqual({});
  });

  it("serializes with Section 4.1 key order, 2 spaces, LF, trailing newline", () => {
    const meta = buildMeta(
      resolveScaffoldRequest({ slug: "aurora-text", category: "text-animations" }),
      "2026-10-05",
    );
    const text = serializeMeta(meta);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.includes("\r")).toBe(false);
    const parsed: unknown = JSON.parse(text);
    expect(typeof parsed === "object" && parsed !== null).toBe(true);
    if (typeof parsed === "object" && parsed !== null) {
      expect(Object.keys(parsed)).toEqual([
        "slug",
        "title",
        "type",
        "category",
        "tags",
        "description",
        "dependencies",
        "registryDependencies",
        "difficulty",
        "performance",
        "status",
        "addedAt",
      ]);
    }
  });
});

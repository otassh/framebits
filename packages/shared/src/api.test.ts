import { describe, expect, it } from "vitest";
import {
  ErrorResponseSchema,
  EventsRequestSchema,
  LikeResponseSchema,
  LikesCountSchema,
  MAX_EVENTS_PER_REQUEST,
  NewsletterRequestSchema,
  PopularQuerySchema,
  SearchQuerySchema,
} from "./api.js";

function events(count: number): Array<{ type: "install"; slug: string }> {
  return Array.from({ length: count }, () => ({ type: "install" as const, slug: "aurora-text" }));
}

describe("EventsRequestSchema", () => {
  it("accepts install and view events with optional source", () => {
    expect(
      EventsRequestSchema.safeParse({
        events: [
          { type: "install", slug: "aurora-text", source: "cli" },
          { type: "view", slug: "aurora-text" },
        ],
      }).success,
    ).toBe(true);
  });

  it(`accepts exactly ${String(MAX_EVENTS_PER_REQUEST)} events`, () => {
    expect(EventsRequestSchema.safeParse({ events: events(MAX_EVENTS_PER_REQUEST) }).success).toBe(
      true,
    );
  });

  it(`rejects ${String(MAX_EVENTS_PER_REQUEST + 1)} events`, () => {
    expect(
      EventsRequestSchema.safeParse({ events: events(MAX_EVENTS_PER_REQUEST + 1) }).success,
    ).toBe(false);
  });

  it.each([
    ["bad type", { events: [{ type: "delete", slug: "aurora-text" }] }],
    ["bad slug", { events: [{ type: "view", slug: "Bad" }] }],
    ["bad source", { events: [{ type: "view", slug: "aurora-text", source: "web" }] }],
    ["unknown key in event", { events: [{ type: "view", slug: "aurora-text", x: 1 }] }],
    ["unknown key", { events: [], extra: 1 }],
  ])("rejects %s", (_rule, value) => {
    expect(EventsRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe("LikeResponseSchema / LikesCountSchema", () => {
  it("accepts valid payloads", () => {
    expect(LikeResponseSchema.safeParse({ liked: true, count: 3 }).success).toBe(true);
    expect(LikesCountSchema.safeParse({ count: 0 }).success).toBe(true);
  });

  it("rejects negative counts and unknown keys", () => {
    expect(LikeResponseSchema.safeParse({ liked: true, count: -1 }).success).toBe(false);
    expect(LikesCountSchema.safeParse({ count: 1, extra: 1 }).success).toBe(false);
  });
});

describe("NewsletterRequestSchema", () => {
  it("normalizes trim + lowercase", () => {
    expect(NewsletterRequestSchema.parse({ email: "  Foo@Example.COM  " })).toEqual({
      email: "foo@example.com",
    });
  });

  it("rejects invalid and overlong emails", () => {
    expect(NewsletterRequestSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(NewsletterRequestSchema.safeParse({ email: "" }).success).toBe(false);
    const local = "a".repeat(243);
    expect(NewsletterRequestSchema.safeParse({ email: `${local}@example.com` }).success).toBe(
      false,
    );
    const okLocal = "a".repeat(242);
    expect(NewsletterRequestSchema.safeParse({ email: `${okLocal}@example.com` }).success).toBe(
      true,
    );
  });
});

describe("PopularQuerySchema", () => {
  it("applies defaults", () => {
    expect(PopularQuerySchema.parse({})).toEqual({ period: "week", limit: 20 });
  });

  it("accepts all periods and coerces string limits", () => {
    for (const period of ["day", "week", "month", "all"]) {
      expect(PopularQuerySchema.safeParse({ period }).success).toBe(true);
    }
    expect(PopularQuerySchema.parse({ limit: "5" }).limit).toBe(5);
    expect(PopularQuerySchema.parse({ limit: 5 }).limit).toBe(5);
  });

  it("rejects non-string/non-number limits before coercion", () => {
    for (const limit of [true, false, [5], ["5"], { value: 5 }, null]) {
      expect(PopularQuerySchema.safeParse({ limit }).success).toBe(false);
      expect(SearchQuerySchema.safeParse({ q: "x", limit }).success).toBe(false);
    }
    expect(PopularQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    expect(PopularQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(PopularQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("rejects out-of-range limits and bad periods", () => {
    expect(PopularQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(PopularQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(PopularQuerySchema.safeParse({ period: "year" }).success).toBe(false);
  });
});

describe("SearchQuerySchema", () => {
  it("accepts q with defaults", () => {
    expect(SearchQuerySchema.parse({ q: "aurora" })).toEqual({
      q: "aurora",
      limit: 20,
    });
  });

  it("accepts a category filter", () => {
    expect(SearchQuerySchema.safeParse({ q: "x", category: "buttons" }).success).toBe(true);
  });

  it.each([
    ["empty q", { q: "" }],
    ["q too long", { q: "x".repeat(101) }],
    ["limit 0", { q: "x", limit: 0 }],
    ["limit 51", { q: "x", limit: 51 }],
    ["bad category", { q: "x", category: "nope" }],
  ])("rejects %s", (_rule, value) => {
    expect(SearchQuerySchema.safeParse(value).success).toBe(false);
  });

  it("accepts q of exactly 100 chars", () => {
    expect(SearchQuerySchema.safeParse({ q: "x".repeat(100) }).success).toBe(true);
  });
});

describe("ErrorResponseSchema", () => {
  it("accepts the documented shape", () => {
    expect(
      ErrorResponseSchema.safeParse({
        error: { code: "VALIDATION_ERROR", message: "bad input", details: [] },
      }).success,
    ).toBe(true);
  });

  it("defaults details to []", () => {
    expect(ErrorResponseSchema.parse({ error: { code: "X", message: "y" } })).toEqual({
      error: { code: "X", message: "y", details: [] },
    });
  });

  it("rejects empty code/message and unknown keys", () => {
    expect(
      ErrorResponseSchema.safeParse({ error: { code: "", message: "y" } }).success,
    ).toBe(false);
    expect(
      ErrorResponseSchema.safeParse({ error: { code: "X", message: "y", z: 1 } }).success,
    ).toBe(false);
  });
});

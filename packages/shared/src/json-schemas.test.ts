import { z } from "zod";
import { describe, expect, it } from "vitest";
import { JSON_SCHEMA_NAMES, JSON_SCHEMA_SOURCES } from "./json-schemas.js";

describe("JSON_SCHEMA_SOURCES", () => {
  it("covers every contract area", () => {
    expect([...JSON_SCHEMA_NAMES].sort()).toEqual(
      [
        "cli-config",
        "error-response",
        "events-request",
        "like-response",
        "likes-count",
        "meta",
        "newsletter-request",
        "popular-query",
        "registry-index",
        "registry-item",
        "registry-lock",
        "search-query",
      ].sort(),
    );
  });

  it("generates a valid JSON Schema draft object per source (native z.toJSONSchema)", () => {
    for (const name of JSON_SCHEMA_NAMES) {
      const source = JSON_SCHEMA_SOURCES[name] as z.ZodType;
      const schema = z.toJSONSchema(source) as Record<string, unknown>;
      expect(typeof schema).toBe("object");
      expect(schema["type"]).toBe("object");
      expect(schema["additionalProperties"]).toBe(false);
    }
  });

  it("rejects unknown keys at the JSON Schema level too", () => {
    const meta = z.toJSONSchema(JSON_SCHEMA_SOURCES["meta"] as z.ZodType) as Record<
      string,
      unknown
    >;
    expect(meta["additionalProperties"]).toBe(false);
  });
});

import { z } from "zod";
import {
  ErrorResponseSchema,
  EventsRequestSchema,
  LikeResponseSchema,
  LikesCountSchema,
  NewsletterRequestSchema,
  PopularQuerySchema,
  SearchQuerySchema,
} from "./api.js";
import { CliConfigSchema } from "./cli-config.js";
import { RegistryLockSchema } from "./lock.js";
import { MetaSchema } from "./meta.js";
import { PlaygroundSchema } from "./playground.js";
import { RegistryIndexSchema } from "./registry-index.js";
import { RegistryItemSchema } from "./registry-item.js";
import { SearchIndexSchema } from "./search-index.js";

/**
 * Schemas published as JSON Schema (MASTER_PROMPT Section 4: `/schema/*.json`).
 * Generated from Zod with native `z.toJSONSchema` (Zod 4) — no extra dependency.
 */
export const JSON_SCHEMA_SOURCES: Record<string, z.ZodType> = {
  meta: MetaSchema,
  playground: PlaygroundSchema,
  "registry-item": RegistryItemSchema,
  "registry-index": RegistryIndexSchema,
  "cli-config": CliConfigSchema,
  "registry-lock": RegistryLockSchema,
  "events-request": EventsRequestSchema,
  "like-response": LikeResponseSchema,
  "likes-count": LikesCountSchema,
  "newsletter-request": NewsletterRequestSchema,
  "popular-query": PopularQuerySchema,
  "search-query": SearchQuerySchema,
  "error-response": ErrorResponseSchema,
  "search-index": SearchIndexSchema,
};

export const JSON_SCHEMA_NAMES = Object.keys(JSON_SCHEMA_SOURCES);

/** JSON Schema object for one named source (throws on unknown names). */
export function jsonSchemaFor(name: string): unknown {
  const source = JSON_SCHEMA_SOURCES[name];
  if (source === undefined) {
    throw new Error(`unknown JSON schema: ${name} (known: ${JSON_SCHEMA_NAMES.join(", ")})`);
  }
  return z.toJSONSchema(source, { unrepresentable: "throw" });
}

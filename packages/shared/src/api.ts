import { z } from "zod";
import { CategorySchema } from "./categories.js";
import { SlugSchema } from "./meta.js";

/** `POST /api/events` body (MASTER_PROMPT Section 8). Max 50 events per request. */
export const EventTypeSchema = z.enum(["install", "view"]);
export const EventSourceSchema = z.enum(["cli", "copy"]);

export const RegistryEventSchema = z
  .object({
    type: EventTypeSchema,
    slug: SlugSchema,
    source: EventSourceSchema.optional(),
  })
  .strict();

export type RegistryEvent = z.infer<typeof RegistryEventSchema>;

export const MAX_EVENTS_PER_REQUEST = 50;

export const EventsRequestSchema = z
  .object({
    events: z.array(RegistryEventSchema).max(
      MAX_EVENTS_PER_REQUEST,
      `at most ${String(MAX_EVENTS_PER_REQUEST)} events per request`,
    ),
  })
  .strict();

export type EventsRequest = z.infer<typeof EventsRequestSchema>;

/** `POST /api/components/:slug/like` response and `GET .../likes` response. */
export const LikeResponseSchema = z
  .object({
    liked: z.boolean(),
    count: z.number().int().min(0),
  })
  .strict();

export type LikeResponse = z.infer<typeof LikeResponseSchema>;

export const LikesCountSchema = z
  .object({
    count: z.number().int().min(0),
  })
  .strict();

export type LikesCount = z.infer<typeof LikesCountSchema>;

/**
 * `POST /api/newsletter` body.
 * Email is normalized (trimmed + lowercased) before validation; max 254 chars (RFC 5321).
 */
export const NewsletterRequestSchema = z
  .object({
    email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
  })
  .strict();

export type NewsletterRequest = z.infer<typeof NewsletterRequestSchema>;

/** `GET /api/stats/popular` query. Defaults are chosen (prompt is silent): week / 20. */
export const PopularPeriodSchema = z.enum(["day", "week", "month", "all"]);

/**
 * Pagination-style limit shared by the query schemas. Accepts ONLY a number or
 * its decimal string form (booleans, arrays, and objects are rejected BEFORE
 * coercion — a bare `z.coerce.number()` would turn `true` into `1` and `[5]`
 * into `5`). The string branch goes through `z.codec`, which stays
 * representable in published JSON Schemas (unlike `transform`/`pipe`).
 */
const QueryLimitSchema = z.union([
  z.number().int().min(1).max(50),
  z.codec(
    z.string().regex(/^\d+$/, "limit must be an integer string"),
    z.number().int().min(1).max(50),
    {
      decode: (text) => Number(text),
      encode: (limit) => String(limit),
    },
  ),
]);

export const PopularQuerySchema = z
  .object({
    period: PopularPeriodSchema.default("week"),
    limit: QueryLimitSchema.default(20),
  })
  .strict();

export type PopularQuery = z.infer<typeof PopularQuerySchema>;

/** `GET /api/search` query. `q` 1-100 chars, `limit` 1-50 (default 20). */
export const SearchQuerySchema = z
  .object({
    q: z.string().min(1, "q must not be empty").max(100, "q must be at most 100 characters"),
    category: CategorySchema.optional(),
    limit: QueryLimitSchema.default(20),
  })
  .strict();

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** Consistent API error shape (MASTER_PROMPT Section 8). */
export const ErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1, "code must not be empty"),
        message: z.string().min(1, "message must not be empty"),
        details: z.array(z.unknown()).default([]),
      })
      .strict(),
  })
  .strict();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

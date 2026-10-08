export const SHARED_PACKAGE_NAME = "@framebits/shared";

export { DEFAULT_REGISTRY_URL, PLACEHOLDER_DOMAIN, PROJECT_NAME } from "./site.js";

export { ALLOWED_DEPENDENCIES, AllowedDependencySchema } from "./allowed-dependencies.js";
export type { AllowedDependency } from "./allowed-dependencies.js";

export {
  ErrorResponseSchema,
  EventSourceSchema,
  EventTypeSchema,
  EventsRequestSchema,
  LikesCountSchema,
  LikeResponseSchema,
  MAX_EVENTS_PER_REQUEST,
  NewsletterRequestSchema,
  PopularPeriodSchema,
  PopularQuerySchema,
  SearchQuerySchema,
} from "./api.js";
export type {
  ErrorResponse,
  PopularQuery,
  LikesCount,
  LikeResponse,
  NewsletterRequest,
  RegistryEvent,
  EventsRequest,
  SearchQuery,
} from "./api.js";

export { CanonicalizeError, MAX_DEPTH, canonicalize } from "./canonical.js";

export { CATEGORIES, CategorySchema, KebabCaseSchema } from "./categories.js";
export type { Category } from "./categories.js";

export { CliConfigSchema, InstalledEntrySchema, MAX_INSTALLED_ENTRIES } from "./cli-config.js";
export type { CliConfig, InstalledEntry } from "./cli-config.js";

export {
  MAX_FILE_CONTENT_BYTES,
  MAX_TOTAL_CONTENT_BYTES,
  PAYLOAD_VERSION,
  computeItemHash,
  exceedsContentLimits,
  normalizeContent,
  normalizeItemForHash,
  verifyItemHash,
} from "./hash.js";
export type { ItemHashInput, ItemHashInputFile } from "./hash.js";

export {
  DANGEROUS_KEYS,
  HashableJsonValueSchema,
  RawDangerousKeysGuard,
  Sha256HashSchema,
  containsDangerousKey,
  findDangerousKey,
  guardedRecord,
  isDangerousKey,
  rejectDangerousKeys,
} from "./hashable-json.js";
export type { HashableJsonValue, Sha256Hash } from "./hashable-json.js";

export { JSON_SCHEMA_NAMES, JSON_SCHEMA_SOURCES, jsonSchemaFor } from "./json-schemas.js";

export { LockEntrySchema, MAX_LOCK_COMPONENTS, RegistryLockSchema } from "./lock.js";
export type { LockEntry, RegistryLock } from "./lock.js";

export {
  DependenciesSchema,
  DescriptionSchema,
  DifficultySchema,
  ItemTypeSchema,
  MetaSchema,
  PerformanceSchema,
  PublishStatusSchema,
  RegistryDependenciesSchema,
  SlugSchema,
  TagSchema,
  TitleSchema,
} from "./meta.js";
export type { ItemType, Meta, Slug } from "./meta.js";

export {
  MAX_PATH_LENGTH,
  MAX_PATH_SEGMENTS,
  RelativePathSchema,
  WINDOWS_RESERVED_NAMES,
} from "./paths.js";
export type { RelativePath } from "./paths.js";

export {
  PreviewAssetPathSchema,
  PreviewWebpSchema,
  RegistryPreviewsSchema,
} from "./preview.js";
export type { RegistryPreviews } from "./preview.js";

export {
  ComponentStylesSchema,
  CssVarsSchema,
  DEFAULT_VARIANT,
  MAX_FILES_PER_ITEM,
  MAX_FILE_CONTENT_CHARS,
  RegistryFileSchema,
  RegistryItemSchema,
  SCHEMA_VERSION,
  TailwindFragmentSchema,
} from "./registry-item.js";
export type { ComponentStyles, CssVars, RegistryFile, RegistryItem, TailwindFragment } from "./registry-item.js";

export { RegistryIndexItemSchema, RegistryIndexSchema } from "./registry-index.js";
export type { RegistryIndex, RegistryIndexItem } from "./registry-index.js";

export {
  MAX_PLAYGROUND_COLORS,
  MAX_PLAYGROUND_CONTROLS,
  MAX_PLAYGROUND_TEXT,
  PlaygroundControlSchema,
  PlaygroundKeySchema,
  PlaygroundSchema,
  generateUsageSnippet,
  playgroundDefaults,
  playgroundDiff,
  resolvePlaygroundValues,
} from "./playground.js";
export type {
  Playground,
  PlaygroundControl,
  PlaygroundValue,
  PlaygroundValues,
} from "./playground.js";

export {
  MAX_SEARCH_INDEX_KEYS,
  SearchIndexDocSchema,
  SearchIndexSchema,
} from "./search-index.js";
export type { SearchIndex, SearchIndexDoc } from "./search-index.js";

export {
  MAX_SEMVER_LENGTH,
  SemverRangeSchema,
  SemverVersionSchema,
  bumpSemverVersion,
  canonicalizeSemverVersion,
  doSemverRangesIntersect,
  isGreaterSemverVersion,
  isPrereleaseSemverRange,
  isSemverSubset,
  satisfiesSemverRange,
} from "./semver.js";
export type { SemverBumpLevel, SemverRange, SemverVersion } from "./semver.js";

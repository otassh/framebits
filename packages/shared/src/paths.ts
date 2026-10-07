import { z } from "zod";

/**
 * Relative, POSIX-style registry/CLI paths (MASTER_PROMPT Section 4.2 + Task 2 path-safety rules).
 *
 * One schema serves both `RegistryItem.files[].path` and CLI target paths (Task 5 reuses it).
 *
 * Schema-level checks catch lexical traversal (`..`, absolute paths, drive letters,
 * backslashes, percent-encoded variants, reserved device names, 8.3 short names,
 * unicode confusables, invisible controls). They are NOT sufficient on their own:
 * the CLI MUST additionally resolve the final target with `realpath` and assert
 * containment inside the project root (guard against symlink escapes) before
 * writing — see the CLI `add` path-safety logic.
 */

export const MAX_PATH_LENGTH = 200;
export const MAX_PATH_SEGMENTS = 10;

/** Case-insensitive. A segment equal to one of these (with or without extension) is rejected. */
export const WINDOWS_RESERVED_NAMES: ReadonlySet<string> = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

const DRIVE_LETTER_PATTERN = /^[A-Za-z]:/;
const FORBIDDEN_SEGMENT_CHARS_PATTERN = /[<>":|?*]/;
/** Unicode invisibles: Cc/Cf/Zl/Zp classes (C0/C1 controls, bidi, joiners, separators). */
const UNICODE_CONTROL_PATTERN = /\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}/u;
/** Explicit mid-path bidi/invisible rejects: ZWSP U+200B, bidi U+202A-U+202E, WJ U+2060, BOM U+FEFF. */
const EXPLICIT_BIDI_PATTERN = /[\u200B\u202A-\u202E\u2060\uFEFF]/;
/** Fullwidth confusables for `.` and `/` (U+FF0E FULLWIDTH FULL STOP, U+FF0F FULLWIDTH SOLIDUS). */
const FULLWIDTH_DOT_SLASH_PATTERN = /[\uFF0E\uFF0F]/;
/** 8.3 short-name shape, e.g. `CON~1`, `COM1~2` (checked against reserved bases). */
const SHORT_NAME_PATTERN = /^[A-Z0-9]+~\d+$/;
/** Percent-encoded NUL, dot, slash, backslash (`%00`, `%2e`, `%2f`, `%5c`). */
const ENCODED_TRAVERSAL_PATTERN = /%(?:00|2e|2f|5c)/i;
/** `%25` (encoded `%`) signals double-encoding like `%252e`. */
const ENCODED_PERCENT_PATTERN = /%25/i;
/** Any remaining `%XX` escape after one decode pass. */
const ANY_ESCAPE_PATTERN = /%[0-9A-Fa-f]{2}/;

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function baseName(segment: string): string {
  const dot = segment.indexOf(".");
  return (dot === -1 ? segment : segment.slice(0, dot)).toUpperCase();
}

/** Uppercase base (no extension), trimmed, for reserved-name checks. The trim is on the base itself so `CON .tsx` (Windows strips the trailing space+dot) is caught. */
function trimmedBaseName(segment: string): string {
  return baseName(segment).trim();
}

/**
 * True when the segment is an 8.3 short name for a reserved device
 * (e.g. `CON~1`, `CON~1.txt`, `COM1~2`). Comparison is case-insensitive.
 */
function isReservedShortName(segment: string): boolean {
  const base = trimmedBaseName(segment);
  if (!SHORT_NAME_PATTERN.test(base)) return false;
  const prefix = base.slice(0, base.indexOf("~"));
  return WINDOWS_RESERVED_NAMES.has(prefix);
}

export const RelativePathSchema = z
  .string()
  .min(1, "path must not be empty")
  .max(MAX_PATH_LENGTH, `path must be at most ${String(MAX_PATH_LENGTH)} characters`)
  .superRefine((path, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: "custom", message });
    };

    // Normalize first so canonically-equivalent spellings collapse before all checks.
    const normalized = path.normalize("NFC");

    if (FULLWIDTH_DOT_SLASH_PATTERN.test(normalized)) {
      fail("path must not contain fullwidth confusables (U+FF0E/U+FF0F)");
      return;
    }
    if (UNICODE_CONTROL_PATTERN.test(normalized) || EXPLICIT_BIDI_PATTERN.test(normalized)) {
      fail("path must not contain control, bidi, or invisible characters");
      return;
    }

    // Decode-then-revalidate: decode percent-escapes once, then re-check the result.
    if (normalized.includes("%")) {
      if (ENCODED_TRAVERSAL_PATTERN.test(normalized) || ENCODED_PERCENT_PATTERN.test(normalized)) {
        fail("path must not contain encoded traversal or double-encoding (%00/%2e/%2f/%5c/%25)");
        return;
      }
      let decoded: string;
      try {
        decoded = decodeURIComponent(normalized);
      } catch {
        fail("path contains invalid percent-encoding");
        return;
      }
      if (decoded !== normalized) {
        if (
          ANY_ESCAPE_PATTERN.test(decoded) ||
          decoded.includes("\0") ||
          decoded.includes("\\") ||
          decoded.split("/").some((segment) => segment === "." || segment === "..")
        ) {
          fail("path must not contain encoded traversal or double-encoding");
          return;
        }
      }
    }

    if (normalized.startsWith("/")) {
      fail("path must be relative (must not start with /)");
      return;
    }
    if (DRIVE_LETTER_PATTERN.test(normalized)) {
      fail("path must be relative (must not contain a drive letter)");
      return;
    }
    if (normalized.includes("\\")) {
      fail("path must use POSIX separators (no backslashes)");
    }
    if (hasControlChar(normalized)) {
      fail("path must not contain null bytes or control characters");
    }

    const segments = normalized.split("/");
    if (segments.length > MAX_PATH_SEGMENTS) {
      fail(`path must have at most ${String(MAX_PATH_SEGMENTS)} segments`);
    }
    for (const segment of segments) {
      if (segment === "") {
        fail("path must not contain empty segments (no //, no trailing /)");
        break;
      }
      if (segment === "." || segment === "..") {
        fail('path must not contain "." or ".." segments');
        break;
      }
      if (WINDOWS_RESERVED_NAMES.has(trimmedBaseName(segment))) {
        fail(`path segment "${segment}" is a reserved Windows device name`);
        break;
      }
      if (isReservedShortName(segment)) {
        fail(`path segment "${segment}" is a reserved Windows short (8.3) name`);
        break;
      }
      if (segment !== segment.trim()) {
        fail("path segments must not have leading or trailing spaces");
        break;
      }
      if (segment.endsWith(".")) {
        fail('path segments must not end with "."');
        break;
      }
      if (FORBIDDEN_SEGMENT_CHARS_PATTERN.test(segment)) {
        fail('path segments must not contain < > " : | ? *');
        break;
      }
      if (WINDOWS_RESERVED_NAMES.has(baseName(segment))) {
        fail(`path segment "${segment}" is a reserved Windows device name`);
        break;
      }
    }
  });

export type RelativePath = z.infer<typeof RelativePathSchema>;

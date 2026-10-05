import { z } from "zod";

/**
 * Relative, POSIX-style registry/CLI paths (MASTER_PROMPT Section 4.2 + Task 2 path-safety rules).
 *
 * One schema serves both `RegistryItem.files[].path` and CLI target paths (Task 5 reuses it).
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

export const RelativePathSchema = z
  .string()
  .min(1, "path must not be empty")
  .max(MAX_PATH_LENGTH, `path must be at most ${String(MAX_PATH_LENGTH)} characters`)
  .superRefine((path, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: "custom", message });
    };

    if (path.startsWith("/")) {
      fail("path must be relative (must not start with /)");
      return;
    }
    if (DRIVE_LETTER_PATTERN.test(path)) {
      fail("path must be relative (must not contain a drive letter)");
      return;
    }
    if (path.includes("\\")) {
      fail("path must use POSIX separators (no backslashes)");
    }
    if (hasControlChar(path)) {
      fail("path must not contain null bytes or control characters");
    }

    const segments = path.split("/");
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

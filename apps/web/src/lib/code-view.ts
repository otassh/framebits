/**
 * Truncated code rendering guard (DoS / DOM-bloat defense).
 *
 * Registry file content is data and is always rendered as a React text node
 * (never `dangerouslySetInnerHTML`). Files larger than `MAX_RENDER_CHARS`
 * are never fully mounted in the DOM nor copied to the clipboard; the UI
 * shows a prefix plus a "use the CLI" notice instead.
 *
 * Mirrors `MAX_FILE_CONTENT_CHARS` (500_000) from `packages/shared` without
 * importing `hash.ts` (which pulls in `node:crypto`). Values must stay in
 * sync; see `code-view.test.ts`.
 */
export const MAX_RENDER_CHARS = 500_000;

export interface TruncatedCode {
  text: string;
  truncated: boolean;
  totalChars: number;
}

export function truncateForDisplay(content: string): TruncatedCode {
  if (content.length <= MAX_RENDER_CHARS) {
    return { text: content, truncated: false, totalChars: content.length };
  }
  return {
    text: content.slice(0, MAX_RENDER_CHARS),
    truncated: true,
    totalChars: content.length,
  };
}

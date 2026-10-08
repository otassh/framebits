/**
 * Type declarations for the sibling `render.mjs` changelog-site renderer, so
 * TypeScript tests can import its pure functions. (With
 * `moduleResolution: NodeNext`, an import of `./render.mjs` resolves its
 * types from this `render.d.mts` file.)
 */

export const KNOWN_SECTIONS: string[];

export interface ChangelogSection {
  name: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  id: string;
  date: string | null;
  unreleased: boolean;
  sections: ChangelogSection[];
}

export interface ChangelogData {
  title: string;
  intro: string[];
  releases: ChangelogRelease[];
}

export interface RenderMeta {
  generatedAt: string;
}

export function escapeHtml(text: string): string;
export function renderInline(text: string): string;
export function slugifyVersion(version: string): string;
export function parseChangelog(markdown: string): ChangelogData;
export function renderSite(data: ChangelogData, meta: RenderMeta): string;

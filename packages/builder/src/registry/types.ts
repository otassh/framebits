import type {
  CssVars,
  ItemType,
  Meta,
  TailwindFragment,
} from "@framebits/shared";

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  /** POSIX path relative to the registry root, e.g. "components/buttons/ok/ok.tsx". */
  file: string;
  line?: number | undefined;
  column?: number | undefined;
  message: string;
  hint?: string | undefined;
}

export interface ModelFile {
  /** POSIX target path, e.g. "components/ui/aurora-text.tsx". */
  path: string;
  /** Normalized source content (shared normalizeContent, no import rewriting). */
  content: string;
  type: ItemType;
  variant: "ts-tw";
}

export interface RegistryItemModel {
  slug: string;
  meta: Meta;
  files: ModelFile[];
  dependencies: Record<string, string>;
  registryDependencies: string[];
  tailwind?: TailwindFragment | undefined;
  cssVars?: CssVars | undefined;
  hash: string;
}

export interface LoadRegistryOptions {
  registryRoot: string;
  /** Skip the type-check stage (local speed only; CI must never use it). */
  skipTypecheck?: boolean | undefined;
}

export interface LoadRegistryResult {
  /** Absolute registry root as given. */
  registryRoot: string;
  /** In-memory model, non-draft items only, sorted by slug. */
  items: RegistryItemModel[];
  /** Every diagnostic collected, sorted by (file, line, column, code). */
  diagnostics: Diagnostic[];
  /** Totals over all parsed metas (drafts included); additive summary. */
  summary: RegistrySummary;
}

export interface RegistrySummary {
  /** Items with a valid meta.json (drafts included). */
  discovered: number;
  /** Items present in `items` (non-draft, error-free). */
  modeled: number;
  byType: Record<"component" | "lib" | "hook", number>;
  byStatus: Record<"draft" | "published" | "deprecated", number>;
  /** Slugs with status draft (sorted). Needed for lock planning. */
  draftSlugs: string[];
}

export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  const aLine = a.line ?? 0;
  const bLine = b.line ?? 0;
  if (aLine !== bLine) return aLine - bLine;
  const aCol = a.column ?? 0;
  const bCol = b.column ?? 0;
  if (aCol !== bCol) return aCol - bCol;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  return 0;
}

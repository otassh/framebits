import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { satisfiesSemverRange } from "@framebits/shared";
import ts from "typescript";
import type { Meta } from "@framebits/shared";
import type { Diagnostic } from "./types.js";

/**
 * Type-check stage (Task 4b Part 1). Uses the TypeScript compiler API
 * (`createProgram`, `noEmit`) — never a child process, never executes sources.
 *
 * Materializes every item with a valid meta and readable sources (drafts included)
 * into a temp project INSIDE packages/registry-env (so module resolution finds the
 * pinned env node_modules), at CLI target layout, then maps every TS diagnostic back
 * to the original repo-relative registry file. The temp dir is always removed.
 */

export interface TypecheckItem {
  meta: Meta;
  /** Normalized shipped files: target path -> content. */
  files: Record<string, string>;
  /** Raw demo.tsx text, if the item has one. */
  demoText: string | undefined;
}

export interface TypecheckResult {
  diagnostics: Diagnostic[];
}

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: false,
    jsx: "react-jsx",
    module: "ESNext",
    moduleResolution: "Bundler",
    target: "ES2022",
    skipLibCheck: true,
    lib: ["dom", "dom.iterable", "es2022"],
    noEmit: true,
    baseUrl: ".",
    paths: {
      "@/lib/*": ["lib/*"],
      "@/hooks/*": ["hooks/*"],
      "@/components/ui/*": ["components/ui/*"],
    },
  },
  include: ["components/**/*", "lib/**/*", "hooks/**/*", "demos/**/*"],
};

function envDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "registry-env");
}

function sourceRelPath(meta: Meta): string {
  if (meta.type === "component") return `components/${meta.category}/${meta.slug}/${meta.slug}.tsx`;
  return `lib/${meta.slug}/${meta.slug}.ts`;
}

function demoRelPath(meta: Meta): string {
  return `components/${meta.category}/${meta.slug}/demo.tsx`;
}

/** Read the pinned env versions (exact pins in registry-env/package.json). */
async function readEnvVersions(): Promise<Record<string, string>> {
  const raw: unknown = JSON.parse(
    await readFile(join(envDir(), "package.json"), "utf8"),
  );
  if (typeof raw !== "object" || raw === null || !("devDependencies" in raw)) return {};
  const deps: unknown = raw.devDependencies;
  if (typeof deps !== "object" || deps === null) return {};
  const out: Record<string, string> = {};
  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === "string") out[name] = version;
  }
  return out;
}

export async function runTypecheck(
  items: TypecheckItem[],
  options: { tmpBase?: string | undefined } = {},
): Promise<TypecheckResult> {
  const diagnostics: Diagnostic[] = [];
  if (items.length === 0) return { diagnostics };

  const envVersions = await readEnvVersions();
  for (const item of items) {
    for (const [name, range] of Object.entries(item.meta.dependencies).sort()) {
      const pinned = envVersions[name];
      if (pinned === undefined || !satisfiesSemverRange(pinned, range)) {
        diagnostics.push({
          severity: "error",
          code: "TYPECHECK_ENV_RANGE_MISMATCH",
          file: sourceRelPath(item.meta),
          message:
            pinned === undefined
              ? `dependency "${name}" is not pinned in packages/registry-env`
              : `env pins ${name}@${pinned}, which does not satisfy range "${range}"`,
          hint: "Update packages/registry-env or the meta.json range.",
        });
      }
    }
  }

  const tmpBase = options.tmpBase ?? tmpdir();
  await mkdir(tmpBase, { recursive: true });
  const tmp = await mkdtemp(join(tmpBase, "framebits-typecheck-"));
  try {
    // The temp project lives outside the package dir (os.tmpdir), so bare
    // imports (react, motion, ...) resolve via a node_modules junction back to
    // the pinned registry-env. A junction (not a symlink) works on Windows
    // without elevated privileges.
    await symlink(join(envDir(), "node_modules"), join(tmp, "node_modules"), "junction");
    await writeFile(join(tmp, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2), "utf8");
    const materialized: string[] = [];
    const reverse = new Map<string, string>();
    for (const item of items) {
      for (const [target, content] of Object.entries(item.files)) {
        const abs = joinInto(tmp, target.split("/"));
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, content, "utf8");
        materialized.push(abs);
        reverse.set(abs.split(sep).join("/"), targetToRegistry(item.meta, target));
      }
      if (item.demoText !== undefined) {
        // Demos live at demos/<slug>.tsx but import "./<slug>"; rewrite that one
        // specifier so it resolves to the materialized component (check scaffolding
        // only — demos are never shipped and emitted content is never rewritten).
        const rewritten = rewriteDemoImport(item.demoText, item.meta.slug);
        const abs = joinInto(tmp, ["demos", `${item.meta.slug}.tsx`]);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, rewritten, "utf8");
        materialized.push(abs);
        reverse.set(abs.split(sep).join("/"), demoRelPath(item.meta));
      }
    }

    const configFile = ts.readConfigFile(join(tmp, "tsconfig.json"), (name) => ts.sys.readFile(name));
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, tmp);
    // CSS files are materialized for completeness but are not compilation roots.
    const rootNames = materialized.filter((file) => !file.endsWith(".css"));
    const program = ts.createProgram({ rootNames, options: parsed.options });
    for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
      const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      const code = `TS${String(diagnostic.code)}`;
      if (diagnostic.file === undefined || diagnostic.start === undefined) {
        diagnostics.push({
          severity: "error",
          code: "TYPECHECK_ERROR",
          file: "",
          message: `${code}: ${text}`,
        });
        continue;
      }
      const abs = diagnostic.file.fileName;
      const original = reverse.get(abs.split(sep).join("/")) ?? abs;
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      diagnostics.push({
        severity: "error",
        code: "TYPECHECK_ERROR",
        file: original,
        line: line + 1,
        column: character + 1,
        message: `${code}: ${text}`,
      });
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return { diagnostics };
}

/** Rewrite the demo's own `"./<slug>"` import so it resolves to the component. */
export function rewriteDemoImport(demoText: string, slug: string): string {
  const pattern = new RegExp(`(["'])\\./${escapeRegExp(slug)}(\\.tsx)?\\1`, "g");
  return demoText.replace(pattern, `"../components/ui/${slug}"`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Join untrusted path segments onto a base directory, refusing to escape it.
 * Targets are builder-computed (never user input), so this is defense in depth:
 * a violation throws instead of writing outside the temp project.
 */
function joinInto(base: string, segments: string[]): string {
  const target = join(base, ...segments);
  const root = resolve(base);
  const resolved = resolve(target);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error(`refusing to materialize outside the temp project: ${segments.join("/")}`);
  }
  return target;
}

/** Materialized target path -> original registry relPath. */
function targetToRegistry(meta: Meta, target: string): string {
  if (target.startsWith("components/ui/") || target.startsWith("lib/") || target.startsWith("hooks/")) {
    const base = target.split("/").pop() as string;
    if (meta.type === "component") return `components/${meta.category}/${meta.slug}/${base}`;
    return `lib/${meta.slug}/${base}`;
  }
  return target;
}

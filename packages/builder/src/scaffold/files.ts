import { toCamelCase, toPascalCase } from "./names.js";
import { serializeMeta, type ResolvedScaffold } from "./request.js";
import type { GeneratedFile } from "./types.js";
import type { Meta } from "@algorithco-ui/shared";

/** LF, no BOM, trailing newline — enforced by construction in every template below. */
function finalize(content: string): string {
  const lf = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const stripped = lf.startsWith("\uFEFF") ? lf.slice(1) : lf;
  return stripped.endsWith("\n") ? stripped : `${stripped}\n`;
}

export function renderComponentTsx(slug: string): string {
  const name = toPascalCase(slug);
  return finalize(`"use client";

// ${slug}
import { motion, useReducedMotion } from "motion/react";
import type { HTMLAttributes } from "react";

export interface ${name}Props extends HTMLAttributes<HTMLSpanElement> {
  text: string;
}

export function ${name}({ text, className, ...rest }: ${name}Props) {
  const reduceMotion = useReducedMotion();
  const joined = ["${slug}", className]
    .filter((part): part is string => part !== undefined)
    .join(" ");
  if (reduceMotion) {
    return (
      <span className={joined} {...rest}>
        {text}
      </span>
    );
  }
  return (
    <motion.span className={joined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} {...rest}>
      {text}
    </motion.span>
  );
}
`);
}

export function renderDemoTsx(slug: string): string {
  const name = toPascalCase(slug);
  return finalize(`import { ${name} } from "./${slug}";

export default function ${name}Demo() {
  return <${name} text="Hello, world" />;
}
`);
}

export function renderLibTs(slug: string): string {
  const fn = toCamelCase(slug);
  return finalize(`/**
 * ${slug} shared helper.
 *
 * Starter implementation: joins truthy class-name parts with a space.
 * Replace with the real implementation.
 */
export function ${fn}(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part) => typeof part === "string" && part !== "").join(" ");
}
`);
}

export function renderHookTs(slug: string): string {
  const fn = toCamelCase(slug);
  return finalize(`import { useState } from "react";

/**
 * ${slug} hook.
 *
 * Starter implementation: boolean flag with a setter. Replace with the real logic.
 */
export function ${fn}(initial = false): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(initial);
  return [value, setValue];
}
`);
}

/**
 * Render the full file set for one scaffolded item (in-memory, no I/O):
 * component -> {<slug>.tsx, demo.tsx, meta.json},
 * lib/hook  -> {<slug>.ts, meta.json}.
 */
export function renderFiles(resolved: ResolvedScaffold, meta: Meta): GeneratedFile[] {
  const metaFile: GeneratedFile = { path: "meta.json", content: serializeMeta(meta) };
  if (resolved.type === "component") {
    return [
      { path: `${resolved.slug}.tsx`, content: renderComponentTsx(resolved.slug) },
      { path: "demo.tsx", content: renderDemoTsx(resolved.slug) },
      metaFile,
    ];
  }
  const ext = ".ts";
  const content = resolved.type === "hook" ? renderHookTs(resolved.slug) : renderLibTs(resolved.slug);
  return [{ path: `${resolved.slug}${ext}`, content }, metaFile];
}

/**
 * CSS block generation (E1). Deterministic: sorted names, 2-space indent,
 * LF line endings inside the block. Property names are emitted verbatim
 * (the shimmer-button sample uses kebab-case already; no camelCase
 * conversion is performed — see docs/CLI.md).
 */
import type { ValidatedStyles } from "./validate.js";

export type TailwindMajor = 3 | 4;

export function beginMarker(slug: string): string {
  return `/* framebits:begin ${slug} */`;
}

export function endMarker(slug: string): string {
  return `/* framebits:end ${slug} */`;
}

function keyframesBlock(frames: ValidatedStyles["keyframes"], baseIndent: number): string[] {
  const lines: string[] = [];
  for (const frame of frames) {
    lines.push(`${" ".repeat(baseIndent)}@keyframes ${frame.name} {`);
    for (const entry of frame.frames) {
      lines.push(`${" ".repeat(baseIndent + 2)}${entry.selector} {`);
      for (const decl of entry.declarations) {
        lines.push(`${" ".repeat(baseIndent + 4)}${decl.property}: ${decl.value};`);
      }
      lines.push(`${" ".repeat(baseIndent + 2)}}`);
    }
    lines.push(`${" ".repeat(baseIndent)}}`);
  }
  return lines;
}

/**
 * Build the inner block lines (without markers) for one slug.
 * v3: top-level @keyframes, `@layer utilities` animation classes,
 * `@layer base` css vars. v4: `@theme` with --animate-* + nested keyframes,
 * plain :root/.dark var blocks.
 */
export function generateBlockInner(
  validated: ValidatedStyles,
  tailwindVersion: TailwindMajor,
): string {
  const lines: string[] = [];
  if (tailwindVersion === 3) {
    lines.push(...keyframesBlock(validated.keyframes, 0));
    for (const anim of validated.animations) {
      lines.push("@layer utilities {");
      lines.push(`  .animate-${anim.name} {`);
      lines.push(`    animation: ${anim.value};`);
      lines.push("  }");
      lines.push("}");
    }
    if (validated.varsLight.length > 0 || validated.varsDark.length > 0) {
      lines.push("@layer base {");
      if (validated.varsLight.length > 0) {
        lines.push("  :root {");
        for (const variable of validated.varsLight) {
          lines.push(`    ${variable.name}: ${variable.value};`);
        }
        lines.push("  }");
      }
      if (validated.varsDark.length > 0) {
        lines.push("  .dark {");
        for (const variable of validated.varsDark) {
          lines.push(`    ${variable.name}: ${variable.value};`);
        }
        lines.push("  }");
      }
      lines.push("}");
    }
  } else {
    const hasTheme = validated.animations.length > 0 || validated.keyframes.length > 0;
    if (hasTheme) {
      lines.push("@theme {");
      for (const anim of validated.animations) {
        lines.push(`  --animate-${anim.name}: ${anim.value};`);
      }
      for (const inner of keyframesBlock(validated.keyframes, 2)) {
        lines.push(inner);
      }
      lines.push("}");
    }
    if (validated.varsLight.length > 0) {
      lines.push(":root {");
      for (const variable of validated.varsLight) {
        lines.push(`  ${variable.name}: ${variable.value};`);
      }
      lines.push("}");
    }
    if (validated.varsDark.length > 0) {
      lines.push(".dark {");
      for (const variable of validated.varsDark) {
        lines.push(`  ${variable.name}: ${variable.value};`);
      }
      lines.push("}");
    }
  }
  return lines.join("\n");
}

export function generateBlock(
  slug: string,
  validated: ValidatedStyles,
  tailwindVersion: TailwindMajor,
): string {
  const inner = generateBlockInner(validated, tailwindVersion);
  if (inner === "") return `${beginMarker(slug)}\n${endMarker(slug)}`;
  return `${beginMarker(slug)}\n${inner}\n${endMarker(slug)}`;
}

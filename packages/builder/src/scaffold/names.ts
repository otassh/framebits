/**
 * Name conversions from a validated kebab-case slug.
 * Inputs are slug-shaped (`[a-z0-9]+(-[a-z0-9]+)*`); functions stay total anyway.
 */

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function split(slug: string): string[] {
  return slug.split("-").filter((part) => part !== "");
}

/** "aurora-text" -> "AuroraText"; "3d-card" -> "Ui3dCard" (identifiers can't start with a digit). */
export function toPascalCase(slug: string): string {
  const joined = split(slug).map(capitalize).join("");
  return /^[0-9]/.test(joined) ? `Ui${joined}` : joined;
}

/** "aurora-text" -> "auroraText"; "3d-card" -> "ui3dCard". */
export function toCamelCase(slug: string): string {
  const parts = split(slug);
  const [first, ...rest] = parts;
  const head = first === undefined ? "" : first.charAt(0).toLowerCase() + first.slice(1);
  const joined = [head, ...rest.map(capitalize)].join("");
  return /^[0-9]/.test(joined) ? `ui${joined}` : joined;
}

/** "aurora-text" -> "Aurora Text" (default meta title). */
export function toTitleCase(slug: string): string {
  return split(slug).map(capitalize).join(" ");
}

/**
 * Style safety validation (E1). Registry data is semi-trusted: the hash only
 * detects corruption, so every name/selector/property/value is validated
 * before ANY CSS is generated. Violation => exit 4 (integrityError).
 */
import { integrityError } from "../errors.js";

export const MAX_CSS_VALUE_LENGTH = 200;
export const MAX_DECLARATIONS_PER_ITEM = 50;

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const PROPERTY_PATTERN = /^-{0,2}[a-z][a-zA-Z0-9-]*$/;
const PERCENT_PATTERN = /^(\d+(\.\d+)?)%$/;

const FORBIDDEN_VALUE_SUBSTRINGS = ["{", "}", ";", "\\", "/*", "*/", "@", "<"] as const;
const FORBIDDEN_VALUE_CALLS = ["url(", "expression(", "image-set(", "javascript:"] as const;

function fail(slug: string, detail: string): never {
  throw integrityError(
    `item "${slug}" has invalid style data: ${detail}`,
    "report the registry content; style data must follow the safety rules in docs/CLI.md",
  );
}

export function validateStyleName(slug: string, kind: string, name: string): void {
  if (!NAME_PATTERN.test(name)) {
    fail(slug, `${kind} name ${JSON.stringify(name)} must match /^[a-z][a-z0-9-]*$/`);
  }
}

export function normalizeCssVarName(slug: string, key: string): string {
  const bare = key.startsWith("--") ? key.slice(2) : key;
  if (bare === "" || !NAME_PATTERN.test(bare)) {
    fail(slug, `css var name ${JSON.stringify(key)} must be --<kebab-case> or <kebab-case>`);
  }
  return key.startsWith("--") ? key : `--${key}`;
}

export function validateKeyframeSelector(slug: string, name: string, selector: string): void {
  const parts = selector.split(",");
  if (parts.length === 0) fail(slug, `keyframe "${name}" has an empty selector`);
  for (const raw of parts) {
    const part = raw.trim();
    if (part === "from" || part === "to") continue;
    const match = PERCENT_PATTERN.exec(part);
    if (match === null) {
      fail(slug, `keyframe "${name}" selector ${JSON.stringify(selector)} must be from/to or 0-100%`);
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      fail(slug, `keyframe "${name}" percentage ${JSON.stringify(part)} is out of range 0-100`);
    }
  }
}

export function validatePropertyName(slug: string, property: string): void {
  if (!PROPERTY_PATTERN.test(property)) {
    fail(slug, `property name ${JSON.stringify(property)} must match /^-{0,2}[a-z][a-zA-Z0-9-]*$/`);
  }
}

export function validateCssValue(slug: string, what: string, value: string): void {
  if (value.length > MAX_CSS_VALUE_LENGTH) {
    fail(slug, `${what} value exceeds ${String(MAX_CSS_VALUE_LENGTH)} chars`);
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x0a || code === 0x0d) {
      fail(slug, `${what} value contains a newline or control character`);
    }
  }
  if (value.includes("\n") || value.includes("\r")) {
    fail(slug, `${what} value contains a newline`);
  }
  for (const forbidden of FORBIDDEN_VALUE_SUBSTRINGS) {
    if (value.includes(forbidden)) {
      fail(slug, `${what} value contains forbidden ${JSON.stringify(forbidden)}`);
    }
  }
  const lower = value.toLowerCase();
  for (const forbidden of FORBIDDEN_VALUE_CALLS) {
    if (lower.includes(forbidden)) {
      fail(slug, `${what} value contains forbidden ${JSON.stringify(forbidden)}`);
    }
  }
}

export type JsonRecord = Record<string, unknown>;

export interface ValidatedDeclarations {
  property: string;
  value: string;
}

export interface ValidatedKeyframe {
  name: string;
  frames: Array<{ selector: string; declarations: ValidatedDeclarations[] }>;
}

export interface ValidatedStyles {
  keyframes: ValidatedKeyframe[];
  animations: Array<{ name: string; value: string }>;
  varsLight: Array<{ name: string; value: string }>;
  varsDark: Array<{ name: string; value: string }>;
  declarationCount: number;
}

function asRecord(slug: string, what: string, value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(slug, `${what} must be an object`);
  }
  return value as JsonRecord;
}

function asStringOrNumber(slug: string, what: string, value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  fail(slug, `${what} must be a string or finite number`);
}

export function validateStyles(
  slug: string,
  tailwind: { keyframes?: JsonRecord | undefined; animation?: JsonRecord | undefined } | undefined,
  cssVars: { light?: JsonRecord | undefined; dark?: JsonRecord | undefined } | undefined,
): ValidatedStyles {
  const keyframes: ValidatedKeyframe[] = [];
  const animations: Array<{ name: string; value: string }> = [];
  const varsLight: Array<{ name: string; value: string }> = [];
  const varsDark: Array<{ name: string; value: string }> = [];
  let declarations = 0;
  const count = (): void => {
    declarations += 1;
    if (declarations > MAX_DECLARATIONS_PER_ITEM) {
      fail(slug, `more than ${String(MAX_DECLARATIONS_PER_ITEM)} declarations`);
    }
  };

  if (tailwind?.keyframes !== undefined) {
    const frames = asRecord(slug, "tailwind.keyframes", tailwind.keyframes);
    for (const name of Object.keys(frames).sort()) {
      validateStyleName(slug, "keyframe", name);
      const selectors = asRecord(slug, `tailwind.keyframes[${name}]`, frames[name]);
      const frameList: Array<{ selector: string; declarations: ValidatedDeclarations[] }> = [];
      for (const selector of Object.keys(selectors).sort()) {
        validateKeyframeSelector(slug, name, selector);
        const decls = asRecord(slug, `tailwind.keyframes[${name}][${selector}]`, selectors[selector]);
        const list: ValidatedDeclarations[] = [];
        for (const property of Object.keys(decls).sort()) {
          validatePropertyName(slug, property);
          const value = asStringOrNumber(slug, `tailwind.keyframes[${name}][${selector}][${property}]`, decls[property]);
          validateCssValue(slug, `tailwind.keyframes[${name}][${selector}][${property}]`, value);
          count();
          list.push({ property, value });
        }
        frameList.push({ selector, declarations: list });
      }
      keyframes.push({ name, frames: frameList });
    }
  }

  if (tailwind?.animation !== undefined) {
    const anims = asRecord(slug, "tailwind.animation", tailwind.animation);
    for (const name of Object.keys(anims).sort()) {
      validateStyleName(slug, "animation", name);
      const value = asStringOrNumber(slug, `tailwind.animation[${name}]`, anims[name]);
      validateCssValue(slug, `tailwind.animation[${name}]`, value);
      count();
      animations.push({ name, value });
    }
  }

  const collectVars = (label: string, record: JsonRecord | undefined, out: Array<{ name: string; value: string }>): void => {
    if (record === undefined) return;
    const vars = asRecord(slug, label, record);
    for (const key of Object.keys(vars).sort()) {
      const name = normalizeCssVarName(slug, key);
      const value = asStringOrNumber(slug, `${label}[${key}]`, vars[key]);
      validateCssValue(slug, `${label}[${key}]`, value);
      count();
      out.push({ name, value });
    }
  };
  collectVars("cssVars.light", cssVars?.light, varsLight);
  collectVars("cssVars.dark", cssVars?.dark, varsDark);

  keyframes.sort((a, b) => (a.name < b.name ? -1 : 1));
  animations.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { keyframes, animations, varsLight, varsDark, declarationCount: declarations };
}

import { z } from "zod";
import { isDangerousKey } from "./hashable-json.js";

/**
 * Per-component playground definition (`playground.json`, components only).
 *
 * A playground declares the live-tweakable props of one component for the
 * detail-page sandbox. Each control maps to a real
 * component prop (`key`); the builder verifies that mapping against the
 * component source, and the web playground generates its controls, URL state,
 * and usage snippet from this definition.
 *
 * Placement (deliberate): a sibling `playground.json`, NOT a `meta.json`
 * field and NOT merged into `/r/<slug>.json`. Both `MetaSchema` and
 * `RegistryItemSchema` are `.strict()`, and the CLI parses items with the
 * shared strict schema — any new field there would make already-published
 * CLIs reject new items with exit 4. The builder emits the validated
 * definition as a sidecar file (`playground/<slug>.json`) that old CLIs
 * never fetch, and the playground is EXCLUDED from the item hash: tweaking
 * website controls changes no installed code, so it must not bump versions.
 * <!-- TODO(question): owner to confirm playground stays outside the item
 * hash (no version bump on control-only edits). -->
 */

/** Max controls per component (chosen bound; keeps the panel usable). */
export const MAX_PLAYGROUND_CONTROLS = 32;

/** Max items in a `colors` control (chosen bound). */
export const MAX_PLAYGROUND_COLORS = 8;

/** Max chars of a `text` default (chosen bound). */
export const MAX_PLAYGROUND_TEXT = 500;

/** A control key names a real component prop: a JS identifier, never a pollution key. */
export const PlaygroundKeySchema = z
  .string()
  .min(1, "control key must not be empty")
  .max(64, "control key must be at most 64 characters")
  .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "control key must be a valid JS property name")
  .refine(
    (key) => !isDangerousKey(key),
    'key "__proto__", "constructor", and "prototype" are not allowed',
  );

const LabelSchema = z
  .string()
  .min(1, "control label must not be empty")
  .max(80, "control label must be at most 80 characters");

const DescriptionSchema = z
  .string()
  .max(200, "control description must be at most 200 characters")
  .optional();

const GroupSchema = z
  .string()
  .min(1, "control group must not be empty")
  .max(40, "control group must be at most 40 characters")
  .optional();

const FiniteNumberSchema = z
  .number()
  .refine((value) => Number.isFinite(value), "value must be a finite number");

const HexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    "color must be hex (#rgb, #rgba, #rrggbb, or #rrggbbaa)",
  );

const UnitSchema = z
  .string()
  .min(1, "unit must not be empty")
  .max(12, "unit must be at most 12 characters")
  .optional();

function numericControl<K extends "number" | "range" | "duration">(kind: K) {
  return z
    .object({
      kind: z.literal(kind),
      key: PlaygroundKeySchema,
      label: LabelSchema,
      description: DescriptionSchema,
      group: GroupSchema,
      default: FiniteNumberSchema,
      min: FiniteNumberSchema.optional(),
      max: FiniteNumberSchema.optional(),
      step: FiniteNumberSchema.refine((value) => value > 0, "step must be positive").optional(),
      unit: UnitSchema,
    })
    .strict()
    .superRefine((control, ctx) => {
      if (control.min !== undefined && control.max !== undefined && control.min > control.max) {
        ctx.addIssue({ code: "custom", message: "min must not exceed max" });
      }
      if (control.min !== undefined && control.default < control.min) {
        ctx.addIssue({ code: "custom", message: "default must not be below min" });
      }
      if (control.max !== undefined && control.default > control.max) {
        ctx.addIssue({ code: "custom", message: "default must not exceed max" });
      }
    });
}

const NumberControlSchema = numericControl("number");
const RangeControlSchema = numericControl("range");
const DurationControlSchema = numericControl("duration");

const ColorControlSchema = z
  .object({
    kind: z.literal("color"),
    key: PlaygroundKeySchema,
    label: LabelSchema,
    description: DescriptionSchema,
    group: GroupSchema,
    default: HexColorSchema,
    alpha: z.boolean().optional(),
  })
  .strict();

const ColorsControlSchema = z
  .object({
    kind: z.literal("colors"),
    key: PlaygroundKeySchema,
    label: LabelSchema,
    description: DescriptionSchema,
    group: GroupSchema,
    default: z.array(HexColorSchema).min(1).max(MAX_PLAYGROUND_COLORS),
    minItems: z.int().min(1).max(MAX_PLAYGROUND_COLORS).optional(),
    maxItems: z.int().min(1).max(MAX_PLAYGROUND_COLORS).optional(),
  })
  .strict()
  .superRefine((control, ctx) => {
    if (
      control.minItems !== undefined &&
      control.maxItems !== undefined &&
      control.minItems > control.maxItems
    ) {
      ctx.addIssue({ code: "custom", message: "minItems must not exceed maxItems" });
    }
    const low = control.minItems ?? control.default.length;
    const high = control.maxItems ?? control.default.length;
    if (control.default.length < low || control.default.length > high) {
      ctx.addIssue({ code: "custom", message: "default item count must fit minItems/maxItems" });
    }
  });

const BooleanControlSchema = z
  .object({
    kind: z.literal("boolean"),
    key: PlaygroundKeySchema,
    label: LabelSchema,
    description: DescriptionSchema,
    group: GroupSchema,
    default: z.boolean(),
  })
  .strict();

function optionsControl<K extends "select" | "radio">(kind: K) {
  return z
    .object({
      kind: z.literal(kind),
      key: PlaygroundKeySchema,
      label: LabelSchema,
      description: DescriptionSchema,
      group: GroupSchema,
      default: z.string().min(1).max(80),
      options: z
        .array(z.string().min(1).max(80))
        .min(2, "options needs at least 2 entries")
        .max(20, "options allows at most 20 entries")
        .refine((options) => new Set(options).size === options.length, "options must be unique"),
    })
    .strict()
    .superRefine((control, ctx) => {
      if (!control.options.includes(control.default)) {
        ctx.addIssue({ code: "custom", message: "default must be one of options" });
      }
    });
}

const SelectControlSchema = optionsControl("select");
const RadioControlSchema = optionsControl("radio");

const TextControlSchema = z
  .object({
    kind: z.literal("text"),
    key: PlaygroundKeySchema,
    label: LabelSchema,
    description: DescriptionSchema,
    group: GroupSchema,
    default: z.string().max(MAX_PLAYGROUND_TEXT),
    maxLength: z.int().min(1).max(2000).optional(),
  })
  .strict();

export const PlaygroundControlSchema = z.discriminatedUnion("kind", [
  NumberControlSchema,
  RangeControlSchema,
  DurationControlSchema,
  ColorControlSchema,
  ColorsControlSchema,
  BooleanControlSchema,
  SelectControlSchema,
  RadioControlSchema,
  TextControlSchema,
]);

export type PlaygroundControl = z.infer<typeof PlaygroundControlSchema>;

/**
 * A component's `playground.json`. `.strict()`: unknown keys are rejected.
 * `key` values must be unique (one control per prop).
 */
export const PlaygroundSchema = z
  .object({
    controls: z
      .array(PlaygroundControlSchema)
      .min(1, "playground needs at least 1 control")
      .max(
        MAX_PLAYGROUND_CONTROLS,
        `playground allows at most ${String(MAX_PLAYGROUND_CONTROLS)} controls`,
      )
      .refine(
        (controls) => new Set(controls.map((control) => control.key)).size === controls.length,
        "control keys must be unique",
      ),
  })
  .strict();

export type Playground = z.infer<typeof PlaygroundSchema>;

/** JSON-serializable control values: string | number | boolean | string[] of hex colors. */
export type PlaygroundValue = string | number | boolean | string[];

export type PlaygroundValues = Record<string, PlaygroundValue>;

/** Defaults object (fresh array copies on every call). */
export function playgroundDefaults(definition: Playground): PlaygroundValues {
  const out: PlaygroundValues = {};
  for (const control of definition.controls) {
    const value = control.default;
    out[control.key] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

function sanitizeValue(control: PlaygroundControl, raw: unknown): PlaygroundValue {
  const fallback: PlaygroundValue = Array.isArray(control.default)
    ? [...control.default]
    : control.default;
  switch (control.kind) {
    case "number":
    case "range":
    case "duration": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
      const low = control.min ?? Number.NEGATIVE_INFINITY;
      const high = control.max ?? Number.POSITIVE_INFINITY;
      // Clamp only (no step snapping): the value stays truthful to the input.
      return Math.min(high, Math.max(low, raw));
    }
    case "color": {
      return typeof raw === "string" && HexColorSchema.safeParse(raw).success ? raw : fallback;
    }
    case "colors": {
      if (!Array.isArray(raw)) return fallback;
      const low = control.minItems ?? control.default.length;
      const high = control.maxItems ?? control.default.length;
      if (raw.length < low || raw.length > high) return fallback;
      if (
        !raw.every((entry) => typeof entry === "string" && HexColorSchema.safeParse(entry).success)
      ) {
        return fallback;
      }
      return [...(raw as string[])];
    }
    case "boolean": {
      return typeof raw === "boolean" ? raw : fallback;
    }
    case "select":
    case "radio": {
      return typeof raw === "string" && control.options.includes(raw) ? raw : fallback;
    }
    case "text": {
      if (typeof raw !== "string") return fallback;
      return raw.slice(0, control.maxLength ?? MAX_PLAYGROUND_TEXT);
    }
  }
}

/**
 * Validate/clamp an unknown values object against a definition. Unknown keys
 * are dropped, wrong-typed entries fall back to their control default, and
 * numbers are clamped to min/max. Never throws; missing input yields defaults.
 */
export function resolvePlaygroundValues(definition: Playground, input: unknown): PlaygroundValues {
  const out = playgroundDefaults(definition);
  if (typeof input !== "object" || input === null || Array.isArray(input)) return out;
  const record = input as Record<string, unknown>;
  for (const control of definition.controls) {
    const raw: unknown = Object.prototype.hasOwnProperty.call(record, control.key)
      ? record[control.key]
      : undefined;
    if (raw === undefined) continue;
    out[control.key] = sanitizeValue(control, raw);
  }
  return out;
}

function valuesEqual(a: PlaygroundValue, b: PlaygroundValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

/**
 * Entries that differ from their control default, in definition order.
 * Unknown keys in `values` are ignored; missing keys count as default.
 */
export function playgroundDiff(definition: Playground, values: PlaygroundValues): PlaygroundValues {
  const out: PlaygroundValues = {};
  for (const control of definition.controls) {
    const current: PlaygroundValue = Object.prototype.hasOwnProperty.call(values, control.key)
      ? (values[control.key] as PlaygroundValue)
      : (playgroundDefaults(definition)[control.key] as PlaygroundValue);
    const baseline: PlaygroundValue = Array.isArray(control.default)
      ? [...control.default]
      : control.default;
    if (!valuesEqual(current, baseline)) out[control.key] = current;
  }
  return out;
}

const COMPONENT_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

function escapeJsxAttributeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * JSX usage snippet with ONLY non-default props, in definition order, e.g.
 * `<AuroraText text="Hello" duration={3} colors={["#f0f","#0af","#0fa"]} />`.
 * Values are resolved (validated/clamped) first, so the snippet always shows
 * effective settings. Copy-safe: strings are JSX-escaped, arrays JSON-quoted.
 */
export function generateUsageSnippet(
  componentName: string,
  definition: Playground,
  values: unknown,
): string {
  if (!COMPONENT_NAME_PATTERN.test(componentName)) {
    throw new Error(`invalid component name "${componentName}" (PascalCase identifier expected)`);
  }
  const resolved = resolvePlaygroundValues(definition, values);
  const diff = playgroundDiff(definition, resolved);
  const parts: string[] = [];
  for (const control of definition.controls) {
    if (!Object.prototype.hasOwnProperty.call(diff, control.key)) continue;
    const value = diff[control.key] as PlaygroundValue;
    if (typeof value === "string") {
      parts.push(`${control.key}="${escapeJsxAttributeText(value)}"`);
    } else if (typeof value === "number") {
      parts.push(`${control.key}={${JSON.stringify(value)}}`);
    } else if (typeof value === "boolean") {
      parts.push(value ? control.key : `${control.key}={false}`);
    } else {
      parts.push(`${control.key}={${JSON.stringify(value)}}`);
    }
  }
  return parts.length === 0 ? `<${componentName} />` : `<${componentName} ${parts.join(" ")} />`;
}

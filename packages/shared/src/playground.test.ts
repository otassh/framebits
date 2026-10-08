import { describe, expect, it } from "vitest";
import {
  generateUsageSnippet,
  playgroundDefaults,
  playgroundDiff,
  resolvePlaygroundValues,
  PlaygroundSchema,
  type Playground,
} from "./playground.js";

const FULL: Playground = {
  controls: [
    { kind: "text", key: "text", label: "Text", default: "Hello" },
    { kind: "duration", key: "duration", label: "Duration", default: 6, min: 0.5, max: 30, step: 0.5, unit: "s" },
    { kind: "colors", key: "colors", label: "Stops", default: ["#f0abfc", "#7dd3fc", "#6ee7b7"] },
    { kind: "color", key: "background", label: "Background", default: "#0b0b0c", alpha: true },
    { kind: "number", key: "intensity", label: "Intensity", default: 1, min: 0, max: 2 },
    { kind: "range", key: "angle", label: "Angle", default: 90, min: 0, max: 360 },
    { kind: "boolean", key: "paused", label: "Paused", default: false },
    { kind: "select", key: "direction", label: "Direction", default: "right", options: ["left", "right"] },
    { kind: "radio", key: "size", label: "Size", default: "md", options: ["sm", "md", "lg"], group: "Look" },
  ],
};

describe("PlaygroundSchema", () => {
  it("accepts a full definition with every kind", () => {
    expect(PlaygroundSchema.safeParse(FULL).success).toBe(true);
  });

  it("accepts optional description and group fields", () => {
    const parsed = PlaygroundSchema.safeParse({
      controls: [
        { kind: "boolean", key: "on", label: "On", description: "Toggles it.", group: "State", default: true },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["empty controls", { controls: [] }],
    ["unknown top-level key", { controls: [], extra: 1 }],
    ["unknown kind", { controls: [{ kind: "slider", key: "x", label: "X", default: 1 }] }],
    ["unknown control key", { controls: [{ kind: "boolean", key: "on", label: "On", default: true, bogus: 1 }] }],
    ["duplicate keys", { controls: [
      { kind: "boolean", key: "on", label: "On", default: true },
      { kind: "text", key: "on", label: "Onn", default: "x" },
    ] }],
    ["bad prop key", { controls: [{ kind: "boolean", key: "not-a-prop!", label: "X", default: true }] }],
    ["min above max", { controls: [{ kind: "number", key: "n", label: "N", default: 1, min: 5, max: 2 }] }],
    ["default below min", { controls: [{ kind: "number", key: "n", label: "N", default: 0, min: 1 }] }],
    ["default above max", { controls: [{ kind: "number", key: "n", label: "N", default: 9, min: 1, max: 5 }] }],
    ["non-positive step", { controls: [{ kind: "range", key: "r", label: "R", default: 1, step: 0 }] }],
    ["NaN default", { controls: [{ kind: "number", key: "n", label: "N", default: Number.NaN }] }],
    ["bad hex color", { controls: [{ kind: "color", key: "c", label: "C", default: "red" }] }],
    ["bad hex in colors", { controls: [{ kind: "colors", key: "c", label: "C", default: ["#fff", "nope"] }] }],
    ["empty colors", { controls: [{ kind: "colors", key: "c", label: "C", default: [] }] }],
    ["default outside options", { controls: [{ kind: "select", key: "s", label: "S", default: "z", options: ["a", "b"] }] }],
    ["single option", { controls: [{ kind: "radio", key: "s", label: "S", default: "a", options: ["a"] }] }],
    ["duplicate options", { controls: [{ kind: "select", key: "s", label: "S", default: "a", options: ["a", "a"] }] }],
    ["minItems above maxItems", { controls: [{ kind: "colors", key: "c", label: "C", default: ["#fff"], minItems: 3, maxItems: 2 }] }],
  ])("rejects %s", (_rule, value) => {
    expect(PlaygroundSchema.safeParse(value).success).toBe(false);
  });

  it.each(["__proto__", "constructor", "prototype"])("rejects dangerous key %s", (key) => {
    expect(
      PlaygroundSchema.safeParse({
        controls: [{ kind: "text", key, label: "X", default: "y" }],
      }).success,
    ).toBe(false);
  });
});

describe("playgroundDefaults", () => {
  it("returns every default with fresh array copies", () => {
    const first = playgroundDefaults(FULL);
    expect(first["text"]).toBe("Hello");
    expect(first["duration"]).toBe(6);
    expect(first["paused"]).toBe(false);
    expect(first["colors"]).toEqual(["#f0abfc", "#7dd3fc", "#6ee7b7"]);
    (first["colors"] as string[]).push("#000");
    expect(playgroundDefaults(FULL)["colors"]).toEqual(["#f0abfc", "#7dd3fc", "#6ee7b7"]);
  });
});

describe("resolvePlaygroundValues", () => {
  it("returns defaults for missing, null, or non-object input", () => {
    expect(resolvePlaygroundValues(FULL, undefined)).toEqual(playgroundDefaults(FULL));
    expect(resolvePlaygroundValues(FULL, null)).toEqual(playgroundDefaults(FULL));
    expect(resolvePlaygroundValues(FULL, [])).toEqual(playgroundDefaults(FULL));
    expect(resolvePlaygroundValues(FULL, "nope")).toEqual(playgroundDefaults(FULL));
  });

  it("clamps numbers and falls back on wrong types", () => {
    const resolved = resolvePlaygroundValues(FULL, {
      duration: 99,
      intensity: -5,
      angle: "wide",
      paused: 1,
    });
    expect(resolved["duration"]).toBe(30);
    expect(resolved["intensity"]).toBe(0);
    expect(resolved["angle"]).toBe(90);
    expect(resolved["paused"]).toBe(false);
  });

  it("keeps valid values and drops unknown keys", () => {
    const resolved = resolvePlaygroundValues(FULL, {
      text: "Hi",
      paused: true,
      direction: "left",
      size: "xl",
      evil: "dropped",
      __proto__: "dropped",
    });
    expect(resolved["text"]).toBe("Hi");
    expect(resolved["paused"]).toBe(true);
    expect(resolved["direction"]).toBe("left");
    expect(resolved["size"]).toBe("md");
    expect("evil" in resolved).toBe(false);
  });

  it("validates colors strictly and truncates text", () => {
    const resolved = resolvePlaygroundValues(FULL, {
      background: "not-a-color",
      colors: ["#fff", "nope", "#000"],
      text: "x".repeat(600),
    });
    expect(resolved["background"]).toBe("#0b0b0c");
    expect(resolved["colors"]).toEqual(["#f0abfc", "#7dd3fc", "#6ee7b7"]);
    expect((resolved["text"] as string).length).toBe(500);
    const ok = resolvePlaygroundValues(FULL, { colors: ["#111", "#222", "#333"] });
    expect(ok["colors"]).toEqual(["#111", "#222", "#333"]);
  });
});

describe("playgroundDiff", () => {
  it("lists only non-default props in definition order", () => {
    const diff = playgroundDiff(FULL, { ...playgroundDefaults(FULL), text: "Hi", paused: true });
    expect(Object.keys(diff)).toEqual(["text", "paused"]);
  });

  it("compares color arrays element-wise and ignores unknown keys", () => {
    const same = playgroundDiff(
      FULL,
      Object.assign(playgroundDefaults(FULL), {
        colors: ["#f0abfc", "#7dd3fc", "#6ee7b7"],
        unknown: 1,
      }),
    );
    expect(same).toEqual({});
    const changed = playgroundDiff(FULL, {
      ...playgroundDefaults(FULL),
      colors: ["#f0abfc", "#7dd3fc"],
    });
    expect(changed).toEqual({ colors: ["#f0abfc", "#7dd3fc"] });
  });
});

describe("generateUsageSnippet", () => {
  it("renders only non-default props", () => {
    expect(generateUsageSnippet("AuroraText", FULL, playgroundDefaults(FULL))).toBe("<AuroraText />");
    expect(
      generateUsageSnippet("AuroraText", FULL, { text: "Hello there", duration: 3, colors: ["#f0f", "#0af", "#0fa"] }),
    ).toBe('<AuroraText text="Hello there" duration={3} colors={["#f0f","#0af","#0fa"]} />');
  });

  it("renders booleans bare when true and explicit when false-by-change", () => {
    const def: Playground = {
      controls: [{ kind: "boolean", key: "active", label: "Active", default: true }],
    };
    expect(generateUsageSnippet("Widget", def, { active: false })).toBe("<Widget active={false} />");
    const def2: Playground = {
      controls: [{ kind: "boolean", key: "paused", label: "Paused", default: false }],
    };
    expect(generateUsageSnippet("Widget", def2, { paused: true })).toBe("<Widget paused />");
  });

  it("escapes quotes in text props and rejects bad component names", () => {
    expect(generateUsageSnippet("Widget", FULL, { text: 'say "hi" <now>' })).toBe(
      '<Widget text="say &quot;hi&quot; &lt;now&gt;" />',
    );
    expect(() => generateUsageSnippet("not-a-component", FULL, {})).toThrow(/invalid component name/);
    expect(() => generateUsageSnippet("window.alert(1)", FULL, {})).toThrow(/invalid component name/);
  });

  it("resolves values before rendering, so invalid input shows defaults", () => {
    expect(generateUsageSnippet("AuroraText", FULL, { duration: 99, text: 42 })).toBe(
      "<AuroraText duration={30} />",
    );
  });
});

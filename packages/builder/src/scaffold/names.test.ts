import { describe, expect, it } from "vitest";
import { toCamelCase, toPascalCase, toTitleCase } from "./names.js";

describe("name conversions", () => {
  const table: Array<{
    slug: string;
    pascal: string;
    camel: string;
    title: string;
  }> = [
    { slug: "aurora-text", pascal: "AuroraText", camel: "auroraText", title: "Aurora Text" },
    { slug: "button", pascal: "Button", camel: "button", title: "Button" },
    { slug: "3d-card", pascal: "Ui3dCard", camel: "ui3dCard", title: "3d Card" },
    { slug: "use-mounted", pascal: "UseMounted", camel: "useMounted", title: "Use Mounted" },
    { slug: "gl-canvas", pascal: "GlCanvas", camel: "glCanvas", title: "Gl Canvas" },
  ];
  it.each(table)("$slug converts", ({ slug, pascal, camel, title }) => {
    expect(toPascalCase(slug)).toBe(pascal);
    expect(toCamelCase(slug)).toBe(camel);
    expect(toTitleCase(slug)).toBe(title);
  });

  it("produces valid identifiers for digit-leading slugs", () => {
    expect(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(toPascalCase("3d-card"))).toBe(true);
    expect(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(toCamelCase("3d-card"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { generateBlock } from "./generate.js";
import { validateStyles } from "./validate.js";

const SHIMMER_TAILWIND = {
  keyframes: {
    shimmer: {
      from: { "background-position": "200% 0" },
      to: { "background-position": "-200% 0" },
    },
  },
  animation: { shimmer: "shimmer 2s linear infinite" },
};

describe("generateBlock shimmer-button goldens", () => {
  it("matches the v3 golden", () => {
    const validated = validateStyles("shimmer-button", SHIMMER_TAILWIND, undefined);
    expect(generateBlock("shimmer-button", validated, 3)).toBe(
      [
        "/* algorithco-ui:begin shimmer-button */",
        "@keyframes shimmer {",
        "  from {",
        "    background-position: 200% 0;",
        "  }",
        "  to {",
        "    background-position: -200% 0;",
        "  }",
        "}",
        "@layer utilities {",
        "  .animate-shimmer {",
        "    animation: shimmer 2s linear infinite;",
        "  }",
        "}",
        "/* algorithco-ui:end shimmer-button */",
      ].join("\n"),
    );
  });

  it("matches the v4 golden", () => {
    const validated = validateStyles("shimmer-button", SHIMMER_TAILWIND, undefined);
    expect(generateBlock("shimmer-button", validated, 4)).toBe(
      [
        "/* algorithco-ui:begin shimmer-button */",
        "@theme {",
        "  --animate-shimmer: shimmer 2s linear infinite;",
        "  @keyframes shimmer {",
        "    from {",
        "      background-position: 200% 0;",
        "    }",
        "    to {",
        "      background-position: -200% 0;",
        "    }",
        "  }",
        "}",
        "/* algorithco-ui:end shimmer-button */",
      ].join("\n"),
    );
  });
});

describe("generateBlock synthetic multi-keyframe + vars", () => {
  const validated = validateStyles(
    "multi",
    {
      keyframes: {
        zebra: { "0%, 100%": { opacity: "0" }, "50%": { opacity: "1" } },
        alpha: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: { zebra: "zebra 1s ease infinite", alpha: "alpha 2s linear infinite" },
    },
    { light: { brand: "#fff" }, dark: { brand: "#000" } },
  );

  it("v3 orders names deterministically", () => {
    const block = generateBlock("multi", validated, 3);
    expect(block).toBe(
      [
        "/* algorithco-ui:begin multi */",
        "@keyframes alpha {",
        "  from {",
        "    opacity: 0;",
        "  }",
        "  to {",
        "    opacity: 1;",
        "  }",
        "}",
        "@keyframes zebra {",
        "  0%, 100% {",
        "    opacity: 0;",
        "  }",
        "  50% {",
        "    opacity: 1;",
        "  }",
        "}",
        "@layer utilities {",
        "  .animate-alpha {",
        "    animation: alpha 2s linear infinite;",
        "  }",
        "}",
        "@layer utilities {",
        "  .animate-zebra {",
        "    animation: zebra 1s ease infinite;",
        "  }",
        "}",
        "@layer base {",
        "  :root {",
        "    --brand: #fff;",
        "  }",
        "  .dark {",
        "    --brand: #000;",
        "  }",
        "}",
        "/* algorithco-ui:end multi */",
      ].join("\n"),
    );
  });

  it("v4 nests keyframes in @theme with plain var blocks", () => {
    const block = generateBlock("multi", validated, 4);
    expect(block).toBe(
      [
        "/* algorithco-ui:begin multi */",
        "@theme {",
        "  --animate-alpha: alpha 2s linear infinite;",
        "  --animate-zebra: zebra 1s ease infinite;",
        "  @keyframes alpha {",
        "    from {",
        "      opacity: 0;",
        "    }",
        "    to {",
        "      opacity: 1;",
        "    }",
        "  }",
        "  @keyframes zebra {",
        "    0%, 100% {",
        "      opacity: 0;",
        "    }",
        "    50% {",
        "      opacity: 1;",
        "    }",
        "  }",
        "}",
        ":root {",
        "  --brand: #fff;",
        "}",
        ".dark {",
        "  --brand: #000;",
        "}",
        "/* algorithco-ui:end multi */",
      ].join("\n"),
    );
  });

  it("uses LF only with 2-space indent", () => {
    const block = generateBlock("multi", validated, 3);
    expect(block.includes("\r")).toBe(false);
    expect(block).toContain("\n    opacity: 0;");
  });
});

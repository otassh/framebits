import { describe, expect, it } from "vitest";
import { App } from "./app.js";

describe("web package smoke", () => {
  it("exports the production application root", () => {
    expect(App).toBeTypeOf("function");
  });
});

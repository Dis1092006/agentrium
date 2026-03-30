import { describe, it, expect } from "vitest";
import { createProductManager } from "../../src/agents/productManager.js";

describe("ProductManager agent", () => {
  it("has correct name and tools", () => {
    const pm = createProductManager();
    expect(pm.name).toBe("product-manager");
    expect(pm.tools).toEqual(["Read", "Glob", "Grep", "WebSearch"]);
  });

  it("system prompt includes role description", () => {
    const pm = createProductManager();
    const prompt = pm.buildSystemPrompt("test context");
    expect(prompt).toContain("Product Manager");
    expect(prompt).toContain("test context");
  });
});

import { describe, it, expect } from "vitest";
import { createArchitect } from "../../src/agents/architect.js";

describe("Architect agent", () => {
  it("has correct name and tools", () => {
    const arch = createArchitect();
    expect(arch.name).toBe("architect");
    expect(arch.tools).toEqual(["Read", "Glob", "Grep"]);
  });

  it("system prompt includes role description", () => {
    const arch = createArchitect();
    const prompt = arch.buildSystemPrompt("test context");
    expect(prompt).toContain("Architect");
    expect(prompt).toContain("test context");
  });
});

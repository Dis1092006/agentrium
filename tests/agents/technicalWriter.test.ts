// tests/agents/technicalWriter.test.ts
import { describe, it, expect } from "vitest";
import { createTechnicalWriter } from "../../src/agents/technicalWriter.js";

describe("Technical Writer agent", () => {
  it("has correct name and tools", () => {
    const agent = createTechnicalWriter();
    expect(agent.name).toBe("technical-writer");
    expect(agent.tools).toEqual(["Read", "Write", "Edit", "Glob"]);
  });

  it("system prompt includes Technical Writer role", () => {
    const agent = createTechnicalWriter();
    const prompt = agent.buildSystemPrompt("test context");
    expect(prompt).toContain("Technical Writer");
    expect(prompt).toContain("test context");
  });
});

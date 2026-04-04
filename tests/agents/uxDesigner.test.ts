import { describe, it, expect } from "vitest";
import { createUxDesigner } from "../../src/agents/uxDesigner.js";

describe("UX Designer agent", () => {
  it("has correct name and tools", () => {
    const agent = createUxDesigner();
    expect(agent.name).toBe("ux-designer");
    expect(agent.tools).toEqual(["Read", "Glob", "WebSearch"]);
  });

  it("system prompt includes UX Designer role", () => {
    const agent = createUxDesigner();
    const prompt = agent.buildSystemPrompt("test context");
    expect(prompt).toContain("UX Designer");
    expect(prompt).toContain("test context");
  });
});

import { describe, it, expect } from "vitest";
import { BaseAgent } from "../../src/agents/base.js";

describe("BaseAgent", () => {
  it("stores config properties", () => {
    const agent = new BaseAgent({
      name: "test-agent",
      description: "A test agent",
      systemPrompt: "You are a test agent.",
      tools: ["Read", "Glob"],
    });

    expect(agent.name).toBe("test-agent");
    expect(agent.description).toBe("A test agent");
    expect(agent.tools).toEqual(["Read", "Glob"]);
  });

  it("builds full system prompt with context", () => {
    const agent = new BaseAgent({
      name: "test-agent",
      description: "A test agent",
      systemPrompt: "You are a test agent.",
      tools: ["Read"],
    });

    const fullPrompt = agent.buildSystemPrompt("## Repo context here");
    expect(fullPrompt).toContain("You are a test agent.");
    expect(fullPrompt).toContain("## Repo context here");
  });
});

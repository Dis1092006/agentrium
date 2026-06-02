import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseAgent } from "../../src/agents/base.js";

// Mock the SDK so it yields one intermediate assistant message then a result message.
vi.mock("@anthropic-ai/claude-agent-sdk", () => {
  const query = vi.fn(async function* () {
    yield { type: "assistant", content: "Thinking..." };
    yield { result: "mocked artifact output" };
  });
  return { query };
});

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

  it("returns the final artifact from the SDK", async () => {
    const agent = new BaseAgent({
      name: "test-agent",
      description: "A test agent",
      systemPrompt: "You are a test agent.",
      tools: ["Read"],
    });

    const result = await agent.run("ctx", "task");
    expect(result.artifact).toBe("mocked artifact output");
    expect(result.metadata).toEqual({ agent: "test-agent" });
  });

  it("forwards intermediate messages via onMessage callback", async () => {
    const agent = new BaseAgent({
      name: "test-agent",
      description: "A test agent",
      systemPrompt: "You are a test agent.",
      tools: ["Read"],
    });

    const seen: unknown[] = [];
    const result = await agent.run("ctx", "task", { onMessage: (m) => seen.push(m) });
    expect(result.artifact).toBe("mocked artifact output");
    expect(seen.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects immediately when an already-aborted external signal is provided", async () => {
    const agent = new BaseAgent({
      name: "test-agent",
      description: "A test agent",
      systemPrompt: "You are a test agent.",
      tools: ["Read"],
    });

    const ac = new AbortController();
    ac.abort();
    await expect(agent.run("ctx", "task", { signal: ac.signal })).rejects.toThrow();
  });
});

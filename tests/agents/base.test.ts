import { describe, it, expect, vi, beforeEach } from "vitest";

const queryImpl = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: unknown) => queryImpl(args),
}));

import { BaseAgent } from "../../src/agents/base.js";

function makeAgent() {
  return new BaseAgent({ name: "t", description: "d", systemPrompt: "p", tools: [] });
}

function normalGenerator() {
  return (async function* () {
    yield { type: "assistant", content: "Thinking..." };
    yield { result: "mocked artifact output" };
  })();
}

beforeEach(() => {
  queryImpl.mockReset();
  queryImpl.mockImplementation(() => normalGenerator());
});

describe("BaseAgent config", () => {
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

describe("BaseAgent.run streaming + abort", () => {
  it("returns the final artifact and forwards every intermediate message via onMessage", async () => {
    const agent = makeAgent();
    const seen: unknown[] = [];
    const result = await agent.run("ctx", "task", { onMessage: (m) => seen.push(m) });
    expect(result.artifact).toBe("mocked artifact output");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ type: "assistant", content: "Thinking..." });
  });

  it("rejects when the external signal is already aborted", async () => {
    const agent = makeAgent();
    const ac = new AbortController();
    ac.abort();
    await expect(agent.run("ctx", "task", { signal: ac.signal })).rejects.toThrow();
  });

  it("throws a distinct timeout error when the agent exceeds timeoutMs", async () => {
    queryImpl.mockImplementation((args: { options: { abortController: AbortController } }) => {
      const signal = args.options.abortController.signal;
      return (async function* () {
        yield { type: "assistant", content: "Working..." };
        await new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        yield { result: "never reached" };
      })();
    });
    const agent = makeAgent();
    await expect(agent.run("ctx", "task", { timeoutMs: 10 })).rejects.toThrow(/timed out/);
  });
});

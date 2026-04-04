import { describe, it, expect } from "vitest";
import { createAgentByName, getRegisteredAgentNames } from "../../src/agents/registry.js";

describe("agent registry", () => {
  it("creates product-manager agent by name", () => {
    const agent = createAgentByName("product-manager");
    expect(agent.name).toBe("product-manager");
  });

  it("creates architect agent by name", () => {
    const agent = createAgentByName("architect");
    expect(agent.name).toBe("architect");
  });

  it("creates software-engineer agent by name", () => {
    const agent = createAgentByName("software-engineer");
    expect(agent.name).toBe("software-engineer");
  });

  it("creates qa-engineer agent by name", () => {
    const agent = createAgentByName("qa-engineer");
    expect(agent.name).toBe("qa-engineer");
  });

  it("creates code-reviewer-logic agent by name", () => {
    const agent = createAgentByName("code-reviewer-logic");
    expect(agent.name).toBe("code-reviewer-logic");
  });

  it("creates code-reviewer-security agent by name", () => {
    const agent = createAgentByName("code-reviewer-security");
    expect(agent.name).toBe("code-reviewer-security");
  });

  it("creates review-arbiter agent by name", () => {
    const agent = createAgentByName("review-arbiter");
    expect(agent.name).toBe("review-arbiter");
  });

  it("creates ux-designer agent by name", () => {
    const agent = createAgentByName("ux-designer");
    expect(agent.name).toBe("ux-designer");
  });

  it("creates technical-writer agent by name", () => {
    const agent = createAgentByName("technical-writer");
    expect(agent.name).toBe("technical-writer");
  });

  it("throws for unknown agent name", () => {
    expect(() => createAgentByName("unknown-agent")).toThrow('Unknown agent: "unknown-agent"');
  });

  it("lists all registered agent names", () => {
    const names = getRegisteredAgentNames();
    expect(names).toContain("product-manager");
    expect(names).toContain("architect");
    expect(names).toContain("software-engineer");
    expect(names).toContain("qa-engineer");
    expect(names).toContain("code-reviewer-logic");
    expect(names).toContain("code-reviewer-security");
    expect(names).toContain("review-arbiter");
    expect(names).toContain("ux-designer");
    expect(names).toContain("technical-writer");
  });
});

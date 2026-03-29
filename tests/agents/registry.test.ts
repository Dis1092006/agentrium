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

  it("throws for unknown agent name", () => {
    expect(() => createAgentByName("unknown-agent")).toThrow('Unknown agent: "unknown-agent"');
  });

  it("lists all registered agent names", () => {
    const names = getRegisteredAgentNames();
    expect(names).toContain("product-manager");
    expect(names).toContain("architect");
    expect(names).toContain("software-engineer");
    expect(names).toContain("qa-engineer");
  });
});

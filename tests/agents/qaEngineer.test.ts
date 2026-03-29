import { describe, it, expect } from "vitest";
import { createQAEngineer } from "../../src/agents/qaEngineer.js";

describe("QAEngineer agent", () => {
  it("has correct name and tools", () => {
    const qa = createQAEngineer();
    expect(qa.name).toBe("qa-engineer");
    expect(qa.tools).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "Bash"]);
  });

  it("system prompt includes role description", () => {
    const qa = createQAEngineer();
    const prompt = qa.buildSystemPrompt("test context");
    expect(prompt).toContain("QA Engineer");
    expect(prompt).toContain("test context");
  });
});

import { describe, it, expect } from "vitest";
import { createSoftwareEngineer } from "../../src/agents/softwareEngineer.js";

describe("SoftwareEngineer agent", () => {
  it("has correct name and tools", () => {
    const eng = createSoftwareEngineer();
    expect(eng.name).toBe("software-engineer");
    expect(eng.tools).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "Bash"]);
  });

  it("system prompt includes role description", () => {
    const eng = createSoftwareEngineer();
    const prompt = eng.buildSystemPrompt("test context");
    expect(prompt).toContain("Software Engineer");
    expect(prompt).toContain("test context");
  });
});

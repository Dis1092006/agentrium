// tests/agents/codeReviewer.test.ts
import { describe, it, expect } from "vitest";
import { createLogicReviewer, createSecurityReviewer } from "../../src/agents/codeReviewer.js";

describe("Code Reviewer agents", () => {
  describe("Logic Reviewer", () => {
    it("has correct name and tools", () => {
      const reviewer = createLogicReviewer();
      expect(reviewer.name).toBe("code-reviewer-logic");
      expect(reviewer.tools).toEqual(["Read", "Glob", "Grep"]);
    });

    it("system prompt includes logic focus", () => {
      const reviewer = createLogicReviewer();
      const prompt = reviewer.buildSystemPrompt("test context");
      expect(prompt).toContain("Logic & Correctness");
      expect(prompt).toContain("test context");
    });
  });

  describe("Security Reviewer", () => {
    it("has correct name and tools", () => {
      const reviewer = createSecurityReviewer();
      expect(reviewer.name).toBe("code-reviewer-security");
      expect(reviewer.tools).toEqual(["Read", "Glob", "Grep"]);
    });

    it("system prompt includes security focus", () => {
      const reviewer = createSecurityReviewer();
      const prompt = reviewer.buildSystemPrompt("test context");
      expect(prompt).toContain("Security & Conventions");
      expect(prompt).toContain("test context");
    });
  });
});

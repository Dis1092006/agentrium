// tests/agents/reviewArbiter.test.ts
import { describe, it, expect } from "vitest";
import { createReviewArbiter } from "../../src/agents/reviewArbiter.js";

describe("ReviewArbiter agent", () => {
  it("has correct name and tools", () => {
    const arbiter = createReviewArbiter();
    expect(arbiter.name).toBe("review-arbiter");
    expect(arbiter.tools).toEqual(["Read"]);
  });

  it("system prompt includes arbiter role", () => {
    const arbiter = createReviewArbiter();
    const prompt = arbiter.buildSystemPrompt("test context");
    expect(prompt).toContain("Review Arbiter");
    expect(prompt).toContain("test context");
  });
});

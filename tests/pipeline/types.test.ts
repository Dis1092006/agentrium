import { describe, it, expect } from "vitest";
import { Stage, STAGE_ORDER, isOptionalStage } from "../../src/pipeline/types.js";

describe("Stage", () => {
  it("defines all pipeline stages in order", () => {
    expect(STAGE_ORDER).toEqual([
      "analysis",
      "design",
      "architecture",
      "implementation",
      "testing",
      "documentation",
      "review",
    ]);
  });

  it("identifies optional stages", () => {
    expect(isOptionalStage("design")).toBe(true);
    expect(isOptionalStage("documentation")).toBe(true);
    expect(isOptionalStage("analysis")).toBe(false);
    expect(isOptionalStage("implementation")).toBe(false);
  });
});

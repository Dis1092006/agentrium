import { describe, it, expect } from "vitest";
import { buildPipelineStages } from "../../src/pipeline/pipeline.js";
import type { PipelineConfig } from "../../src/pipeline/types.js";

describe("buildPipelineStages", () => {
  it("returns all non-optional stages when no skips configured", () => {
    const config: PipelineConfig = {
      checkpoints: "all",
      skipStages: [],
    };
    const stages = buildPipelineStages(config);
    const names = stages.map((s) => s.stage);
    expect(names).toEqual([
      "analysis",
      "architecture",
      "implementation",
      "testing",
      "review",
    ]);
  });

  it("skips optional stages by default", () => {
    const config: PipelineConfig = {
      checkpoints: "all",
      skipStages: [],
    };
    const stages = buildPipelineStages(config);
    const names = stages.map((s) => s.stage);
    expect(names).not.toContain("design");
    expect(names).not.toContain("documentation");
  });

  it("skips explicitly configured stages", () => {
    const config: PipelineConfig = {
      checkpoints: "none",
      skipStages: ["testing"],
    };
    const stages = buildPipelineStages(config);
    const names = stages.map((s) => s.stage);
    expect(names).not.toContain("testing");
    expect(names).not.toContain("design");
    expect(names).not.toContain("documentation");
  });

  it("includes optional stages when explicitly requested", () => {
    const config: PipelineConfig = {
      checkpoints: "all",
      skipStages: [],
    };
    const stages = buildPipelineStages(config, ["design"]);
    const names = stages.map((s) => s.stage);
    expect(names).toContain("design");
    expect(names.indexOf("design")).toBeLessThan(names.indexOf("architecture"));
  });

  it("maps stages to correct agent names", () => {
    const config: PipelineConfig = { checkpoints: "all", skipStages: [] };
    const stages = buildPipelineStages(config);
    const agentMap = Object.fromEntries(stages.map((s) => [s.stage, s.agentName]));
    expect(agentMap["analysis"]).toBe("product-manager");
    expect(agentMap["architecture"]).toBe("architect");
    expect(agentMap["implementation"]).toBe("software-engineer");
    expect(agentMap["testing"]).toBe("qa-engineer");
    expect(agentMap["review"]).toBe("code-reviewer");
  });

  it("marks checkpoint stages based on config 'all'", () => {
    const config: PipelineConfig = { checkpoints: "all", skipStages: [] };
    const stages = buildPipelineStages(config);
    expect(stages.every((s) => s.hasCheckpoint)).toBe(true);
  });

  it("marks no checkpoint stages when config is 'none'", () => {
    const config: PipelineConfig = { checkpoints: "none", skipStages: [] };
    const stages = buildPipelineStages(config);
    expect(stages.every((s) => !s.hasCheckpoint)).toBe(true);
  });

  it("marks only specified checkpoint stages", () => {
    const config: PipelineConfig = {
      checkpoints: ["analysis", "review"],
      skipStages: [],
    };
    const stages = buildPipelineStages(config);
    const withCheckpoint = stages.filter((s) => s.hasCheckpoint).map((s) => s.stage);
    expect(withCheckpoint).toEqual(["analysis", "review"]);
  });
});

import { type Stage, STAGE_ORDER, isOptionalStage, type PipelineConfig } from "./types.js";

export interface PlannedStage {
  stage: Stage;
  agentName: string;
  hasCheckpoint: boolean;
}

const STAGE_AGENT_MAP: Record<Stage, string> = {
  analysis: "product-manager",
  design: "ux-designer",
  architecture: "architect",
  implementation: "software-engineer",
  testing: "qa-engineer",
  documentation: "technical-writer",
  review: "code-reviewer",
};

export function buildPipelineStages(
  config: PipelineConfig,
  includeOptional: Stage[] = [],
): PlannedStage[] {
  const includeSet = new Set(includeOptional);

  const stages = STAGE_ORDER.filter((stage) => {
    if (config.skipStages.includes(stage)) return false;
    if (isOptionalStage(stage) && !includeSet.has(stage)) return false;
    return true;
  });

  return stages.map((stage) => ({
    stage,
    agentName: STAGE_AGENT_MAP[stage],
    hasCheckpoint: resolveCheckpoint(config, stage),
  }));
}

function resolveCheckpoint(config: PipelineConfig, stage: Stage): boolean {
  if (config.checkpoints === "all") return true;
  if (config.checkpoints === "none") return false;
  return config.checkpoints.includes(stage);
}

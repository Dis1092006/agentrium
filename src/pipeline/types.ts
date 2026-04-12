export type Stage =
  | "analysis"
  | "design"
  | "architecture"
  | "implementation"
  | "testing"
  | "documentation"
  | "review";

export const STAGE_ORDER: Stage[] = [
  "analysis",
  "design",
  "architecture",
  "implementation",
  "testing",
  "documentation",
  "review",
];

const OPTIONAL_STAGES: Set<Stage> = new Set(["design", "documentation"]);

export function isOptionalStage(stage: Stage): boolean {
  return OPTIONAL_STAGES.has(stage);
}

export type CheckpointDecision = "approve" | "reject" | "skip" | "view";

export interface StageResult {
  stage: Stage;
  artifact: string;
  agentName: string;
  durationMs: number;
}

export interface PipelineConfig {
  checkpoints: "all" | "none" | Stage[];
  skipStages: Stage[];
  repoPath?: string | null;
  copilotReviewEnabled?: boolean;
  copilotReviewTimeoutMinutes?: number;
}

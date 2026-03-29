import chalk from "chalk";
import ora from "ora";
import type { Stage, PipelineConfig, StageResult, CheckpointDecision } from "./types.js";
import { STAGE_ORDER } from "./types.js";
import { buildPipelineStages, type PlannedStage } from "./pipeline.js";
import { promptCheckpoint } from "./checkpoint.js";
import { createAgentByName } from "../agents/registry.js";
import { ArtifactStore } from "../artifacts/store.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export class PipelineRunner {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;

  constructor(store: ArtifactStore, runId: string, workspaceContext: string) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
  }

  assembleAgentContext(currentStage: Stage): string {
    const sections: string[] = [this.workspaceContext];

    for (const stage of ARTIFACT_STAGES) {
      if (stage === currentStage) break;
      const artifact = this.store.readArtifact(this.runId, stage);
      if (artifact) {
        sections.push(`\n---\n\n## Previous Stage: ${stage}\n\n${artifact}`);
      }
    }

    return sections.join("\n");
  }

  buildTaskDescription(currentStage: Stage, originalTask: string): string {
    const meta = this.store.readMeta(this.runId);
    const completedStages = Object.keys(meta.stages);

    let desc = `Original task: ${originalTask}\n\n`;
    desc += `Current stage: ${currentStage}\n\n`;

    if (completedStages.length > 0) {
      desc += `Completed stages: ${completedStages.join(", ")}\n\n`;
      desc += `Review the outputs from previous stages (provided in your context) and produce your deliverable for the "${currentStage}" stage.`;
    } else {
      desc += `This is the first stage. Analyze the task and produce your deliverable.`;
    }

    return desc;
  }

  async runPipeline(
    task: string,
    config: PipelineConfig,
    includeOptional: Stage[] = [],
  ): Promise<void> {
    const stages = buildPipelineStages(config, includeOptional);

    console.log(chalk.blue(`Pipeline: ${stages.map((s) => s.stage).join(" → ")}`));
    console.log("");

    for (const planned of stages) {
      const result = await this.runStage(planned, task);

      if (!result) {
        console.log(chalk.yellow(`Stage "${planned.stage}" was skipped.`));
        continue;
      }

      if (planned.hasCheckpoint) {
        const decision = await promptCheckpoint(
          planned.stage,
          result.artifact,
          this.store,
          this.runId,
        );

        if (decision === "reject") {
          console.log(chalk.red(`Stage "${planned.stage}" rejected. Aborting pipeline.`));
          this.store.updateStatus(this.runId, "aborted");
          return;
        }

        if (decision === "skip") {
          console.log(chalk.yellow(`Skipping to next stage.`));
        }
      }
    }

    this.store.updateStatus(this.runId, "completed");
    console.log(chalk.green(`\nPipeline completed for run ${this.runId}.`));
  }

  private async runStage(planned: PlannedStage, task: string): Promise<StageResult | null> {
    const spinner = ora(`${planned.agentName} working on ${planned.stage}...`).start();
    const startTime = Date.now();

    try {
      const agent = createAgentByName(planned.agentName);
      const context = this.assembleAgentContext(planned.stage);
      const taskDesc = this.buildTaskDescription(planned.stage, task);
      const result = await agent.run(context, taskDesc);

      this.store.saveArtifact(this.runId, planned.stage, result.artifact);
      const durationMs = Date.now() - startTime;

      spinner.succeed(`${planned.stage} complete (${(durationMs / 1000).toFixed(1)}s)`);

      return {
        stage: planned.stage,
        artifact: result.artifact,
        agentName: planned.agentName,
        durationMs,
      };
    } catch (error) {
      spinner.fail(`${planned.stage} failed`);
      this.store.updateStatus(this.runId, "failed");
      throw error;
    }
  }
}

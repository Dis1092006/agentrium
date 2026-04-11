// src/pipeline/runner.ts
import chalk from "chalk";
import ora from "ora";
import type { Stage, PipelineConfig, StageResult } from "./types.js";
import { STAGE_ORDER } from "./types.js";
import { buildPipelineStages, type PlannedStage } from "./pipeline.js";
import { promptCheckpoint } from "./checkpoint.js";
import { createAgentByName } from "../agents/registry.js";
import { ArtifactStore } from "../artifacts/store.js";
import { ReviewProcess } from "../review/process.js";
import { slugifyTask, createBranch, commitChanges, pushBranch, createPR } from "../git/operations.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export class PipelineRunner {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;
  private readonly maxReviewIterations: number;
  private readonly agentTimeoutMs: number | undefined;
  private readonly repoPath: string | null;

  constructor(
    store: ArtifactStore,
    runId: string,
    workspaceContext: string,
    maxReviewIterations: number,
    repoPath: string | null = null,
    agentTimeoutMinutes: number | null = null,
  ) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
    this.maxReviewIterations = maxReviewIterations;
    this.repoPath = repoPath;
    this.agentTimeoutMs = agentTimeoutMinutes ? agentTimeoutMinutes * 60_000 : undefined;
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

  isReviewStage(stage: string): boolean {
    return stage === "review";
  }

  async runPipeline(
    task: string,
    config: PipelineConfig,
    includeOptional: Stage[] = [],
  ): Promise<void> {
    const stages = buildPipelineStages(config, includeOptional);

    console.log(chalk.blue(`Pipeline: ${stages.map((s) => s.stage).join(" → ")}`));
    console.log("");

    // Create git branch in target repo
    let branchName: string | null = null;
    if (this.repoPath) {
      branchName = `agentrium/${slugifyTask(task)}`;
      try {
        await createBranch(this.repoPath, branchName);
        console.log(chalk.gray(`Branch: ${branchName}`));
      } catch {
        console.log(chalk.yellow(`Warning: could not create branch "${branchName}". Continuing without git integration.`));
        branchName = null;
      }
    }

    for (const planned of stages) {
      const meta = this.store.readMeta(this.runId);
      if (meta.stages[planned.stage]) {
        console.log(chalk.gray(`Skipping ${planned.stage} (already completed)`));
        continue;
      }

      let result: StageResult | null;

      if (this.isReviewStage(planned.stage)) {
        result = await this.runReviewStage(planned, task);
      } else {
        result = await this.runStage(planned, task);
      }

      if (!result) {
        console.log(chalk.yellow(`Stage "${planned.stage}" was skipped.`));
        continue;
      }

      if (planned.hasCheckpoint) {
        const decision = await promptCheckpoint(
          planned.stage,
          result.artifact,
        );

        if (decision === "reject") {
          this.store.removeStage(this.runId, planned.stage);
          console.log(chalk.red(`Stage "${planned.stage}" rejected. Aborting pipeline.`));
          this.store.updateStatus(this.runId, "aborted");
          return;
        }

        if (decision === "skip") {
          console.log(chalk.yellow(`Skipping to next stage.`));
        }
      }

      // Commit after checkpoint (only reached if not rejected)
      if (this.repoPath && branchName && (planned.stage === "implementation" || planned.stage === "testing")) {
        const commitMsg = planned.stage === "implementation"
          ? `feat: ${task}`
          : `test: add tests for ${task}`;
        try {
          const committed = await commitChanges(this.repoPath, commitMsg);
          if (committed) {
            console.log(chalk.gray(`Committed changes for ${planned.stage} stage.`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(chalk.yellow(`Warning: failed to commit changes for ${planned.stage} stage: ${message}`));
        }
      }
    }

    this.store.updateStatus(this.runId, "completed");
    console.log(chalk.green(`\nPipeline completed for run ${this.runId}.`));

    // Push branch and create PR
    if (this.repoPath && branchName) {
      try {
        console.log(chalk.blue("\nCreating pull request..."));
        await pushBranch(this.repoPath, branchName);
        const analysisSummary = this.store.readArtifact(this.runId, "analysis") ?? "";
        const implSummary = this.store.readArtifact(this.runId, "implementation") ?? "";
        const prBody = [
          "## Summary",
          "",
          analysisSummary.slice(0, 1000),
          "",
          "## Implementation",
          "",
          implSummary.slice(0, 1000),
          "",
          "---",
          `_Generated by [agentrium](https://github.com/Dis1092006/agentrium) run \`${this.runId}\`_`,
        ].join("\n");
        const prUrl = createPR(this.repoPath, branchName, task, prBody);
        this.store.updatePrUrl(this.runId, prUrl);
        console.log(chalk.green(`Pull request created: ${prUrl}`));
      } catch {
        console.log(chalk.yellow(`Warning: could not create pull request. Push manually: git push origin ${branchName}`));
      }
    }
  }

  private async runStage(planned: PlannedStage, task: string): Promise<StageResult | null> {
    const spinner = ora(`${planned.agentName} working on ${planned.stage}...`).start();
    const startTime = Date.now();

    try {
      const agent = createAgentByName(planned.agentName);
      const context = this.assembleAgentContext(planned.stage);
      const taskDesc = this.buildTaskDescription(planned.stage, task);
      const result = await agent.run(context, taskDesc, this.agentTimeoutMs);

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

  private async runReviewStage(planned: PlannedStage, task: string): Promise<StageResult | null> {
    const startTime = Date.now();

    try {
      const reviewProcess = new ReviewProcess(
        this.store,
        this.runId,
        this.workspaceContext,
        this.maxReviewIterations,
        this.agentTimeoutMs,
      );

      const verdict = await reviewProcess.run(task);
      const durationMs = Date.now() - startTime;

      console.log(
        chalk.green(`Review complete: ${verdict} (${(durationMs / 1000).toFixed(1)}s)`),
      );

      const artifact = this.store.readArtifact(this.runId, "review") ?? "";

      return {
        stage: planned.stage,
        artifact,
        agentName: "review-process",
        durationMs,
      };
    } catch (error) {
      console.log(chalk.red("Review stage failed"));
      this.store.updateStatus(this.runId, "failed");
      throw error;
    }
  }
}

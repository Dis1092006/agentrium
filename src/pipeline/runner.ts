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
import { slugifyTask, createBranch, commitChanges, pushBranch, createPR, getUncommittedFiles } from "../git/operations.js";
import { extractPrNumber, requestCopilotReview } from "../github/copilotReview.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export class PipelineRunner {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;
  private readonly maxReviewIterations: number;
  private readonly agentTimeoutMs: number | undefined;
  private readonly repoPaths: string[];
  private readonly copilotReviewEnabled: boolean;
  private readonly copilotReviewTimeoutMs: number;

  constructor(
    store: ArtifactStore,
    runId: string,
    workspaceContext: string,
    maxReviewIterations: number,
    repoPaths: string[] = [],
    agentTimeoutMinutes: number | null = null,
    copilotReviewEnabled: boolean = false,
    copilotReviewTimeoutMinutes: number = 5,
  ) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
    this.maxReviewIterations = maxReviewIterations;
    this.repoPaths = repoPaths;
    this.agentTimeoutMs = agentTimeoutMinutes ? agentTimeoutMinutes * 60_000 : undefined;
    this.copilotReviewEnabled = copilotReviewEnabled;
    this.copilotReviewTimeoutMs = copilotReviewTimeoutMinutes * 60_000;
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

    const branchName = this.repoPaths.length > 0 ? `agentrium/${slugifyTask(task)}` : null;

    // Create git branch in each repo; track which ones succeeded
    const activePaths: string[] = [];
    if (branchName) {
      for (const repoPath of this.repoPaths) {
        try {
          await createBranch(repoPath, branchName);
          activePaths.push(repoPath);
          console.log(chalk.gray(`Branch: ${branchName} (${repoPath})`));
        } catch {
          console.log(chalk.yellow(`Warning: could not create branch in "${repoPath}". Skipping git integration for this repo.`));
        }
      }
    }

    // prNumber is set for the first repo's PR (used for Copilot review)
    let firstPrNumber = 0;
    const existingPrUrl = this.store.readMeta(this.runId).prUrl;
    if (existingPrUrl) {
      firstPrNumber = extractPrNumber(existingPrUrl.split("\n")[0]);
    }

    for (const planned of stages) {
      const meta = this.store.readMeta(this.runId);
      if (meta.stages[planned.stage]) {
        console.log(chalk.gray(`Skipping ${planned.stage} (already completed)`));
        continue;
      }

      let result: StageResult | null;

      if (this.isReviewStage(planned.stage)) {
        const firstActive = activePaths[0] ?? null;
        result = await this.runReviewStage(planned, task, firstActive, branchName, firstPrNumber);
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

      // Commit after checkpoint in all repos that have changes
      if (branchName && activePaths.length > 0 && (planned.stage === "implementation" || planned.stage === "testing")) {
        const commitMsg = planned.stage === "implementation"
          ? `feat: ${task}`
          : `test: add tests for ${task}`;
        await this.commitToChangedRepos(activePaths, commitMsg);
      }

      // Create PRs after testing stage for all repos with commits
      if (planned.stage === "testing" && branchName && activePaths.length > 0 && !firstPrNumber) {
        const prUrls = await this.createPrsForReview(task, activePaths, branchName);
        if (prUrls.length > 0) {
          firstPrNumber = extractPrNumber(prUrls[0]);
          this.store.updatePrUrl(this.runId, prUrls.join("\n"));
        }
      }
    }

    this.store.updateStatus(this.runId, "completed");
    console.log(chalk.green(`\nPipeline completed for run ${this.runId}.`));

    // If PR was not yet created (e.g. testing stage was skipped), create it now
    if (branchName && activePaths.length > 0 && !firstPrNumber) {
      console.log(chalk.blue("\nCreating pull requests..."));
      const prUrls: string[] = [];
      for (const repoPath of activePaths) {
        try {
          await pushBranch(repoPath, branchName);
          const prBody = this.buildPrBody(task);
          const prUrl = createPR(repoPath, branchName, task, prBody);
          prUrls.push(prUrl);
          console.log(chalk.green(`Pull request created: ${prUrl}`));
        } catch {
          console.log(chalk.yellow(`Warning: could not create pull request for "${repoPath}". Push manually: git push origin ${branchName}`));
        }
      }
      if (prUrls.length > 0) {
        this.store.updatePrUrl(this.runId, prUrls.join("\n"));
      }
    }
  }

  private async commitToChangedRepos(repoPaths: string[], commitMsg: string): Promise<void> {
    for (const repoPath of repoPaths) {
      try {
        const changed = await getUncommittedFiles(repoPath);
        if (changed.length === 0) continue;
        const committed = await commitChanges(repoPath, commitMsg);
        if (committed) {
          console.log(chalk.gray(`Committed changes in "${repoPath}".`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`Warning: failed to commit in "${repoPath}": ${message}`));
      }
    }
  }

  private async createPrsForReview(task: string, repoPaths: string[], branchName: string): Promise<string[]> {
    const prUrls: string[] = [];
    for (const repoPath of repoPaths) {
      try {
        await pushBranch(repoPath, branchName);
        const prBody = this.buildPrBody(task);
        const prUrl = createPR(repoPath, branchName, task, prBody);
        prUrls.push(prUrl);
        console.log(chalk.green(`Pull request created: ${prUrl}`));

        if (this.copilotReviewEnabled && prUrls.length === 1) {
          const prNumber = extractPrNumber(prUrl);
          if (prNumber) {
            try {
              requestCopilotReview(repoPath, prNumber);
            } catch {
              // Non-fatal
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`Warning: could not create pull request for "${repoPath}" before review: ${message}`));
      }
    }
    return prUrls;
  }

  private buildPrBody(task: string): string {
    const analysisSummary = this.store.readArtifact(this.runId, "analysis") ?? "";
    const implSummary = this.store.readArtifact(this.runId, "implementation") ?? "";
    return [
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

  private async runReviewStage(
    planned: PlannedStage,
    task: string,
    repoPath: string | null,
    branchName: string | null,
    prNumber: number,
  ): Promise<StageResult | null> {
    const startTime = Date.now();

    try {
      const gitContext = (repoPath && branchName && prNumber)
        ? {
            repoPath,
            branchName,
            prNumber,
            copilotEnabled: this.copilotReviewEnabled,
            copilotTimeoutMs: this.copilotReviewTimeoutMs,
          }
        : undefined;

      const reviewProcess = new ReviewProcess(
        this.store,
        this.runId,
        this.workspaceContext,
        this.maxReviewIterations,
        this.agentTimeoutMs,
        gitContext,
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

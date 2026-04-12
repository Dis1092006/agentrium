// src/review/process.ts
import chalk from "chalk";
import ora from "ora";
import { createAgentByName } from "../agents/registry.js";
import { ArtifactStore } from "../artifacts/store.js";
import { parseVerdict, type ReviewVerdict } from "./types.js";
import { STAGE_ORDER } from "../pipeline/types.js";
import { commitChanges, pushBranch } from "../git/operations.js";
import {
  requestCopilotReview,
  waitForCopilotReview,
  formatCopilotFindings,
  postCommentReplies,
  parseCopilotDispositions,
  type CopilotReview,
} from "../github/copilotReview.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export interface GitContext {
  repoPath: string;
  branchName: string;
  prNumber: number;
  copilotEnabled: boolean;
  copilotTimeoutMs: number;
}

export class ReviewProcess {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;
  private readonly maxIterations: number;
  private readonly agentTimeoutMs: number | undefined;
  private readonly gitContext: GitContext | undefined;

  constructor(
    store: ArtifactStore,
    runId: string,
    workspaceContext: string,
    maxIterations: number,
    agentTimeoutMs?: number,
    gitContext?: GitContext,
  ) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
    this.maxIterations = maxIterations;
    this.agentTimeoutMs = agentTimeoutMs;
    this.gitContext = gitContext;
  }

  buildReviewContext(): string {
    const sections: string[] = [this.workspaceContext];

    for (const stage of ARTIFACT_STAGES) {
      if (stage === "review") break;
      const artifact = this.store.readArtifact(this.runId, stage);
      if (artifact) {
        sections.push(`\n---\n\n## Previous Stage: ${stage}\n\n${artifact}`);
      }
    }

    return sections.join("\n");
  }

  buildReviewTaskDescription(originalTask: string): string {
    return (
      `Original task: ${originalTask}\n\n` +
      `Current stage: review\n\n` +
      `Review the implementation and testing stages. ` +
      `Produce your findings using the comment format specified in your instructions.`
    );
  }

  buildArbiterTaskDescription(
    logicFindings: string,
    securityFindings: string,
    originalTask: string,
    copilotFindings?: string,
  ): string {
    let desc =
      `Original task: ${originalTask}\n\n` +
      `## Logic Reviewer Findings\n\n${logicFindings}\n\n` +
      `## Security Reviewer Findings\n\n${securityFindings}\n\n`;

    if (copilotFindings) {
      desc += `## Copilot Findings\n\n${copilotFindings}\n\n`;
    }

    desc += `Deduplicate, resolve conflicts, prioritize, and produce your verdict.`;
    if (copilotFindings) {
      desc += ` For each Copilot inline comment, include a "## Copilot Comment Dispositions" section with entries in the format: \`- comment_id:{id} → ADDRESSED|REJECTED|NOTED: {explanation}\``;
    }

    return desc;
  }

  buildReworkTaskDescription(
    arbiterOutput: string,
    originalTask: string,
    reworkIteration: number,
  ): string {
    return (
      `Original task: ${originalTask}\n\n` +
      `This is rework iteration ${reworkIteration} of ${this.maxIterations - 1}.\n\n` +
      `The Review Arbiter requested changes. Address the mandatory fixes below:\n\n` +
      `${arbiterOutput}\n\n` +
      `Fix only what is listed. Do not make other changes.`
    );
  }

  private buildContextForIteration(reviewIteration: number): string {
    const base = this.buildReviewContext();
    if (reviewIteration === 1) return base;

    // Append rework outputs from the previous iteration so reviewers see updated code
    const prevRework = reviewIteration - 1;
    const reworkFix = this.store.readArtifact(this.runId, `rework_fix_v${prevRework}`);
    const reworkQa = this.store.readArtifact(this.runId, `rework_qa_v${prevRework}`);

    const sections = [base];
    if (reworkFix) {
      sections.push(`\n---\n\n## Rework Fix (iteration ${prevRework})\n\n${reworkFix}`);
    }
    if (reworkQa) {
      sections.push(`\n---\n\n## Rework QA Verification (iteration ${prevRework})\n\n${reworkQa}`);
    }
    return sections.join("\n");
  }

  async run(originalTask: string): Promise<ReviewVerdict> {
    const reviewTaskDesc = this.buildReviewTaskDescription(originalTask);

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      const iterLabel = this.maxIterations > 1 ? ` (iteration ${iteration})` : "";

      // Rebuild context each iteration so reviewers see the latest rework output
      const context = this.buildContextForIteration(iteration);

      // 1. Run two reviewers in parallel
      const reviewSpinner = ora(`Running code reviewers in parallel${iterLabel}...`).start();
      let logicResult: Awaited<ReturnType<InstanceType<typeof import("../agents/base.js").BaseAgent>["run"]>>;
      let securityResult: typeof logicResult;

      try {
        [logicResult, securityResult] = await Promise.all([
          createAgentByName("code-reviewer-logic").run(context, reviewTaskDesc, this.agentTimeoutMs),
          createAgentByName("code-reviewer-security").run(context, reviewTaskDesc, this.agentTimeoutMs),
        ]);
        reviewSpinner.succeed(`Code reviews complete${iterLabel}`);
      } catch (error) {
        reviewSpinner.fail(`Code reviews failed${iterLabel}`);
        throw error;
      }

      // Save individual review artifacts
      const reviewSuffix = iteration > 1 ? `_v${iteration}` : "";
      this.store.saveArtifact(this.runId, `review_logic${reviewSuffix}`, logicResult.artifact);
      this.store.saveArtifact(this.runId, `review_security${reviewSuffix}`, securityResult.artifact);

      // 2. Wait for Copilot review (if enabled and PR exists)
      let copilotReview: CopilotReview | null = null;
      if (this.gitContext?.copilotEnabled) {
        const copilotSpinner = ora(`Waiting for Copilot review${iterLabel}...`).start();
        try {
          if (iteration > 1) {
            requestCopilotReview(this.gitContext.repoPath, this.gitContext.prNumber);
          }
          copilotReview = await waitForCopilotReview(
            this.gitContext.repoPath,
            this.gitContext.prNumber,
            this.gitContext.copilotTimeoutMs,
          );
          if (copilotReview) {
            const findings = formatCopilotFindings(copilotReview);
            this.store.saveArtifact(this.runId, `review_copilot${reviewSuffix}`, findings);
            copilotSpinner.succeed(`Copilot review received (${copilotReview.comments.length} comments)${iterLabel}`);
          } else {
            copilotSpinner.warn(`Copilot review timed out, continuing without it${iterLabel}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          copilotSpinner.warn(`Copilot review unavailable: ${message}`);
        }
      }

      // 3. Run arbiter
      const arbiterSpinner = ora(`Review Arbiter analyzing findings${iterLabel}...`).start();
      let arbiterResult: typeof logicResult;

      try {
        const copilotFindings = copilotReview ? formatCopilotFindings(copilotReview) : undefined;
        const arbiterTaskDesc = this.buildArbiterTaskDescription(
          logicResult.artifact,
          securityResult.artifact,
          originalTask,
          copilotFindings,
        );
        arbiterResult = await createAgentByName("review-arbiter").run(context, arbiterTaskDesc, this.agentTimeoutMs);
        const verdict = parseVerdict(arbiterResult.artifact);
        arbiterSpinner.succeed(`Arbiter verdict${iterLabel}: ${verdict}`);

        this.store.saveArtifact(this.runId, `review_arbiter${reviewSuffix}`, arbiterResult.artifact);

        // 4. Post replies to Copilot comments
        if (copilotReview && this.gitContext) {
          try {
            const replies = parseCopilotDispositions(arbiterResult.artifact);
            if (replies.length > 0) {
              postCommentReplies(this.gitContext.repoPath, this.gitContext.prNumber, replies);
              console.log(chalk.gray(`Posted ${replies.length} replies to Copilot comments${iterLabel}`));
            }
          } catch {
            // Don't fail the pipeline if replies can't be posted
          }
        }

        // 5. If approved, save final review and return
        if (verdict === "approve" || verdict === "approve_with_nits") {
          this.store.saveArtifact(this.runId, "review", arbiterResult.artifact);
          return verdict;
        }

        // 6. Request changes — enter rework cycle
        if (iteration >= this.maxIterations) {
          console.log(
            chalk.yellow(`Max review iterations (${this.maxIterations}) reached. Saving last review.`),
          );
          this.store.saveArtifact(this.runId, "review", arbiterResult.artifact);
          return verdict;
        }

        console.log(chalk.yellow(`Changes requested. Starting rework ${iteration}...`));
      } catch (error) {
        arbiterSpinner.fail(`Arbiter failed${iterLabel}`);
        throw error;
      }

      // 7a. Software Engineer fixes (rework iteration = current review iteration)
      const fixSpinner = ora(`Software Engineer applying fixes (rework ${iteration})...`).start();
      try {
        const reworkDesc = this.buildReworkTaskDescription(
          arbiterResult.artifact,
          originalTask,
          iteration,
        );
        const fixResult = await createAgentByName("software-engineer").run(context, reworkDesc, this.agentTimeoutMs);
        this.store.saveArtifact(this.runId, `rework_fix_v${iteration}`, fixResult.artifact);
        fixSpinner.succeed(`Fixes applied (rework ${iteration})`);
      } catch (error) {
        fixSpinner.fail(`Fix failed (rework ${iteration})`);
        throw error;
      }

      // 7b. Commit and push rework fixes so Copilot can see them in the next iteration
      if (this.gitContext) {
        try {
          const committed = await commitChanges(
            this.gitContext.repoPath,
            `fix: rework iteration ${iteration} for task: ${originalTask.slice(0, 50)}`,
          );
          if (committed) {
            await pushBranch(this.gitContext.repoPath, this.gitContext.branchName);
            console.log(chalk.gray(`Pushed rework ${iteration} commits`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(chalk.yellow(`Warning: could not push rework commits: ${message}`));
        }
      }

      // 7c. QA Engineer re-verifies
      const qaSpinner = ora(`QA Engineer re-verifying (rework ${iteration})...`).start();
      try {
        const qaDesc =
          `Original task: ${originalTask}\n\n` +
          `Re-verify after rework ${iteration}. ` +
          `The Software Engineer made fixes based on review feedback. ` +
          `Run tests and verify the fixes are correct.`;
        const qaResult = await createAgentByName("qa-engineer").run(context, qaDesc, this.agentTimeoutMs);
        this.store.saveArtifact(this.runId, `rework_qa_v${iteration}`, qaResult.artifact);
        qaSpinner.succeed(`Re-verification complete (rework ${iteration})`);
      } catch (error) {
        qaSpinner.fail(`QA re-verification failed (rework ${iteration})`);
        throw error;
      }
    }

    return "request_changes";
  }
}

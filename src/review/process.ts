// src/review/process.ts
import chalk from "chalk";
import ora from "ora";
import { createAgentByName } from "../agents/registry.js";
import { ArtifactStore } from "../artifacts/store.js";
import { parseVerdict, type ReviewVerdict } from "./types.js";
import { STAGE_ORDER } from "../pipeline/types.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export class ReviewProcess {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;
  private readonly maxIterations: number;

  constructor(
    store: ArtifactStore,
    runId: string,
    workspaceContext: string,
    maxIterations: number,
  ) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
    this.maxIterations = maxIterations;
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
  ): string {
    return (
      `Original task: ${originalTask}\n\n` +
      `## Logic Reviewer Findings\n\n${logicFindings}\n\n` +
      `## Security Reviewer Findings\n\n${securityFindings}\n\n` +
      `Deduplicate, resolve conflicts, prioritize, and produce your verdict.`
    );
  }

  buildReworkTaskDescription(
    arbiterOutput: string,
    originalTask: string,
    iteration: number,
  ): string {
    return (
      `Original task: ${originalTask}\n\n` +
      `This is rework iteration ${iteration} of ${this.maxIterations}.\n\n` +
      `The Review Arbiter requested changes. Address the mandatory fixes below:\n\n` +
      `${arbiterOutput}\n\n` +
      `Fix only what is listed. Do not make other changes.`
    );
  }

  async run(originalTask: string): Promise<ReviewVerdict> {
    const context = this.buildReviewContext();
    const reviewTaskDesc = this.buildReviewTaskDescription(originalTask);

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      const iterLabel = this.maxIterations > 1 ? ` (iteration ${iteration})` : "";

      // 1. Run two reviewers in parallel
      const reviewSpinner = ora(`Running code reviewers in parallel${iterLabel}...`).start();

      const logicReviewer = createAgentByName("code-reviewer-logic");
      const securityReviewer = createAgentByName("code-reviewer-security");

      const [logicResult, securityResult] = await Promise.all([
        logicReviewer.run(context, reviewTaskDesc),
        securityReviewer.run(context, reviewTaskDesc),
      ]);

      reviewSpinner.succeed(`Code reviews complete${iterLabel}`);

      // Save individual review artifacts
      const reviewSuffix = iteration > 1 ? `_v${iteration}` : "";
      this.store.saveArtifact(
        this.runId,
        `review_logic${reviewSuffix}`,
        logicResult.artifact,
      );
      this.store.saveArtifact(
        this.runId,
        `review_security${reviewSuffix}`,
        securityResult.artifact,
      );

      // 2. Run arbiter
      const arbiterSpinner = ora(`Review Arbiter analyzing findings${iterLabel}...`).start();
      const arbiter = createAgentByName("review-arbiter");
      const arbiterTaskDesc = this.buildArbiterTaskDescription(
        logicResult.artifact,
        securityResult.artifact,
        originalTask,
      );
      const arbiterResult = await arbiter.run(context, arbiterTaskDesc);

      this.store.saveArtifact(
        this.runId,
        `review_arbiter${reviewSuffix}`,
        arbiterResult.artifact,
      );

      const verdict = parseVerdict(arbiterResult.artifact);
      arbiterSpinner.succeed(`Arbiter verdict${iterLabel}: ${verdict}`);

      // 3. If approved, save final review and return
      if (verdict === "approve" || verdict === "approve_with_nits") {
        this.store.saveArtifact(this.runId, "review", arbiterResult.artifact);
        return verdict;
      }

      // 4. Request changes — enter rework cycle
      if (iteration >= this.maxIterations) {
        console.log(
          chalk.yellow(
            `Max review iterations (${this.maxIterations}) reached. Saving last review.`,
          ),
        );
        this.store.saveArtifact(this.runId, "review", arbiterResult.artifact);
        return verdict;
      }

      console.log(chalk.yellow(`Changes requested. Starting rework iteration ${iteration + 1}...`));

      // 4a. Software Engineer fixes
      const fixSpinner = ora("Software Engineer applying fixes...").start();
      const engineer = createAgentByName("software-engineer");
      const reworkDesc = this.buildReworkTaskDescription(
        arbiterResult.artifact,
        originalTask,
        iteration,
      );
      const fixResult = await engineer.run(context, reworkDesc);
      this.store.saveArtifact(this.runId, `rework_fix_v${iteration + 1}`, fixResult.artifact);
      fixSpinner.succeed("Fixes applied");

      // 4b. QA Engineer re-verifies
      const qaSpinner = ora("QA Engineer re-verifying...").start();
      const qa = createAgentByName("qa-engineer");
      const qaDesc =
        `Original task: ${originalTask}\n\n` +
        `Re-verify after rework iteration ${iteration}. ` +
        `The Software Engineer made fixes based on review feedback. ` +
        `Run tests and verify the fixes are correct.`;
      const qaResult = await qa.run(context, qaDesc);
      this.store.saveArtifact(this.runId, `rework_qa_v${iteration + 1}`, qaResult.artifact);
      qaSpinner.succeed("Re-verification complete");
    }

    return "request_changes";
  }
}

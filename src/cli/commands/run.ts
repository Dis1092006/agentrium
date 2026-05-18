// src/cli/commands/run.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { loadWorkspaceConfig, getWorkspacesDir } from "../../workspace/manager.js";
import { parseAgentriumMd } from "../../context/configParser.js";
import { analyzeRepo } from "../../context/repoAnalyzer.js";
import { buildContextPrompt } from "../../context/contextBuilder.js";
import { ArtifactStore } from "../../artifacts/store.js";
import { PipelineRunner } from "../../pipeline/runner.js";
import type { FullContext } from "../../context/types.js";
import type { PipelineConfig, Stage } from "../../pipeline/types.js";
import { detectWorkspace } from "../utils.js";
import fs from "fs";
import { parseSeedOptions, validateSeedCoverage, SeedOptionError, type SeedableStage } from "../seedOptions.js";
import { buildPipelineStages } from "../../pipeline/pipeline.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a task through the agent pipeline")
    .argument("<task>", "Task description")
    .option("-w, --workspace <name>", "Workspace name")
    .option("--no-checkpoints", "Skip all checkpoints")
    .option("--include <stages...>", "Include optional stages (design, documentation)")
    .option(
      "--seed <kv>",
      "Seed an artifact for a stage as <stage>=<path> (repeatable)",
      (value: string, prev: string[]) => [...prev, value],
      [] as string[],
    )
    .option("--start-from <stage>", "Begin the pipeline at the given stage")
    .action(async (task: string, options: {
      workspace?: string;
      checkpoints: boolean;
      include?: string[];
      seed: string[];
      startFrom?: string;
    }) => {
      let parsed;
      try {
        parsed = parseSeedOptions(options.seed, options.startFrom);
      } catch (err) {
        if (err instanceof SeedOptionError) {
          console.log(chalk.red(err.message));
          process.exit(1);
        }
        throw err;
      }

      // 1. Find workspace
      const workspaceName = options.workspace ?? detectWorkspace();
      if (!workspaceName) {
        console.log(chalk.red("No workspace found. Run `agentrium init` first."));
        process.exit(1);
      }

      const configContent = loadWorkspaceConfig(workspaceName);
      if (!configContent) {
        console.log(chalk.red(`Workspace "${workspaceName}" not found.`));
        process.exit(1);
      }

      // 2. Parse config and analyze repos
      const workspaceConfig = parseAgentriumMd(configContent);
      const spinner = ora("Analyzing repositories...").start();

      const repos = [];
      for (const repoRef of workspaceConfig.repositories) {
        const expandedPath = repoRef.path.replace(/^~/, process.env.HOME ?? "~");
        if (fs.existsSync(expandedPath)) {
          repos.push(await analyzeRepo(expandedPath));
        }
      }
      spinner.succeed("Repositories analyzed");

      const fullContext: FullContext = { workspace: workspaceConfig, repos };
      const contextPrompt = buildContextPrompt(fullContext);

      // Read seed file contents up-front so we fail fast on missing files,
      // before we mutate any state.
      const seedContents = new Map<SeedableStage, string>();
      for (const [stage, filePath] of parsed.seeds) {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          console.log(chalk.red(`Seed file for stage "${stage}" not found: ${resolved}`));
          process.exit(1);
        }
        seedContents.set(stage, fs.readFileSync(resolved, "utf-8"));
      }

      // 3. Create run and save intake
      const includeOptional = (options.include ?? []) as Stage[];
      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));

      // 4. Build pipeline config
      const repoPaths = repos.map((r) => r.path);

      const pipelineConfig: PipelineConfig = {
        checkpoints: options.checkpoints
          ? workspaceConfig.pipelineSettings.checkpoints as PipelineConfig["checkpoints"]
          : "none",
        skipStages: workspaceConfig.pipelineSettings.skipStages as Stage[],
        repoPaths,
      };

      // Validate that --start-from has seeds for every preceding planned stage.
      const plannedFull = buildPipelineStages(pipelineConfig, includeOptional);
      try {
        validateSeedCoverage(parsed.seeds, parsed.startFrom, plannedFull);
      } catch (err) {
        if (err instanceof SeedOptionError) {
          console.log(chalk.red(err.message));
          process.exit(1);
        }
        throw err;
      }

      const plannedFromStart = buildPipelineStages(pipelineConfig, includeOptional, parsed.startFrom);
      if (plannedFromStart.length === 0) {
        console.log(chalk.red(
          `Nothing to run: all stages from ${parsed.startFrom ?? "the beginning"} ` +
          `onward are skipped or optional-not-included.`,
        ));
        process.exit(1);
      }

      const seededStages = [...seedContents.keys()];
      const runId = store.createRun(
        task,
        workspaceName,
        includeOptional,
        seededStages,
        parsed.startFrom,
      );

      // Intake: seed overrides the default; otherwise build the standard envelope.
      const intakeContent = seedContents.get("intake")
        ?? `# Task\n\n${task}\n\n# Context\n\n${contextPrompt}`;
      store.saveArtifact(runId, "intake", intakeContent);

      // Save remaining seeds so the pipeline (and resume) sees them as existing artifacts.
      for (const [stage, content] of seedContents) {
        if (stage === "intake") continue;
        store.saveArtifact(runId, stage, content);
      }
      if (seededStages.length > 0) {
        console.log(chalk.gray(`Seeded stages: ${seededStages.join(", ")}`));
      }
      if (parsed.startFrom) {
        console.log(chalk.gray(`Starting from: ${parsed.startFrom}`));
      }
      console.log(chalk.blue(`Run: ${runId}`));

      // 5. Run pipeline
      const rawIterations = workspaceConfig.pipelineSettings.maxReviewIterations;
      const maxReviewIterations = Number.isFinite(rawIterations) && rawIterations >= 1
        ? Math.floor(rawIterations)
        : 3;
      const rawTimeout = workspaceConfig.pipelineSettings.agentTimeoutMinutes;
      const agentTimeoutMinutes = Number.isFinite(rawTimeout) && rawTimeout >= 1
        ? Math.floor(rawTimeout)
        : 30;
      const copilotEnabled = workspaceConfig.pipelineSettings.copilotReviewEnabled ?? false;
      const rawCopilotTimeout = workspaceConfig.pipelineSettings.copilotReviewTimeoutMinutes;
      const copilotTimeoutMinutes = Number.isFinite(rawCopilotTimeout) && rawCopilotTimeout >= 1
        ? Math.floor(rawCopilotTimeout)
        : 5;
      const runner = new PipelineRunner(store, runId, contextPrompt, maxReviewIterations, repoPaths, agentTimeoutMinutes, copilotEnabled, copilotTimeoutMinutes);
      await runner.runPipeline(task, pipelineConfig, includeOptional, parsed.startFrom);
    });
}


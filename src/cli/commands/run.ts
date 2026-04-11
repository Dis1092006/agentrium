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

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a task through the agent pipeline")
    .argument("<task>", "Task description")
    .option("-w, --workspace <name>", "Workspace name")
    .option("--no-checkpoints", "Skip all checkpoints")
    .option("--include <stages...>", "Include optional stages (design, documentation)")
    .action(async (task: string, options: { workspace?: string; checkpoints: boolean; include?: string[] }) => {
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

      // 3. Create run and save intake
      const includeOptional = (options.include ?? []) as Stage[];
      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));
      const runId = store.createRun(task, workspaceName, includeOptional);
      store.saveArtifact(runId, "intake", `# Task\n\n${task}\n\n# Context\n\n${contextPrompt}`);
      console.log(chalk.blue(`Run: ${runId}`));

      // 4. Build pipeline config
      const primaryRepo = repos[0]?.path ?? null;

      const pipelineConfig: PipelineConfig = {
        checkpoints: options.checkpoints
          ? workspaceConfig.pipelineSettings.checkpoints as PipelineConfig["checkpoints"]
          : "none",
        skipStages: workspaceConfig.pipelineSettings.skipStages as Stage[],
        repoPath: primaryRepo,
      };

      // 5. Run pipeline
      const rawIterations = workspaceConfig.pipelineSettings.maxReviewIterations;
      const maxReviewIterations = Number.isFinite(rawIterations) && rawIterations >= 1
        ? Math.floor(rawIterations)
        : 3;
      const rawTimeout = workspaceConfig.pipelineSettings.agentTimeoutMinutes;
      const agentTimeoutMinutes = Number.isFinite(rawTimeout) && rawTimeout >= 1
        ? Math.floor(rawTimeout)
        : 30;
      const runner = new PipelineRunner(store, runId, contextPrompt, maxReviewIterations, pipelineConfig.repoPath, agentTimeoutMinutes);
      await runner.runPipeline(task, pipelineConfig, includeOptional);
    });
}


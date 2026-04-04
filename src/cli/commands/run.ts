// src/cli/commands/run.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { loadWorkspaceConfig, listWorkspaces, getWorkspacesDir } from "../../workspace/manager.js";
import { parseAgentriumMd } from "../../context/configParser.js";
import { analyzeRepo } from "../../context/repoAnalyzer.js";
import { buildContextPrompt } from "../../context/contextBuilder.js";
import { ArtifactStore } from "../../artifacts/store.js";
import { PipelineRunner } from "../../pipeline/runner.js";
import type { FullContext } from "../../context/types.js";
import type { PipelineConfig, Stage } from "../../pipeline/types.js";
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
      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));
      const runId = store.createRun(task);
      store.saveArtifact(runId, "intake", `# Task\n\n${task}\n\n# Context\n\n${contextPrompt}`);
      console.log(chalk.blue(`Run: ${runId}`));

      // 4. Build pipeline config
      const pipelineConfig: PipelineConfig = {
        checkpoints: options.checkpoints
          ? workspaceConfig.pipelineSettings.checkpoints as PipelineConfig["checkpoints"]
          : "none",
        skipStages: workspaceConfig.pipelineSettings.skipStages as Stage[],
      };

      const includeOptional = (options.include ?? []) as Stage[];

      // 5. Run pipeline
      const maxReviewIterations = workspaceConfig.pipelineSettings.maxReviewIterations;
      const runner = new PipelineRunner(store, runId, contextPrompt, maxReviewIterations);
      await runner.runPipeline(task, pipelineConfig, includeOptional);
    });
}

function detectWorkspace(): string | null {
  const workspaces = listWorkspaces();
  if (workspaces.length === 1) return workspaces[0];
  if (workspaces.length === 0) return null;

  const cwd = process.cwd();
  for (const ws of workspaces) {
    const configContent = loadWorkspaceConfig(ws);
    if (!configContent) continue;
    const wsConfig = parseAgentriumMd(configContent);
    const match = wsConfig.repositories.some((repo) => {
      const expanded = repo.path.replace(/^~/, process.env.HOME ?? "~");
      return cwd === expanded || cwd.startsWith(expanded + path.sep);
    });
    if (match) return ws;
  }

  console.log(chalk.yellow(`Multiple workspaces found: ${workspaces.join(", ")}. Use --workspace to specify.`));
  return null;
}

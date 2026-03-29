import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { loadWorkspaceConfig, listWorkspaces, getWorkspacesDir } from "../../workspace/manager.js";
import { parseAgentriumMd } from "../../context/configParser.js";
import { analyzeRepo } from "../../context/repoAnalyzer.js";
import { buildContextPrompt } from "../../context/contextBuilder.js";
import { createProductManager } from "../../agents/productManager.js";
import { ArtifactStore } from "../../artifacts/store.js";
import type { FullContext } from "../../context/types.js";
import fs from "fs";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a task through the agent pipeline")
    .argument("<task>", "Task description")
    .option("-w, --workspace <name>", "Workspace name")
    .action(async (task: string, options: { workspace?: string }) => {
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

      // 3. Create run
      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));
      const runId = store.createRun(task);
      console.log(chalk.blue(`Run: ${runId}`));

      // 4. Save intake
      store.saveArtifact(runId, "intake", `# Task\n\n${task}\n\n# Context\n\n${contextPrompt}`);

      // 5. Run Product Manager agent
      const pmSpinner = ora("Product Manager analyzing task...").start();
      try {
        const pm = createProductManager();
        const result = await pm.run(contextPrompt, task);
        store.saveArtifact(runId, "analysis", result.artifact);
        pmSpinner.succeed("Analysis complete");

        console.log("");
        console.log(chalk.green("=== Analysis ==="));
        console.log(result.artifact);
        console.log("");
        console.log(chalk.gray(`Artifact saved to: ${runId}/02-analysis.md`));
      } catch (error) {
        pmSpinner.fail("Analysis failed");
        store.updateStatus(runId, "failed");
        throw error;
      }

      store.updateStatus(runId, "completed");
      console.log(chalk.green(`\nRun ${runId} completed (analysis only — pipeline stages coming in Plan 2).`));
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

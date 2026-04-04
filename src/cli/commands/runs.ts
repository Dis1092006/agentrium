// src/cli/commands/runs.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import { getWorkspacesDir } from "../../workspace/manager.js";
import { ArtifactStore } from "../../artifacts/store.js";
import { detectWorkspace } from "../utils.js";

export function registerRunsCommand(program: Command): void {
  program
    .command("runs")
    .description("List all runs for a workspace")
    .option("-w, --workspace <name>", "Workspace name")
    .action((options: { workspace?: string }) => {
      const workspaceName = options.workspace ?? detectWorkspace();
      if (!workspaceName) {
        console.log(chalk.red("No workspace found. Use --workspace to specify."));
        process.exit(1);
      }

      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));
      const runs = store.listRuns();

      if (runs.length === 0) {
        console.log(chalk.yellow("No runs found."));
        return;
      }

      console.log(chalk.bold(`Workspace: ${workspaceName}\n`));
      for (const run of runs) {
        const stageCount = Object.keys(run.stages).length;
        const statusColor =
          run.status === "completed" ? chalk.green :
          run.status === "failed" ? chalk.red :
          run.status === "aborted" ? chalk.yellow : chalk.blue;
        const date = new Date(run.createdAt).toLocaleString();
        const taskPreview = run.task.length > 48 ? run.task.slice(0, 48) + "…" : run.task;
        console.log(
          `${chalk.bold(run.runId)}  ${taskPreview.padEnd(50)}  ` +
          `${statusColor(run.status.padEnd(10))}  ${chalk.gray(date)}  ` +
          `${chalk.gray(`${stageCount} stages`)}`,
        );
      }
    });
}

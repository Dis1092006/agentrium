// src/cli/commands/show.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import fs from "fs";
import { getWorkspacesDir, listWorkspaces } from "../../workspace/manager.js";
import { ArtifactStore, type RunMeta } from "../../artifacts/store.js";

export function printRunDetails(meta: RunMeta): void {
  const statusColor =
    meta.status === "completed" ? chalk.green :
    meta.status === "failed" ? chalk.red :
    meta.status === "aborted" ? chalk.yellow : chalk.blue;

  console.log(`${chalk.gray("Run:")}     ${chalk.bold(meta.runId)}`);
  console.log(`${chalk.gray("Task:")}    ${meta.task}`);
  console.log(`${chalk.gray("Status:")}  ${statusColor(meta.status)}`);
  console.log(`${chalk.gray("Created:")} ${new Date(meta.createdAt).toLocaleString()}`);
  console.log();
  console.log(chalk.bold("Stages:"));

  for (const [stage, info] of Object.entries(meta.stages)) {
    const time = new Date(info.completedAt).toLocaleTimeString();
    console.log(`  ${chalk.green("✓")} ${stage.padEnd(16)} ${chalk.gray(time)}`);
  }
}

function findWorkspaceForRun(runId: string): string | null {
  for (const ws of listWorkspaces()) {
    const runsDir = path.join(getWorkspacesDir(), ws, "runs");
    const metaPath = path.join(runsDir, runId, "meta.json");
    if (fs.existsSync(metaPath)) return ws;
  }
  return null;
}

export function registerShowCommand(program: Command): void {
  program
    .command("show <run-id>")
    .description("Show run details or a specific stage artifact")
    .option("-w, --workspace <name>", "Workspace name")
    .option("-s, --stage <stage>", "Show artifact for a specific stage (e.g. analysis, review)")
    .action((runId: string, options: { workspace?: string; stage?: string }) => {
      const workspaceName = options.workspace ?? findWorkspaceForRun(runId);
      if (!workspaceName) {
        console.log(chalk.red(`Run "${runId}" not found.`));
        process.exit(1);
      }

      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));

      if (options.stage) {
        const artifact = store.readArtifact(runId, options.stage);
        if (artifact === null) {
          console.log(chalk.red(`Stage "${options.stage}" not found in run "${runId}".`));
          process.exit(1);
        }
        console.log(artifact);
        return;
      }

      const meta = store.readMeta(runId);
      printRunDetails(meta);
    });
}

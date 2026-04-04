// src/cli/commands/status.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import { getWorkspacesDir } from "../../workspace/manager.js";
import { ArtifactStore } from "../../artifacts/store.js";
import { detectWorkspace } from "../utils.js";
import { printRunDetails } from "./show.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show the latest run for the current workspace")
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
      printRunDetails(runs[0], store);
    });
}

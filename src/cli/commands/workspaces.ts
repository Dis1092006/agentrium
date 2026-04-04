// src/cli/commands/workspaces.ts
import { Command } from "commander";
import chalk from "chalk";
import { listWorkspaces, loadWorkspaceConfig } from "../../workspace/manager.js";
import { parseAgentriumMd } from "../../context/configParser.js";

export function registerWorkspacesCommand(program: Command): void {
  program
    .command("workspaces")
    .description("List all configured workspaces")
    .action(() => {
      const workspaces = listWorkspaces();
      if (workspaces.length === 0) {
        console.log(chalk.yellow("No workspaces found. Run `agentrium init` first."));
        return;
      }
      for (const name of workspaces) {
        const content = loadWorkspaceConfig(name);
        if (!content) continue;
        const config = parseAgentriumMd(content);
        const repoCount = config.repositories.length;
        console.log(
          `${chalk.bold(name)}  ${chalk.gray(`(${repoCount} repo${repoCount !== 1 ? "s" : ""})`)}`,
        );
      }
    });
}

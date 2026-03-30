import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import { findGitRepos, generateAgentriumMd, saveWorkspace } from "../../workspace/manager.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize Agentrium workspace")
    .option("-n, --name <name>", "Workspace name")
    .option("-d, --dir <directory>", "Directory to scan for repos", ".")
    .action(async (options: { name?: string; dir: string }) => {
      const scanDir = path.resolve(options.dir);
      console.log(chalk.blue(`Scanning ${scanDir} for git repositories...`));

      const repoPaths = findGitRepos(scanDir);

      if (repoPaths.length === 0) {
        const { existsSync } = await import("fs");
        if (existsSync(path.join(scanDir, ".git"))) {
          repoPaths.push(scanDir);
        } else {
          console.log(chalk.yellow("No git repositories found."));
          return;
        }
      }

      console.log(chalk.green(`Found ${repoPaths.length} repository(s):`));
      for (const repo of repoPaths) {
        console.log(`  ${chalk.white(path.basename(repo))} — ${repo}`);
      }

      const workspaceName = options.name ?? path.basename(scanDir);
      const repos = repoPaths.map((p) => ({
        name: path.basename(p),
        path: p,
        description: "",
      }));

      const content = generateAgentriumMd(workspaceName, repos);
      const savedPath = saveWorkspace(workspaceName, content);

      console.log("");
      console.log(chalk.green("Workspace created!"));
      console.log(`  Config: ${chalk.white(savedPath)}`);
      console.log("");
      console.log(`Edit ${chalk.white("AGENTRIUM.md")} to customize tech stack, conventions, and pipeline settings.`);
      console.log(`Then run: ${chalk.cyan("agentrium run \"your task description\"")}`);
    });
}

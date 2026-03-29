import { Command } from "commander";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a task through the agent pipeline")
    .argument("<task>", "Task description")
    .action(async (task: string) => {
      console.log(`agentforge run "${task}" — not yet implemented`);
    });
}

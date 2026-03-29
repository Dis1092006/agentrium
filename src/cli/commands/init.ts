import { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize AgentForge workspace")
    .action(async () => {
      console.log("agentforge init — not yet implemented");
    });
}

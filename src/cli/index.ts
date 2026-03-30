import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerRunCommand } from "./commands/run.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("agentrium")
    .description("Multi-agent orchestrator for software development")
    .version("0.1.0");

  registerInitCommand(program);
  registerRunCommand(program);

  return program;
}

// Only parse when this file is the direct entrypoint, not when imported as a module.
const isMain =
  process.argv[1] != null &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const program = createProgram();
  program.parse();
}

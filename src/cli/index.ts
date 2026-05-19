#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { realpathSync } from "fs";
import { registerInitCommand } from "./commands/init.js";
import { registerRunCommand } from "./commands/run.js";
import { registerWorkspacesCommand } from "./commands/workspaces.js";
import { registerRunsCommand } from "./commands/runs.js";
import { registerShowCommand } from "./commands/show.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerResumeCommand } from "./commands/resume.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

export function createProgram(): Command {
  const program = new Command();
  program
    .name("agentrium")
    .description("Multi-agent orchestrator for software development")
    .version(version);

  registerInitCommand(program);
  registerRunCommand(program);
  registerWorkspacesCommand(program);
  registerRunsCommand(program);
  registerShowCommand(program);
  registerStatusCommand(program);
  registerResumeCommand(program);

  return program;
}

// Only parse when this file is the direct entrypoint, not when imported as a module.
// Resolve both paths through realpath so npm-link junctions and symlinks compare equal.
const isMain = (() => {
  if (process.argv[1] == null) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const program = createProgram();
  program.parse();
}

// src/cli/utils.ts
import path from "path";
import chalk from "chalk";
import { loadWorkspaceConfig, listWorkspaces } from "../workspace/manager.js";
import { parseAgentriumMd } from "../context/configParser.js";

export function detectWorkspace(): string | null {
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

import fs from "fs";
import path from "path";
import os from "os";
import type { RepositoryRef } from "../context/types.js";

export function getWorkspacesDir(): string {
  return path.join(os.homedir(), ".agentrium", "workspaces");
}

export function findGitRepos(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(directory, e.name, ".git")))
    .map((e) => path.join(directory, e.name));
}

export function generateAgentriumMd(name: string, repos: RepositoryRef[]): string {
  const lines: string[] = [];

  lines.push(`# Workspace: ${name}`);
  lines.push("");
  lines.push("## Repositories");
  for (const repo of repos) {
    const desc = repo.description ? ` — ${repo.description}` : "";
    lines.push(`- [${repo.name}](${repo.path})${desc}`);
  }
  lines.push("");
  lines.push("## Tech Stack");
  lines.push("<!-- Auto-detected. Edit as needed. -->");
  lines.push("");
  lines.push("## Conventions");
  lines.push("<!-- Link to your CLAUDE.md or coding standards. -->");
  lines.push("");
  lines.push("## Pipeline Settings");
  lines.push("- Checkpoints: all");
  lines.push("- Max review iterations: 3");
  lines.push("- Agent timeout minutes: 30");
  lines.push("- Skip stages: ");
  lines.push("");
  lines.push("## Knowledge Sources");
  lines.push("<!-- Add links to docs, Notion, Confluence, etc. -->");
  lines.push("");

  return lines.join("\n");
}

export function saveWorkspace(name: string, content: string): string {
  const wsDir = path.join(getWorkspacesDir(), name);
  fs.mkdirSync(wsDir, { recursive: true });
  const filePath = path.join(wsDir, "AGENTRIUM.md");
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function loadWorkspaceConfig(name: string): string | null {
  const filePath = path.join(getWorkspacesDir(), name, "AGENTRIUM.md");
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function listWorkspaces(): string[] {
  const wsDir = getWorkspacesDir();
  if (!fs.existsSync(wsDir)) return [];
  return fs.readdirSync(wsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

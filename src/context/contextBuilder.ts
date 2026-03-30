import type { FullContext } from "./types.js";

export function buildContextPrompt(context: FullContext): string {
  const sections: string[] = [];

  sections.push(`# Workspace: ${context.workspace.name}`);
  sections.push("");

  if (context.workspace.techStack.length > 0) {
    sections.push("## Tech Stack");
    for (const tech of context.workspace.techStack) {
      sections.push(`- ${tech}`);
    }
    sections.push("");
  }

  for (const repo of context.repos) {
    sections.push(`## Repository: ${repo.name}`);
    sections.push(`Path: ${repo.path}`);

    if (repo.stack.length > 0) {
      sections.push(`Detected stack: ${repo.stack.join(", ")}`);
    }

    sections.push("");
    sections.push("### Directory Structure");
    sections.push("```");
    sections.push(repo.structure);
    sections.push("```");
    sections.push("");

    if (repo.conventions) {
      sections.push("### Conventions");
      sections.push(repo.conventions);
      sections.push("");
    }

    if (repo.recentCommits.length > 0) {
      sections.push("### Recent Commits");
      for (const commit of repo.recentCommits) {
        sections.push(`- ${commit}`);
      }
      sections.push("");
    }
  }

  return sections.join("\n");
}

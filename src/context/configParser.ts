import type { WorkspaceConfig, RepositoryRef, PipelineSettings, KnowledgeSource } from "./types.js";

export function parseAgentriumMd(content: string): WorkspaceConfig {
  const name = parseWorkspaceName(content);
  const repositories = parseRepositories(content);
  const techStack = parseBulletList(content, "Tech Stack");
  const conventions = parseConventions(content);
  const pipelineSettings = parsePipelineSettings(content);
  const knowledgeSources = parseKnowledgeSources(content);

  return { name, repositories, techStack, conventions, pipelineSettings, knowledgeSources };
}

function parseWorkspaceName(content: string): string {
  const match = content.match(/^#\s+Workspace:\s+(.+)$/m);
  return match ? match[1].trim() : "unnamed";
}

function parseRepositories(content: string): RepositoryRef[] {
  const section = extractSection(content, "Repositories");
  if (!section) return [];

  const repoPattern = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*—\s*(.+)$/gm;
  const repos: RepositoryRef[] = [];
  let match;
  while ((match = repoPattern.exec(section)) !== null) {
    repos.push({ name: match[1], path: match[2], description: match[3].trim() });
  }
  return repos;
}

function parseBulletList(content: string, heading: string): string[] {
  const section = extractSection(content, heading);
  if (!section) return [];

  return section
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function parseConventions(content: string): string | null {
  const section = extractSection(content, "Conventions");
  return section?.trim() || null;
}

function parsePipelineSettings(content: string): PipelineSettings {
  const section = extractSection(content, "Pipeline Settings");
  const defaults: PipelineSettings = {
    checkpoints: "all",
    maxReviewIterations: 3,
    skipStages: [],
  };
  if (!section) return defaults;

  const lines = section.split("\n").filter((l) => l.startsWith("- "));
  for (const line of lines) {
    const text = line.slice(2).trim();
    if (text.toLowerCase().startsWith("checkpoints:")) {
      const value = text.split(":")[1].trim();
      if (value === "all" || value === "none") {
        defaults.checkpoints = value;
      } else {
        defaults.checkpoints = value.split(",").map((s) => s.trim());
      }
    } else if (text.toLowerCase().startsWith("max review iterations:")) {
      defaults.maxReviewIterations = parseInt(text.split(":")[1].trim(), 10);
    } else if (text.toLowerCase().startsWith("skip stages:")) {
      defaults.skipStages = text
        .split(":")[1]
        .trim()
        .split(",")
        .map((s) => s.trim());
    }
  }
  return defaults;
}

function parseKnowledgeSources(content: string): KnowledgeSource[] {
  const section = extractSection(content, "Knowledge Sources");
  if (!section) return [];

  const sources: KnowledgeSource[] = [];
  const lines = section.split("\n").filter((l) => l.startsWith("- "));
  for (const line of lines) {
    const text = line.slice(2).trim();
    if (text.toLowerCase().startsWith("mcp:")) {
      sources.push({ type: "mcp", description: text.slice(4).trim() });
    } else {
      const linkMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        sources.push({ type: "file", path: linkMatch[2], description: linkMatch[1] });
      } else {
        sources.push({ type: "file", path: text, description: text });
      }
    }
  }
  return sources;
}

function extractSection(content: string, heading: string): string | null {
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m");
  const match = pattern.exec(content);
  if (!match) return null;

  const start = match.index + match[0].length;
  const nextHeading = content.indexOf("\n## ", start);
  const end = nextHeading === -1 ? content.length : nextHeading;
  return content.slice(start, end).trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface WorkspaceConfig {
  name: string;
  repositories: RepositoryRef[];
  techStack: string[];
  conventions: string | null;
  pipelineSettings: PipelineSettings;
  knowledgeSources: KnowledgeSource[];
}

export interface RepositoryRef {
  name: string;
  path: string;
  description: string;
}

export interface PipelineSettings {
  checkpoints: "all" | "none" | string[];
  maxReviewIterations: number;
  agentTimeoutMinutes: number;
  copilotReviewEnabled: boolean;
  copilotReviewTimeoutMinutes: number;
  skipStages: string[];
}

export interface KnowledgeSource {
  type: "file" | "mcp";
  path?: string;
  description?: string;
}

export interface RepoContext {
  name: string;
  path: string;
  stack: string[];
  structure: string;
  conventions: string | null;
  recentCommits: string[];
}

export interface FullContext {
  workspace: WorkspaceConfig;
  repos: RepoContext[];
}

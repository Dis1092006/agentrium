export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
}

export interface AgentResult {
  artifact: string;
  metadata: Record<string, unknown>;
}

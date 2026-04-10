import type { AgentConfig, AgentResult } from "./types.js";

export class BaseAgent {
  readonly name: string;
  readonly description: string;
  readonly tools: string[];
  private readonly systemPrompt: string;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools;
  }

  buildSystemPrompt(contextPrompt: string): string {
    return `${this.systemPrompt}\n\n---\n\n# Project Context\n\n${contextPrompt}`;
  }

  async run(contextPrompt: string, taskDescription: string, timeoutMs?: number): Promise<AgentResult> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const fullPrompt = this.buildSystemPrompt(contextPrompt);

    const execute = async (): Promise<string> => {
      let result = "";
      for await (const message of query({
        prompt: taskDescription,
        options: {
          systemPrompt: fullPrompt,
          allowedTools: this.tools,
          permissionMode: "default",
        },
      })) {
        if ("result" in message) {
          result = message.result;
        }
      }
      return result;
    };

    let result: string;
    if (timeoutMs) {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Agent "${this.name}" timed out after ${Math.round(timeoutMs / 60_000)} minutes`)),
          timeoutMs,
        ),
      );
      result = await Promise.race([execute(), timeout]);
    } else {
      result = await execute();
    }

    if (!result) {
      throw new Error(`Agent "${this.name}" produced no output for task: ${taskDescription.slice(0, 100)}`);
    }

    return { artifact: result, metadata: { agent: this.name } };
  }
}

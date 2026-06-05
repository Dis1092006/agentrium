import type { AgentConfig, AgentResult } from "./types.js";

export interface AgentRunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onMessage?: (message: unknown) => void;
}

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

  async run(contextPrompt: string, taskDescription: string, options: AgentRunOptions = {}): Promise<AgentResult> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const { timeoutMs, signal, onMessage } = options;

    const fullPrompt = this.buildSystemPrompt(contextPrompt);
    const ac = new AbortController();

    let timedOut = false;
    const onExternalAbort = () => ac.abort();
    if (signal) {
      if (signal.aborted) ac.abort();
      else signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs) {
      timeoutId = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
    }

    const timeoutError = () =>
      new Error(`Agent "${this.name}" timed out after ${Math.round((timeoutMs ?? 0) / 60_000)} minutes`);
    const abortError = () => new Error(`Agent "${this.name}" was aborted`);

    try {
      let result = "";
      try {
        for await (const message of query({
          prompt: taskDescription,
          options: { systemPrompt: fullPrompt, allowedTools: this.tools, permissionMode: "default", abortController: ac },
        })) {
          try { onMessage?.(message); } catch { /* observers never break the run */ }
          if ("result" in message) result = (message as { result: string }).result;
        }
      } catch (err) {
        // The real SDK throws when the controller aborts; classify it.
        if (timedOut) throw timeoutError();
        if (ac.signal.aborted) throw abortError();
        throw err;
      }
      // Safety net for iterators that finish without throwing on abort (e.g. test mocks).
      if (timedOut) throw timeoutError();
      if (ac.signal.aborted) throw abortError();
      if (!result) {
        throw new Error(`Agent "${this.name}" produced no output for task: ${taskDescription.slice(0, 100)}`);
      }
      return { artifact: result, metadata: { agent: this.name } };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

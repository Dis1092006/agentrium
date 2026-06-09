// src/agents/quickPrompt.ts
// A minimal one-shot LLM call: no tools, no system-prompt scaffolding, no
// artifact semantics — just send a prompt and return the final text. Used for
// short auxiliary generations (PR titles, commit messages) that should never
// break a run, so callers are expected to wrap this in try/catch with a
// deterministic fallback.

export interface QuickPromptOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function runQuickPrompt(prompt: string, options: QuickPromptOptions = {}): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const { timeoutMs, signal } = options;

  const ac = new AbortController();
  const onExternalAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs) {
    timeoutId = setTimeout(() => ac.abort(), timeoutMs);
  }

  try {
    let result = "";
    for await (const message of query({
      prompt,
      options: { allowedTools: [], permissionMode: "default", abortController: ac },
    })) {
      if ("result" in message) result = (message as { result: string }).result;
    }
    return result.trim();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}

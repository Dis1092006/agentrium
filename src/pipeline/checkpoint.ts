import readline from "node:readline";
import chalk from "chalk";
import type { CheckpointDecision, Stage } from "./types.js";
import type { ControlChannel } from "../observability/controlChannel.js";
import type { EventLogger } from "../observability/eventLog.js";

export interface CheckpointPrompter {
  prompt(stage: Stage, artifactPreview: string, signal?: AbortSignal): Promise<CheckpointDecision>;
}

export function parseCheckpointInput(input: string): CheckpointDecision | null {
  const normalized = input.trim().toLowerCase();
  const map: Record<string, CheckpointDecision> = {
    a: "approve", approve: "approve",
    r: "reject", reject: "reject",
    s: "skip", skip: "skip",
    v: "view", view: "view",
  };
  return map[normalized] ?? null;
}

export class StdinCheckpointPrompter implements CheckpointPrompter {
  prompt(stage: Stage, artifactPreview: string, signal?: AbortSignal): Promise<CheckpointDecision> {
    console.log("");
    console.log(chalk.yellow(`── Checkpoint: ${stage} ──`));
    console.log("");
    const previewLimit = 3000;
    console.log(artifactPreview.slice(0, previewLimit));
    if (artifactPreview.length > previewLimit) {
      console.log(chalk.gray(`... (${artifactPreview.length - previewLimit} more characters — press [v] to view full artifact)`));
    }
    console.log("");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    signal?.addEventListener("abort", () => rl.close(), { once: true });

    const askOnce = (): Promise<CheckpointDecision> =>
      new Promise((resolve) => {
        rl.question(chalk.cyan("[a]pprove  [r]eject  [s]kip  [v]iew full artifact > "), (answer) => {
          const decision = parseCheckpointInput(answer);
          if (!decision) { console.log(chalk.red("Invalid input. Try again.")); resolve(askOnce()); return; }
          if (decision === "view") {
            console.log(chalk.blue(`\n── ${stage} (full) ──\n`));
            console.log(artifactPreview);
            resolve(askOnce());
            return;
          }
          rl.close();
          resolve(decision);
        });
      });
    return askOnce();
  }
}

export class ControlChannelCheckpointPrompter implements CheckpointPrompter {
  constructor(private readonly channel: ControlChannel, private readonly logger: EventLogger) {}
  async prompt(stage: Stage, artifactPreview: string, signal?: AbortSignal): Promise<CheckpointDecision> {
    this.logger.emit("stage", "checkpoint_awaiting", { stage, data: { preview: artifactPreview.slice(0, 3000) } });
    const decision = await this.channel.awaitDecision(stage, signal);
    this.logger.emit("stage", "checkpoint_decided", { stage, data: { decision } });
    return decision;
  }
}

export async function raceCheckpoint(
  prompters: CheckpointPrompter[],
  stage: Stage,
  artifactPreview: string,
): Promise<CheckpointDecision> {
  const ac = new AbortController();
  try {
    return await Promise.race(prompters.map((p) => p.prompt(stage, artifactPreview, ac.signal)));
  } finally {
    ac.abort();
  }
}

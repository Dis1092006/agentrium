import readline from "readline";
import chalk from "chalk";
import type { CheckpointDecision, Stage } from "./types.js";
import type { ArtifactStore } from "../artifacts/store.js";

export function parseCheckpointInput(input: string): CheckpointDecision | null {
  const normalized = input.trim().toLowerCase();
  const map: Record<string, CheckpointDecision> = {
    a: "approve",
    approve: "approve",
    r: "reject",
    reject: "reject",
    s: "skip",
    skip: "skip",
    v: "view",
    view: "view",
  };
  return map[normalized] ?? null;
}

export async function promptCheckpoint(
  stage: Stage,
  artifactPreview: string,
  store: ArtifactStore,
  runId: string,
): Promise<CheckpointDecision> {
  console.log("");
  console.log(chalk.yellow(`── Checkpoint: ${stage} ──`));
  console.log("");
  console.log(artifactPreview.slice(0, 2000));
  if (artifactPreview.length > 2000) {
    console.log(chalk.gray(`... (${artifactPreview.length - 2000} more characters)`));
  }
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const askOnce = (): Promise<CheckpointDecision> =>
    new Promise((resolve) => {
      rl.question(
        chalk.cyan("[a]pprove  [r]eject  [s]kip  [v]iew previous > "),
        (answer) => {
          const decision = parseCheckpointInput(answer);
          if (!decision) {
            console.log(chalk.red("Invalid input. Try again."));
            resolve(askOnce());
            return;
          }

          if (decision === "view") {
            const meta = store.readMeta(runId);
            const completedStages = Object.keys(meta.stages);
            if (completedStages.length === 0) {
              console.log(chalk.gray("No previous stages to view."));
            } else {
              for (const s of completedStages) {
                const content = store.readArtifact(runId, s);
                if (content) {
                  console.log(chalk.blue(`\n── ${s} ──`));
                  console.log(content.slice(0, 1000));
                  if (content.length > 1000) {
                    console.log(chalk.gray(`... (truncated)`));
                  }
                }
              }
            }
            resolve(askOnce());
            return;
          }

          rl.close();
          resolve(decision);
        },
      );
    });

  return askOnce();
}

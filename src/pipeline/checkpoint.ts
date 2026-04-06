import readline from "readline";
import chalk from "chalk";
import type { CheckpointDecision, Stage } from "./types.js";

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
): Promise<CheckpointDecision> {
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

  const askOnce = (): Promise<CheckpointDecision> =>
    new Promise((resolve) => {
      rl.question(
        chalk.cyan("[a]pprove  [r]eject  [s]kip  [v]iew full artifact > "),
        (answer) => {
          const decision = parseCheckpointInput(answer);
          if (!decision) {
            console.log(chalk.red("Invalid input. Try again."));
            resolve(askOnce());
            return;
          }

          if (decision === "view") {
            console.log(chalk.blue(`\n── ${stage} (full) ──\n`));
            console.log(artifactPreview);
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

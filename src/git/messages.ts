// src/git/messages.ts
// LLM-generated PR titles and commit messages, with deterministic fallbacks so
// generation can never break a run. PR title = the *intent* (derived from the
// task); commit message = the *actual changes* (derived from the staged diff).
import { simpleGit } from "simple-git";
import { runQuickPrompt, type QuickPromptOptions } from "../agents/quickPrompt.js";

const MAX_TITLE_LEN = 72;
const MAX_DIFF_CHARS = 12_000;

/** Collapse a raw LLM/title string to a single tidy line, capped in length. */
export function sanitizeTitle(raw: string): string {
  const firstLine = (raw.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim();
  const unwrapped = firstLine
    .replace(/^["'`]+|["'`]+$/g, "")            // surrounding quotes/backticks
    .replace(/^(?:title|pr title)\s*[:\-]\s*/i, "") // "Title: ..." prefixes
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")                      // trailing period/space
    .trim();
  return unwrapped.length > MAX_TITLE_LEN ? unwrapped.slice(0, MAX_TITLE_LEN).trimEnd() : unwrapped;
}

/** Offline title when LLM generation is unavailable: the task's first line, tidied. */
export function fallbackPrTitle(task: string): string {
  return sanitizeTitle(task) || "Automated changes";
}

/** Neutral commit subject when LLM generation is unavailable — never restates the task. */
export function fallbackCommitMessage(fileCount: number, type: string, stage: string): string {
  const plural = fileCount === 1 ? "file" : "files";
  return `${type}: ${stage} changes (${fileCount} ${plural})`;
}

/**
 * A concise, English, imperative PR title summarizing the task's intent.
 * Falls back to a tidied form of the task on any failure.
 */
export async function generatePrTitle(task: string, options: QuickPromptOptions = {}): Promise<string> {
  const prompt = [
    "Summarize the following software task as a pull-request title.",
    "Rules: English, imperative mood, Conventional Commits style (e.g. \"feat: add ...\", \"fix: ...\"),",
    "at most about 8 words, no trailing period. Output ONLY the title, nothing else.",
    "",
    "Task:",
    task,
  ].join("\n");

  try {
    const title = sanitizeTitle(await runQuickPrompt(prompt, options));
    return title || fallbackPrTitle(task);
  } catch {
    return fallbackPrTitle(task);
  }
}

/**
 * A Conventional Commits message describing what actually changed in `files`,
 * built from the staged diff. `files` are staged first so newly-created files
 * appear in the diff. Falls back to a neutral subject on any failure.
 */
export async function generateCommitMessage(
  repoPath: string,
  files: string[],
  meta: { type: string; stage: string } & QuickPromptOptions,
): Promise<string> {
  const { type, stage, ...promptOptions } = meta;
  try {
    const git = simpleGit(repoPath);
    await git.add(files); // stage so new files show up in --cached diff
    let diff = await git.diff(["--cached", "--", ...files]);
    if (diff.length > MAX_DIFF_CHARS) {
      diff = diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated]";
    }
    if (!diff.trim()) return fallbackCommitMessage(files.length, type, stage);

    const prompt = [
      `Write a git commit message for changes produced during the "${stage}" stage of an automated pipeline.`,
      "Base it on the diff below — describe what ACTUALLY changed; do NOT restate the original task.",
      `Use Conventional Commits: a concise subject line (≤72 chars, imperative, prefer the "${type}" type),`,
      "optionally a blank line then 1-3 short \"- \" bullets. Output ONLY the commit message.",
      "",
      "Diff:",
      diff,
    ].join("\n");

    const message = (await runQuickPrompt(prompt, promptOptions)).trim();
    return message || fallbackCommitMessage(files.length, type, stage);
  } catch {
    return fallbackCommitMessage(files.length, type, stage);
  }
}

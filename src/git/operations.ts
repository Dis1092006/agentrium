// src/git/operations.ts
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { simpleGit } from "simple-git";

export function slugifyTask(task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "-")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/-+$/, "");
  return slug || "task";
}

export async function createBranch(repoPath: string, branchName: string): Promise<void> {
  const git = simpleGit(repoPath);
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    await git.checkout(branchName);
  } else {
    await git.checkoutLocalBranch(branchName);
  }
}

export async function getUncommittedFiles(repoPath: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  const status = await git.status();
  return Array.from(
    new Set([
      ...status.modified,
      ...status.not_added,
      ...status.created,
      ...status.deleted,
      ...status.staged,
      ...status.conflicted,
      ...status.renamed.map((r) => r.to),
    ]),
  );
}

/** Per-repo snapshot of uncommitted files at run start: path → content hash. */
export type DirtySnapshot = Record<string, string>;

/** Content hash of a working-tree file; "" for a missing (deleted) file. */
function hashWorkingFile(repoPath: string, file: string): string {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(path.join(repoPath, file))).digest("hex");
  } catch {
    return "";
  }
}

/**
 * Snapshot the files already uncommitted in `repoPath`, hashing each one's
 * current content. Taken once before any agent runs so later commits can tell
 * which dirty files agentrium actually changed.
 */
export async function snapshotDirty(repoPath: string): Promise<DirtySnapshot> {
  const files = await getUncommittedFiles(repoPath);
  const snapshot: DirtySnapshot = {};
  for (const file of files) {
    snapshot[file] = hashWorkingFile(repoPath, file);
  }
  return snapshot;
}

/**
 * Files agentrium changed during the run, relative to the `baseline` snapshot.
 * A file is included when it was clean at run start (now dirty) OR was already
 * dirty but its content changed since the snapshot. A pre-existing dirty file
 * agentrium never touched is excluded, so we never commit unrelated user
 * work-in-progress — but any file an agent edits is committed even if the user
 * had it dirty beforehand.
 */
export async function getAgentChangedFiles(repoPath: string, baseline: DirtySnapshot): Promise<string[]> {
  const current = await getUncommittedFiles(repoPath);
  return current.filter((file) => {
    const baseHash = baseline[file];
    if (baseHash === undefined) return true; // clean at run start, dirty now
    return hashWorkingFile(repoPath, file) !== baseHash; // dirty before, changed since
  });
}

/**
 * Commit changes in `repoPath`. When `files` is provided, only those paths are
 * staged (so pre-existing user changes are left untouched); an empty list is a
 * no-op. When `files` is omitted, the entire working tree is staged.
 */
export async function commitChanges(repoPath: string, message: string, files?: string[]): Promise<boolean> {
  const git = simpleGit(repoPath);
  if (files !== undefined) {
    if (files.length === 0) return false;
    await git.add(files);
  } else {
    await git.add(".");
  }
  const status = await git.status();
  if (status.staged.length === 0) return false;
  await git.commit(message);
  return true;
}

export async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  const git = simpleGit(repoPath);
  const branches = await git.branchLocal();
  return branches.all.includes(branchName);
}

export async function pushBranch(repoPath: string, branchName: string): Promise<void> {
  const git = simpleGit(repoPath);
  await git.push("origin", branchName, ["-u"]);
}

export function createPR(repoPath: string, branchName: string, title: string, body: string): string {
  // execFileSync (not exec) prevents shell injection — args passed as array
  const output = execFileSync(
    "gh",
    ["pr", "create", "--head", branchName, "--title", title, "--body", body],
    { cwd: repoPath, encoding: "utf-8" },
  );
  return output.trim();
}

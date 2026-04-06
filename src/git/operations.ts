// src/git/operations.ts
import { execFileSync } from "child_process";
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
  await git.checkoutLocalBranch(branchName);
}

export async function commitChanges(repoPath: string, message: string): Promise<boolean> {
  const git = simpleGit(repoPath);
  await git.add(".");
  const status = await git.status();
  if (status.staged.length === 0) return false;
  await git.commit(message);
  return true;
}

export async function pushBranch(repoPath: string, branchName: string): Promise<void> {
  const git = simpleGit(repoPath);
  await git.push("origin", branchName, ["-u"]);
}

export function createPR(repoPath: string, title: string, body: string): string {
  // execFileSync (not exec) prevents shell injection — args passed as array
  const output = execFileSync(
    "gh",
    ["pr", "create", "--title", title, "--body", body],
    { cwd: repoPath, encoding: "utf-8" },
  );
  return output.trim();
}

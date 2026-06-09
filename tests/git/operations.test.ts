// tests/git/operations.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { slugifyTask, createBranch, commitChanges, branchExists, getUncommittedFiles, getAgentChangedFiles, snapshotDirty } from "../../src/git/operations.js";

describe("git operations", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-git-"));
    execSync("git init", { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "README.md"), "# Test");
    execSync("git add .", { cwd: repoDir });
    execSync('git commit -m "init"', { cwd: repoDir });
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true });
  });

  it("slugifyTask converts task to branch-safe slug", () => {
    expect(slugifyTask("Add user authentication with JWT")).toBe("add-user-authentication-with-jwt");
    expect(slugifyTask("Fix null pointer in auth/middleware")).toBe("fix-null-pointer-in-auth-middleware");
    expect(slugifyTask("  Extra   spaces  ")).toBe("extra-spaces");
  });

  it("slugifyTask handles edge cases", () => {
    expect(slugifyTask("!!!!")).toBe("task");
    expect(slugifyTask("   ")).toBe("task");
    expect(slugifyTask("short")).toBe("short");
  });

  it("slugifyTask truncates to 50 characters", () => {
    const long = "This is a very long task description that exceeds fifty characters easily";
    expect(slugifyTask(long).length).toBeLessThanOrEqual(50);
  });

  it("createBranch creates and checks out a new branch", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    const result = execSync("git branch --show-current", { cwd: repoDir, encoding: "utf-8" });
    expect(result.trim()).toBe("agentrium/test-branch");
  });

  it("commitChanges commits staged changes and returns true", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    fs.writeFileSync(path.join(repoDir, "new-file.ts"), "export const x = 1;");
    const committed = await commitChanges(repoDir, "feat: add new file");
    expect(committed).toBe(true);
    const log = execSync("git log --oneline", { cwd: repoDir, encoding: "utf-8" });
    expect(log).toContain("feat: add new file");
  });

  it("commitChanges returns false when there is nothing to commit", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    const committed = await commitChanges(repoDir, "feat: nothing");
    expect(committed).toBe(false);
  });

  it("commitChanges with an explicit file list stages only those files", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    // A pre-existing dirty file the user already had (must NOT be committed)
    fs.writeFileSync(path.join(repoDir, "user-wip.ts"), "user changes");
    // A file agentrium produced (must be committed)
    fs.writeFileSync(path.join(repoDir, "agent-file.ts"), "export const x = 1;");

    const committed = await commitChanges(repoDir, "feat: only agent file", ["agent-file.ts"]);
    expect(committed).toBe(true);

    // The agent file is in the commit
    const show = execSync("git show --name-only --pretty=format: HEAD", { cwd: repoDir, encoding: "utf-8" });
    expect(show).toContain("agent-file.ts");
    expect(show).not.toContain("user-wip.ts");

    // The user's WIP file is still uncommitted (untouched)
    const stillDirty = await getUncommittedFiles(repoDir);
    expect(stillDirty).toContain("user-wip.ts");
  });

  it("commitChanges returns false when given an empty file list", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    fs.writeFileSync(path.join(repoDir, "user-wip.ts"), "user changes");
    const committed = await commitChanges(repoDir, "feat: nothing of ours", []);
    expect(committed).toBe(false);
    // Nothing was committed; the user's file is still dirty
    expect(await getUncommittedFiles(repoDir)).toContain("user-wip.ts");
  });

  it("getAgentChangedFiles returns files dirtied after the baseline snapshot", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    // Pre-existing dirty file at run start, left untouched by agentrium
    fs.writeFileSync(path.join(repoDir, "user-wip.ts"), "user changes");
    const baseline = await snapshotDirty(repoDir);

    // Now agentrium changes a different file
    fs.writeFileSync(path.join(repoDir, "agent-file.ts"), "export const x = 1;");

    const mine = await getAgentChangedFiles(repoDir, baseline);
    expect(mine).toContain("agent-file.ts");
    expect(mine).not.toContain("user-wip.ts");
  });

  it("getAgentChangedFiles includes a pre-existing dirty file when agentrium edits it further", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    fs.writeFileSync(path.join(repoDir, "user-wip.ts"), "user v1");
    const baseline = await snapshotDirty(repoDir);

    // agentrium further modifies the file the user already had dirty
    fs.writeFileSync(path.join(repoDir, "user-wip.ts"), "user v1 + agent v2");

    const mine = await getAgentChangedFiles(repoDir, baseline);
    expect(mine).toContain("user-wip.ts");
  });

  it("getAgentChangedFiles excludes a pre-existing dirty file agentrium never touched", async () => {
    await createBranch(repoDir, "agentrium/test-branch");
    fs.writeFileSync(path.join(repoDir, "user-wip.ts"), "user only");
    const baseline = await snapshotDirty(repoDir);

    // agentrium touches a different file; user-wip.ts is left exactly as-is
    fs.writeFileSync(path.join(repoDir, "agent-file.ts"), "agent");

    const mine = await getAgentChangedFiles(repoDir, baseline);
    expect(mine).not.toContain("user-wip.ts");
    expect(mine).toContain("agent-file.ts");
  });

  it("branchExists returns true for an existing local branch", async () => {
    await createBranch(repoDir, "agentrium/existing");
    expect(await branchExists(repoDir, "agentrium/existing")).toBe(true);
  });

  it("branchExists returns false for a non-existent branch", async () => {
    expect(await branchExists(repoDir, "agentrium/no-such-branch")).toBe(false);
  });

  it("getUncommittedFiles returns modified, untracked, deleted, and staged files", async () => {
    // set up a file to delete in a separate commit first
    fs.writeFileSync(path.join(repoDir, "to-delete.ts"), "export {}");
    execSync("git add to-delete.ts", { cwd: repoDir });
    execSync('git commit -m "add file"', { cwd: repoDir });

    // modified
    fs.writeFileSync(path.join(repoDir, "README.md"), "changed");
    // untracked
    fs.writeFileSync(path.join(repoDir, "untracked.ts"), "export {}");
    // staged new file (added to index, not yet committed)
    fs.writeFileSync(path.join(repoDir, "staged.ts"), "export {}");
    execSync("git add staged.ts", { cwd: repoDir });
    // deleted
    fs.rmSync(path.join(repoDir, "to-delete.ts"));

    const files = await getUncommittedFiles(repoDir);
    expect(files).toContain("README.md");
    expect(files).toContain("untracked.ts");
    expect(files).toContain("staged.ts");
    expect(files).toContain("to-delete.ts");
  });

  it("getUncommittedFiles deduplicates files that appear in multiple status categories", async () => {
    // A file staged then modified again appears in both staged and modified
    fs.writeFileSync(path.join(repoDir, "double.ts"), "v1");
    execSync("git add double.ts", { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "double.ts"), "v2");

    const files = await getUncommittedFiles(repoDir);
    const count = files.filter((f) => f === "double.ts").length;
    expect(count).toBe(1);
  });

  it("getUncommittedFiles returns empty array when working tree is clean", async () => {
    const files = await getUncommittedFiles(repoDir);
    expect(files).toHaveLength(0);
  });
});

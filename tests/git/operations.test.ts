// tests/git/operations.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { slugifyTask, createBranch, commitChanges } from "../../src/git/operations.js";

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
});

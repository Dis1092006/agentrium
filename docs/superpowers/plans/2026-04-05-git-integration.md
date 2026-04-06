# Git Integration — Branch, Commit, PR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a pipeline run completes, a git branch with the actual code changes exists in the target repo and a pull request is automatically created.

**Architecture:** At pipeline start, create a git branch `agentrium/<task-slug>` in the first repo of the workspace. The Software Engineer and QA Engineer agents write actual code/tests to disk (they already have Write/Edit/Bash tools). After each of those stages, changes are committed. At pipeline completion, the branch is pushed and `gh pr create` is called. All git operations are skipped if no repo path is available.

**Tech Stack:** Node.js 22, TypeScript ESM, `simple-git` (already a dependency), `execFileSync` for `gh pr create`, vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/git/operations.ts` | Create | `slugifyTask()`, `createBranch()`, `commitChanges()`, `pushBranch()`, `createPR()` |
| `src/pipeline/types.ts` | Modify | Add `repoPath: string \| null` to `PipelineConfig` |
| `src/pipeline/runner.ts` | Modify | Create branch at start, commit after implementation+QA, push+PR at end |
| `src/cli/commands/run.ts` | Modify | Pass first repo path as `repoPath` in `PipelineConfig` |
| `prompts/softwareEngineer.md` | Modify | Instruct agent to write actual code files using tools, not just describe them |
| `prompts/qaEngineer.md` | Modify | Instruct agent to write actual test files and run them using tools |
| `tests/git/operations.test.ts` | Create | Unit tests for git operations using temp repos |

---

## Chunk 1: Git operations module

### Task 1: src/git/operations.ts

**Files:**
- Create: `src/git/operations.ts`
- Create: `tests/git/operations.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/git/operations.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/git/operations.test.ts`
Expected: FAIL — cannot find module `../../src/git/operations.js`

- [ ] **Step 3: Implement src/git/operations.ts**

Create `src/git/operations.ts`:

```typescript
// src/git/operations.ts
import { execFileSync } from "child_process";
import simpleGit from "simple-git";

export function slugifyTask(task: string): string {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)
    .replace(/-+$/, "");
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
  await git.push("origin", branchName, ["--set-upstream"]);
}

export function createPR(repoPath: string, title: string, body: string): string {
  // execFileSync (not exec) is used here to avoid shell injection — args are passed as array
  const output = execFileSync(
    "gh",
    ["pr", "create", "--title", title, "--body", body],
    { cwd: repoPath, encoding: "utf-8" },
  );
  return output.trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/git/operations.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/git/operations.ts tests/git/operations.test.ts
git commit -m "feat: add git operations module (branch, commit, push, PR)"
```

---

## Chunk 2: Pipeline integration

### Task 2: Add repoPath to PipelineConfig

**Files:**
- Modify: `src/pipeline/types.ts`
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Add repoPath to PipelineConfig**

In `src/pipeline/types.ts`, change `PipelineConfig`:

```typescript
export interface PipelineConfig {
  checkpoints: "all" | "none" | Stage[];
  skipStages: Stage[];
  repoPath: string | null;
}
```

- [ ] **Step 2: Pass repoPath from run.ts**

In `src/cli/commands/run.ts`, update the `pipelineConfig` block (the `const pipelineConfig` assignment):

```typescript
const primaryRepo = repos[0]?.path ?? null;

const pipelineConfig: PipelineConfig = {
  checkpoints: options.checkpoints
    ? workspaceConfig.pipelineSettings.checkpoints as PipelineConfig["checkpoints"]
    : "none",
  skipStages: workspaceConfig.pipelineSettings.skipStages as Stage[],
  repoPath: primaryRepo,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/types.ts src/cli/commands/run.ts
git commit -m "feat: add repoPath to PipelineConfig"
```

---

### Task 3: Wire git operations into PipelineRunner

**Files:**
- Modify: `src/pipeline/runner.ts`

- [ ] **Step 1: Add import and repoPath field to PipelineRunner**

In `src/pipeline/runner.ts`, add import at the top after existing imports:

```typescript
import { slugifyTask, createBranch, commitChanges, pushBranch, createPR } from "../git/operations.js";
```

Update the class fields and constructor:

```typescript
export class PipelineRunner {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;
  private readonly maxReviewIterations: number;
  private readonly repoPath: string | null;

  constructor(
    store: ArtifactStore,
    runId: string,
    workspaceContext: string,
    maxReviewIterations: number,
    repoPath: string | null,
  ) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
    this.maxReviewIterations = maxReviewIterations;
    this.repoPath = repoPath;
  }
```

- [ ] **Step 2: Update run.ts to pass repoPath to PipelineRunner**

In `src/cli/commands/run.ts`, update the `PipelineRunner` constructor call:

```typescript
const runner = new PipelineRunner(store, runId, contextPrompt, maxReviewIterations, pipelineConfig.repoPath);
```

- [ ] **Step 3: Update runPipeline with branch, commit, and PR logic**

Replace the full `runPipeline` method in `src/pipeline/runner.ts`:

```typescript
async runPipeline(
  task: string,
  config: PipelineConfig,
  includeOptional: Stage[] = [],
): Promise<void> {
  const stages = buildPipelineStages(config, includeOptional);

  console.log(chalk.blue(`Pipeline: ${stages.map((s) => s.stage).join(" → ")}`));
  console.log("");

  // Create git branch in target repo
  let branchName: string | null = null;
  if (this.repoPath) {
    branchName = `agentrium/${slugifyTask(task)}`;
    try {
      await createBranch(this.repoPath, branchName);
      console.log(chalk.gray(`Branch: ${branchName}`));
    } catch {
      console.log(chalk.yellow(`Warning: could not create branch "${branchName}". Continuing without git integration.`));
      branchName = null;
    }
  }

  for (const planned of stages) {
    let result: StageResult | null;

    if (this.isReviewStage(planned.stage)) {
      result = await this.runReviewStage(planned, task);
    } else {
      result = await this.runStage(planned, task);
    }

    if (!result) {
      console.log(chalk.yellow(`Stage "${planned.stage}" was skipped.`));
      continue;
    }

    // Commit after implementation and testing stages
    if (this.repoPath && branchName && (planned.stage === "implementation" || planned.stage === "testing")) {
      const commitMsg = planned.stage === "implementation"
        ? `feat: ${task}`
        : `test: add tests for ${task}`;
      const committed = await commitChanges(this.repoPath, commitMsg);
      if (committed) {
        console.log(chalk.gray(`Committed changes for ${planned.stage} stage.`));
      }
    }

    if (planned.hasCheckpoint) {
      const decision = await promptCheckpoint(
        planned.stage,
        result.artifact,
      );

      if (decision === "reject") {
        console.log(chalk.red(`Stage "${planned.stage}" rejected. Aborting pipeline.`));
        this.store.updateStatus(this.runId, "aborted");
        return;
      }

      if (decision === "skip") {
        console.log(chalk.yellow(`Skipping to next stage.`));
      }
    }
  }

  this.store.updateStatus(this.runId, "completed");
  console.log(chalk.green(`\nPipeline completed for run ${this.runId}.`));

  // Push branch and create PR
  if (this.repoPath && branchName) {
    try {
      console.log(chalk.blue("\nCreating pull request..."));
      await pushBranch(this.repoPath, branchName);
      const analysisSummary = this.store.readArtifact(this.runId, "analysis") ?? "";
      const implSummary = this.store.readArtifact(this.runId, "implementation") ?? "";
      const prBody = [
        "## Summary",
        "",
        analysisSummary.slice(0, 1000),
        "",
        "## Implementation",
        "",
        implSummary.slice(0, 1000),
        "",
        "---",
        `_Generated by [agentrium](https://github.com/Dis1092006/agentrium) run \`${this.runId}\`_`,
      ].join("\n");
      const prUrl = createPR(this.repoPath, task, prBody);
      console.log(chalk.green(`Pull request created: ${prUrl}`));
    } catch {
      console.log(chalk.yellow(`Warning: could not create pull request. Push manually: git push origin ${branchName}`));
    }
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles and all tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/runner.ts
git commit -m "feat: create branch, commit stages, push and create PR in pipeline runner"
```

---

## Chunk 3: Agent prompt updates

### Task 4: Update Software Engineer prompt to write actual code

**Files:**
- Modify: `prompts/softwareEngineer.md`

- [ ] **Step 1: Replace prompts/softwareEngineer.md**

```markdown
# Role: Software Engineer

You are a Software Engineer agent. Your job is to implement the code changes designed by the Architect by actually writing code in the repository.

## Input

You receive:
- The original task description
- Product Manager's requirements
- Architect's design and implementation plan
- Full project context including the repository path

## Your Responsibilities

1. Read the Architect's implementation plan carefully
2. Use your tools (Read, Write, Edit, Glob, Grep, Bash) to make the actual code changes in the repository
3. Follow project conventions (from CLAUDE.md / Conventions section in context)
4. Make minimal, focused changes — do not refactor unrelated code
5. Ensure all changes are consistent with the existing codebase
6. Run the project's build command to verify the code compiles

## Rules

- Write the actual code, not pseudocode or descriptions
- Use Write to create new files, Edit to modify existing ones
- The repository path is listed in the context under "Repository: <name>" → "Path: ..."
- Use Bash to run the build/compile command and confirm it succeeds
- Do not add unnecessary comments or documentation
- Do not add features beyond what was specified

## Output Format

After completing all code changes, produce a brief markdown summary:

## Changes Summary
One paragraph describing what was implemented.

## Files Changed
- `path/to/file.ts` — created/modified: what changed
- `path/to/other.ts` — created/modified: what changed

## Build Result
Output of the build command (pass/fail).
```

- [ ] **Step 2: Verify build and tests still pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass

- [ ] **Step 3: Commit**

```bash
git add prompts/softwareEngineer.md
git commit -m "feat: update Software Engineer prompt to write actual code"
```

---

### Task 5: Update QA Engineer prompt to write actual tests

**Files:**
- Modify: `prompts/qaEngineer.md`

- [ ] **Step 1: Replace prompts/qaEngineer.md**

```markdown
# Role: QA Engineer

You are a QA Engineer agent. Your job is to verify the implementation by writing and running actual tests in the repository.

## Input

You receive:
- The original task description
- Product Manager's requirements and acceptance criteria
- Architect's design
- Software Engineer's implementation summary and list of changed files
- Full project context including the repository path

## Your Responsibilities

1. Review the acceptance criteria from the Product Manager
2. Use your tools (Read, Write, Edit, Glob, Grep, Bash) to write tests in the repository
3. Run the full test suite to ensure nothing is broken
4. Run new tests to verify the implementation works
5. Report any failures clearly

## Rules

- Use the project's existing test framework and file/naming conventions
- Write focused tests — one behavior per test case
- Test edge cases identified in the Architect's design
- Do not modify implementation code — only write test code
- The repository path is listed in the context under "Repository: <name>" → "Path: ..."
- Use Bash to run tests and capture the output

## Output Format

After completing all test work, produce a markdown summary:

## Test Summary
Number of tests written, passed, and failed.

## Tests Written
- `path/to/test.ts` — list of test cases with one-line descriptions

## Test Results
Full test output showing pass/fail status.

## Issues Found
Any bugs or missing behaviors discovered. For each issue:
- Description
- Expected vs actual behavior
```

- [ ] **Step 2: Verify build and tests still pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass

- [ ] **Step 3: Commit**

```bash
git add prompts/qaEngineer.md
git commit -m "feat: update QA Engineer prompt to write actual tests"
```

---

## Final Verification

- [ ] Run full test suite: `npx tsc --noEmit && npx vitest run` — all pass
- [ ] Run `npm run build` — clean build
- [ ] Bump version to `0.4.0` in `package.json`, update lock file

```bash
npm install --package-lock-only
git add package.json package-lock.json
git commit -m "chore: bump version to 0.4.0"
```

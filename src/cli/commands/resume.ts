// src/cli/commands/resume.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import fs from "fs";
import readline from "readline";
import { getWorkspacesDir, listWorkspaces, loadWorkspaceConfig } from "../../workspace/manager.js";
import { parseAgentriumMd } from "../../context/configParser.js";
import { analyzeRepo } from "../../context/repoAnalyzer.js";
import { buildContextPrompt } from "../../context/contextBuilder.js";
import { ArtifactStore } from "../../artifacts/store.js";
import { PipelineRunner } from "../../pipeline/runner.js";
import { pushBranch, createPR, slugifyTask, branchExists, getUncommittedFiles, commitChanges } from "../../git/operations.js";
import type { FullContext } from "../../context/types.js";
import type { PipelineConfig, Stage } from "../../pipeline/types.js";

function findStoreForRun(runId: string): { store: ArtifactStore; workspaceName: string } | null {
  for (const ws of listWorkspaces()) {
    const store = new ArtifactStore(path.join(getWorkspacesDir(), ws, "runs"));
    try {
      store.readMeta(runId);
      return { store, workspaceName: ws };
    } catch {
      // not in this workspace
    }
  }
  return null;
}

export function registerResumeCommand(program: Command): void {
  program
    .command("resume <run-id>")
    .description("Resume an interrupted pipeline run or retry failed git operations")
    .option("-w, --workspace <name>", "Workspace name (auto-detected if omitted)")
    .action(async (runId: string, options: { workspace?: string }) => {
      // 1. Find run
      let store: ArtifactStore;
      let workspaceName: string;

      if (options.workspace) {
        workspaceName = options.workspace;
        store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));
      } else {
        const found = findStoreForRun(runId);
        if (!found) {
          console.log(chalk.red(`Run "${runId}" not found in any workspace.`));
          process.exit(1);
        }
        ({ store, workspaceName } = found);
      }

      let meta;
      try {
        meta = store.readMeta(runId);
      } catch {
        if (options.workspace) {
          console.log(chalk.red(`Run "${runId}" not found or unreadable in workspace "${workspaceName}". Try omitting --workspace to auto-detect it.`));
        } else {
          console.log(chalk.red(`Run "${runId}" not found in any workspace.`));
        }
        process.exit(1);
      }

      // Use stored workspaceName if present (overrides search result for clarity)
      const effectiveWorkspace = meta.workspaceName || workspaceName;

      // 2. Already completed with PR → nothing to do
      if (meta.status === "completed" && meta.prUrl) {
        console.log(chalk.green(`Run ${runId} is already complete.`));
        console.log(chalk.gray(`PR: ${meta.prUrl}`));
        return;
      }

      // 3. Completed pipeline but no PR → only run git ops
      if (meta.status === "completed" && !meta.prUrl) {
        console.log(chalk.blue(`Pipeline complete. Retrying PR creation for run ${runId}...`));
        await retryGitOps(store, runId, meta.task, effectiveWorkspace);
        return;
      }

      // 4. Interrupted/failed → rebuild context and resume pipeline
      console.log(chalk.blue(`Resuming run ${runId} from workspace "${effectiveWorkspace}"...`));
      console.log(chalk.gray(`Completed stages: ${Object.keys(meta.stages).join(", ") || "none"}`));

      const configContent = loadWorkspaceConfig(effectiveWorkspace);
      if (!configContent) {
        console.log(chalk.red(`Workspace "${effectiveWorkspace}" config not found.`));
        process.exit(1);
      }

      const workspaceConfig = parseAgentriumMd(configContent);
      const repos = [];
      for (const repoRef of workspaceConfig.repositories) {
        const expandedPath = repoRef.path.replace(/^~/, process.env.HOME ?? "~");
        if (fs.existsSync(expandedPath)) {
          repos.push(await analyzeRepo(expandedPath));
        }
      }

      const fullContext: FullContext = { workspace: workspaceConfig, repos };
      const contextPrompt = buildContextPrompt(fullContext);

      const primaryRepo = repos[0]?.path ?? null;
      const includeOptional = (meta.includeOptional ?? []) as Stage[];

      const pipelineConfig: PipelineConfig = {
        checkpoints: workspaceConfig.pipelineSettings.checkpoints as PipelineConfig["checkpoints"],
        skipStages: workspaceConfig.pipelineSettings.skipStages as Stage[],
        repoPath: primaryRepo,
      };

      const rawIterations = workspaceConfig.pipelineSettings.maxReviewIterations;
      const maxReviewIterations = Number.isFinite(rawIterations) && rawIterations >= 1
        ? Math.floor(rawIterations)
        : 3;
      const rawTimeout = workspaceConfig.pipelineSettings.agentTimeoutMinutes;
      const agentTimeoutMinutes = Number.isFinite(rawTimeout) && rawTimeout >= 1
        ? Math.floor(rawTimeout)
        : 30;

      // Reset status to running so pipeline proceeds normally
      store.updateStatus(runId, "running");

      const runner = new PipelineRunner(store, runId, contextPrompt, maxReviewIterations, primaryRepo, agentTimeoutMinutes);
      await runner.runPipeline(meta.task, pipelineConfig, includeOptional);
    });
}

async function retryGitOps(store: ArtifactStore, runId: string, task: string, workspaceName: string): Promise<void> {
  const configContent = loadWorkspaceConfig(workspaceName);
  if (!configContent) {
    console.log(chalk.red(`Workspace "${workspaceName}" config not found.`));
    process.exit(1);
  }

  const workspaceConfig = parseAgentriumMd(configContent);
  const repos = [];
  for (const repoRef of workspaceConfig.repositories) {
    const expandedPath = repoRef.path.replace(/^~/, process.env.HOME ?? "~");
    if (fs.existsSync(expandedPath)) {
      repos.push(await analyzeRepo(expandedPath));
    }
  }

  const repoPath = repos[0]?.path ?? null;
  if (!repoPath) {
    console.log(chalk.yellow("No repository configured. Cannot create PR."));
    return;
  }

  const branchName = `agentrium/${slugifyTask(task)}`;
  try {
    const exists = await branchExists(repoPath, branchName);
    if (!exists) {
      console.log(chalk.red(`Branch "${branchName}" does not exist locally.`));
      console.log(chalk.yellow(`If you pushed it manually, create the PR with: gh pr create --head ${branchName}`));
      return;
    }

    const uncommitted = await getUncommittedFiles(repoPath);
    if (uncommitted.length > 0) {
      console.log(chalk.yellow(`\nUncommitted changes found in ${repoPath}:`));
      for (const f of uncommitted) {
        console.log(chalk.gray(`  ${f}`));
      }
      const confirmed = await askYesNo(chalk.cyan("\nCommit these changes and include in PR? [y/n] > "));
      if (!confirmed) {
        console.log(chalk.yellow("Skipping commit. Proceeding with push of existing commits."));
      } else {
        const commitMsg = `feat: ${task}`;
        const committed = await commitChanges(repoPath, commitMsg);
        if (committed) {
          console.log(chalk.gray(`Committed changes: "${commitMsg}"`));
        }
      }
    }

    await pushBranch(repoPath, branchName);
    const analysisSummary = store.readArtifact(runId, "analysis") ?? "";
    const implSummary = store.readArtifact(runId, "implementation") ?? "";
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
      `_Generated by [agentrium](https://github.com/Dis1092006/agentrium) run \`${runId}\`_`,
    ].join("\n");
    const prUrl = createPR(repoPath, branchName, task, prBody);
    store.updatePrUrl(runId, prUrl);
    console.log(chalk.green(`Pull request created: ${prUrl}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`Failed to create PR: ${message}`));
    console.log(chalk.yellow(`Push manually: git push origin ${branchName}`));
  }
}

function askYesNo(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

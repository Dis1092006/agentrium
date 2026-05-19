// tests/cli/commands/run.seed.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { Command } from "commander";

vi.mock("../../../src/context/repoAnalyzer.js", () => ({
  analyzeRepo: vi.fn(async (p: string) => ({ path: p, name: path.basename(p) })),
}));
vi.mock("../../../src/context/contextBuilder.js", () => ({
  buildContextPrompt: vi.fn(() => "WORKSPACE CONTEXT"),
}));

const runPipelineMock = vi.fn(async () => undefined);
vi.mock("../../../src/pipeline/runner.js", () => {
  class PipelineRunner {
    runPipeline = runPipelineMock;
  }
  return { PipelineRunner };
});

import { registerRunCommand } from "../../../src/cli/commands/run.js";
import { ArtifactStore } from "../../../src/artifacts/store.js";

describe("agentrium run --seed / --start-from", () => {
  let home: string;
  let oldHome: string | undefined;
  let exitSpy: any;
  let workspaceName: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-run-seed-"));
    oldHome = process.env.HOME;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("process.exit");
    }) as never);

    workspaceName = "ws-seed";
    const wsDir = path.join(home, ".agentrium", "workspaces", workspaceName);
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(
      path.join(wsDir, "AGENTRIUM.md"),
      `# Workspace: ${workspaceName}\n\n## Repositories\n\n## Tech Stack\n\n## Pipeline Settings\n- Checkpoints: none\n- Max review iterations: 3\n- Agent timeout minutes: 30\n- Copilot review: false\n`,
    );

    runPipelineMock.mockClear();
  });

  afterEach(() => {
    process.env.HOME = oldHome;
    fs.rmSync(home, { recursive: true, force: true });
    exitSpy.mockRestore();
  });

  async function runCli(args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerRunCommand(program);
    await program.parseAsync(["node", "agentrium", "run", ...args]);
  }

  it("creates a run, persists seeded artifacts, and passes startFrom to the runner", async () => {
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "seeds-"));
    const analysisPath = path.join(seedDir, "design.md");
    const archPath = path.join(seedDir, "plan.md");
    fs.writeFileSync(analysisPath, "# Design");
    fs.writeFileSync(archPath, "# Plan");

    await runCli([
      "do the thing",
      "--workspace", workspaceName,
      "--seed", `analysis=${analysisPath}`,
      "--seed", `architecture=${archPath}`,
      "--start-from", "implementation",
    ]);

    const runsDir = path.join(home, ".agentrium", "workspaces", workspaceName, "runs");
    const store = new ArtifactStore(runsDir);
    const runs = store.listRuns();
    expect(runs).toHaveLength(1);

    const meta = runs[0];
    expect(meta.seededStages).toEqual(["analysis", "architecture"]);
    expect(meta.startFrom).toBe("implementation");
    expect(store.readArtifact(meta.runId, "analysis")).toBe("# Design");
    expect(store.readArtifact(meta.runId, "architecture")).toBe("# Plan");

    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    const callArgs = runPipelineMock.mock.calls[0];
    expect(callArgs[3]).toBe("implementation");

    fs.rmSync(seedDir, { recursive: true });
  });

  it("aborts when a seed file is missing", async () => {
    await expect(runCli([
      "do the thing",
      "--workspace", workspaceName,
      "--seed", "analysis=/nonexistent/path.md",
      "--start-from", "implementation",
    ])).rejects.toThrow(/process\.exit/);
  });

  it("aborts when --start-from has uncovered preceding stages", async () => {
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "seeds-"));
    fs.writeFileSync(path.join(seedDir, "plan.md"), "# Plan");

    await expect(runCli([
      "do the thing",
      "--workspace", workspaceName,
      "--seed", `architecture=${path.join(seedDir, "plan.md")}`,
      "--start-from", "implementation",
    ])).rejects.toThrow(/process\.exit/);

    fs.rmSync(seedDir, { recursive: true });
  });
});

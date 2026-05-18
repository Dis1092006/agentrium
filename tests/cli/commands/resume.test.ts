// tests/cli/commands/resume.test.ts
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

describe("resume command", () => {
  it("exports registerResumeCommand", async () => {
    const { registerResumeCommand } = await import("../../../src/cli/commands/resume.js");
    expect(typeof registerResumeCommand).toBe("function");
  });
});

describe("agentrium resume --seed/start-from replay", () => {
  let home: string;
  let oldHome: string | undefined;
  let workspaceName: string;
  let runId: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-resume-seed-"));
    oldHome = process.env.HOME;
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    workspaceName = "ws-resume";
    const wsDir = path.join(home, ".agentrium", "workspaces", workspaceName);
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(
      path.join(wsDir, "AGENTRIUM.md"),
      `# Workspace: ${workspaceName}\n\n## Repositories\n\n## Tech Stack\n\n## Pipeline Settings\n- Checkpoints: none\n- Max review iterations: 3\n- Agent timeout minutes: 30\n- Copilot review: false\n`,
    );

    runId = "run_seedtest";
    const runDir = path.join(wsDir, "runs", runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "meta.json"),
      JSON.stringify({
        runId,
        task: "do the thing",
        status: "failed",
        createdAt: new Date().toISOString(),
        stages: {},
        workspaceName,
        includeOptional: [],
        seededStages: ["analysis", "architecture"],
        startFrom: "implementation",
      }),
    );
    fs.writeFileSync(path.join(runDir, "01-intake.md"), "# Task\n\ndo the thing");
    fs.writeFileSync(path.join(runDir, "02-analysis.md"), "# Design");
    fs.writeFileSync(path.join(runDir, "04-architecture.md"), "# Plan");

    runPipelineMock.mockClear();
  });

  afterEach(() => {
    process.env.HOME = oldHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("forwards meta.startFrom to PipelineRunner.runPipeline", async () => {
    const { registerResumeCommand } = await import("../../../src/cli/commands/resume.js");
    const program = new Command();
    program.exitOverride();
    registerResumeCommand(program);

    await program.parseAsync(["node", "agentrium", "resume", runId, "--workspace", workspaceName]);

    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    const callArgs = runPipelineMock.mock.calls[0];
    expect(callArgs[3]).toBe("implementation");
  });
});

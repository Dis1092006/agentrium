import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { PipelineRunner } from "../../src/pipeline/runner.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { eventsPathFor, controlPathFor, SCHEMA_VERSION } from "@agentrium/contract";
import fs from "fs";
import path from "path";
import os from "os";

const queryImpl = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: unknown) => queryImpl(args),
}));

vi.mock("ora", () => {
  const spinner: Record<string, unknown> = {};
  for (const m of ["start", "stop", "succeed", "fail", "warn", "info"]) {
    spinner[m] = () => spinner;
  }
  spinner.text = "";
  return { default: () => spinner };
});

// Swallow EPIPE errors emitted on stdout/stderr during worker teardown.
// When Vitest closes the IPC pipe while buffered writes are in flight, Node raises
// EPIPE as an uncaught exception — we re-throw anything that isn't EPIPE.
process.stdout.on("error", (err: NodeJS.ErrnoException) => { if (err.code !== "EPIPE") throw err; });
process.stderr.on("error", (err: NodeJS.ErrnoException) => { if (err.code !== "EPIPE") throw err; });
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if ((err as NodeJS.ErrnoException).code !== "EPIPE") throw err;
});

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe("PipelineRunner", () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-runner-"));
    store = new ArtifactStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("assembles context from previous artifacts", () => {
    const runId = store.createRun("test task");
    store.saveArtifact(runId, "intake", "# Task\nDo something");
    store.saveArtifact(runId, "analysis", "# Analysis\nRequirements here");

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
    const ctx = runner.assembleAgentContext("architecture");

    expect(ctx).toContain("workspace context");
    expect(ctx).toContain("# Task");
    expect(ctx).toContain("# Analysis");
  });

  it("assembleAgentContext only includes stages before the current one", () => {
    const runId = store.createRun("test task");
    store.saveArtifact(runId, "intake", "# Task");
    store.saveArtifact(runId, "analysis", "# Analysis");
    store.saveArtifact(runId, "architecture", "# Architecture");

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
    const ctx = runner.assembleAgentContext("architecture");

    expect(ctx).toContain("# Task");
    expect(ctx).toContain("# Analysis");
    expect(ctx).not.toContain("# Architecture");
  });

  it("builds task description with previous artifacts summary", () => {
    const runId = store.createRun("Add user auth");
    store.saveArtifact(runId, "intake", "# Task\nAdd user auth");
    store.saveArtifact(runId, "analysis", "# Analysis\nReq 1: Login page");

    const runner = new PipelineRunner(store, runId, "ctx", 3);
    const taskDesc = runner.buildTaskDescription("architecture", "Add user auth");

    expect(taskDesc).toContain("Add user auth");
    expect(taskDesc).toContain("analysis");
  });

  it("identifies review stage as special", () => {
    const runId = store.createRun("test");
    const runner = new PipelineRunner(store, runId, "ctx", 3);
    expect(runner.isReviewStage("review")).toBe(true);
    expect(runner.isReviewStage("testing")).toBe(false);
  });

  it("readMeta reflects completed stages saved via saveArtifact", () => {
    const runId = store.createRun("test task");
    store.saveArtifact(runId, "analysis", "# Analysis");

    const meta = store.readMeta(runId);
    expect(meta.stages).toHaveProperty("analysis");
    expect(meta.stages).not.toHaveProperty("architecture");
  });
});

describe("PipelineRunner telemetry + control", () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-runner-telemetry-"));
    store = new ArtifactStore(tmpDir);
    queryImpl.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("telemetry events written: run_started, stage_started, stage_completed, run_completed", async () => {
    // Normal generator that completes immediately
    queryImpl.mockImplementation(() =>
      (async function* () {
        yield { type: "assistant", content: "Working..." };
        yield { result: "analysis artifact content" };
      })()
    );

    const runId = store.createRun("test telemetry task");
    const config = {
      checkpoints: "none" as const,
      skipStages: ["architecture", "implementation", "testing", "documentation", "review"] as import("../../src/pipeline/types.js").Stage[],
    };

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
    await runner.runPipeline("test telemetry task", config);

    const eventsPath = eventsPathFor(store.runDir(runId));
    expect(fs.existsSync(eventsPath)).toBe(true);
    const lines = fs.readFileSync(eventsPath, "utf-8")
      .trim().split("\n").map((l) => JSON.parse(l));
    const types = lines.map((l: { type: string }) => l.type);

    expect(types).toContain("run_started");
    expect(types).toContain("stage_started");
    expect(types).toContain("stage_completed");
    expect(types).toContain("run_completed");
  });

  it("cancel marks the run aborted", async () => {
    // Mock that hangs until the abort signal fires — mirrors base.test.ts cooperative-abort style
    queryImpl.mockImplementation((args: { options: { abortController: AbortController } }) => {
      const signal = args.options.abortController.signal;
      return (async function* () {
        yield { type: "assistant", content: "Working..." };
        await new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        yield { result: "never reached" };
      })();
    });

    const runId = store.createRun("test cancel task");
    const runDir = store.runDir(runId);

    // Write the cancel command BEFORE starting the pipeline so the channel
    // picks it up at start()/first gate — deterministic on Windows.
    const cancelCmd = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      seq: 0,
      ts: new Date().toISOString(),
      command: "cancel",
    });
    fs.writeFileSync(controlPathFor(runDir), cancelCmd + "\n");

    const config = {
      checkpoints: "none" as const,
      skipStages: ["architecture", "implementation", "testing", "documentation", "review"] as import("../../src/pipeline/types.js").Stage[],
    };

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
    await runner.runPipeline("test cancel task", config);

    expect(store.readMeta(runId).status).toBe("aborted");
  });

  it("cancel arriving in-flight aborts the run without marking it failed", async () => {
    const runId = store.createRun("test in-flight cancel task");
    const runDir = store.runDir(runId);
    const controlFile = controlPathFor(runDir);

    queryImpl.mockImplementation((args: { options: { abortController: AbortController } }) => {
      const signal = args.options.abortController.signal;
      return (async function* () {
        yield { type: "assistant", message: { content: [{ type: "text", text: "working" }] } };
        // Cancel now that the stage is in flight; ControlChannel polling picks it up.
        fs.appendFileSync(controlFile, JSON.stringify({ schemaVersion: SCHEMA_VERSION, seq: 1, ts: new Date().toISOString(), command: "cancel" }) + "\n");
        await new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        yield { result: "never reached" };
      })();
    });

    const config = {
      checkpoints: "none" as const,
      skipStages: ["architecture", "implementation", "testing", "documentation", "review"] as import("../../src/pipeline/types.js").Stage[],
    };

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
    await runner.runPipeline("test in-flight cancel task", config);

    expect(store.readMeta(runId).status).toBe("aborted");
    const types = fs.readFileSync(eventsPathFor(store.runDir(runId)), "utf-8")
      .trim().split("\n").map((l) => JSON.parse(l).type);
    expect(types).toContain("run_aborted");
    expect(types).not.toContain("run_failed");
  });

  it("cancel during the review stage ends the run aborted, not failed or completed", async () => {
    const runId = store.createRun("test review cancel task");
    const runDir = store.runDir(runId);
    const controlFile = controlPathFor(runDir);

    // The review stage runs logic + security reviewers in parallel via queryImpl.
    // When invoked, each reviewer appends cancel (idempotent) then waits for abort.
    queryImpl.mockImplementation((args: { options: { abortController: AbortController } }) => {
      const signal = args.options.abortController.signal;
      return (async function* () {
        yield { type: "assistant", message: { content: [{ type: "text", text: "reviewing" }] } };
        // Append cancel; multiple appends from parallel reviewers are harmless.
        fs.appendFileSync(
          controlFile,
          JSON.stringify({ schemaVersion: SCHEMA_VERSION, seq: 1, ts: new Date().toISOString(), command: "cancel" }) + "\n",
        );
        await new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        yield { result: "never reached" };
      })();
    });

    // Skip all non-review, non-optional stages so the pipeline goes straight to review.
    // design and documentation are optional and excluded automatically (not in includeOptional).
    const config = {
      checkpoints: "none" as const,
      skipStages: ["analysis", "architecture", "implementation", "testing"] as import("../../src/pipeline/types.js").Stage[],
    };

    const runner = new PipelineRunner(store, runId, "workspace context", 3, [], null, false, 5);
    await runner.runPipeline("test review cancel task", config);

    expect(store.readMeta(runId).status).toBe("aborted");
    const types = fs.readFileSync(eventsPathFor(store.runDir(runId)), "utf-8")
      .trim().split("\n").map((l) => JSON.parse(l).type);
    expect(types).toContain("run_aborted");
    expect(types).not.toContain("run_failed");
    expect(types).not.toContain("run_completed");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PipelineRunner } from "../../src/pipeline/runner.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { ControlChannel } from "../../src/observability/controlChannel.js";
import { eventsPathFor, controlPathFor, SCHEMA_VERSION } from "@agentrium/contract";
import fs from "fs";
import path from "path";
import os from "os";

const queryImpl = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: unknown) => queryImpl(args),
}));

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

    // Capture the ControlChannel instance created by PipelineRunner so we can
    // drive processPending() directly — avoiding reliance on fs.watch, which is
    // unreliable on Windows for in-process file appends.
    let capturedChannel: ControlChannel | null = null;
    const realStart = ControlChannel.prototype.start;
    vi.spyOn(ControlChannel.prototype, "start").mockImplementation(function (this: ControlChannel) {
      capturedChannel = this;
      return realStart.call(this);
    });

    queryImpl.mockImplementation((args: { options: { abortController: AbortController } }) => {
      const signal = args.options.abortController.signal;
      return (async function* () {
        yield { type: "assistant", message: { content: [{ type: "text", text: "working" }] } };
        // Cancel now that the stage is in flight.
        fs.appendFileSync(
          controlFile,
          JSON.stringify({ schemaVersion: SCHEMA_VERSION, seq: 1, ts: new Date().toISOString(), command: "cancel" }) + "\n",
        );
        // Drive processPending() directly (test seam) so the cancel is applied
        // without depending on fs.watch firing — fs.watch is unreliable on Windows
        // for in-process appends within the same event loop tick.
        if (capturedChannel) {
          await capturedChannel.processPending();
        }
        // If the abort fired synchronously, the signal is already aborted here.
        // If not (shouldn't happen after processPending), wait briefly.
        if (!signal.aborted) {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
            setTimeout(resolve, 2000);
          });
        }
        // End the generator — BaseAgent sees ac.signal.aborted and throws abortError().
      })();
    });

    const config = {
      checkpoints: "none" as const,
      skipStages: ["architecture", "implementation", "testing", "documentation", "review"] as import("../../src/pipeline/types.js").Stage[],
    };

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
    await runner.runPipeline("test in-flight cancel task", config);

    vi.restoreAllMocks();

    expect(store.readMeta(runId).status).toBe("aborted");
    const types = fs
      .readFileSync(eventsPathFor(runDir), "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).type);
    expect(types).toContain("run_aborted");
    expect(types).not.toContain("run_failed");
  });
});

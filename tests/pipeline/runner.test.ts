import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PipelineRunner } from "../../src/pipeline/runner.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import fs from "fs";
import path from "path";
import os from "os";

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

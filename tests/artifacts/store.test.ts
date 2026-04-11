import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArtifactStore } from "../../src/artifacts/store.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("ArtifactStore", () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-artifacts-"));
    store = new ArtifactStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("creates a new run with unique id", () => {
    const runId = store.createRun("Test task");
    expect(runId).toMatch(/^run_/);
    expect(fs.existsSync(path.join(tmpDir, runId))).toBe(true);
  });

  it("saves and reads an artifact", () => {
    const runId = store.createRun("Test task");
    store.saveArtifact(runId, "analysis", "# Analysis\nThis is the analysis.");

    const content = store.readArtifact(runId, "analysis");
    expect(content).toBe("# Analysis\nThis is the analysis.");
  });

  it("saves and reads run metadata", () => {
    const runId = store.createRun("Test task");
    const meta = store.readMeta(runId);
    expect(meta.task).toBe("Test task");
    expect(meta.status).toBe("running");
  });

  it("updates run status", () => {
    const runId = store.createRun("Test task");
    store.updateStatus(runId, "completed");
    const meta = store.readMeta(runId);
    expect(meta.status).toBe("completed");
  });

  it("listRuns returns empty array when no runs exist", () => {
    const emptyDir = path.join(tmpDir, "empty-runs");
    fs.mkdirSync(emptyDir, { recursive: true });
    const emptyStore = new ArtifactStore(emptyDir);
    expect(emptyStore.listRuns()).toEqual([]);
  });

  it("listRuns returns all runs sorted by createdAt descending", () => {
    store.createRun("first task");
    store.createRun("second task");

    const runs = store.listRuns();
    expect(runs).toHaveLength(2);
    // verify sorted: first element's createdAt >= second element's createdAt
    expect(new Date(runs[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(runs[1].createdAt).getTime(),
    );
  });

  it("createRun stores workspaceName and includeOptional", () => {
    const runId = store.createRun("task", "my-workspace", ["design"]);
    const meta = store.readMeta(runId);
    expect(meta.workspaceName).toBe("my-workspace");
    expect(meta.includeOptional).toEqual(["design"]);
  });

  it("createRun defaults workspaceName and includeOptional when not provided", () => {
    const runId = store.createRun("task");
    const meta = store.readMeta(runId);
    expect(meta.workspaceName).toBe("");
    expect(meta.includeOptional).toEqual([]);
  });

  it("updatePrUrl persists prUrl in meta", () => {
    const runId = store.createRun("task");
    store.updatePrUrl(runId, "https://github.com/org/repo/pull/42");
    const meta = store.readMeta(runId);
    expect(meta.prUrl).toBe("https://github.com/org/repo/pull/42");
  });

  it("readMeta handles old meta.json without new fields gracefully", () => {
    const runId = `run_oldformat`;
    const runDir = path.join(tmpDir, runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "meta.json"),
      JSON.stringify({ runId, task: "old task", status: "completed", createdAt: new Date().toISOString(), stages: {} }),
    );
    const meta = store.readMeta(runId);
    expect(meta.task).toBe("old task");
    expect(meta.workspaceName).toBe("");
    expect(meta.includeOptional).toEqual([]);
  });

  it("listRuns includes task, status, and stage data", () => {
    const runId = store.createRun("my task");
    store.saveArtifact(runId, "analysis", "# Analysis");
    store.updateStatus(runId, "completed");

    const runs = store.listRuns();
    expect(runs[0].task).toBe("my task");
    expect(runs[0].status).toBe("completed");
    expect(runs[0].stages).toHaveProperty("analysis");
  });
});

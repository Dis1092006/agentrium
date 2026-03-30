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
});

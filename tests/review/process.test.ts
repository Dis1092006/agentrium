// tests/review/process.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReviewProcess } from "../../src/review/process.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("ReviewProcess", () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-review-"));
    store = new ArtifactStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("builds review context from previous artifacts", () => {
    const runId = store.createRun("test task");
    store.saveArtifact(runId, "intake", "# Task");
    store.saveArtifact(runId, "analysis", "# Analysis");
    store.saveArtifact(runId, "architecture", "# Architecture");
    store.saveArtifact(runId, "implementation", "# Implementation");
    store.saveArtifact(runId, "testing", "# Testing");

    const process = new ReviewProcess(store, runId, "workspace ctx", 3);
    const ctx = process.buildReviewContext();

    expect(ctx).toContain("workspace ctx");
    expect(ctx).toContain("# Implementation");
    expect(ctx).toContain("# Testing");
  });

  it("builds review task description", () => {
    const runId = store.createRun("Add auth");
    const process = new ReviewProcess(store, runId, "ctx", 3);
    const desc = process.buildReviewTaskDescription("Add auth");

    expect(desc).toContain("Add auth");
    expect(desc).toContain("review");
  });

  it("builds arbiter task with both review outputs", () => {
    const runId = store.createRun("test");
    const process = new ReviewProcess(store, runId, "ctx", 3);
    const desc = process.buildArbiterTaskDescription(
      "Logic findings here",
      "Security findings here",
      "Add auth",
    );

    expect(desc).toContain("Logic findings here");
    expect(desc).toContain("Security findings here");
    expect(desc).toContain("Add auth");
  });

  it("builds rework task from arbiter mandatory fixes", () => {
    const runId = store.createRun("test");
    const process = new ReviewProcess(store, runId, "ctx", 3);
    const desc = process.buildReworkTaskDescription(
      "## Mandatory Fixes\n1. Fix null check\n2. Add validation",
      "Add auth",
      1,
    );

    expect(desc).toContain("Fix null check");
    expect(desc).toContain("iteration 1");
  });
});

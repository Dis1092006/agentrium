// tests/cli/commands/runs.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ArtifactStore } from "../../../src/artifacts/store.js";

describe("runs command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-runs-cmd-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("runs.ts module exports registerRunsCommand", async () => {
    const { registerRunsCommand } = await import("../../../src/cli/commands/runs.js");
    expect(typeof registerRunsCommand).toBe("function");
  });

  it("ArtifactStore lists runs correctly", () => {
    const store = new ArtifactStore(tmpDir);
    store.createRun("task one");
    store.createRun("task two");
    expect(store.listRuns()).toHaveLength(2);
  });
});

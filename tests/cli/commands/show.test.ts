// tests/cli/commands/show.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ArtifactStore } from "../../../src/artifacts/store.js";

describe("show command", () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-show-cmd-"));
    store = new ArtifactStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("show.ts module exports registerShowCommand and printRunDetails", async () => {
    const mod = await import("../../../src/cli/commands/show.js");
    expect(typeof mod.registerShowCommand).toBe("function");
    expect(typeof mod.printRunDetails).toBe("function");
  });

  it("printRunDetails does not throw for a valid run", async () => {
    const { printRunDetails } = await import("../../../src/cli/commands/show.js");
    const runId = store.createRun("test task");
    store.saveArtifact(runId, "analysis", "# Analysis content");
    store.updateStatus(runId, "completed");
    const meta = store.readMeta(runId);
    expect(() => printRunDetails(meta)).not.toThrow();
  });
});

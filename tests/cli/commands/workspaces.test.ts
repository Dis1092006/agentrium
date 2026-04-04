// tests/cli/commands/workspaces.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

describe("workspaces command helpers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-ws-cmd-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("workspaces.ts module exports registerWorkspacesCommand", async () => {
    const { registerWorkspacesCommand } = await import("../../../src/cli/commands/workspaces.js");
    expect(typeof registerWorkspacesCommand).toBe("function");
  });
});

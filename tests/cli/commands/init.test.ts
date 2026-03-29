import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createProgram } from "../../../src/cli/index.js";
import { findGitRepos, generateAgentforgeMd } from "../../../src/workspace/manager.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("CLI", () => {
  it("registers init command", () => {
    const program = createProgram();
    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd).toBeDefined();
  });

  it("registers run command", () => {
    const program = createProgram();
    const runCmd = program.commands.find((c) => c.name() === "run");
    expect(runCmd).toBeDefined();
  });
});

describe("init command logic", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentforge-init-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("detects repos and generates config for single repo", () => {
    const repoDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "package.json"), "{}");

    const repos = findGitRepos(tmpDir);
    expect(repos).toHaveLength(1);

    const config = generateAgentforgeMd("my-project", [
      { name: "my-project", path: repoDir, description: "" },
    ]);
    expect(config).toContain("# Workspace: my-project");
    expect(config).toContain("my-project");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findGitRepos,
  generateAgentriumMd,
  getWorkspacesDir,
} from "../../src/workspace/manager.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("workspace manager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-ws-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("finds git repos in a directory", () => {
    const repo1 = path.join(tmpDir, "repo1");
    const repo2 = path.join(tmpDir, "repo2");
    const notRepo = path.join(tmpDir, "just-a-folder");
    fs.mkdirSync(path.join(repo1, ".git"), { recursive: true });
    fs.mkdirSync(path.join(repo2, ".git"), { recursive: true });
    fs.mkdirSync(notRepo, { recursive: true });

    const repos = findGitRepos(tmpDir);
    expect(repos).toHaveLength(2);
    expect(repos.map((r) => path.basename(r)).sort()).toEqual(["repo1", "repo2"]);
  });

  it("generates AGENTRIUM.md content", () => {
    const content = generateAgentriumMd("my-workspace", [
      { name: "api", path: "/workspace/api", description: "" },
      { name: "web", path: "/workspace/web", description: "" },
    ]);

    expect(content).toContain("# Workspace: my-workspace");
    expect(content).toContain("[api](/workspace/api)");
    expect(content).toContain("[web](/workspace/web)");
    expect(content).toContain("## Pipeline Settings");
  });

  it("returns correct workspaces directory", () => {
    const dir = getWorkspacesDir();
    expect(dir).toContain(".agentrium");
    expect(dir).toContain("workspaces");
  });
});

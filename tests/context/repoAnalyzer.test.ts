import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectStack } from "../../src/context/repoAnalyzer.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("detectStack", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("detects Node.js project from package.json", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    const stack = detectStack(tmpDir);
    expect(stack).toContain("node");
  });

  it("detects TypeScript from tsconfig.json", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    const stack = detectStack(tmpDir);
    expect(stack).toContain("typescript");
  });

  it("detects Python (uv) from pyproject.toml + uv.lock", () => {
    fs.writeFileSync(path.join(tmpDir, "pyproject.toml"), "");
    fs.writeFileSync(path.join(tmpDir, "uv.lock"), "");
    const stack = detectStack(tmpDir);
    expect(stack).toContain("python");
    expect(stack).toContain("uv");
  });

  it("detects .NET from .csproj", () => {
    fs.writeFileSync(path.join(tmpDir, "App.csproj"), "");
    const stack = detectStack(tmpDir);
    expect(stack).toContain("dotnet");
  });

  it("detects Go from go.mod", () => {
    fs.writeFileSync(path.join(tmpDir, "go.mod"), "");
    const stack = detectStack(tmpDir);
    expect(stack).toContain("go");
  });

  it("detects Rust from Cargo.toml", () => {
    fs.writeFileSync(path.join(tmpDir, "Cargo.toml"), "");
    const stack = detectStack(tmpDir);
    expect(stack).toContain("rust");
  });

  it("detects Java from pom.xml", () => {
    fs.writeFileSync(path.join(tmpDir, "pom.xml"), "");
    const stack = detectStack(tmpDir);
    expect(stack).toContain("java");
  });
});

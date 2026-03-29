# AgentForge Foundation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational layer — project scaffold, CLI skeleton, LLM provider, base agent, context system — so that `agentforge init` works and a test agent can respond with repo context.

**Architecture:** TypeScript ESM project with commander for CLI. Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) powers agent execution. Context is assembled from AGENTFORGE.md config + auto-analysis of repos. Each agent is a class extending BaseAgent with a system prompt, allowed tools, and output schema.

**Tech Stack:** Node.js 22, TypeScript, ESM, commander, @anthropic-ai/claude-agent-sdk, simple-git, chalk, ora, vitest

---

## Chunk 1: Project Scaffold and CLI Skeleton

### Task 1: Project initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize the project**

```bash
cd ~/workspace/projects/ai/agentforge
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install commander chalk ora simple-git @anthropic-ai/claude-agent-sdk
npm install -D typescript vitest @types/node tsx
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Update package.json**

Add to package.json:
```json
{
  "type": "module",
  "bin": {
    "agentforge": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
*.tgz
.env
```

- [ ] **Step 7: Verify setup compiles**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, clean exit)

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "chore: initialize TypeScript project with dependencies"
```

---

### Task 2: CLI entrypoint with `init` and `run` commands (stubs)

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/commands/init.ts`
- Create: `src/cli/commands/run.ts`
- Test: `tests/cli/commands/init.test.ts`

- [ ] **Step 1: Write the test for CLI command registration**

```typescript
// tests/cli/commands/init.test.ts
import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/commands/init.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Create CLI entrypoint**

```typescript
// src/cli/index.ts
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerRunCommand } from "./commands/run.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("agentforge")
    .description("Multi-agent orchestrator for software development")
    .version("0.1.0");

  registerInitCommand(program);
  registerRunCommand(program);

  return program;
}

const program = createProgram();
program.parse();
```

- [ ] **Step 4: Create init command stub**

```typescript
// src/cli/commands/init.ts
import { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize AgentForge workspace")
    .action(async () => {
      console.log("agentforge init — not yet implemented");
    });
}
```

- [ ] **Step 5: Create run command stub**

```typescript
// src/cli/commands/run.ts
import { Command } from "commander";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a task through the agent pipeline")
    .argument("<task>", "Task description")
    .action(async (task: string) => {
      console.log(`agentforge run "${task}" — not yet implemented`);
    });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/cli/commands/init.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Verify CLI runs**

Run: `npx tsx src/cli/index.ts --help`
Expected: Shows help with `init` and `run` commands listed

- [ ] **Step 8: Commit**

```bash
git add src/cli/ tests/cli/
git commit -m "feat: add CLI skeleton with init and run command stubs"
```

---

## Chunk 2: Context System

### Task 3: AGENTFORGE.md config parser

**Files:**
- Create: `src/context/configParser.ts`
- Create: `src/context/types.ts`
- Test: `tests/context/configParser.test.ts`

- [ ] **Step 1: Define context types**

```typescript
// src/context/types.ts
export interface WorkspaceConfig {
  name: string;
  repositories: RepositoryRef[];
  techStack: string[];
  conventions: string | null;
  pipelineSettings: PipelineSettings;
  knowledgeSources: KnowledgeSource[];
}

export interface RepositoryRef {
  name: string;
  path: string;
  description: string;
}

export interface PipelineSettings {
  checkpoints: "all" | "none" | string[];
  maxReviewIterations: number;
  skipStages: string[];
}

export interface KnowledgeSource {
  type: "file" | "mcp";
  path?: string;
  description?: string;
}

export interface RepoContext {
  name: string;
  path: string;
  stack: string[];
  structure: string;
  conventions: string | null;
  recentCommits: string[];
}

export interface FullContext {
  workspace: WorkspaceConfig;
  repos: RepoContext[];
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/context/configParser.test.ts
import { describe, it, expect } from "vitest";
import { parseAgentforgeMd } from "../../src/context/configParser.js";

const SAMPLE_MD = `# Workspace: test-project

## Repositories
- [my-api](~/workspace/my-api) — REST API service
- [my-frontend](~/workspace/my-frontend) — React SPA

## Tech Stack
- TypeScript, Node.js 22
- React, Vite

## Conventions
See [CLAUDE.md](~/workspace/my-api/CLAUDE.md)

## Pipeline Settings
- Checkpoints: analysis, architecture, review
- Max review iterations: 3
- Skip stages: ux_design

## Knowledge Sources
- [Business context](docs/business-context.md)
- MCP: Notion workspace https://notion.so/team
`;

describe("parseAgentforgeMd", () => {
  it("parses workspace name", () => {
    const config = parseAgentforgeMd(SAMPLE_MD);
    expect(config.name).toBe("test-project");
  });

  it("parses repositories", () => {
    const config = parseAgentforgeMd(SAMPLE_MD);
    expect(config.repositories).toHaveLength(2);
    expect(config.repositories[0]).toEqual({
      name: "my-api",
      path: "~/workspace/my-api",
      description: "REST API service",
    });
  });

  it("parses tech stack", () => {
    const config = parseAgentforgeMd(SAMPLE_MD);
    expect(config.techStack).toEqual([
      "TypeScript, Node.js 22",
      "React, Vite",
    ]);
  });

  it("parses pipeline settings", () => {
    const config = parseAgentforgeMd(SAMPLE_MD);
    expect(config.pipelineSettings.checkpoints).toEqual([
      "analysis",
      "architecture",
      "review",
    ]);
    expect(config.pipelineSettings.maxReviewIterations).toBe(3);
    expect(config.pipelineSettings.skipStages).toEqual(["ux_design"]);
  });

  it("parses knowledge sources", () => {
    const config = parseAgentforgeMd(SAMPLE_MD);
    expect(config.knowledgeSources).toHaveLength(2);
    expect(config.knowledgeSources[0]).toEqual({
      type: "file",
      path: "docs/business-context.md",
      description: "Business context",
    });
    expect(config.knowledgeSources[1]).toEqual({
      type: "mcp",
      description: "Notion workspace https://notion.so/team",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/context/configParser.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement configParser**

```typescript
// src/context/configParser.ts
import type { WorkspaceConfig, RepositoryRef, PipelineSettings, KnowledgeSource } from "./types.js";

export function parseAgentforgeMd(content: string): WorkspaceConfig {
  const name = parseWorkspaceName(content);
  const repositories = parseRepositories(content);
  const techStack = parseBulletList(content, "Tech Stack");
  const conventions = parseConventions(content);
  const pipelineSettings = parsePipelineSettings(content);
  const knowledgeSources = parseKnowledgeSources(content);

  return { name, repositories, techStack, conventions, pipelineSettings, knowledgeSources };
}

function parseWorkspaceName(content: string): string {
  const match = content.match(/^#\s+Workspace:\s+(.+)$/m);
  return match ? match[1].trim() : "unnamed";
}

function parseRepositories(content: string): RepositoryRef[] {
  const section = extractSection(content, "Repositories");
  if (!section) return [];

  const repoPattern = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*—\s*(.+)$/gm;
  const repos: RepositoryRef[] = [];
  let match;
  while ((match = repoPattern.exec(section)) !== null) {
    repos.push({ name: match[1], path: match[2], description: match[3].trim() });
  }
  return repos;
}

function parseBulletList(content: string, heading: string): string[] {
  const section = extractSection(content, heading);
  if (!section) return [];

  return section
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function parseConventions(content: string): string | null {
  const section = extractSection(content, "Conventions");
  return section?.trim() || null;
}

function parsePipelineSettings(content: string): PipelineSettings {
  const section = extractSection(content, "Pipeline Settings");
  const defaults: PipelineSettings = {
    checkpoints: "all",
    maxReviewIterations: 3,
    skipStages: [],
  };
  if (!section) return defaults;

  const lines = section.split("\n").filter((l) => l.startsWith("- "));
  for (const line of lines) {
    const text = line.slice(2).trim();
    if (text.toLowerCase().startsWith("checkpoints:")) {
      const value = text.split(":")[1].trim();
      if (value === "all" || value === "none") {
        defaults.checkpoints = value;
      } else {
        defaults.checkpoints = value.split(",").map((s) => s.trim());
      }
    } else if (text.toLowerCase().startsWith("max review iterations:")) {
      defaults.maxReviewIterations = parseInt(text.split(":")[1].trim(), 10);
    } else if (text.toLowerCase().startsWith("skip stages:")) {
      defaults.skipStages = text
        .split(":")[1]
        .trim()
        .split(",")
        .map((s) => s.trim());
    }
  }
  return defaults;
}

function parseKnowledgeSources(content: string): KnowledgeSource[] {
  const section = extractSection(content, "Knowledge Sources");
  if (!section) return [];

  const sources: KnowledgeSource[] = [];
  const lines = section.split("\n").filter((l) => l.startsWith("- "));
  for (const line of lines) {
    const text = line.slice(2).trim();
    if (text.toLowerCase().startsWith("mcp:")) {
      sources.push({ type: "mcp", description: text.slice(4).trim() });
    } else {
      const linkMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        sources.push({ type: "file", path: linkMatch[2], description: linkMatch[1] });
      } else {
        sources.push({ type: "file", path: text, description: text });
      }
    }
  }
  return sources;
}

function extractSection(content: string, heading: string): string | null {
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m");
  const match = pattern.exec(content);
  if (!match) return null;

  const start = match.index + match[0].length;
  const nextHeading = content.indexOf("\n## ", start);
  const end = nextHeading === -1 ? content.length : nextHeading;
  return content.slice(start, end).trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/context/configParser.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/context/ tests/context/
git commit -m "feat: add AGENTFORGE.md config parser"
```

---

### Task 4: Repository auto-analyzer

**Files:**
- Create: `src/context/repoAnalyzer.ts`
- Test: `tests/context/repoAnalyzer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/context/repoAnalyzer.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectStack, analyzeRepo } from "../../src/context/repoAnalyzer.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("detectStack", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentforge-test-"));
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/context/repoAnalyzer.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement repoAnalyzer**

```typescript
// src/context/repoAnalyzer.ts
import fs from "fs";
import path from "path";
import type { RepoContext } from "./types.js";

interface StackMarker {
  file: string;
  stack: string[];
}

const STACK_MARKERS: StackMarker[] = [
  { file: "tsconfig.json", stack: ["typescript"] },
  { file: "package.json", stack: ["node"] },
  { file: "uv.lock", stack: ["python", "uv"] },
  { file: "pyproject.toml", stack: ["python"] },
  { file: "requirements.txt", stack: ["python"] },
  { file: "Pipfile", stack: ["python"] },
  { file: "go.mod", stack: ["go"] },
  { file: "Cargo.toml", stack: ["rust"] },
  { file: "pom.xml", stack: ["java"] },
  { file: "build.gradle", stack: ["java"] },
  { file: "build.gradle.kts", stack: ["kotlin"] },
];

export function detectStack(repoPath: string): string[] {
  const detected = new Set<string>();
  const entries = fs.readdirSync(repoPath);

  for (const marker of STACK_MARKERS) {
    if (entries.includes(marker.file)) {
      for (const s of marker.stack) detected.add(s);
    }
  }

  // Check for .csproj / .sln files
  if (entries.some((e) => e.endsWith(".csproj") || e.endsWith(".sln"))) {
    detected.add("dotnet");
  }

  return [...detected];
}

export function getDirectoryTree(repoPath: string, maxDepth: number = 3): string {
  const lines: string[] = [];
  buildTree(repoPath, "", 0, maxDepth, lines);
  return lines.join("\n");
}

function buildTree(dir: string, prefix: string, depth: number, maxDepth: number, lines: string[]): void {
  if (depth >= maxDepth) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`);

    if (entry.isDirectory()) {
      buildTree(path.join(dir, entry.name), prefix + childPrefix, depth + 1, maxDepth, lines);
    }
  }
}

export function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function analyzeRepo(repoPath: string): Promise<RepoContext> {
  const name = path.basename(repoPath);
  const stack = detectStack(repoPath);
  const structure = getDirectoryTree(repoPath);
  const conventions = readFileIfExists(path.join(repoPath, "CLAUDE.md"))
    ?? readFileIfExists(path.join(repoPath, "CONVENTIONS.md"));

  let recentCommits: string[] = [];
  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(repoPath);
    const log = await git.log({ maxCount: 10 });
    recentCommits = log.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`);
  } catch {
    // Not a git repo or git not available
  }

  return { name, path: repoPath, stack, structure, conventions, recentCommits };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/context/repoAnalyzer.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/context/repoAnalyzer.ts tests/context/repoAnalyzer.test.ts
git commit -m "feat: add repository auto-analyzer with stack detection"
```

---

### Task 5: Context builder — assembles full context from config + repo analysis

**Files:**
- Create: `src/context/contextBuilder.ts`
- Test: `tests/context/contextBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/context/contextBuilder.test.ts
import { describe, it, expect } from "vitest";
import { buildContextPrompt } from "../../src/context/contextBuilder.js";
import type { FullContext } from "../../src/context/types.js";

describe("buildContextPrompt", () => {
  const context: FullContext = {
    workspace: {
      name: "test-project",
      repositories: [
        { name: "api", path: "/tmp/api", description: "REST API" },
      ],
      techStack: ["TypeScript", "Node.js"],
      conventions: "See CLAUDE.md",
      pipelineSettings: {
        checkpoints: "all",
        maxReviewIterations: 3,
        skipStages: [],
      },
      knowledgeSources: [],
    },
    repos: [
      {
        name: "api",
        path: "/tmp/api",
        stack: ["typescript", "node"],
        structure: "├── src/\n└── package.json",
        conventions: "Use ESM. No default exports.",
        recentCommits: ["abc1234 feat: add auth"],
      },
    ],
  };

  it("includes workspace name", () => {
    const prompt = buildContextPrompt(context);
    expect(prompt).toContain("test-project");
  });

  it("includes repo structure", () => {
    const prompt = buildContextPrompt(context);
    expect(prompt).toContain("├── src/");
  });

  it("includes conventions", () => {
    const prompt = buildContextPrompt(context);
    expect(prompt).toContain("Use ESM. No default exports.");
  });

  it("includes recent commits", () => {
    const prompt = buildContextPrompt(context);
    expect(prompt).toContain("abc1234 feat: add auth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/context/contextBuilder.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement contextBuilder**

```typescript
// src/context/contextBuilder.ts
import type { FullContext } from "./types.js";

export function buildContextPrompt(context: FullContext): string {
  const sections: string[] = [];

  sections.push(`# Workspace: ${context.workspace.name}`);
  sections.push("");

  // Tech stack
  if (context.workspace.techStack.length > 0) {
    sections.push("## Tech Stack");
    for (const tech of context.workspace.techStack) {
      sections.push(`- ${tech}`);
    }
    sections.push("");
  }

  // Repositories
  for (const repo of context.repos) {
    sections.push(`## Repository: ${repo.name}`);
    sections.push(`Path: ${repo.path}`);

    if (repo.stack.length > 0) {
      sections.push(`Detected stack: ${repo.stack.join(", ")}`);
    }

    sections.push("");
    sections.push("### Directory Structure");
    sections.push("```");
    sections.push(repo.structure);
    sections.push("```");
    sections.push("");

    if (repo.conventions) {
      sections.push("### Conventions");
      sections.push(repo.conventions);
      sections.push("");
    }

    if (repo.recentCommits.length > 0) {
      sections.push("### Recent Commits");
      for (const commit of repo.recentCommits) {
        sections.push(`- ${commit}`);
      }
      sections.push("");
    }
  }

  return sections.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/context/contextBuilder.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/context/contextBuilder.ts tests/context/contextBuilder.test.ts
git commit -m "feat: add context builder for assembling agent prompts"
```

---

## Chunk 3: Agent Framework

### Task 6: Base agent class

**Files:**
- Create: `src/agents/base.ts`
- Create: `src/agents/types.ts`
- Test: `tests/agents/base.test.ts`

- [ ] **Step 1: Define agent types**

```typescript
// src/agents/types.ts
export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
}

export interface AgentResult {
  artifact: string;
  metadata: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/agents/base.test.ts
import { describe, it, expect } from "vitest";
import { BaseAgent } from "../../src/agents/base.js";

describe("BaseAgent", () => {
  it("stores config properties", () => {
    const agent = new BaseAgent({
      name: "test-agent",
      description: "A test agent",
      systemPrompt: "You are a test agent.",
      tools: ["Read", "Glob"],
    });

    expect(agent.name).toBe("test-agent");
    expect(agent.description).toBe("A test agent");
    expect(agent.tools).toEqual(["Read", "Glob"]);
  });

  it("builds full system prompt with context", () => {
    const agent = new BaseAgent({
      name: "test-agent",
      description: "A test agent",
      systemPrompt: "You are a test agent.",
      tools: ["Read"],
    });

    const fullPrompt = agent.buildSystemPrompt("## Repo context here");
    expect(fullPrompt).toContain("You are a test agent.");
    expect(fullPrompt).toContain("## Repo context here");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/agents/base.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement BaseAgent**

```typescript
// src/agents/base.ts
import type { AgentConfig, AgentResult } from "./types.js";

export class BaseAgent {
  readonly name: string;
  readonly description: string;
  readonly tools: string[];
  private readonly systemPrompt: string;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools;
  }

  buildSystemPrompt(contextPrompt: string): string {
    return `${this.systemPrompt}\n\n---\n\n# Project Context\n\n${contextPrompt}`;
  }

  async run(contextPrompt: string, taskDescription: string): Promise<AgentResult> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const fullPrompt = this.buildSystemPrompt(contextPrompt);
    let result = "";

    for await (const message of query({
      prompt: taskDescription,
      options: {
        systemPrompt: fullPrompt,
        allowedTools: this.tools,
        permissionMode: "default",
      },
    })) {
      if ("result" in message) {
        result = message.result;
      }
    }

    return { artifact: result, metadata: { agent: this.name } };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/agents/base.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/agents/ tests/agents/
git commit -m "feat: add BaseAgent class with Claude Agent SDK integration"
```

---

### Task 7: Product Manager agent (first concrete agent)

**Files:**
- Create: `src/agents/productManager.ts`
- Create: `prompts/productManager.md`
- Test: `tests/agents/productManager.test.ts`

- [ ] **Step 1: Create system prompt**

```markdown
<!-- prompts/productManager.md -->
# Role: Product Manager

You are a Product Manager agent. Your job is to analyze a task and produce clear, actionable requirements.

## Your Responsibilities

1. Understand the task in the context of the project
2. Break down ambiguous requests into specific requirements
3. Define acceptance criteria for each requirement
4. Identify risks and dependencies

## Output Format

Produce a markdown document with the following structure:

## Task Summary
One paragraph describing what needs to be done and why.

## Requirements
Numbered list of specific, testable requirements.

## Acceptance Criteria
For each requirement, define how to verify it is complete.

## Risks and Dependencies
List any risks, assumptions, or dependencies on other systems.

## Out of Scope
Explicitly list what this task does NOT include.
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/agents/productManager.test.ts
import { describe, it, expect } from "vitest";
import { createProductManager } from "../../src/agents/productManager.js";

describe("ProductManager agent", () => {
  it("has correct name and tools", () => {
    const pm = createProductManager();
    expect(pm.name).toBe("product-manager");
    expect(pm.tools).toEqual(["Read", "Glob", "Grep", "WebSearch"]);
  });

  it("system prompt includes role description", () => {
    const pm = createProductManager();
    const prompt = pm.buildSystemPrompt("test context");
    expect(prompt).toContain("Product Manager");
    expect(prompt).toContain("test context");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/agents/productManager.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement Product Manager agent**

```typescript
// src/agents/productManager.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/productManager.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a Product Manager agent. Analyze the task and produce requirements.";
  }
}

export function createProductManager(): BaseAgent {
  return new BaseAgent({
    name: "product-manager",
    description: "Analyzes tasks and produces requirements with acceptance criteria",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Glob", "Grep", "WebSearch"],
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/agents/productManager.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/agents/productManager.ts prompts/productManager.md tests/agents/productManager.test.ts
git commit -m "feat: add Product Manager agent with system prompt"
```

---

## Chunk 4: Init Command and Workspace Management

### Task 8: Workspace manager

**Files:**
- Create: `src/workspace/manager.ts`
- Test: `tests/workspace/manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/workspace/manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findGitRepos,
  generateAgentforgeMd,
  getWorkspacesDir,
} from "../../src/workspace/manager.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("workspace manager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentforge-ws-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("finds git repos in a directory", () => {
    // Create two fake repos with .git dirs
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

  it("generates AGENTFORGE.md content", () => {
    const content = generateAgentforgeMd("my-workspace", [
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
    expect(dir).toContain(".agentforge");
    expect(dir).toContain("workspaces");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workspace/manager.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement workspace manager**

```typescript
// src/workspace/manager.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { RepositoryRef } from "../context/types.js";

export function getWorkspacesDir(): string {
  return path.join(os.homedir(), ".agentforge", "workspaces");
}

export function findGitRepos(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(directory, e.name, ".git")))
    .map((e) => path.join(directory, e.name));
}

export function generateAgentforgeMd(name: string, repos: RepositoryRef[]): string {
  const lines: string[] = [];

  lines.push(`# Workspace: ${name}`);
  lines.push("");
  lines.push("## Repositories");
  for (const repo of repos) {
    const desc = repo.description ? ` — ${repo.description}` : "";
    lines.push(`- [${repo.name}](${repo.path})${desc}`);
  }
  lines.push("");
  lines.push("## Tech Stack");
  lines.push("<!-- Auto-detected. Edit as needed. -->");
  lines.push("");
  lines.push("## Conventions");
  lines.push("<!-- Link to your CLAUDE.md or coding standards. -->");
  lines.push("");
  lines.push("## Pipeline Settings");
  lines.push("- Checkpoints: all");
  lines.push("- Max review iterations: 3");
  lines.push("- Skip stages: ");
  lines.push("");
  lines.push("## Knowledge Sources");
  lines.push("<!-- Add links to docs, Notion, Confluence, etc. -->");
  lines.push("");

  return lines.join("\n");
}

export function saveWorkspace(name: string, content: string): string {
  const wsDir = path.join(getWorkspacesDir(), name);
  fs.mkdirSync(wsDir, { recursive: true });
  const filePath = path.join(wsDir, "AGENTFORGE.md");
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function loadWorkspaceConfig(name: string): string | null {
  const filePath = path.join(getWorkspacesDir(), name, "AGENTFORGE.md");
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function listWorkspaces(): string[] {
  const wsDir = getWorkspacesDir();
  if (!fs.existsSync(wsDir)) return [];
  return fs.readdirSync(wsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/workspace/manager.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/workspace/ tests/workspace/
git commit -m "feat: add workspace manager for multi-repo support"
```

---

### Task 9: Implement `agentforge init` command

**Files:**
- Modify: `src/cli/commands/init.ts`
- Test: `tests/cli/commands/init.test.ts` (extend existing)

- [ ] **Step 1: Add integration test for init logic**

Append to `tests/cli/commands/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createProgram } from "../../../src/cli/index.js";
import { findGitRepos, generateAgentforgeMd } from "../../../src/workspace/manager.js";
import fs from "fs";
import path from "path";
import os from "os";

// ... keep existing tests ...

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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/cli/commands/init.test.ts`
Expected: PASS (all tests including new ones)

- [ ] **Step 3: Implement init command with interactive prompts**

```typescript
// src/cli/commands/init.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import { findGitRepos, generateAgentforgeMd, saveWorkspace } from "../../workspace/manager.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize AgentForge workspace")
    .option("-n, --name <name>", "Workspace name")
    .option("-d, --dir <directory>", "Directory to scan for repos", ".")
    .action(async (options: { name?: string; dir: string }) => {
      const scanDir = path.resolve(options.dir);
      console.log(chalk.blue(`Scanning ${scanDir} for git repositories...`));

      const repoPaths = findGitRepos(scanDir);

      if (repoPaths.length === 0) {
        // Check if current dir itself is a git repo
        const { existsSync } = await import("fs");
        if (existsSync(path.join(scanDir, ".git"))) {
          repoPaths.push(scanDir);
        } else {
          console.log(chalk.yellow("No git repositories found."));
          return;
        }
      }

      console.log(chalk.green(`Found ${repoPaths.length} repository(s):`));
      for (const repo of repoPaths) {
        console.log(`  ${chalk.white(path.basename(repo))} — ${repo}`);
      }

      const workspaceName = options.name ?? path.basename(scanDir);
      const repos = repoPaths.map((p) => ({
        name: path.basename(p),
        path: p,
        description: "",
      }));

      const content = generateAgentforgeMd(workspaceName, repos);
      const savedPath = saveWorkspace(workspaceName, content);

      console.log("");
      console.log(chalk.green("Workspace created!"));
      console.log(`  Config: ${chalk.white(savedPath)}`);
      console.log("");
      console.log(`Edit ${chalk.white("AGENTFORGE.md")} to customize tech stack, conventions, and pipeline settings.`);
      console.log(`Then run: ${chalk.cyan("agentforge run \"your task description\"")}`);
    });
}
```

- [ ] **Step 4: Verify init command works manually**

Run: `npx tsx src/cli/index.ts init --dir ~/workspace/projects/ai/agentforge`
Expected: Shows found repos, creates workspace config

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/init.ts tests/cli/commands/init.test.ts
git commit -m "feat: implement agentforge init with repo detection and workspace creation"
```

---

## Chunk 5: Artifact Storage and End-to-End Wiring

### Task 10: Artifact store

**Files:**
- Create: `src/artifacts/store.ts`
- Test: `tests/artifacts/store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/artifacts/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArtifactStore } from "../../src/artifacts/store.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("ArtifactStore", () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentforge-artifacts-"));
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/artifacts/store.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement ArtifactStore**

```typescript
// src/artifacts/store.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

const STAGE_FILES: Record<string, string> = {
  intake: "01-intake.md",
  analysis: "02-analysis.md",
  design: "03-design.md",
  architecture: "04-architecture.md",
  implementation: "05-implementation.md",
  testing: "06-testing.md",
  documentation: "07-documentation.md",
  review: "08-review.md",
};

interface RunMeta {
  runId: string;
  task: string;
  status: "running" | "completed" | "failed" | "aborted";
  createdAt: string;
  stages: Record<string, { completedAt: string }>;
}

export class ArtifactStore {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    fs.mkdirSync(baseDir, { recursive: true });
  }

  createRun(task: string): string {
    const runId = `run_${crypto.randomBytes(6).toString("hex")}`;
    const runDir = path.join(this.baseDir, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const meta: RunMeta = {
      runId,
      task,
      status: "running",
      createdAt: new Date().toISOString(),
      stages: {},
    };
    fs.writeFileSync(path.join(runDir, "meta.json"), JSON.stringify(meta, null, 2));

    return runId;
  }

  saveArtifact(runId: string, stage: string, content: string): void {
    const fileName = STAGE_FILES[stage] ?? `${stage}.md`;
    const filePath = path.join(this.baseDir, runId, fileName);
    fs.writeFileSync(filePath, content);

    const meta = this.readMeta(runId);
    meta.stages[stage] = { completedAt: new Date().toISOString() };
    this.writeMeta(runId, meta);
  }

  readArtifact(runId: string, stage: string): string | null {
    const fileName = STAGE_FILES[stage] ?? `${stage}.md`;
    const filePath = path.join(this.baseDir, runId, fileName);
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  readMeta(runId: string): RunMeta {
    const filePath = path.join(this.baseDir, runId, "meta.json");
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  updateStatus(runId: string, status: RunMeta["status"]): void {
    const meta = this.readMeta(runId);
    meta.status = status;
    this.writeMeta(runId, meta);
  }

  private writeMeta(runId: string, meta: RunMeta): void {
    const filePath = path.join(this.baseDir, runId, "meta.json");
    fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/artifacts/store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/artifacts/ tests/artifacts/
git commit -m "feat: add artifact store for saving pipeline stage outputs"
```

---

### Task 11: Wire up `agentforge run` end-to-end with Product Manager

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Implement run command**

```typescript
// src/cli/commands/run.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { loadWorkspaceConfig, listWorkspaces, getWorkspacesDir } from "../../workspace/manager.js";
import { parseAgentforgeMd } from "../../context/configParser.js";
import { analyzeRepo } from "../../context/repoAnalyzer.js";
import { buildContextPrompt } from "../../context/contextBuilder.js";
import { createProductManager } from "../../agents/productManager.js";
import { ArtifactStore } from "../../artifacts/store.js";
import type { FullContext } from "../../context/types.js";
import fs from "fs";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a task through the agent pipeline")
    .argument("<task>", "Task description")
    .option("-w, --workspace <name>", "Workspace name")
    .action(async (task: string, options: { workspace?: string }) => {
      // 1. Find workspace
      const workspaceName = options.workspace ?? detectWorkspace();
      if (!workspaceName) {
        console.log(chalk.red("No workspace found. Run `agentforge init` first."));
        process.exit(1);
      }

      const configContent = loadWorkspaceConfig(workspaceName);
      if (!configContent) {
        console.log(chalk.red(`Workspace "${workspaceName}" not found.`));
        process.exit(1);
      }

      // 2. Parse config and analyze repos
      const workspaceConfig = parseAgentforgeMd(configContent);
      const spinner = ora("Analyzing repositories...").start();

      const repos = [];
      for (const repoRef of workspaceConfig.repositories) {
        const expandedPath = repoRef.path.replace(/^~/, process.env.HOME ?? "~");
        if (fs.existsSync(expandedPath)) {
          repos.push(await analyzeRepo(expandedPath));
        }
      }
      spinner.succeed("Repositories analyzed");

      const fullContext: FullContext = { workspace: workspaceConfig, repos };
      const contextPrompt = buildContextPrompt(fullContext);

      // 3. Create run
      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));
      const runId = store.createRun(task);
      console.log(chalk.blue(`Run: ${runId}`));

      // 4. Save intake
      store.saveArtifact(runId, "intake", `# Task\n\n${task}\n\n# Context\n\n${contextPrompt}`);

      // 5. Run Product Manager agent
      const pmSpinner = ora("Product Manager analyzing task...").start();
      try {
        const pm = createProductManager();
        const result = await pm.run(contextPrompt, task);
        store.saveArtifact(runId, "analysis", result.artifact);
        pmSpinner.succeed("Analysis complete");

        console.log("");
        console.log(chalk.green("=== Analysis ==="));
        console.log(result.artifact);
        console.log("");
        console.log(chalk.gray(`Artifact saved to: ${runId}/02-analysis.md`));
      } catch (error) {
        pmSpinner.fail("Analysis failed");
        store.updateStatus(runId, "failed");
        throw error;
      }

      store.updateStatus(runId, "completed");
      console.log(chalk.green(`\nRun ${runId} completed (analysis only — pipeline stages coming in Plan 2).`));
    });
}

function detectWorkspace(): string | null {
  const workspaces = listWorkspaces();
  if (workspaces.length === 1) return workspaces[0];
  if (workspaces.length === 0) return null;

  // Try to match current directory to a workspace repo
  const cwd = process.cwd();
  for (const ws of workspaces) {
    const config = loadWorkspaceConfig(ws);
    if (config && config.includes(cwd)) return ws;
  }

  return workspaces[0];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat: implement agentforge run with Product Manager agent"
```

---

### Task 12: Run all tests and final verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Clean build, dist/ directory created

- [ ] **Step 3: Verify CLI help**

Run: `npx tsx src/cli/index.ts --help`
Expected: Shows agentforge with init and run commands

- [ ] **Step 4: Verify init works**

Run: `npx tsx src/cli/index.ts init --dir ~/workspace/projects/ai/agentforge --name agentforge-test`
Expected: Creates workspace config at ~/.agentforge/workspaces/agentforge-test/AGENTFORGE.md

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: verify foundation build and tests pass"
```

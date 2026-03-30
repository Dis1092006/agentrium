# Pipeline, Checkpoints & Core Agents — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pipeline engine that orchestrates agents through stages, add checkpoint-based human approval between stages, and implement the core agents (Architect, Software Engineer, QA Engineer) so that `agentrium run` executes a full task from analysis through review.

**Architecture:** A `Pipeline` class defines the ordered stages and which agent handles each. A `PipelineRunner` drives execution: for each stage it assembles context (workspace context + all previous artifacts), runs the agent, saves the artifact, and pauses at checkpoints. Checkpoints use stdin prompts (approve/reject/skip/view). Each agent follows the existing `BaseAgent` pattern with a markdown prompt file and a factory function. The existing `run.ts` command is refactored to delegate to `PipelineRunner` instead of directly calling ProductManager.

**Tech Stack:** Node.js 22, TypeScript, ESM, commander, @anthropic-ai/claude-agent-sdk, chalk, ora, vitest, readline (Node built-in for checkpoint prompts)

---

## File Map

| File | Responsibility |
|---|---|
| `src/pipeline/types.ts` | Stage enum, pipeline config types |
| `src/pipeline/pipeline.ts` | Pipeline definition — ordered stages, agent mapping, skip logic |
| `src/pipeline/runner.ts` | PipelineRunner — drives execution, assembles context, saves artifacts |
| `src/pipeline/checkpoint.ts` | Checkpoint prompts — interactive approve/reject/skip/view UI |
| `src/agents/architect.ts` | Architect agent factory |
| `src/agents/softwareEngineer.ts` | Software Engineer agent factory |
| `src/agents/qaEngineer.ts` | QA Engineer agent factory |
| `prompts/architect.md` | Architect system prompt |
| `prompts/softwareEngineer.md` | Software Engineer system prompt |
| `prompts/qaEngineer.md` | QA Engineer system prompt |
| `src/cli/commands/run.ts` | Refactored to use PipelineRunner |
| `tests/pipeline/types.test.ts` | Stage ordering tests |
| `tests/pipeline/pipeline.test.ts` | Pipeline configuration tests |
| `tests/pipeline/runner.test.ts` | Runner logic tests (with mocked agents) |
| `tests/pipeline/checkpoint.test.ts` | Checkpoint decision logic tests |
| `tests/agents/architect.test.ts` | Architect agent config tests |
| `tests/agents/softwareEngineer.test.ts` | Software Engineer agent config tests |
| `tests/agents/qaEngineer.test.ts` | QA Engineer agent config tests |

---

## Chunk 1: Pipeline Types and Stage Definitions

### Task 1: Pipeline types

**Files:**
- Create: `src/pipeline/types.ts`
- Test: `tests/pipeline/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pipeline/types.test.ts
import { describe, it, expect } from "vitest";
import { Stage, STAGE_ORDER, isOptionalStage } from "../../src/pipeline/types.js";

describe("Stage", () => {
  it("defines all pipeline stages in order", () => {
    expect(STAGE_ORDER).toEqual([
      "analysis",
      "design",
      "architecture",
      "implementation",
      "testing",
      "documentation",
      "review",
    ]);
  });

  it("identifies optional stages", () => {
    expect(isOptionalStage("design")).toBe(true);
    expect(isOptionalStage("documentation")).toBe(true);
    expect(isOptionalStage("analysis")).toBe(false);
    expect(isOptionalStage("implementation")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline/types.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement pipeline types**

```typescript
// src/pipeline/types.ts

export type Stage =
  | "analysis"
  | "design"
  | "architecture"
  | "implementation"
  | "testing"
  | "documentation"
  | "review";

export const STAGE_ORDER: Stage[] = [
  "analysis",
  "design",
  "architecture",
  "implementation",
  "testing",
  "documentation",
  "review",
];

const OPTIONAL_STAGES: Set<Stage> = new Set(["design", "documentation"]);

export function isOptionalStage(stage: Stage): boolean {
  return OPTIONAL_STAGES.has(stage);
}

export type CheckpointDecision = "approve" | "reject" | "skip" | "view";

export interface StageResult {
  stage: Stage;
  artifact: string;
  agentName: string;
  durationMs: number;
}

export interface PipelineConfig {
  checkpoints: "all" | "none" | Stage[];
  skipStages: Stage[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pipeline/types.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/types.ts tests/pipeline/types.test.ts
git commit -m "feat: add pipeline stage types and ordering"
```

---

### Task 2: Pipeline definition — stage-to-agent mapping and skip logic

**Files:**
- Create: `src/pipeline/pipeline.ts`
- Test: `tests/pipeline/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pipeline/pipeline.test.ts
import { describe, it, expect } from "vitest";
import { buildPipelineStages } from "../../src/pipeline/pipeline.js";
import type { PipelineConfig } from "../../src/pipeline/types.js";

describe("buildPipelineStages", () => {
  it("returns all non-optional stages when no skips configured", () => {
    const config: PipelineConfig = {
      checkpoints: "all",
      skipStages: [],
    };
    const stages = buildPipelineStages(config);
    const names = stages.map((s) => s.stage);
    expect(names).toEqual([
      "analysis",
      "architecture",
      "implementation",
      "testing",
      "review",
    ]);
  });

  it("skips optional stages by default", () => {
    const config: PipelineConfig = {
      checkpoints: "all",
      skipStages: [],
    };
    const stages = buildPipelineStages(config);
    const names = stages.map((s) => s.stage);
    expect(names).not.toContain("design");
    expect(names).not.toContain("documentation");
  });

  it("skips explicitly configured stages", () => {
    const config: PipelineConfig = {
      checkpoints: "none",
      skipStages: ["testing"],
    };
    const stages = buildPipelineStages(config);
    const names = stages.map((s) => s.stage);
    expect(names).not.toContain("testing");
    expect(names).not.toContain("design");
    expect(names).not.toContain("documentation");
  });

  it("includes optional stages when not in skipStages (explicit include)", () => {
    const config: PipelineConfig = {
      checkpoints: "all",
      skipStages: [],
      includeOptional: ["design"],
    } as PipelineConfig & { includeOptional: string[] };
    const stages = buildPipelineStages(config, ["design"]);
    const names = stages.map((s) => s.stage);
    expect(names).toContain("design");
    expect(names.indexOf("design")).toBeLessThan(names.indexOf("architecture"));
  });

  it("maps stages to correct agent names", () => {
    const config: PipelineConfig = { checkpoints: "all", skipStages: [] };
    const stages = buildPipelineStages(config);
    const agentMap = Object.fromEntries(stages.map((s) => [s.stage, s.agentName]));
    expect(agentMap["analysis"]).toBe("product-manager");
    expect(agentMap["architecture"]).toBe("architect");
    expect(agentMap["implementation"]).toBe("software-engineer");
    expect(agentMap["testing"]).toBe("qa-engineer");
    expect(agentMap["review"]).toBe("code-reviewer");
  });

  it("marks checkpoint stages based on config 'all'", () => {
    const config: PipelineConfig = { checkpoints: "all", skipStages: [] };
    const stages = buildPipelineStages(config);
    expect(stages.every((s) => s.hasCheckpoint)).toBe(true);
  });

  it("marks no checkpoint stages when config is 'none'", () => {
    const config: PipelineConfig = { checkpoints: "none", skipStages: [] };
    const stages = buildPipelineStages(config);
    expect(stages.every((s) => !s.hasCheckpoint)).toBe(true);
  });

  it("marks only specified checkpoint stages", () => {
    const config: PipelineConfig = {
      checkpoints: ["analysis", "review"],
      skipStages: [],
    };
    const stages = buildPipelineStages(config);
    const withCheckpoint = stages.filter((s) => s.hasCheckpoint).map((s) => s.stage);
    expect(withCheckpoint).toEqual(["analysis", "review"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline/pipeline.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement pipeline.ts**

```typescript
// src/pipeline/pipeline.ts
import { type Stage, STAGE_ORDER, isOptionalStage, type PipelineConfig } from "./types.js";

export interface PlannedStage {
  stage: Stage;
  agentName: string;
  hasCheckpoint: boolean;
}

const STAGE_AGENT_MAP: Record<Stage, string> = {
  analysis: "product-manager",
  design: "ux-designer",
  architecture: "architect",
  implementation: "software-engineer",
  testing: "qa-engineer",
  documentation: "technical-writer",
  review: "code-reviewer",
};

export function buildPipelineStages(
  config: PipelineConfig,
  includeOptional: Stage[] = [],
): PlannedStage[] {
  const includeSet = new Set(includeOptional);

  const stages = STAGE_ORDER.filter((stage) => {
    if (config.skipStages.includes(stage)) return false;
    if (isOptionalStage(stage) && !includeSet.has(stage)) return false;
    return true;
  });

  return stages.map((stage) => ({
    stage,
    agentName: STAGE_AGENT_MAP[stage],
    hasCheckpoint: resolveCheckpoint(config, stage),
  }));
}

function resolveCheckpoint(config: PipelineConfig, stage: Stage): boolean {
  if (config.checkpoints === "all") return true;
  if (config.checkpoints === "none") return false;
  return config.checkpoints.includes(stage);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pipeline/pipeline.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/pipeline.ts tests/pipeline/pipeline.test.ts
git commit -m "feat: add pipeline stage planning with agent mapping and checkpoint config"
```

---

## Chunk 2: Checkpoint System

### Task 3: Checkpoint prompts

**Files:**
- Create: `src/pipeline/checkpoint.ts`
- Test: `tests/pipeline/checkpoint.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pipeline/checkpoint.test.ts
import { describe, it, expect } from "vitest";
import { parseCheckpointInput } from "../../src/pipeline/checkpoint.js";

describe("parseCheckpointInput", () => {
  it("parses 'a' as approve", () => {
    expect(parseCheckpointInput("a")).toBe("approve");
  });

  it("parses 'approve' as approve", () => {
    expect(parseCheckpointInput("approve")).toBe("approve");
  });

  it("parses 'r' as reject", () => {
    expect(parseCheckpointInput("r")).toBe("reject");
  });

  it("parses 's' as skip", () => {
    expect(parseCheckpointInput("s")).toBe("skip");
  });

  it("parses 'v' as view", () => {
    expect(parseCheckpointInput("v")).toBe("view");
  });

  it("returns null for unknown input", () => {
    expect(parseCheckpointInput("x")).toBeNull();
    expect(parseCheckpointInput("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline/checkpoint.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement checkpoint.ts**

```typescript
// src/pipeline/checkpoint.ts
import readline from "readline";
import chalk from "chalk";
import type { CheckpointDecision, Stage } from "./types.js";
import type { ArtifactStore } from "../artifacts/store.js";

export function parseCheckpointInput(input: string): CheckpointDecision | null {
  const normalized = input.trim().toLowerCase();
  const map: Record<string, CheckpointDecision> = {
    a: "approve",
    approve: "approve",
    r: "reject",
    reject: "reject",
    s: "skip",
    skip: "skip",
    v: "view",
    view: "view",
  };
  return map[normalized] ?? null;
}

export async function promptCheckpoint(
  stage: Stage,
  artifactPreview: string,
  store: ArtifactStore,
  runId: string,
): Promise<CheckpointDecision> {
  console.log("");
  console.log(chalk.yellow(`── Checkpoint: ${stage} ──`));
  console.log("");
  console.log(artifactPreview.slice(0, 2000));
  if (artifactPreview.length > 2000) {
    console.log(chalk.gray(`... (${artifactPreview.length - 2000} more characters)`));
  }
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const askOnce = (): Promise<CheckpointDecision> =>
    new Promise((resolve) => {
      rl.question(
        chalk.cyan("[a]pprove  [r]eject  [s]kip  [v]iew previous > "),
        (answer) => {
          const decision = parseCheckpointInput(answer);
          if (!decision) {
            console.log(chalk.red("Invalid input. Try again."));
            resolve(askOnce());
            return;
          }

          if (decision === "view") {
            const meta = store.readMeta(runId);
            const completedStages = Object.keys(meta.stages);
            if (completedStages.length === 0) {
              console.log(chalk.gray("No previous stages to view."));
            } else {
              for (const s of completedStages) {
                const content = store.readArtifact(runId, s);
                if (content) {
                  console.log(chalk.blue(`\n── ${s} ──`));
                  console.log(content.slice(0, 1000));
                  if (content.length > 1000) {
                    console.log(chalk.gray(`... (truncated)`));
                  }
                }
              }
            }
            resolve(askOnce());
            return;
          }

          rl.close();
          resolve(decision);
        },
      );
    });

  return askOnce();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pipeline/checkpoint.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/checkpoint.ts tests/pipeline/checkpoint.test.ts
git commit -m "feat: add checkpoint system with interactive prompts"
```

---

## Chunk 3: Core Agents

### Task 4: Architect agent

**Files:**
- Create: `prompts/architect.md`
- Create: `src/agents/architect.ts`
- Test: `tests/agents/architect.test.ts`

- [ ] **Step 1: Create system prompt**

```markdown
<!-- prompts/architect.md -->
# Role: Architect

You are a Software Architect agent. Your job is to design the technical approach for implementing the requirements.

## Input

You receive:
- The original task description
- Product Manager's analysis with requirements and acceptance criteria
- Full project context (repo structure, tech stack, conventions)

## Your Responsibilities

1. Analyze the requirements and understand what needs to change
2. Identify which files and modules are affected
3. Design the high-level approach (new files, modified files, data flow)
4. Define the detailed implementation plan with specific code changes
5. Ensure the design follows project conventions and patterns

## Output Format

Produce a markdown document with the following structure:

## Approach Summary
One paragraph describing the overall technical approach.

## Affected Components
List of files/modules that will be created or modified, with the reason for each.

## Design Details
For each component, describe:
- What changes are needed
- Key interfaces or types to add/modify
- Data flow between components

## Implementation Order
Numbered list of steps in the order they should be implemented. Each step should be independently testable.

## Edge Cases and Considerations
List any edge cases, performance concerns, or backwards-compatibility issues.
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/agents/architect.test.ts
import { describe, it, expect } from "vitest";
import { createArchitect } from "../../src/agents/architect.js";

describe("Architect agent", () => {
  it("has correct name and tools", () => {
    const arch = createArchitect();
    expect(arch.name).toBe("architect");
    expect(arch.tools).toEqual(["Read", "Glob", "Grep"]);
  });

  it("system prompt includes role description", () => {
    const arch = createArchitect();
    const prompt = arch.buildSystemPrompt("test context");
    expect(prompt).toContain("Architect");
    expect(prompt).toContain("test context");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/agents/architect.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement Architect agent**

```typescript
// src/agents/architect.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/architect.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are an Architect agent. Design the technical approach for the given requirements.";
  }
}

export function createArchitect(): BaseAgent {
  return new BaseAgent({
    name: "architect",
    description: "Designs technical approach and implementation plan",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Glob", "Grep"],
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/agents/architect.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/agents/architect.ts prompts/architect.md tests/agents/architect.test.ts
git commit -m "feat: add Architect agent with system prompt"
```

---

### Task 5: Software Engineer agent

**Files:**
- Create: `prompts/softwareEngineer.md`
- Create: `src/agents/softwareEngineer.ts`
- Test: `tests/agents/softwareEngineer.test.ts`

- [ ] **Step 1: Create system prompt**

```markdown
<!-- prompts/softwareEngineer.md -->
# Role: Software Engineer

You are a Software Engineer agent. Your job is to implement the code changes designed by the Architect.

## Input

You receive:
- The original task description
- Product Manager's requirements
- Architect's design and implementation plan
- Full project context (repo structure, tech stack, conventions)

## Your Responsibilities

1. Follow the Architect's implementation plan step by step
2. Write clean, production-quality code
3. Follow project conventions (from CLAUDE.md / Conventions)
4. Make minimal, focused changes — do not refactor unrelated code
5. Ensure all changes are consistent with the existing codebase

## Rules

- Write the actual code changes, not pseudocode
- Use the project's existing patterns and idioms
- Add imports where needed
- Do not add unnecessary comments or documentation
- Do not add features beyond what was specified

## Output Format

Produce a markdown document listing all changes made:

## Changes Summary
One paragraph describing what was implemented.

## Files Changed
For each file, show:
- File path
- Whether it was created or modified
- A description of what changed

## Implementation Notes
Any decisions made during implementation that deviate from or extend the Architect's plan.
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/agents/softwareEngineer.test.ts
import { describe, it, expect } from "vitest";
import { createSoftwareEngineer } from "../../src/agents/softwareEngineer.js";

describe("SoftwareEngineer agent", () => {
  it("has correct name and tools", () => {
    const eng = createSoftwareEngineer();
    expect(eng.name).toBe("software-engineer");
    expect(eng.tools).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "Bash"]);
  });

  it("system prompt includes role description", () => {
    const eng = createSoftwareEngineer();
    const prompt = eng.buildSystemPrompt("test context");
    expect(prompt).toContain("Software Engineer");
    expect(prompt).toContain("test context");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/agents/softwareEngineer.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement Software Engineer agent**

```typescript
// src/agents/softwareEngineer.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/softwareEngineer.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a Software Engineer agent. Implement the code changes from the Architect's plan.";
  }
}

export function createSoftwareEngineer(): BaseAgent {
  return new BaseAgent({
    name: "software-engineer",
    description: "Implements code changes following the Architect's design",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/agents/softwareEngineer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/agents/softwareEngineer.ts prompts/softwareEngineer.md tests/agents/softwareEngineer.test.ts
git commit -m "feat: add Software Engineer agent with system prompt"
```

---

### Task 6: QA Engineer agent

**Files:**
- Create: `prompts/qaEngineer.md`
- Create: `src/agents/qaEngineer.ts`
- Test: `tests/agents/qaEngineer.test.ts`

- [ ] **Step 1: Create system prompt**

```markdown
<!-- prompts/qaEngineer.md -->
# Role: QA Engineer

You are a QA Engineer agent. Your job is to verify that the implementation meets the requirements by writing and running tests.

## Input

You receive:
- The original task description
- Product Manager's requirements and acceptance criteria
- Architect's design
- Software Engineer's implementation summary
- Full project context (repo structure, tech stack, conventions)

## Your Responsibilities

1. Review the acceptance criteria from the Product Manager
2. Write tests that verify each requirement is met
3. Run existing tests to ensure nothing is broken
4. Run the new tests to ensure the implementation works
5. Report any failures or issues found

## Rules

- Use the project's existing test framework and patterns
- Write focused tests — one assertion per behavior
- Test edge cases identified in the Architect's design
- Do not modify implementation code — only test code
- If tests fail, report the failure clearly

## Output Format

Produce a markdown document:

## Test Summary
Number of tests written, passed, and failed.

## Tests Written
For each test file:
- File path
- List of test cases with descriptions

## Test Results
Full test output showing pass/fail status.

## Issues Found
Any bugs, missing behaviors, or regressions discovered. For each issue:
- Description
- Steps to reproduce
- Expected vs actual behavior
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/agents/qaEngineer.test.ts
import { describe, it, expect } from "vitest";
import { createQAEngineer } from "../../src/agents/qaEngineer.js";

describe("QAEngineer agent", () => {
  it("has correct name and tools", () => {
    const qa = createQAEngineer();
    expect(qa.name).toBe("qa-engineer");
    expect(qa.tools).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "Bash"]);
  });

  it("system prompt includes role description", () => {
    const qa = createQAEngineer();
    const prompt = qa.buildSystemPrompt("test context");
    expect(prompt).toContain("QA Engineer");
    expect(prompt).toContain("test context");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/agents/qaEngineer.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement QA Engineer agent**

```typescript
// src/agents/qaEngineer.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/qaEngineer.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a QA Engineer agent. Write and run tests to verify the implementation.";
  }
}

export function createQAEngineer(): BaseAgent {
  return new BaseAgent({
    name: "qa-engineer",
    description: "Writes and runs tests to verify implementation meets requirements",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/agents/qaEngineer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/agents/qaEngineer.ts prompts/qaEngineer.md tests/agents/qaEngineer.test.ts
git commit -m "feat: add QA Engineer agent with system prompt"
```

---

### Task 7: Agent registry — factory that creates agents by name

**Files:**
- Create: `src/agents/registry.ts`
- Test: `tests/agents/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agents/registry.test.ts
import { describe, it, expect } from "vitest";
import { createAgentByName, getRegisteredAgentNames } from "../../src/agents/registry.js";

describe("agent registry", () => {
  it("creates product-manager agent by name", () => {
    const agent = createAgentByName("product-manager");
    expect(agent.name).toBe("product-manager");
  });

  it("creates architect agent by name", () => {
    const agent = createAgentByName("architect");
    expect(agent.name).toBe("architect");
  });

  it("creates software-engineer agent by name", () => {
    const agent = createAgentByName("software-engineer");
    expect(agent.name).toBe("software-engineer");
  });

  it("creates qa-engineer agent by name", () => {
    const agent = createAgentByName("qa-engineer");
    expect(agent.name).toBe("qa-engineer");
  });

  it("throws for unknown agent name", () => {
    expect(() => createAgentByName("unknown-agent")).toThrow('Unknown agent: "unknown-agent"');
  });

  it("lists all registered agent names", () => {
    const names = getRegisteredAgentNames();
    expect(names).toContain("product-manager");
    expect(names).toContain("architect");
    expect(names).toContain("software-engineer");
    expect(names).toContain("qa-engineer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agents/registry.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement agent registry**

```typescript
// src/agents/registry.ts
import { BaseAgent } from "./base.js";
import { createProductManager } from "./productManager.js";
import { createArchitect } from "./architect.js";
import { createSoftwareEngineer } from "./softwareEngineer.js";
import { createQAEngineer } from "./qaEngineer.js";

type AgentFactory = () => BaseAgent;

const AGENT_FACTORIES: Record<string, AgentFactory> = {
  "product-manager": createProductManager,
  "architect": createArchitect,
  "software-engineer": createSoftwareEngineer,
  "qa-engineer": createQAEngineer,
};

export function createAgentByName(name: string): BaseAgent {
  const factory = AGENT_FACTORIES[name];
  if (!factory) {
    throw new Error(`Unknown agent: "${name}"`);
  }
  return factory();
}

export function getRegisteredAgentNames(): string[] {
  return Object.keys(AGENT_FACTORIES);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/agents/registry.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/registry.ts tests/agents/registry.test.ts
git commit -m "feat: add agent registry for name-based agent creation"
```

---

## Chunk 4: Pipeline Runner

### Task 8: Pipeline runner — orchestrates agent execution through stages

**Files:**
- Create: `src/pipeline/runner.ts`
- Test: `tests/pipeline/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pipeline/runner.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PipelineRunner } from "../../src/pipeline/runner.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import type { PipelineConfig, Stage } from "../../src/pipeline/types.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("PipelineRunner", () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-runner-"));
    store = new ArtifactStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("assembles context from previous artifacts", () => {
    const runId = store.createRun("test task");
    store.saveArtifact(runId, "intake", "# Task\nDo something");
    store.saveArtifact(runId, "analysis", "# Analysis\nRequirements here");

    const runner = new PipelineRunner(store, runId, "workspace context");
    const ctx = runner.assembleAgentContext("architecture");

    expect(ctx).toContain("workspace context");
    expect(ctx).toContain("# Task");
    expect(ctx).toContain("# Analysis");
  });

  it("assembleAgentContext only includes stages before the current one", () => {
    const runId = store.createRun("test task");
    store.saveArtifact(runId, "intake", "# Task");
    store.saveArtifact(runId, "analysis", "# Analysis");
    store.saveArtifact(runId, "architecture", "# Architecture");

    const runner = new PipelineRunner(store, runId, "workspace context");
    const ctx = runner.assembleAgentContext("architecture");

    // Should include intake and analysis but NOT architecture itself
    expect(ctx).toContain("# Task");
    expect(ctx).toContain("# Analysis");
    expect(ctx).not.toContain("# Architecture");
  });

  it("builds task description with previous artifacts summary", () => {
    const runId = store.createRun("Add user auth");
    store.saveArtifact(runId, "intake", "# Task\nAdd user auth");
    store.saveArtifact(runId, "analysis", "# Analysis\nReq 1: Login page");

    const runner = new PipelineRunner(store, runId, "ctx");
    const taskDesc = runner.buildTaskDescription("architecture", "Add user auth");

    expect(taskDesc).toContain("Add user auth");
    expect(taskDesc).toContain("analysis");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline/runner.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement PipelineRunner**

```typescript
// src/pipeline/runner.ts
import chalk from "chalk";
import ora from "ora";
import type { Stage, PipelineConfig, StageResult, CheckpointDecision } from "./types.js";
import { STAGE_ORDER } from "./types.js";
import { buildPipelineStages, type PlannedStage } from "./pipeline.js";
import { promptCheckpoint } from "./checkpoint.js";
import { createAgentByName } from "../agents/registry.js";
import { ArtifactStore } from "../artifacts/store.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export class PipelineRunner {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;

  constructor(store: ArtifactStore, runId: string, workspaceContext: string) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
  }

  assembleAgentContext(currentStage: Stage): string {
    const sections: string[] = [this.workspaceContext];

    for (const stage of ARTIFACT_STAGES) {
      if (stage === currentStage) break;
      const artifact = this.store.readArtifact(this.runId, stage);
      if (artifact) {
        sections.push(`\n---\n\n## Previous Stage: ${stage}\n\n${artifact}`);
      }
    }

    return sections.join("\n");
  }

  buildTaskDescription(currentStage: Stage, originalTask: string): string {
    const meta = this.store.readMeta(this.runId);
    const completedStages = Object.keys(meta.stages);

    let desc = `Original task: ${originalTask}\n\n`;
    desc += `Current stage: ${currentStage}\n\n`;

    if (completedStages.length > 0) {
      desc += `Completed stages: ${completedStages.join(", ")}\n\n`;
      desc += `Review the outputs from previous stages (provided in your context) and produce your deliverable for the "${currentStage}" stage.`;
    } else {
      desc += `This is the first stage. Analyze the task and produce your deliverable.`;
    }

    return desc;
  }

  async runPipeline(
    task: string,
    config: PipelineConfig,
    includeOptional: Stage[] = [],
  ): Promise<void> {
    const stages = buildPipelineStages(config, includeOptional);

    console.log(chalk.blue(`Pipeline: ${stages.map((s) => s.stage).join(" → ")}`));
    console.log("");

    for (const planned of stages) {
      const result = await this.runStage(planned, task);

      if (!result) {
        console.log(chalk.yellow(`Stage "${planned.stage}" was skipped.`));
        continue;
      }

      if (planned.hasCheckpoint) {
        const decision = await promptCheckpoint(
          planned.stage,
          result.artifact,
          this.store,
          this.runId,
        );

        if (decision === "reject") {
          console.log(chalk.red(`Stage "${planned.stage}" rejected. Aborting pipeline.`));
          this.store.updateStatus(this.runId, "aborted");
          return;
        }

        if (decision === "skip") {
          console.log(chalk.yellow(`Skipping to next stage.`));
        }
      }
    }

    this.store.updateStatus(this.runId, "completed");
    console.log(chalk.green(`\nPipeline completed for run ${this.runId}.`));
  }

  private async runStage(planned: PlannedStage, task: string): Promise<StageResult | null> {
    const spinner = ora(`${planned.agentName} working on ${planned.stage}...`).start();
    const startTime = Date.now();

    try {
      const agent = createAgentByName(planned.agentName);
      const context = this.assembleAgentContext(planned.stage);
      const taskDesc = this.buildTaskDescription(planned.stage, task);
      const result = await agent.run(context, taskDesc);

      this.store.saveArtifact(this.runId, planned.stage, result.artifact);
      const durationMs = Date.now() - startTime;

      spinner.succeed(`${planned.stage} complete (${(durationMs / 1000).toFixed(1)}s)`);

      return {
        stage: planned.stage,
        artifact: result.artifact,
        agentName: planned.agentName,
        durationMs,
      };
    } catch (error) {
      spinner.fail(`${planned.stage} failed`);
      this.store.updateStatus(this.runId, "failed");
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pipeline/runner.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/runner.ts tests/pipeline/runner.test.ts
git commit -m "feat: add PipelineRunner with context assembly and stage orchestration"
```

---

## Chunk 5: Wire Up the Run Command

### Task 9: Refactor `run` command to use PipelineRunner

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Rewrite run.ts to delegate to PipelineRunner**

Replace the full contents of `src/cli/commands/run.ts`:

```typescript
// src/cli/commands/run.ts
import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { loadWorkspaceConfig, listWorkspaces, getWorkspacesDir } from "../../workspace/manager.js";
import { parseAgentriumMd } from "../../context/configParser.js";
import { analyzeRepo } from "../../context/repoAnalyzer.js";
import { buildContextPrompt } from "../../context/contextBuilder.js";
import { ArtifactStore } from "../../artifacts/store.js";
import { PipelineRunner } from "../../pipeline/runner.js";
import type { FullContext } from "../../context/types.js";
import type { PipelineConfig, Stage } from "../../pipeline/types.js";
import fs from "fs";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a task through the agent pipeline")
    .argument("<task>", "Task description")
    .option("-w, --workspace <name>", "Workspace name")
    .option("--no-checkpoints", "Skip all checkpoints")
    .option("--include <stages...>", "Include optional stages (design, documentation)")
    .action(async (task: string, options: { workspace?: string; checkpoints: boolean; include?: string[] }) => {
      // 1. Find workspace
      const workspaceName = options.workspace ?? detectWorkspace();
      if (!workspaceName) {
        console.log(chalk.red("No workspace found. Run `agentrium init` first."));
        process.exit(1);
      }

      const configContent = loadWorkspaceConfig(workspaceName);
      if (!configContent) {
        console.log(chalk.red(`Workspace "${workspaceName}" not found.`));
        process.exit(1);
      }

      // 2. Parse config and analyze repos
      const workspaceConfig = parseAgentriumMd(configContent);
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

      // 3. Create run and save intake
      const store = new ArtifactStore(path.join(getWorkspacesDir(), workspaceName, "runs"));
      const runId = store.createRun(task);
      store.saveArtifact(runId, "intake", `# Task\n\n${task}\n\n# Context\n\n${contextPrompt}`);
      console.log(chalk.blue(`Run: ${runId}`));

      // 4. Build pipeline config
      const pipelineConfig: PipelineConfig = {
        checkpoints: options.checkpoints
          ? workspaceConfig.pipelineSettings.checkpoints
          : "none",
        skipStages: workspaceConfig.pipelineSettings.skipStages as Stage[],
      };

      const includeOptional = (options.include ?? []) as Stage[];

      // 5. Run pipeline
      const runner = new PipelineRunner(store, runId, contextPrompt);
      await runner.runPipeline(task, pipelineConfig, includeOptional);
    });
}

function detectWorkspace(): string | null {
  const workspaces = listWorkspaces();
  if (workspaces.length === 1) return workspaces[0];
  if (workspaces.length === 0) return null;

  const cwd = process.cwd();
  for (const ws of workspaces) {
    const configContent = loadWorkspaceConfig(ws);
    if (!configContent) continue;
    const wsConfig = parseAgentriumMd(configContent);
    const match = wsConfig.repositories.some((repo) => {
      const expanded = repo.path.replace(/^~/, process.env.HOME ?? "~");
      return cwd === expanded || cwd.startsWith(expanded + path.sep);
    });
    if (match) return ws;
  }

  console.log(chalk.yellow(`Multiple workspaces found: ${workspaces.join(", ")}. Use --workspace to specify.`));
  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Verify CLI help shows new options**

Run: `npx tsx src/cli/index.ts run --help`
Expected: Shows `--no-checkpoints` and `--include` options

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat: refactor run command to use PipelineRunner with checkpoint support"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (should be ~47 tests across 14 files)

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Verify CLI end-to-end**

Run: `npx tsx src/cli/index.ts --help`
Expected: Shows agentrium with init and run commands

Run: `npx tsx src/cli/index.ts run --help`
Expected: Shows task argument, --workspace, --no-checkpoints, --include options

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: verify pipeline and agents build and tests pass"
```

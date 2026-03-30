# Review System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a code review subsystem where two reviewers run in parallel, an arbiter merges their findings into a verdict, and a rework cycle iterates fixes until approval or max iterations.

**Architecture:** The "review" stage in the pipeline becomes a multi-step subprocess. Two Code Reviewer agents (Logic and Security) run in parallel via `Promise.all`. A Review Arbiter agent deduplicates and produces a verdict. On "Request changes", a rework loop re-runs Software Engineer → QA Engineer → Reviewers → Arbiter, up to `maxReviewIterations` from config. The PipelineRunner delegates the review stage to a new `ReviewProcess` class that encapsulates this logic. The review artifact (`08-review.md`) contains the final arbiter verdict.

**Tech Stack:** Node.js 22, TypeScript, ESM, @anthropic-ai/claude-agent-sdk, vitest

---

## File Map

| File | Responsibility |
|---|---|
| `prompts/codeReviewerLogic.md` | System prompt for Reviewer 1 (logic, bugs, performance) |
| `prompts/codeReviewerSecurity.md` | System prompt for Reviewer 2 (security, conventions) |
| `prompts/reviewArbiter.md` | System prompt for Review Arbiter |
| `src/agents/codeReviewer.ts` | Two factory functions: createLogicReviewer, createSecurityReviewer |
| `src/agents/reviewArbiter.ts` | Factory function: createReviewArbiter |
| `src/agents/registry.ts` | Add new agents to registry |
| `src/review/process.ts` | ReviewProcess class — orchestrates parallel reviews, arbiter, rework loop |
| `src/review/types.ts` | ReviewVerdict type, ReviewComment interface |
| `src/pipeline/runner.ts` | Modify review stage to delegate to ReviewProcess |
| `tests/agents/codeReviewer.test.ts` | Reviewer agent config tests |
| `tests/agents/reviewArbiter.test.ts` | Arbiter agent config tests |
| `tests/review/types.test.ts` | Verdict parsing tests |
| `tests/review/process.test.ts` | ReviewProcess logic tests |
| `tests/agents/registry.test.ts` | Update for new agents |

---

## Chunk 1: Review Types and Comment Format

### Task 1: Review types

**Files:**
- Create: `src/review/types.ts`
- Test: `tests/review/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/review/types.test.ts
import { describe, it, expect } from "vitest";
import { parseVerdict, type ReviewVerdict } from "../../src/review/types.js";

describe("parseVerdict", () => {
  it("parses 'approve' verdict", () => {
    const text = "## Verdict: Approve\n\nAll looks good.";
    expect(parseVerdict(text)).toBe("approve");
  });

  it("parses 'approve_with_nits' verdict", () => {
    const text = "## Verdict: Approve with nits\n\nMinor issues only.";
    expect(parseVerdict(text)).toBe("approve_with_nits");
  });

  it("parses 'request_changes' verdict", () => {
    const text = "## Verdict: Request changes\n\nCritical bugs found.";
    expect(parseVerdict(text)).toBe("request_changes");
  });

  it("defaults to request_changes when verdict is unclear", () => {
    const text = "Some review text without a clear verdict.";
    expect(parseVerdict(text)).toBe("request_changes");
  });

  it("is case-insensitive", () => {
    const text = "## Verdict: APPROVE\n\nDone.";
    expect(parseVerdict(text)).toBe("approve");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/review/types.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement review types**

```typescript
// src/review/types.ts

export type ReviewVerdict = "approve" | "approve_with_nits" | "request_changes";

export interface ReviewComment {
  file: string;
  severity: "critical" | "major" | "minor" | "nit";
  category: "bug" | "security" | "convention" | "performance" | "readability";
  description: string;
  suggestion: string;
}

export function parseVerdict(arbiterOutput: string): ReviewVerdict {
  const lower = arbiterOutput.toLowerCase();

  const verdictMatch = lower.match(/##\s*verdict:\s*(.+)/);
  if (!verdictMatch) return "request_changes";

  const verdictText = verdictMatch[1].trim();

  if (verdictText.startsWith("approve with nits")) return "approve_with_nits";
  if (verdictText.startsWith("approve")) return "approve";
  if (verdictText.startsWith("request changes")) return "request_changes";

  return "request_changes";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/review/types.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/review/types.ts tests/review/types.test.ts
git commit -m "feat: add review types with verdict parsing"
```

---

## Chunk 2: Code Reviewer Agents

### Task 2: Code Reviewer agents (Logic and Security)

**Files:**
- Create: `prompts/codeReviewerLogic.md`
- Create: `prompts/codeReviewerSecurity.md`
- Create: `src/agents/codeReviewer.ts`
- Test: `tests/agents/codeReviewer.test.ts`

- [ ] **Step 1: Create Logic Reviewer system prompt**

```markdown
<!-- prompts/codeReviewerLogic.md -->
# Role: Code Reviewer (Logic & Correctness)

You are a Code Reviewer focused on logic, correctness, and performance. Review the implementation produced by the Software Engineer.

## Input

You receive:
- The original task description
- Product Manager's requirements
- Architect's design
- Software Engineer's implementation summary
- QA Engineer's test results
- Full project context

## Your Focus Areas

1. **Bugs** — logic errors, off-by-one, null/undefined handling, race conditions
2. **Edge cases** — boundary conditions, empty inputs, error paths
3. **Business logic** — does the implementation match the requirements?
4. **Performance** — unnecessary allocations, O(n^2) where O(n) suffices, missing caching
5. **Readability** — unclear variable names, overly complex logic

## Comment Format

For each finding, use this exact format:

## Comment N
- **File:** path/to/file.ts:lineNumber
- **Severity:** critical | major | minor | nit
- **Category:** bug | performance | readability
- **Description:** What the issue is
- **Suggestion:** How to fix it

## Output Format

Start with a brief summary, then list all comments, then end with:

## Summary
- Total comments: N
- Critical: N
- Major: N
- Minor: N
- Nit: N
```

- [ ] **Step 2: Create Security Reviewer system prompt**

```markdown
<!-- prompts/codeReviewerSecurity.md -->
# Role: Code Reviewer (Security & Conventions)

You are a Code Reviewer focused on security and project conventions. Review the implementation produced by the Software Engineer.

## Input

You receive:
- The original task description
- Product Manager's requirements
- Architect's design
- Software Engineer's implementation summary
- QA Engineer's test results
- Full project context (including conventions from CLAUDE.md)

## Your Focus Areas

1. **Security** — injection vulnerabilities, XSS, CSRF, insecure dependencies, secrets in code
2. **OWASP Top 10** — authentication, authorization, data exposure, misconfiguration
3. **Dependencies** — known vulnerabilities, unnecessary dependencies, version pinning
4. **Project conventions** — naming, file structure, import patterns, error handling style
5. **Code style** — consistency with existing codebase, idiomatic patterns

## Comment Format

For each finding, use this exact format:

## Comment N
- **File:** path/to/file.ts:lineNumber
- **Severity:** critical | major | minor | nit
- **Category:** security | convention | readability
- **Description:** What the issue is
- **Suggestion:** How to fix it

## Output Format

Start with a brief summary, then list all comments, then end with:

## Summary
- Total comments: N
- Critical: N
- Major: N
- Minor: N
- Nit: N
```

- [ ] **Step 3: Write the failing test**

```typescript
// tests/agents/codeReviewer.test.ts
import { describe, it, expect } from "vitest";
import { createLogicReviewer, createSecurityReviewer } from "../../src/agents/codeReviewer.js";

describe("Code Reviewer agents", () => {
  describe("Logic Reviewer", () => {
    it("has correct name and tools", () => {
      const reviewer = createLogicReviewer();
      expect(reviewer.name).toBe("code-reviewer-logic");
      expect(reviewer.tools).toEqual(["Read", "Glob", "Grep"]);
    });

    it("system prompt includes logic focus", () => {
      const reviewer = createLogicReviewer();
      const prompt = reviewer.buildSystemPrompt("test context");
      expect(prompt).toContain("Logic & Correctness");
      expect(prompt).toContain("test context");
    });
  });

  describe("Security Reviewer", () => {
    it("has correct name and tools", () => {
      const reviewer = createSecurityReviewer();
      expect(reviewer.name).toBe("code-reviewer-security");
      expect(reviewer.tools).toEqual(["Read", "Glob", "Grep"]);
    });

    it("system prompt includes security focus", () => {
      const reviewer = createSecurityReviewer();
      const prompt = reviewer.buildSystemPrompt("test context");
      expect(prompt).toContain("Security & Conventions");
      expect(prompt).toContain("test context");
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/agents/codeReviewer.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 5: Implement Code Reviewer agents**

```typescript
// src/agents/codeReviewer.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(filename: string, fallback: string): string {
  const promptPath = path.resolve(__dirname, "../../prompts", filename);
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return fallback;
  }
}

export function createLogicReviewer(): BaseAgent {
  return new BaseAgent({
    name: "code-reviewer-logic",
    description: "Reviews code for logic errors, bugs, edge cases, and performance",
    systemPrompt: loadPrompt(
      "codeReviewerLogic.md",
      "You are a Code Reviewer focused on logic, correctness, and performance.",
    ),
    tools: ["Read", "Glob", "Grep"],
  });
}

export function createSecurityReviewer(): BaseAgent {
  return new BaseAgent({
    name: "code-reviewer-security",
    description: "Reviews code for security vulnerabilities and convention adherence",
    systemPrompt: loadPrompt(
      "codeReviewerSecurity.md",
      "You are a Code Reviewer focused on security and project conventions.",
    ),
    tools: ["Read", "Glob", "Grep"],
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/agents/codeReviewer.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/agents/codeReviewer.ts prompts/codeReviewerLogic.md prompts/codeReviewerSecurity.md tests/agents/codeReviewer.test.ts
git commit -m "feat: add Code Reviewer agents (Logic and Security)"
```

---

### Task 3: Review Arbiter agent

**Files:**
- Create: `prompts/reviewArbiter.md`
- Create: `src/agents/reviewArbiter.ts`
- Test: `tests/agents/reviewArbiter.test.ts`

- [ ] **Step 1: Create Review Arbiter system prompt**

```markdown
<!-- prompts/reviewArbiter.md -->
# Role: Review Arbiter

You are a Review Arbiter. You receive findings from two code reviewers and produce a final, unified review verdict.

## Input

You receive:
- Logic Reviewer's findings (bugs, edge cases, performance)
- Security Reviewer's findings (security, conventions)
- The original task requirements
- The implementation summary

## Your Responsibilities

1. **Deduplicate** — identify findings that both reviewers flagged and merge them into one
2. **Resolve conflicts** — if reviewers contradict each other, decide with reasoning
3. **Prioritize** — sort all findings by severity (critical first)
4. **Verdict** — determine the final outcome

## Output Format

Produce a markdown document:

## Deduplicated Findings
List each unique finding with its source (Logic, Security, or Both).

## Conflicts Resolved
If any reviewers contradicted each other, explain your reasoning.

## Prioritized Comments
All comments sorted by severity, using this format:

### Comment N
- **File:** path/to/file.ts:lineNumber
- **Severity:** critical | major | minor | nit
- **Category:** bug | security | convention | performance | readability
- **Source:** Logic | Security | Both
- **Description:** What the issue is
- **Suggestion:** How to fix it

## Mandatory Fixes
If verdict is "Request changes", list the specific fixes required (critical and major items only).

## Verdict: [Approve | Approve with nits | Request changes]
One paragraph explaining the verdict.
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/agents/reviewArbiter.test.ts
import { describe, it, expect } from "vitest";
import { createReviewArbiter } from "../../src/agents/reviewArbiter.js";

describe("ReviewArbiter agent", () => {
  it("has correct name and tools", () => {
    const arbiter = createReviewArbiter();
    expect(arbiter.name).toBe("review-arbiter");
    expect(arbiter.tools).toEqual(["Read"]);
  });

  it("system prompt includes arbiter role", () => {
    const arbiter = createReviewArbiter();
    const prompt = arbiter.buildSystemPrompt("test context");
    expect(prompt).toContain("Review Arbiter");
    expect(prompt).toContain("test context");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/agents/reviewArbiter.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement Review Arbiter agent**

```typescript
// src/agents/reviewArbiter.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/reviewArbiter.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a Review Arbiter. Deduplicate findings, resolve conflicts, and produce a verdict.";
  }
}

export function createReviewArbiter(): BaseAgent {
  return new BaseAgent({
    name: "review-arbiter",
    description: "Deduplicates review findings, resolves conflicts, and produces final verdict",
    systemPrompt: loadPrompt(),
    tools: ["Read"],
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/agents/reviewArbiter.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/agents/reviewArbiter.ts prompts/reviewArbiter.md tests/agents/reviewArbiter.test.ts
git commit -m "feat: add Review Arbiter agent with system prompt"
```

---

### Task 4: Update agent registry with new agents

**Files:**
- Modify: `src/agents/registry.ts`
- Modify: `tests/agents/registry.test.ts`

- [ ] **Step 1: Update the test file**

Replace the full contents of `tests/agents/registry.test.ts`:

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

  it("creates code-reviewer-logic agent by name", () => {
    const agent = createAgentByName("code-reviewer-logic");
    expect(agent.name).toBe("code-reviewer-logic");
  });

  it("creates code-reviewer-security agent by name", () => {
    const agent = createAgentByName("code-reviewer-security");
    expect(agent.name).toBe("code-reviewer-security");
  });

  it("creates review-arbiter agent by name", () => {
    const agent = createAgentByName("review-arbiter");
    expect(agent.name).toBe("review-arbiter");
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
    expect(names).toContain("code-reviewer-logic");
    expect(names).toContain("code-reviewer-security");
    expect(names).toContain("review-arbiter");
  });
});
```

- [ ] **Step 2: Run test to verify new tests fail**

Run: `npx vitest run tests/agents/registry.test.ts`
Expected: FAIL — "code-reviewer-logic" not found in registry

- [ ] **Step 3: Update the registry**

Replace the full contents of `src/agents/registry.ts`:

```typescript
// src/agents/registry.ts
import { BaseAgent } from "./base.js";
import { createProductManager } from "./productManager.js";
import { createArchitect } from "./architect.js";
import { createSoftwareEngineer } from "./softwareEngineer.js";
import { createQAEngineer } from "./qaEngineer.js";
import { createLogicReviewer, createSecurityReviewer } from "./codeReviewer.js";
import { createReviewArbiter } from "./reviewArbiter.js";

type AgentFactory = () => BaseAgent;

const AGENT_FACTORIES: Record<string, AgentFactory> = {
  "product-manager": createProductManager,
  "architect": createArchitect,
  "software-engineer": createSoftwareEngineer,
  "qa-engineer": createQAEngineer,
  "code-reviewer-logic": createLogicReviewer,
  "code-reviewer-security": createSecurityReviewer,
  "review-arbiter": createReviewArbiter,
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
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/registry.ts tests/agents/registry.test.ts
git commit -m "feat: register Code Reviewer and Review Arbiter agents"
```

---

## Chunk 3: Review Process

### Task 5: ReviewProcess — parallel reviews, arbiter, rework loop

**Files:**
- Create: `src/review/process.ts`
- Test: `tests/review/process.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/review/process.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement ReviewProcess**

```typescript
// src/review/process.ts
import chalk from "chalk";
import ora from "ora";
import { createAgentByName } from "../agents/registry.js";
import { ArtifactStore } from "../artifacts/store.js";
import { parseVerdict, type ReviewVerdict } from "./types.js";
import type { Stage } from "../pipeline/types.js";
import { STAGE_ORDER } from "../pipeline/types.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export class ReviewProcess {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;
  private readonly maxIterations: number;

  constructor(
    store: ArtifactStore,
    runId: string,
    workspaceContext: string,
    maxIterations: number,
  ) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
    this.maxIterations = maxIterations;
  }

  buildReviewContext(): string {
    const sections: string[] = [this.workspaceContext];

    for (const stage of ARTIFACT_STAGES) {
      if (stage === "review") break;
      const artifact = this.store.readArtifact(this.runId, stage);
      if (artifact) {
        sections.push(`\n---\n\n## Previous Stage: ${stage}\n\n${artifact}`);
      }
    }

    return sections.join("\n");
  }

  buildReviewTaskDescription(originalTask: string): string {
    return (
      `Original task: ${originalTask}\n\n` +
      `Current stage: review\n\n` +
      `Review the implementation and testing stages. ` +
      `Produce your findings using the comment format specified in your instructions.`
    );
  }

  buildArbiterTaskDescription(
    logicFindings: string,
    securityFindings: string,
    originalTask: string,
  ): string {
    return (
      `Original task: ${originalTask}\n\n` +
      `## Logic Reviewer Findings\n\n${logicFindings}\n\n` +
      `## Security Reviewer Findings\n\n${securityFindings}\n\n` +
      `Deduplicate, resolve conflicts, prioritize, and produce your verdict.`
    );
  }

  buildReworkTaskDescription(
    arbiterOutput: string,
    originalTask: string,
    iteration: number,
  ): string {
    return (
      `Original task: ${originalTask}\n\n` +
      `This is rework iteration ${iteration} of ${this.maxIterations}.\n\n` +
      `The Review Arbiter requested changes. Address the mandatory fixes below:\n\n` +
      `${arbiterOutput}\n\n` +
      `Fix only what is listed. Do not make other changes.`
    );
  }

  async run(originalTask: string): Promise<ReviewVerdict> {
    const context = this.buildReviewContext();
    const reviewTaskDesc = this.buildReviewTaskDescription(originalTask);

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      const iterLabel = this.maxIterations > 1 ? ` (iteration ${iteration})` : "";

      // 1. Run two reviewers in parallel
      const reviewSpinner = ora(`Running code reviewers in parallel${iterLabel}...`).start();

      const logicReviewer = createAgentByName("code-reviewer-logic");
      const securityReviewer = createAgentByName("code-reviewer-security");

      const [logicResult, securityResult] = await Promise.all([
        logicReviewer.run(context, reviewTaskDesc),
        securityReviewer.run(context, reviewTaskDesc),
      ]);

      reviewSpinner.succeed(`Code reviews complete${iterLabel}`);

      // Save individual review artifacts
      const reviewSuffix = iteration > 1 ? `_v${iteration}` : "";
      this.store.saveArtifact(
        this.runId,
        `review_logic${reviewSuffix}`,
        logicResult.artifact,
      );
      this.store.saveArtifact(
        this.runId,
        `review_security${reviewSuffix}`,
        securityResult.artifact,
      );

      // 2. Run arbiter
      const arbiterSpinner = ora(`Review Arbiter analyzing findings${iterLabel}...`).start();
      const arbiter = createAgentByName("review-arbiter");
      const arbiterTaskDesc = this.buildArbiterTaskDescription(
        logicResult.artifact,
        securityResult.artifact,
        originalTask,
      );
      const arbiterResult = await arbiter.run(context, arbiterTaskDesc);

      this.store.saveArtifact(
        this.runId,
        `review_arbiter${reviewSuffix}`,
        arbiterResult.artifact,
      );

      const verdict = parseVerdict(arbiterResult.artifact);
      arbiterSpinner.succeed(`Arbiter verdict${iterLabel}: ${verdict}`);

      // 3. If approved, save final review and return
      if (verdict === "approve" || verdict === "approve_with_nits") {
        this.store.saveArtifact(this.runId, "review", arbiterResult.artifact);
        return verdict;
      }

      // 4. Request changes — enter rework cycle
      if (iteration >= this.maxIterations) {
        console.log(
          chalk.yellow(
            `Max review iterations (${this.maxIterations}) reached. Saving last review.`,
          ),
        );
        this.store.saveArtifact(this.runId, "review", arbiterResult.artifact);
        return verdict;
      }

      console.log(chalk.yellow(`Changes requested. Starting rework iteration ${iteration + 1}...`));

      // 4a. Software Engineer fixes
      const fixSpinner = ora("Software Engineer applying fixes...").start();
      const engineer = createAgentByName("software-engineer");
      const reworkDesc = this.buildReworkTaskDescription(
        arbiterResult.artifact,
        originalTask,
        iteration,
      );
      const fixResult = await engineer.run(context, reworkDesc);
      this.store.saveArtifact(this.runId, `rework_fix_v${iteration + 1}`, fixResult.artifact);
      fixSpinner.succeed("Fixes applied");

      // 4b. QA Engineer re-verifies
      const qaSpinner = ora("QA Engineer re-verifying...").start();
      const qa = createAgentByName("qa-engineer");
      const qaDesc =
        `Original task: ${originalTask}\n\n` +
        `Re-verify after rework iteration ${iteration}. ` +
        `The Software Engineer made fixes based on review feedback. ` +
        `Run tests and verify the fixes are correct.`;
      const qaResult = await qa.run(context, qaDesc);
      this.store.saveArtifact(this.runId, `rework_qa_v${iteration + 1}`, qaResult.artifact);
      qaSpinner.succeed("Re-verification complete");
    }

    return "request_changes";
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/review/process.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/review/process.ts tests/review/process.test.ts
git commit -m "feat: add ReviewProcess with parallel reviews, arbiter, and rework loop"
```

---

## Chunk 4: Wire Review into Pipeline

### Task 6: Modify PipelineRunner to delegate review stage to ReviewProcess

**Files:**
- Modify: `src/pipeline/runner.ts`
- Modify: `tests/pipeline/runner.test.ts`

- [ ] **Step 1: Add test for review stage detection**

Append to `tests/pipeline/runner.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PipelineRunner } from "../../src/pipeline/runner.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
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

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
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

    const runner = new PipelineRunner(store, runId, "workspace context", 3);
    const ctx = runner.assembleAgentContext("architecture");

    expect(ctx).toContain("# Task");
    expect(ctx).toContain("# Analysis");
    expect(ctx).not.toContain("# Architecture");
  });

  it("builds task description with previous artifacts summary", () => {
    const runId = store.createRun("Add user auth");
    store.saveArtifact(runId, "intake", "# Task\nAdd user auth");
    store.saveArtifact(runId, "analysis", "# Analysis\nReq 1: Login page");

    const runner = new PipelineRunner(store, runId, "ctx", 3);
    const taskDesc = runner.buildTaskDescription("architecture", "Add user auth");

    expect(taskDesc).toContain("Add user auth");
    expect(taskDesc).toContain("analysis");
  });

  it("identifies review stage as special", () => {
    const runId = store.createRun("test");
    const runner = new PipelineRunner(store, runId, "ctx", 3);
    expect(runner.isReviewStage("review")).toBe(true);
    expect(runner.isReviewStage("testing")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify new test fails**

Run: `npx vitest run tests/pipeline/runner.test.ts`
Expected: FAIL — `isReviewStage` is not a function

- [ ] **Step 3: Update PipelineRunner**

Replace the full contents of `src/pipeline/runner.ts`:

```typescript
// src/pipeline/runner.ts
import chalk from "chalk";
import ora from "ora";
import type { Stage, PipelineConfig, StageResult } from "./types.js";
import { STAGE_ORDER } from "./types.js";
import { buildPipelineStages, type PlannedStage } from "./pipeline.js";
import { promptCheckpoint } from "./checkpoint.js";
import { createAgentByName } from "../agents/registry.js";
import { ArtifactStore } from "../artifacts/store.js";
import { ReviewProcess } from "../review/process.js";

const ARTIFACT_STAGES: string[] = ["intake", ...STAGE_ORDER];

export class PipelineRunner {
  private readonly store: ArtifactStore;
  private readonly runId: string;
  private readonly workspaceContext: string;
  private readonly maxReviewIterations: number;

  constructor(
    store: ArtifactStore,
    runId: string,
    workspaceContext: string,
    maxReviewIterations: number,
  ) {
    this.store = store;
    this.runId = runId;
    this.workspaceContext = workspaceContext;
    this.maxReviewIterations = maxReviewIterations;
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

  isReviewStage(stage: string): boolean {
    return stage === "review";
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
      let result: StageResult | null;

      if (this.isReviewStage(planned.stage)) {
        result = await this.runReviewStage(planned, task);
      } else {
        result = await this.runStage(planned, task);
      }

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

  private async runReviewStage(planned: PlannedStage, task: string): Promise<StageResult | null> {
    const startTime = Date.now();

    try {
      const reviewProcess = new ReviewProcess(
        this.store,
        this.runId,
        this.workspaceContext,
        this.maxReviewIterations,
      );

      const verdict = await reviewProcess.run(task);
      const durationMs = Date.now() - startTime;

      console.log(
        chalk.green(`Review complete: ${verdict} (${(durationMs / 1000).toFixed(1)}s)`),
      );

      const artifact = this.store.readArtifact(this.runId, "review") ?? "";

      return {
        stage: planned.stage,
        artifact,
        agentName: "review-process",
        durationMs,
      };
    } catch (error) {
      console.log(chalk.red("Review stage failed"));
      this.store.updateStatus(this.runId, "failed");
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pipeline/runner.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/runner.ts tests/pipeline/runner.test.ts
git commit -m "feat: integrate ReviewProcess into pipeline runner for review stage"
```

---

### Task 7: Update run command to pass maxReviewIterations

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Update the PipelineRunner constructor call**

In `src/cli/commands/run.ts`, find the line:

```typescript
      const runner = new PipelineRunner(store, runId, contextPrompt);
```

Replace with:

```typescript
      const maxReviewIterations = workspaceConfig.pipelineSettings.maxReviewIterations;
      const runner = new PipelineRunner(store, runId, contextPrompt, maxReviewIterations);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat: pass maxReviewIterations from workspace config to pipeline runner"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (should be ~80+ tests across 19+ files)

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Verify CLI**

Run: `npx tsx src/cli/index.ts run --help`
Expected: Shows all options

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: verify review system build and tests pass"
```

# Agentrium — Design Document

Multi-agent orchestrator for software development: from task to approved PR.

## Overview

CLI tool (TypeScript/Node.js) where a Project Manager agent orchestrates specialized sub-agents through a pipeline. Each agent has a role, tools, and produces a markdown artifact. Checkpoints between stages allow human approval.

## Agent Roles

| Role | Stage | Notes |
|---|---|---|
| Product Manager | ANALYSIS | Requirements, acceptance criteria |
| UX Designer | DESIGN | Optional, frontend tasks only |
| Architect | ARCHITECTURE | Two-phase: high-level approach, then detailed design |
| Software Engineer | IMPLEMENTATION | Code changes |
| QA Engineer | TESTING | Tests, verification |
| Technical Writer | DOCUMENTATION | Optional, README/API docs/changelog |
| Code Reviewers (2) | REVIEW | #1 logic/bugs, #2 security/conventions. Run in parallel |
| Review Arbiter | REVIEW | Deduplication, conflict resolution, final verdict |

Future: DevOps/Release Engineer agent for CI/CD and IaC changes.

## Pipeline

```
INTAKE -> ANALYSIS -> [DESIGN] -> ARCHITECTURE -> IMPLEMENTATION -> TESTING -> [DOCUMENTATION] -> REVIEW -> COMPLETE
```

`[Brackets]` = optional stages. Project Manager decides inclusion based on task type. Each transition is a checkpoint (configurable: all, none, or specific stages).

## Context — Three Layers

### Layer 1: Project config (static)

`AGENTRIUM.md` in the workspace (not in repo root). Markdown format, human-readable:

```markdown
# Workspace: math-on-canvas

## Repositories
- [math-on-canvas-auth](~/workspace/math-on-canvas-auth) — authentication service
- [math-on-canvas-app](~/workspace/math-on-canvas-app) — frontend SPA

## Tech Stack
- TypeScript, Node.js 22, ESM
- AWS Lambda, DynamoDB, Cognito

## Conventions
See [CLAUDE.md](~/workspace/math-on-canvas-auth/CLAUDE.md)

## Pipeline Settings
- Checkpoints: analysis, architecture, review
- Max review iterations: 3
- Skip stages: ux_design

## Knowledge Sources
- [Business context](docs/business-context.md)
- MCP: Notion workspace https://notion.so/...
```

### Layer 2: Auto-analysis (dynamic)

On each run, Project Manager scans repos for:
- Directory structure
- Stack markers (package.json, pyproject.toml/uv.lock, *.csproj/*.sln, go.mod, Cargo.toml, pom.xml/build.gradle)
- README.md, CLAUDE.md — project description, conventions
- Recent commits (git log)
- Open PRs/issues

### Layer 3: External sources (pluggable)

Via MCP servers: Notion, Confluence, Jira, Obsidian, or any other MCP-compatible source. Configured in AGENTRIUM.md Knowledge Sources section.

## Agent Architecture

### Each agent = three things

1. **System prompt** — role, focus, output style (stored in `prompts/*.md`)
2. **Tools** — minimal privilege set per role
3. **Output schema** — artifact structure

### Tools by role

| Role | Tools |
|---|---|
| Project Manager | All tools + pipeline management |
| Product Manager | Read files, search code, web search, ask user |
| UX Designer | Read files, web search, ask user |
| Architect | Read files, search code, grep, git log, ask user |
| Software Engineer | Read files, write files, edit files, run commands, git |
| QA Engineer | Read files, write files, edit files, run commands (tests) |
| Technical Writer | Read files, write files, edit files |
| Code Reviewers | Read files, search code, grep, git diff |
| Review Arbiter | Read review artifacts only |

### Artifacts

```
.agentrium/runs/<run-id>/
  ├── 01-intake.md
  ├── 02-analysis.md
  ├── 03-design.md           # optional
  ├── 04-architecture.md
  ├── 05-implementation.md
  ├── 06-testing.md
  ├── 07-documentation.md    # optional
  ├── 08-review.md
  └── meta.json
```

### Handoff mechanism

Project Manager (state machine): determine stage -> build context (AGENTRIUM.md + repo context + previous artifacts) -> launch sub-agent via Claude Agent SDK -> receive artifact -> save -> checkpoint if configured -> next stage.

## Code Review Process

Two reviewers work in parallel:
- **Reviewer 1 (Logic & Correctness):** bugs, edge cases, race conditions, business logic, performance
- **Reviewer 2 (Security & Conventions):** OWASP, dependencies, project conventions, code style

### Comment format

```markdown
## Comment N
- **File:** path:line
- **Severity:** critical | major | minor | nit
- **Category:** bug | security | convention | performance | readability
- **Description:** ...
- **Suggestion:** ...
```

### Review Arbiter

1. Deduplication — merge identical findings
2. Conflict resolution — decide with reasoning
3. Prioritization — sort by severity
4. Verdict: Approve / Approve with nits / Request changes

### Rework cycle

On Request changes: Arbiter produces mandatory fix list -> Software Engineer fixes -> QA Engineer re-verifies -> Reviewers re-review (changed code only) -> Arbiter new verdict. Max 3 iterations, then human checkpoint.

## CLI Interface

```bash
agentrium init                          # interactive workspace setup
agentrium run "task description"        # run from text
agentrium run --from issue github:owner/repo#123
agentrium run --from file spec.md
agentrium status                        # current stage, artifacts
agentrium approve                       # approve checkpoint
agentrium reject "reason"               # reject with comment
agentrium abort                         # abort run
agentrium runs                          # list all runs
agentrium show <run-id>                 # run details
agentrium show <run-id> --stage 4       # specific artifact
agentrium workspaces                    # list workspaces
```

### Checkpoint UI

Interactive prompt at each checkpoint: [a] Approve, [r] Reject, [e] Edit & resubmit, [s] Skip stage, [v] View previous stages.

## Workspace Model

Workspace = logical grouping of repos, not physical directory structure. Stored in `~/.agentrium/workspaces/<name>/AGENTRIUM.md`.

`agentrium init` interactively selects repos from current directory. Multiple workspaces can reference repos from the same directory. Single-repo is a workspace with one repo.

Auto-detection: running `agentrium run` inside a repo that belongs to a workspace uses that workspace automatically.

## Tech Stack (MVP)

- Runtime: Node.js 22, TypeScript, ESM
- CLI: commander
- LLM: Claude Agent SDK (@anthropic-ai/agent-sdk)
- Git: simple-git
- Terminal: chalk, ora
- LLM abstraction: providers/ with LLMProvider interface (Anthropic-only for MVP)

## Project Structure

```
agentrium/
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── commands/ (init, run, status, approve)
│   │   └── ui/ (checkpoint.ts)
│   ├── orchestrator/
│   │   ├── projectManager.ts
│   │   ├── pipeline.ts
│   │   └── checkpoints.ts
│   ├── agents/
│   │   ├── base.ts
│   │   ├── productManager.ts
│   │   ├── uxDesigner.ts
│   │   ├── architect.ts
│   │   ├── softwareEngineer.ts
│   │   ├── qaEngineer.ts
│   │   ├── technicalWriter.ts
│   │   ├── codeReviewer.ts
│   │   └── reviewArbiter.ts
│   ├── context/
│   │   ├── repoAnalyzer.ts
│   │   ├── configParser.ts
│   │   └── contextBuilder.ts
│   ├── tools/
│   │   ├── fileSystem.ts
│   │   ├── git.ts
│   │   ├── search.ts
│   │   ├── shell.ts
│   │   └── web.ts
│   ├── artifacts/
│   │   ├── store.ts
│   │   └── templates.ts
│   └── providers/
│       ├── llmProvider.ts
│       └── anthropic.ts
├── prompts/ (*.md per agent role)
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

## Roadmap

### Phase 1 — MVP
- CLI tool
- Checkpoint-based pipeline
- Anthropic (Claude) only
- Local files + AGENTRIUM.md as context
- Manual run via `agentrium run`

### Phase 2 — Expansion
- Pluggable LLM providers (OpenAI, Google, local models)
- MCP servers for external sources (Notion, Confluence, Jira, Obsidian)
- Configurable checkpoints (all -> selective -> fully autonomous)
- DevOps/Release Engineer agent
- Agent parallelization where possible

### Phase 3 — Platform
- GitHub App / bot — trigger pipeline from issues, PR comments
- Web dashboard — pipeline visualization, artifact browser, run history
- Team collaboration — multiple users, approval permissions
- Metrics — time per stage, review iterations, code quality tracking

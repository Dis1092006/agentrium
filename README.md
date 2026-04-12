# Agentrium

Multi-agent orchestrator for software development. Runs a task through a pipeline of specialized AI agents — from requirements analysis to code review — with human checkpoints between stages.

## Requirements

- Node.js 24+
- [Claude Code](https://claude.ai/code) subscription (used for agent authentication)
- [GitHub CLI (`gh`)](https://cli.github.com/) — required for git integration and Copilot review

## Installation

```bash
npm install -g agentrium
```

## Quick Start

```bash
# 1. Initialize a workspace in your project directory
cd ~/workspace/my-project
agentrium init

# 2. Run a task
agentrium run "Add user authentication with JWT"
```

## How It Works

Each task runs through a pipeline of specialized agents:

```
analysis → architecture → implementation → testing → review
```

Optional stages can be included on demand:

```
analysis → design → architecture → implementation → testing → documentation → review
```

At each checkpoint (configurable), you can approve, reject, skip, or view the agent's output before proceeding.

The **review** stage runs two agents in parallel (Logic Reviewer + Security Reviewer), then a Review Arbiter merges their findings into a final verdict. If changes are requested, a rework cycle runs automatically (Software Engineer fixes → QA re-verifies → re-review), up to a configurable maximum.

### Git integration

When a target repository is configured, agentrium automatically:

1. Creates a branch (`agentrium/<task-slug>`) in the target repo
2. Commits implementation and test changes after those stages
3. Creates a pull request before the review stage

### GitHub Copilot review (optional)

When `Copilot review: true` is set, agentrium requests a GitHub Copilot review on the PR and waits for inline comments. Copilot's findings are passed to the Review Arbiter alongside the Logic and Security reviewers. After each rework iteration the branch is pushed and Copilot is re-requested. Inline replies are posted back to each Copilot comment based on the Arbiter's dispositions.

Requires GitHub Copilot Enterprise or a plan that includes Copilot code review.

## Commands

### `agentrium init`

Scan a directory for git repositories and create a workspace config.

```bash
agentrium init
agentrium init --name my-ws --dir ~/projects
```

After init, edit `~/.agentrium/workspaces/<name>/AGENTRIUM.md` to configure your workspace:

```markdown
# Workspace: my-project

## Repositories
- [my-project](~/workspace/my-project) — main application

## Tech Stack
- TypeScript, Node.js 24, PostgreSQL

## Conventions
See CLAUDE.md

## Pipeline Settings
- Checkpoints: analysis, architecture, review
- Max review iterations: 3
- Agent timeout minutes: 30
- Copilot review: false
- Copilot review timeout minutes: 5
- Skip stages: design, documentation
```

### `agentrium run <task>`

Run a task through the agent pipeline.

```bash
agentrium run "Add password reset flow"
agentrium run "Fix null pointer in auth middleware"
agentrium run "Add login page" --include design
agentrium run "Add API docs" --include documentation
agentrium run "Quick fix" --no-checkpoints
agentrium run "Fix bug" --workspace my-other-ws
```

**Checkpoint controls** (shown at each checkpoint):
- `[a]` Approve — continue to next stage
- `[r]` Reject — abort the pipeline
- `[s]` Skip — skip to the next stage (current stage artifact is still saved)
- `[v]` View — print the saved artifact for the current stage

### `agentrium resume <run-id>`

Resume an interrupted pipeline run from where it left off.

```bash
agentrium resume run_abc123
agentrium resume run_abc123 --workspace my-ws
```

Completed stages are skipped automatically. If the run finished but no PR was created (e.g. due to a network error), the resume command will push the branch and open the PR.

### `agentrium workspaces`

List all configured workspaces.

```bash
agentrium workspaces
```

### `agentrium runs`

List all runs for the current workspace.

```bash
agentrium runs
agentrium runs --workspace my-ws
```

### `agentrium show <run-id>`

Show run details or a specific stage artifact.

```bash
agentrium show run_abc123
agentrium show run_abc123 --stage analysis
agentrium show run_abc123 --stage implementation
agentrium show run_abc123 --stage review
```

### `agentrium status`

Show the latest run for the current workspace.

```bash
agentrium status
agentrium status --workspace my-ws
```

## Agents

| Stage | Agent | Optional |
|---|---|---|
| `analysis` | Product Manager | no |
| `design` | UX Designer | yes (`--include design`) |
| `architecture` | Architect | no |
| `implementation` | Software Engineer | no |
| `testing` | QA Engineer | no |
| `documentation` | Technical Writer | yes (`--include documentation`) |
| `review` | Logic Reviewer + Security Reviewer + Arbiter (+ Copilot) | no |

## Artifacts

All run artifacts are saved to:

```
~/.agentrium/workspaces/<name>/runs/<run-id>/
  01-intake.md
  02-analysis.md
  03-design.md
  04-architecture.md
  05-implementation.md
  06-testing.md
  07-documentation.md
  08-review.md
  meta.json
```

## Development

To build and run from source:

```bash
git clone https://github.com/Dis1092006/agentrium.git
cd agentrium
npm install
npm run build
npm link
```

After `npm link`, the `agentrium` command points to your local build. Run tests with:

```bash
npm test
```

## License

ISC

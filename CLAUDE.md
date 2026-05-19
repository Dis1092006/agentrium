# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — compile TypeScript to `dist/` (output is what the published `agentrium` bin runs).
- `npm run dev -- <args>` — run the CLI from source via `tsx` (e.g. `npm run dev -- run "task"`).
- `npm test` — run the Vitest suite once (`tests/**/*.test.ts`).
- `npm run test:watch` — Vitest in watch mode.
- Single test: `npx vitest run tests/pipeline/runner.test.ts` or filter by name with `-t "<pattern>"`.
- `npm link` after `npm run build` exposes the locally-built `agentrium` binary on PATH.

Requires Node.js ≥ 24 and the GitHub CLI (`gh`) for git/Copilot features.

## Architecture

Agentrium is a CLI that drives a software task through a fixed pipeline of LLM agents, each invoked via `@anthropic-ai/claude-agent-sdk`. The whole runtime is local; there is no server.

### Layered structure

- `src/cli/` — Commander-based entrypoint (`index.ts`) and one file per subcommand under `commands/` (`init`, `run`, `resume`, `runs`, `show`, `status`, `workspaces`). `createProgram()` wires them up; `index.ts` only calls `parse()` when invoked as a script.
- `src/workspace/manager.ts` — owns the `~/.agentrium/workspaces/<name>/` layout: `AGENTRIUM.md` config + `runs/<run-id>/` artifact dirs. `init` scans a directory for `.git` subfolders and seeds the workspace.
- `src/context/` — parses `AGENTRIUM.md` (`configParser.ts`), inspects target repos (`repoAnalyzer.ts`), and produces the workspace context prompt that every agent receives (`contextBuilder.ts`).
- `src/pipeline/` — the orchestrator.
  - `types.ts` defines `Stage` and `STAGE_ORDER` (`analysis → design → architecture → implementation → testing → documentation → review`). `design` and `documentation` are optional and gated by `--include`.
  - `pipeline.ts:buildPipelineStages` filters stages by config + opt-ins and maps each `Stage` to an agent name (`STAGE_AGENT_MAP`).
  - `runner.ts:PipelineRunner` is the heart: for each planned stage it assembles a context prompt from the workspace + every previously-saved artifact, runs the agent, persists the artifact, prompts a checkpoint (`checkpoint.ts`), and triggers git operations at the right boundaries (commit after implementation/testing, push + open PR before review).
  - The review stage is special-cased: it delegates to `src/review/process.ts:ReviewProcess`, which runs Logic + Security reviewers in parallel, optionally requests a GitHub Copilot review (`src/github/copilotReview.ts`), and feeds all findings to a Review Arbiter. If the arbiter requests changes, the runner loops back through Software Engineer → QA → review up to `maxReviewIterations`.
- `src/agents/` — one file per agent role plus `base.ts` (the SDK wrapper that builds the system prompt, applies a timeout via `AbortController`, and returns the final assistant text) and `registry.ts` (the name → factory map). System prompts live in `prompts/*.md` and are loaded by each agent factory.
- `src/artifacts/store.ts` — file-backed store for run artifacts (`NN-<stage>.md`) and `meta.json`. The stage order constant `ARTIFACT_STAGES` in `runner.ts` (`["intake", ...STAGE_ORDER]`) defines the numbering and the previous-stage walk used by `assembleAgentContext`.
- `src/git/operations.ts` — `simple-git` + `gh` helpers. Multi-repo aware: each repo in the workspace gets its own branch/commit/PR. `slugifyTask` derives the `agentrium/<slug>` branch name.

### Two cross-cutting things to know

1. **Agents are stateless and prompt-driven.** Each stage gets the workspace context plus the markdown of every prior artifact concatenated under `## Previous Stage: <name>` headers. To change what a stage "sees", change `assembleAgentContext` or the artifact filenames, not the agent code.
2. **Resume is idempotent against the artifact store.** `resume <run-id>` rebuilds the planned stages from config and skips any whose artifact already exists; if all stages are done but no PR was opened (network failure mid-run), it will still push and open the PR. Don't add side effects to stages that aren't gated by an artifact check.
3. **Stages can be pre-seeded.** `agentrium run --seed <stage>=<file> --start-from <stage>` writes the file's contents as the artifact for that stage **before** the pipeline starts and slices `STAGE_ORDER` so the run begins at `--start-from`. The Software Engineer (or any later agent) still receives the seeded markdown through `assembleAgentContext` as `## Previous Stage: <name>`. Seeded stages are recorded in `meta.json` (`seededStages`, `startFrom`). `review` cannot be seeded; `intake`, if seeded, replaces the default task+context envelope.

### Tests

`tests/` mirrors `src/` one-to-one. Tests use Vitest and mock the Anthropic SDK rather than calling it. When adding a new stage or agent, add a corresponding folder under `tests/`.

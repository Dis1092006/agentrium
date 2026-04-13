import { describe, it, expect } from "vitest";
import { parseAgentriumMd } from "../../src/context/configParser.js";

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

const SAMPLE_MD_WITH_TIMEOUT = `# Workspace: test-project

## Pipeline Settings
- Agent timeout minutes: 60
`;

const SAMPLE_MD_NO_DESCRIPTION = `# Workspace: test-project

## Repositories
- [python-battleship](C:\\git\\github\\experiments\\python-battleship)
`;

describe("parseAgentriumMd", () => {
  it("parses workspace name", () => {
    const config = parseAgentriumMd(SAMPLE_MD);
    expect(config.name).toBe("test-project");
  });

  it("parses repositories", () => {
    const config = parseAgentriumMd(SAMPLE_MD);
    expect(config.repositories).toHaveLength(2);
    expect(config.repositories[0]).toEqual({
      name: "my-api",
      path: "~/workspace/my-api",
      description: "REST API service",
    });
  });

  it("parses repository entry without description", () => {
    const config = parseAgentriumMd(SAMPLE_MD_NO_DESCRIPTION);
    expect(config.repositories).toHaveLength(1);
    expect(config.repositories[0]).toEqual({
      name: "python-battleship",
      path: "C:\\git\\github\\experiments\\python-battleship",
      description: "",
    });
  });

  it("parses tech stack", () => {
    const config = parseAgentriumMd(SAMPLE_MD);
    expect(config.techStack).toEqual([
      "TypeScript, Node.js 22",
      "React, Vite",
    ]);
  });

  it("parses pipeline settings", () => {
    const config = parseAgentriumMd(SAMPLE_MD);
    expect(config.pipelineSettings.checkpoints).toEqual([
      "analysis",
      "architecture",
      "review",
    ]);
    expect(config.pipelineSettings.maxReviewIterations).toBe(3);
    expect(config.pipelineSettings.skipStages).toEqual(["ux_design"]);
  });

  it("defaults agentTimeoutMinutes to 30 when not specified", () => {
    const config = parseAgentriumMd(SAMPLE_MD);
    expect(config.pipelineSettings.agentTimeoutMinutes).toBe(30);
  });

  it("parses agentTimeoutMinutes when specified", () => {
    const config = parseAgentriumMd(SAMPLE_MD_WITH_TIMEOUT);
    expect(config.pipelineSettings.agentTimeoutMinutes).toBe(60);
  });

  it("keeps default agentTimeoutMinutes when value is malformed", () => {
    const md = `# Workspace: test-project\n\n## Pipeline Settings\n- Agent timeout minutes: abc\n`;
    const config = parseAgentriumMd(md);
    expect(config.pipelineSettings.agentTimeoutMinutes).toBe(30);
  });

  it("parses knowledge sources", () => {
    const config = parseAgentriumMd(SAMPLE_MD);
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

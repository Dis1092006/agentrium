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

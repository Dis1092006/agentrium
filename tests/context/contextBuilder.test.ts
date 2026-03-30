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

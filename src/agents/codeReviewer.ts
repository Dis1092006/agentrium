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

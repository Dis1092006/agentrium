// src/agents/technicalWriter.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/technicalWriter.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a Technical Writer. Produce developer-facing documentation for completed features.";
  }
}

export function createTechnicalWriter(): BaseAgent {
  return new BaseAgent({
    name: "technical-writer",
    description: "Produces developer-facing documentation: README updates, API docs, changelog",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Write", "Edit", "Glob"],
  });
}

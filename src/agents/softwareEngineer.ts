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

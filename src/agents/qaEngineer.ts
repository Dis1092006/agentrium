import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/qaEngineer.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a QA Engineer agent. Write and run tests to verify the implementation.";
  }
}

export function createQAEngineer(): BaseAgent {
  return new BaseAgent({
    name: "qa-engineer",
    description: "Writes and runs tests to verify implementation meets requirements",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
  });
}

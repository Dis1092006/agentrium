import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/architect.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are an Architect agent. Design the technical approach for the given requirements.";
  }
}

export function createArchitect(): BaseAgent {
  return new BaseAgent({
    name: "architect",
    description: "Designs technical approach and implementation plan",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Glob", "Grep"],
  });
}

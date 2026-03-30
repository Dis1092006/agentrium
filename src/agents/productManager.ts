import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/productManager.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a Product Manager agent. Analyze the task and produce requirements.";
  }
}

export function createProductManager(): BaseAgent {
  return new BaseAgent({
    name: "product-manager",
    description: "Analyzes tasks and produces requirements with acceptance criteria",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Glob", "Grep", "WebSearch"],
  });
}

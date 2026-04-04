import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/uxDesigner.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a UX Designer. Produce UI/UX design specifications for frontend tasks.";
  }
}

export function createUxDesigner(): BaseAgent {
  return new BaseAgent({
    name: "ux-designer",
    description: "Produces UI/UX design specifications: user flows, screen layouts, interactions",
    systemPrompt: loadPrompt(),
    tools: ["Read", "Glob", "WebSearch"],
  });
}

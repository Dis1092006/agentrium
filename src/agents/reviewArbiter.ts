// src/agents/reviewArbiter.ts
import { BaseAgent } from "./base.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(): string {
  const promptPath = path.resolve(__dirname, "../../prompts/reviewArbiter.md");
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "You are a Review Arbiter. Deduplicate findings, resolve conflicts, and produce a verdict.";
  }
}

export function createReviewArbiter(): BaseAgent {
  return new BaseAgent({
    name: "review-arbiter",
    description: "Deduplicates review findings, resolves conflicts, and produces final verdict",
    systemPrompt: loadPrompt(),
    tools: ["Read"],
  });
}

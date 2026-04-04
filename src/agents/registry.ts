import { BaseAgent } from "./base.js";
import { createProductManager } from "./productManager.js";
import { createArchitect } from "./architect.js";
import { createSoftwareEngineer } from "./softwareEngineer.js";
import { createQAEngineer } from "./qaEngineer.js";
import { createLogicReviewer, createSecurityReviewer } from "./codeReviewer.js";
import { createReviewArbiter } from "./reviewArbiter.js";

type AgentFactory = () => BaseAgent;

const AGENT_FACTORIES: Record<string, AgentFactory> = {
  "product-manager": createProductManager,
  "architect": createArchitect,
  "software-engineer": createSoftwareEngineer,
  "qa-engineer": createQAEngineer,
  "code-reviewer-logic": createLogicReviewer,
  "code-reviewer-security": createSecurityReviewer,
  "review-arbiter": createReviewArbiter,
};

export function createAgentByName(name: string): BaseAgent {
  const factory = AGENT_FACTORIES[name];
  if (!factory) {
    throw new Error(`Unknown agent: "${name}"`);
  }
  return factory();
}

export function getRegisteredAgentNames(): string[] {
  return Object.keys(AGENT_FACTORIES);
}

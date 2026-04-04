// src/review/types.ts

export type ReviewVerdict = "approve" | "approve_with_nits" | "request_changes";

export interface ReviewComment {
  file: string;
  severity: "critical" | "major" | "minor" | "nit";
  category: "bug" | "security" | "convention" | "performance" | "readability";
  description: string;
  suggestion: string;
}

export function parseVerdict(arbiterOutput: string): ReviewVerdict {
  const lower = arbiterOutput.toLowerCase();

  const verdictMatch = lower.match(/##\s*verdict:\s*(.+)/);
  if (!verdictMatch) return "request_changes";

  const verdictText = verdictMatch[1].trim();

  if (verdictText.startsWith("approve with nits")) return "approve_with_nits";
  if (verdictText.startsWith("approve")) return "approve";
  if (verdictText.startsWith("request changes")) return "request_changes";

  return "request_changes";
}

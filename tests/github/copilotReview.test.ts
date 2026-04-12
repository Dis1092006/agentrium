import { describe, it, expect } from "vitest";
import {
  formatCopilotFindings,
  parseCopilotDispositions,
  extractPrNumber,
  type CopilotReview,
} from "../../src/github/copilotReview.js";

describe("formatCopilotFindings", () => {
  it("returns no-issues message when comments array is empty", () => {
    const review: CopilotReview = { reviewId: 1, comments: [] };
    expect(formatCopilotFindings(review)).toContain("no issues");
  });

  it("formats comments with id, file, and body", () => {
    const review: CopilotReview = {
      reviewId: 1,
      comments: [{ id: 42, path: "src/foo.ts", line: 10, body: "This looks wrong" }],
    };
    const output = formatCopilotFindings(review);
    expect(output).toContain("id:42");
    expect(output).toContain("src/foo.ts:10");
    expect(output).toContain("This looks wrong");
  });
});

describe("parseCopilotDispositions", () => {
  it("returns empty array when section is absent", () => {
    expect(parseCopilotDispositions("## Verdict\napprove")).toEqual([]);
  });

  it("parses ADDRESSED disposition", () => {
    const arbiter = `## Copilot Comment Dispositions\n- comment_id:123 → ADDRESSED: Fixed null check\n`;
    const replies = parseCopilotDispositions(arbiter);
    expect(replies).toHaveLength(1);
    expect(replies[0].commentId).toBe(123);
    expect(replies[0].body).toContain("✅ Addressed");
    expect(replies[0].body).toContain("Fixed null check");
  });

  it("parses REJECTED disposition", () => {
    const arbiter = `## Copilot Comment Dispositions\n- comment_id:456 → REJECTED: Intentional design\n`;
    const replies = parseCopilotDispositions(arbiter);
    expect(replies[0].body).toContain("❌ Won't fix");
  });

  it("parses NOTED disposition", () => {
    const arbiter = `## Copilot Comment Dispositions\n- comment_id:789 → NOTED: Will address later\n`;
    const replies = parseCopilotDispositions(arbiter);
    expect(replies[0].body).toContain("📝 Noted");
  });

  it("parses multiple dispositions", () => {
    const arbiter = `## Copilot Comment Dispositions\n- comment_id:1 → ADDRESSED: Done\n- comment_id:2 → REJECTED: By design\n`;
    expect(parseCopilotDispositions(arbiter)).toHaveLength(2);
  });
});

describe("extractPrNumber", () => {
  it("extracts PR number from standard GitHub URL", () => {
    expect(extractPrNumber("https://github.com/org/repo/pull/42")).toBe(42);
  });

  it("returns 0 for invalid URL", () => {
    expect(extractPrNumber("https://github.com/org/repo")).toBe(0);
  });
});

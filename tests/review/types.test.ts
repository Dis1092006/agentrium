// tests/review/types.test.ts
import { describe, it, expect } from "vitest";
import { parseVerdict, type ReviewVerdict } from "../../src/review/types.js";

describe("parseVerdict", () => {
  it("parses 'approve' verdict", () => {
    const text = "## Verdict: Approve\n\nAll looks good.";
    expect(parseVerdict(text)).toBe("approve");
  });

  it("parses 'approve_with_nits' verdict", () => {
    const text = "## Verdict: Approve with nits\n\nMinor issues only.";
    expect(parseVerdict(text)).toBe("approve_with_nits");
  });

  it("parses 'request_changes' verdict", () => {
    const text = "## Verdict: Request changes\n\nCritical bugs found.";
    expect(parseVerdict(text)).toBe("request_changes");
  });

  it("defaults to request_changes when verdict is unclear", () => {
    const text = "Some review text without a clear verdict.";
    expect(parseVerdict(text)).toBe("request_changes");
  });

  it("is case-insensitive", () => {
    const text = "## Verdict: APPROVE\n\nDone.";
    expect(parseVerdict(text)).toBe("approve");
  });
});

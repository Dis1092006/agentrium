import { describe, it, expect } from "vitest";

describe("resume command", () => {
  it("exports registerResumeCommand", async () => {
    const { registerResumeCommand } = await import("../../../src/cli/commands/resume.js");
    expect(typeof registerResumeCommand).toBe("function");
  });
});

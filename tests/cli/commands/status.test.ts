// tests/cli/commands/status.test.ts
import { describe, it, expect } from "vitest";

describe("status command", () => {
  it("status.ts module exports registerStatusCommand", async () => {
    const { registerStatusCommand } = await import("../../../src/cli/commands/status.js");
    expect(typeof registerStatusCommand).toBe("function");
  });
});

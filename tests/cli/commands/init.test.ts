import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";

describe("CLI", () => {
  it("registers init command", () => {
    const program = createProgram();
    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd).toBeDefined();
  });

  it("registers run command", () => {
    const program = createProgram();
    const runCmd = program.commands.find((c) => c.name() === "run");
    expect(runCmd).toBeDefined();
  });
});

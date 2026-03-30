import { describe, it, expect } from "vitest";
import { parseCheckpointInput } from "../../src/pipeline/checkpoint.js";

describe("parseCheckpointInput", () => {
  it("parses 'a' as approve", () => {
    expect(parseCheckpointInput("a")).toBe("approve");
  });

  it("parses 'approve' as approve", () => {
    expect(parseCheckpointInput("approve")).toBe("approve");
  });

  it("parses 'r' as reject", () => {
    expect(parseCheckpointInput("r")).toBe("reject");
  });

  it("parses 's' as skip", () => {
    expect(parseCheckpointInput("s")).toBe("skip");
  });

  it("parses 'v' as view", () => {
    expect(parseCheckpointInput("v")).toBe("view");
  });

  it("returns null for unknown input", () => {
    expect(parseCheckpointInput("x")).toBeNull();
    expect(parseCheckpointInput("")).toBeNull();
  });
});

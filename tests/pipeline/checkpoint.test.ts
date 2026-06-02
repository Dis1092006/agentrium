import { describe, it, expect } from "vitest";
import { parseCheckpointInput, ControlChannelCheckpointPrompter, raceCheckpoint, type CheckpointPrompter } from "../../src/pipeline/checkpoint.js";
import { ControlChannel } from "../../src/observability/controlChannel.js";
import { EventLogger } from "../../src/observability/eventLog.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

describe("checkpoint prompters", () => {
  it("ControlChannelCheckpointPrompter resolves from a control command", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-cp-"));
    const ctlFile = path.join(dir, "control.jsonl");
    fs.writeFileSync(ctlFile, "");
    const ch = new ControlChannel(ctlFile);
    ch.start();
    const log = new EventLogger(path.join(dir, "events.jsonl"));
    const prompter = new ControlChannelCheckpointPrompter(ch, log);

    const decision = prompter.prompt("analysis", "preview");
    fs.appendFileSync(ctlFile, JSON.stringify({ schemaVersion: 1, seq: 1, ts: "t", command: "reject", stage: "analysis" }) + "\n");
    await ch.processPending();
    expect(await decision).toBe("reject");
    ch.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("raceCheckpoint returns the first prompter to resolve", async () => {
    const fast: CheckpointPrompter = { prompt: async () => "approve" };
    const slow: CheckpointPrompter = { prompt: () => new Promise(() => {}) };
    expect(await raceCheckpoint([fast, slow], "analysis", "preview")).toBe("approve");
  });
});

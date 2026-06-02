import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ControlChannel } from "../../src/observability/controlChannel.js";
import { SCHEMA_VERSION, type ControlCommandName } from "@agentrium/contract";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-ctl-"));
  file = path.join(dir, "control.jsonl");
  fs.writeFileSync(file, "");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function send(command: ControlCommandName, stage?: string): void {
  const line = JSON.stringify({ schemaVersion: SCHEMA_VERSION, seq: Date.now(), ts: new Date().toISOString(), command, stage });
  fs.appendFileSync(file, line + "\n");
}

describe("ControlChannel", () => {
  it("awaitGateClear resolves immediately when neither paused nor stepping", async () => {
    const ch = new ControlChannel(file);
    ch.start();
    await ch.awaitGateClear(); // should not hang
    ch.stop();
  });

  it("resume clears a pause", async () => {
    const ch = new ControlChannel(file);
    ch.start();
    send("pause");
    await ch.processPending(); // test seam: force a read
    expect(ch.paused).toBe(true);
    const gate = ch.awaitGateClear();
    send("resume");
    await ch.processPending();
    await gate;
    expect(ch.paused).toBe(false);
    ch.stop();
  });

  it("step releases exactly one boundary and re-arms", async () => {
    const ch = new ControlChannel(file);
    ch.start();
    send("step_mode_on");
    await ch.processPending();
    expect(ch.stepMode).toBe(true);

    const first = ch.awaitGateClear();
    send("step");
    await ch.processPending();
    await first; // released once

    let secondResolved = false;
    ch.awaitGateClear().then(() => { secondResolved = true; });
    await ch.processPending();
    expect(secondResolved).toBe(false); // re-armed, still gated
    ch.stop();
  });

  it("step_mode_off clears the gate", async () => {
    const ch = new ControlChannel(file);
    ch.start();
    send("step_mode_on");
    await ch.processPending();
    const gate = ch.awaitGateClear();
    send("step_mode_off");
    await ch.processPending();
    await gate;
    ch.stop();
  });

  it("awaitDecision resolves with the checkpoint command", async () => {
    const ch = new ControlChannel(file);
    ch.start();
    const decision = ch.awaitDecision("analysis");
    send("approve", "analysis");
    await ch.processPending();
    expect(await decision).toBe("approve");
    ch.stop();
  });

  it("cancel aborts the signal and unblocks gates", async () => {
    const ch = new ControlChannel(file);
    ch.start();
    send("pause");
    await ch.processPending();
    const gate = ch.awaitGateClear();
    send("cancel");
    await ch.processPending();
    await gate; // cancel unblocks the gate
    expect(ch.cancelled).toBe(true);
    expect(ch.signal.aborted).toBe(true);
    ch.stop();
  });
});

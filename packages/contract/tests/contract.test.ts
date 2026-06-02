import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  SCHEMA_VERSION, EVENTS_FILE, CONTROL_FILE,
  eventsPathFor, controlPathFor,
  type EventRecord, type ControlCommand,
} from "../src/index.js";

describe("@agentrium/contract", () => {
  it("exposes a numeric schema version", () => {
    expect(typeof SCHEMA_VERSION).toBe("number");
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("builds per-run file paths", () => {
    expect(eventsPathFor("/runs/run_x")).toBe(`/runs/run_x/${EVENTS_FILE}`.replace(/\//g, path.sep));
    expect(controlPathFor("/runs/run_x")).toBe(`/runs/run_x/${CONTROL_FILE}`.replace(/\//g, path.sep));
  });

  it("parses a golden event line into EventRecord shape", () => {
    const line = JSON.stringify({
      schemaVersion: 1, seq: 0, ts: "2026-06-02T00:00:00.000Z",
      level: "stage", type: "stage_started", stage: "analysis",
    });
    const rec = JSON.parse(line) as EventRecord;
    expect(rec.type).toBe("stage_started");
    expect(rec.level).toBe("stage");
  });

  it("parses a golden control line into ControlCommand shape", () => {
    const cmd = JSON.parse(
      `{"schemaVersion":1,"seq":0,"ts":"2026-06-02T00:00:00.000Z","command":"approve","stage":"analysis"}`,
    ) as ControlCommand;
    expect(cmd.command).toBe("approve");
  });
});

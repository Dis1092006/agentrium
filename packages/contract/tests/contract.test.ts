import { describe, it, expect } from "vitest";
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

  it("builds per-run file paths under the run dir", () => {
    const eventsPath = eventsPathFor("/runs/run_x");
    expect(eventsPath.endsWith(EVENTS_FILE)).toBe(true);
    expect(eventsPath.includes("run_x")).toBe(true);

    const controlPath = controlPathFor("/runs/run_x");
    expect(controlPath.endsWith(CONTROL_FILE)).toBe(true);
    expect(controlPath.includes("run_x")).toBe(true);
  });

  it("parses a golden event line into EventRecord shape", () => {
    const line = JSON.stringify({
      schemaVersion: 1, seq: 0, ts: "2026-06-02T00:00:00.000Z",
      level: "stage", type: "stage_started", stage: "analysis",
    });
    const rec = JSON.parse(line) as EventRecord;
    expect(rec.type).toBe("stage_started");
    expect(rec.level).toBe("stage");
    expect(rec.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("parses a golden control line into ControlCommand shape", () => {
    const cmd = JSON.parse(
      `{"schemaVersion":1,"seq":0,"ts":"2026-06-02T00:00:00.000Z","command":"approve","stage":"analysis"}`,
    ) as ControlCommand;
    expect(cmd.command).toBe("approve");
  });
});

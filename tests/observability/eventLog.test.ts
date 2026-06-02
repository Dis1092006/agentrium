import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventLogger } from "../../src/observability/eventLog.js";
import { SCHEMA_VERSION, type EventRecord } from "@agentrium/contract";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-evt-"));
  file = path.join(dir, "events.jsonl");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function readLines(): EventRecord[] {
  return fs.readFileSync(file, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
}

describe("EventLogger", () => {
  it("writes one JSON line per event with monotonic seq, schemaVersion and ts", () => {
    const log = new EventLogger(file);
    log.emit("stage", "run_started");
    log.emit("stage", "stage_started", { stage: "analysis" });

    const lines = readLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ seq: 0, schemaVersion: SCHEMA_VERSION, level: "stage", type: "run_started" });
    expect(lines[1]).toMatchObject({ seq: 1, type: "stage_started", stage: "analysis" });
    expect(typeof lines[0].ts).toBe("string");
  });

  it("carries data payloads", () => {
    const log = new EventLogger(file);
    log.emit("activity", "tool_use", { stage: "implementation", data: { name: "Read", inputSummary: "foo.ts" } });
    expect(readLines()[0].data).toEqual({ name: "Read", inputSummary: "foo.ts" });
  });

  it("never throws when the target path is unwritable", () => {
    const log = new EventLogger(path.join(dir, "nope", "deep", "events.jsonl"));
    expect(() => log.emit("stage", "run_started")).not.toThrow();
  });
});

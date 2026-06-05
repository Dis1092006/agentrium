import fs from "node:fs";
import { SCHEMA_VERSION, type EventLevel, type EventType, type EventRecord } from "@agentrium/contract";

export class EventLogger {
  private seq = 0;
  constructor(private readonly filePath: string) {}

  emit(
    level: EventLevel,
    type: EventType,
    opts: { stage?: string; data?: Record<string, unknown> } = {},
  ): void {
    const record: EventRecord = {
      schemaVersion: SCHEMA_VERSION,
      seq: this.seq++,
      ts: new Date().toISOString(),
      level,
      type,
      ...(opts.stage ? { stage: opts.stage } : {}),
      ...(opts.data ? { data: opts.data } : {}),
    };
    try {
      fs.appendFileSync(this.filePath, JSON.stringify(record) + "\n");
    } catch {
      // Telemetry is best-effort; never break the run.
    }
  }
}

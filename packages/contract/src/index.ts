// The on-disk contract between an agentrium run (producer of events, consumer
// of control) and any observer (consumer of events, producer of control).
// Bump SCHEMA_VERSION on any breaking change to EventRecord/ControlCommand.

export const SCHEMA_VERSION = 1;

export const EVENTS_FILE = "events.jsonl";
export const CONTROL_FILE = "control.jsonl";

export type EventLevel = "stage" | "activity" | "raw";

export type EventType =
  | "run_started" | "run_completed" | "run_failed" | "run_aborted"
  | "stage_started" | "stage_completed" | "stage_skipped" | "stage_rejected"
  | "checkpoint_awaiting" | "checkpoint_decided"
  | "gate_paused" | "gate_resumed" | "step_awaiting" | "stepped"
  | "commit" | "push" | "pr_created"
  | "review_started" | "reviewer_verdict" | "arbiter_verdict" | "review_iteration"
  | "tool_use" | "tool_result" | "assistant_text"
  | "assistant_text_delta" | "sdk_message";

export interface EventRecord {
  schemaVersion: number;
  seq: number;
  ts: string; // ISO-8601
  level: EventLevel;
  type: EventType;
  stage?: string;
  data?: Record<string, unknown>;
}

export type ControlCommandName =
  | "approve" | "reject" | "skip"
  | "pause" | "resume"
  | "step_mode_on" | "step_mode_off" | "step"
  | "cancel";

export interface ControlCommand {
  schemaVersion: number;
  seq: number;
  ts: string;
  command: ControlCommandName;
  stage?: string;
}

import path from "node:path";

export function eventsPathFor(runDir: string): string {
  return path.join(runDir, EVENTS_FILE);
}

export function controlPathFor(runDir: string): string {
  return path.join(runDir, CONTROL_FILE);
}

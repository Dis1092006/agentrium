import fs from "node:fs";
import { controlPathFor, type ControlCommand } from "@agentrium/contract";
import type { CheckpointDecision } from "../pipeline/types.js";

export class ControlChannel {
  private _paused = false;
  private _stepMode = false;
  private _cancelled = false;
  private stepToken = 0;
  private cursor = 0; // byte offset already consumed
  private watcher: fs.FSWatcher | null = null;

  private readonly abort = new AbortController();
  private gateWaiters: Array<() => void> = [];
  private decisionWaiters: Array<(d: CheckpointDecision) => void> = [];

  constructor(private readonly filePath: string) {}

  static forRunDir(runDir: string): ControlChannel {
    return new ControlChannel(controlPathFor(runDir));
  }

  get paused(): boolean { return this._paused; }
  get stepMode(): boolean { return this._stepMode; }
  get cancelled(): boolean { return this._cancelled; }
  get signal(): AbortSignal { return this.abort.signal; }

  start(): void {
    this.processPending();
    try {
      this.watcher = fs.watch(this.filePath, () => this.processPending());
    } catch {
      // No watcher (e.g. file missing) — degrade silently; callers may still poll.
    }
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  /** Test seam + watcher callback: read and apply any new command lines. */
  async processPending(): Promise<void> {
    let content: string;
    try {
      content = fs.readFileSync(this.filePath, "utf-8");
    } catch {
      return; // best-effort
    }
    if (content.length <= this.cursor) return;
    const fresh = content.slice(this.cursor);
    this.cursor = content.length;
    for (const line of fresh.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let cmd: ControlCommand;
      try { cmd = JSON.parse(trimmed); } catch { continue; }
      this.apply(cmd);
    }
  }

  awaitGateClear(): Promise<void> {
    if (this.canPass()) { this.consumeStep(); return Promise.resolve(); }
    return new Promise((resolve) => this.gateWaiters.push(resolve));
  }

  awaitDecision(_stage: string): Promise<CheckpointDecision> {
    return new Promise((resolve) => this.decisionWaiters.push(resolve));
  }

  private apply(cmd: ControlCommand): void {
    switch (cmd.command) {
      case "pause": this._paused = true; break;
      case "resume": this._paused = false; break;
      case "step_mode_on": this._stepMode = true; break;
      case "step_mode_off": this._stepMode = false; break;
      case "step": this.stepToken += 1; break;
      case "cancel":
        this._cancelled = true;
        this.abort.abort();
        break;
      case "approve": case "reject": case "skip": {
        const waiter = this.decisionWaiters.shift();
        if (waiter) waiter(cmd.command as CheckpointDecision);
        break;
      }
    }
    this.releaseGatesIfClear();
  }

  private canPass(): boolean {
    if (this._cancelled) return true;
    if (this._paused) return false;
    if (this._stepMode) return this.stepToken > 0;
    return true;
  }

  private consumeStep(): void {
    if (!this._cancelled && this._stepMode && this.stepToken > 0) this.stepToken -= 1;
  }

  private releaseGatesIfClear(): void {
    while (this.gateWaiters.length > 0 && this.canPass()) {
      this.consumeStep();
      const waiter = this.gateWaiters.shift();
      waiter?.();
    }
  }
}

import fs from "node:fs";
import { controlPathFor, type ControlCommand } from "@agentrium/contract";
import type { CheckpointDecision } from "../pipeline/types.js";

export class ControlChannel {
  private _paused = false;
  private _stepMode = false;
  private _cancelled = false;
  private stepToken = 0;
  private cursor = 0; // char offset (UTF-16 code units) already consumed
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
    void this.processPending();
    try {
      // Windows fs.watch may miss/duplicate events; processPending is idempotent
      // (cursor-guarded), and callers may also poll.
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

  awaitDecision(_stage: string, signal?: AbortSignal): Promise<CheckpointDecision> {
    return new Promise((resolve) => {
      const waiter = (d: CheckpointDecision) => resolve(d);
      this.decisionWaiters.push(waiter);
      // If the caller loses a race (signal aborts), drop this waiter so a later
      // decision is not delivered to this dead promise. The promise stays
      // unresolved by design — the race already settled via the winner.
      signal?.addEventListener("abort", () => {
        const i = this.decisionWaiters.indexOf(waiter);
        if (i >= 0) this.decisionWaiters.splice(i, 1);
      }, { once: true });
    });
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
        // Resolve any pending checkpoint decision so a runner blocked on
        // awaitDecision aborts (reject) instead of hanging forever.
        while (this.decisionWaiters.length > 0) {
          this.decisionWaiters.shift()?.("reject");
        }
        break;
      case "approve": case "reject": case "skip": {
        // A decision with no pending waiter is discarded (fire-and-forget sender).
        const waiter = this.decisionWaiters.shift();
        if (waiter) waiter(cmd.command as CheckpointDecision);
        break;
      }
    }
    this.releaseGatesIfClear();
  }

  private canPass(): boolean {
    // After cancel, everything passes (and consumeStep is a no-op) so no waiter hangs.
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

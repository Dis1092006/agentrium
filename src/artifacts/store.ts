import fs from "fs";
import path from "path";
import crypto from "crypto";

const STAGE_FILES: Record<string, string> = {
  intake: "01-intake.md",
  analysis: "02-analysis.md",
  design: "03-design.md",
  architecture: "04-architecture.md",
  implementation: "05-implementation.md",
  testing: "06-testing.md",
  documentation: "07-documentation.md",
  review: "08-review.md",
};

export interface RunMeta {
  runId: string;
  task: string;
  status: "running" | "completed" | "failed" | "aborted";
  createdAt: string;
  stages: Record<string, { completedAt: string }>;
  workspaceName: string;
  includeOptional: string[];
  seededStages: string[];
  startFrom?: string;
  prUrl?: string;
  /** LLM-generated concise PR title; generated once and reused across repos and on resume. */
  prTitle?: string;
  /**
   * Snapshot of uncommitted files taken once at the start of the run, before
   * any agent edits: repo path → (file path → content hash). Used to scope
   * commits to files agentrium changed and to survive a resume in a fresh
   * process.
   */
  baselineDirty?: Record<string, Record<string, string>>;
}

export class ArtifactStore {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    fs.mkdirSync(baseDir, { recursive: true });
  }

  createRun(
    task: string,
    workspaceName: string = "",
    includeOptional: string[] = [],
    seededStages: string[] = [],
    startFrom?: string,
  ): string {
    const runId = `run_${crypto.randomBytes(6).toString("hex")}`;
    const runDir = path.join(this.baseDir, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const meta: RunMeta = {
      runId,
      task,
      status: "running",
      createdAt: new Date().toISOString(),
      stages: {},
      workspaceName,
      includeOptional,
      seededStages,
      startFrom,
    };
    fs.writeFileSync(path.join(runDir, "meta.json"), JSON.stringify(meta, null, 2));

    return runId;
  }

  runDir(runId: string): string {
    return path.join(this.baseDir, runId);
  }

  saveArtifact(runId: string, stage: string, content: string): void {
    const fileName = STAGE_FILES[stage] ?? `${stage}.md`;
    const filePath = path.join(this.baseDir, runId, fileName);
    fs.writeFileSync(filePath, content);

    const meta = this.readMeta(runId);
    meta.stages[stage] = { completedAt: new Date().toISOString() };
    this.writeMeta(runId, meta);
  }

  readArtifact(runId: string, stage: string): string | null {
    const fileName = STAGE_FILES[stage] ?? `${stage}.md`;
    const filePath = path.join(this.baseDir, runId, fileName);
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  readMeta(runId: string): RunMeta {
    const filePath = path.join(this.baseDir, runId, "meta.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return {
      workspaceName: "",
      includeOptional: [],
      seededStages: [],
      ...raw,
    };
  }

  removeStage(runId: string, stage: string): void {
    const meta = this.readMeta(runId);
    delete meta.stages[stage];
    this.writeMeta(runId, meta);
  }

  updateStatus(runId: string, status: RunMeta["status"]): void {
    const meta = this.readMeta(runId);
    meta.status = status;
    this.writeMeta(runId, meta);
  }

  updatePrUrl(runId: string, prUrl: string): void {
    const meta = this.readMeta(runId);
    meta.prUrl = prUrl;
    this.writeMeta(runId, meta);
  }

  setBaselineDirty(runId: string, baseline: Record<string, Record<string, string>>): void {
    const meta = this.readMeta(runId);
    meta.baselineDirty = baseline;
    this.writeMeta(runId, meta);
  }

  setPrTitle(runId: string, prTitle: string): void {
    const meta = this.readMeta(runId);
    meta.prTitle = prTitle;
    this.writeMeta(runId, meta);
  }

  listRuns(): RunMeta[] {
    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    const runs: RunMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("run_")) continue;
      try {
        runs.push(this.readMeta(entry.name));
      } catch {
        // skip corrupt runs
      }
    }

    return runs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private writeMeta(runId: string, meta: RunMeta): void {
    const filePath = path.join(this.baseDir, runId, "meta.json");
    fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
  }
}

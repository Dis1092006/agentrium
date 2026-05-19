// src/cli/seedOptions.ts
import type { Stage } from "../pipeline/types.js";
import { STAGE_ORDER } from "../pipeline/types.js";
import type { PlannedStage } from "../pipeline/pipeline.js";

export type SeedableStage = Stage | "intake";

const SEEDABLE_STAGES: ReadonlySet<string> = new Set<string>([
  "intake",
  ...STAGE_ORDER.filter((s) => s !== "review"),
]);

const STARTABLE_STAGES: ReadonlySet<string> = new Set<string>(
  STAGE_ORDER.filter((s) => s !== "review"),
);

export class SeedOptionError extends Error {}

export interface ParsedSeedOptions {
  seeds: Map<SeedableStage, string>;
  startFrom?: Stage;
}

export function parseSeedOptions(
  rawSeeds: string[] | undefined,
  rawStartFrom: string | undefined,
): ParsedSeedOptions {
  const seeds = new Map<SeedableStage, string>();

  for (const entry of rawSeeds ?? []) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx <= 0 || eqIdx === entry.length - 1) {
      throw new SeedOptionError(
        `Invalid --seed value "${entry}". Expected "<stage>=<path>".`,
      );
    }
    const stage = entry.slice(0, eqIdx);
    const value = entry.slice(eqIdx + 1);

    if (!SEEDABLE_STAGES.has(stage)) {
      const allowed = [...SEEDABLE_STAGES].join(", ");
      throw new SeedOptionError(
        `Cannot seed stage "${stage}". Seedable stages: ${allowed}.`,
      );
    }
    if (seeds.has(stage as SeedableStage)) {
      throw new SeedOptionError(
        `Duplicate --seed for stage "${stage}".`,
      );
    }
    seeds.set(stage as SeedableStage, value);
  }

  let startFrom: Stage | undefined;
  if (rawStartFrom !== undefined) {
    if (!STARTABLE_STAGES.has(rawStartFrom)) {
      const allowed = [...STARTABLE_STAGES].join(", ");
      throw new SeedOptionError(
        `Cannot --start-from "${rawStartFrom}". Allowed: ${allowed}.`,
      );
    }
    startFrom = rawStartFrom as Stage;
  }

  return { seeds, startFrom };
}

export function validateSeedCoverage(
  seeds: Map<SeedableStage, string>,
  startFrom: Stage | undefined,
  plannedFull: PlannedStage[],
): void {
  if (startFrom === undefined) return;

  const index = plannedFull.findIndex((p) => p.stage === startFrom);
  if (index === -1) {
    throw new SeedOptionError(
      `--start-from "${startFrom}" is not a planned stage. ` +
        `Planned: ${plannedFull.map((p) => p.stage).join(", ")}.`,
    );
  }

  for (let i = 0; i < index; i++) {
    const stage = plannedFull[i].stage;
    if (!seeds.has(stage)) {
      throw new SeedOptionError(
        `--start-from "${startFrom}" requires --seed for every preceding ` +
          `planned stage, but missing --seed for stage "${stage}".`,
      );
    }
  }
}

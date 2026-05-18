// tests/cli/seedOptions.test.ts
import { describe, it, expect } from "vitest";
import { parseSeedOptions, SeedOptionError } from "../../src/cli/seedOptions.js";

describe("parseSeedOptions", () => {
  it("returns empty seeds and undefined startFrom when no flags are passed", () => {
    const parsed = parseSeedOptions(undefined, undefined);
    expect(parsed.seeds.size).toBe(0);
    expect(parsed.startFrom).toBeUndefined();
  });

  it("parses a single --seed flag", () => {
    const parsed = parseSeedOptions(["architecture=./plan.md"], undefined);
    expect(parsed.seeds.get("architecture")).toBe("./plan.md");
  });

  it("parses multiple --seed flags", () => {
    const parsed = parseSeedOptions(
      ["analysis=./design.md", "architecture=./plan.md"],
      undefined,
    );
    expect(parsed.seeds.get("analysis")).toBe("./design.md");
    expect(parsed.seeds.get("architecture")).toBe("./plan.md");
  });

  it("parses --start-from", () => {
    const parsed = parseSeedOptions(undefined, "implementation");
    expect(parsed.startFrom).toBe("implementation");
  });

  it("preserves '=' characters inside the path value", () => {
    const parsed = parseSeedOptions(["architecture=./weird=name.md"], undefined);
    expect(parsed.seeds.get("architecture")).toBe("./weird=name.md");
  });

  it("accepts intake as a seedable stage", () => {
    const parsed = parseSeedOptions(["intake=./brief.md"], undefined);
    expect(parsed.seeds.get("intake")).toBe("./brief.md");
  });
});

describe("parseSeedOptions error cases", () => {
  it("rejects --seed with no '='", () => {
    expect(() => parseSeedOptions(["architecture"], undefined))
      .toThrow(SeedOptionError);
  });

  it("rejects --seed with empty stage", () => {
    expect(() => parseSeedOptions(["=./plan.md"], undefined))
      .toThrow(SeedOptionError);
  });

  it("rejects --seed with empty path", () => {
    expect(() => parseSeedOptions(["architecture="], undefined))
      .toThrow(SeedOptionError);
  });

  it("rejects --seed for review", () => {
    expect(() => parseSeedOptions(["review=./out.md"], undefined))
      .toThrow(/Cannot seed stage "review"/);
  });

  it("rejects --seed for unknown stage", () => {
    expect(() => parseSeedOptions(["foo=./bar.md"], undefined))
      .toThrow(/Cannot seed stage "foo"/);
  });

  it("rejects duplicate --seed for the same stage", () => {
    expect(() => parseSeedOptions(
      ["analysis=./a.md", "analysis=./b.md"],
      undefined,
    )).toThrow(/Duplicate --seed/);
  });

  it("rejects --start-from review", () => {
    expect(() => parseSeedOptions(undefined, "review"))
      .toThrow(/Cannot --start-from "review"/);
  });

  it("rejects --start-from intake", () => {
    expect(() => parseSeedOptions(undefined, "intake"))
      .toThrow(/Cannot --start-from "intake"/);
  });

  it("rejects --start-from unknown stage", () => {
    expect(() => parseSeedOptions(undefined, "magic"))
      .toThrow(/Cannot --start-from "magic"/);
  });
});

import { validateSeedCoverage } from "../../src/cli/seedOptions.js";
import type { PlannedStage } from "../../src/pipeline/pipeline.js";

function planned(stages: string[]): PlannedStage[] {
  return stages.map((s) => ({
    stage: s as any,
    agentName: "x",
    hasCheckpoint: false,
  }));
}

describe("validateSeedCoverage", () => {
  it("is a no-op when startFrom is undefined", () => {
    expect(() =>
      validateSeedCoverage(new Map(), undefined, planned(["analysis", "review"])),
    ).not.toThrow();
  });

  it("passes when every preceding planned stage is seeded", () => {
    const seeds = new Map<string, string>([
      ["analysis", "./a.md"],
      ["architecture", "./b.md"],
    ]);
    expect(() =>
      validateSeedCoverage(
        seeds as any,
        "implementation",
        planned(["analysis", "architecture", "implementation", "testing", "review"]),
      ),
    ).not.toThrow();
  });

  it("passes when a preceding stage is absent from the planned list (i.e. already skipped via config)", () => {
    expect(() =>
      validateSeedCoverage(
        new Map() as any,
        "implementation",
        planned(["implementation", "testing", "review"]),
      ),
    ).not.toThrow();
  });

  it("throws when a preceding planned stage has no seed", () => {
    const seeds = new Map<string, string>([["architecture", "./b.md"]]);
    expect(() =>
      validateSeedCoverage(
        seeds as any,
        "implementation",
        planned(["analysis", "architecture", "implementation"]),
      ),
    ).toThrow(/missing --seed for stage "analysis"/);
  });

  it("throws when startFrom is not in the planned list", () => {
    expect(() =>
      validateSeedCoverage(
        new Map() as any,
        "design",
        planned(["analysis", "architecture", "implementation"]),
      ),
    ).toThrow(/--start-from "design" is not a planned stage/);
  });
});

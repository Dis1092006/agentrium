// tests/git/messages.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const queryImpl = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: unknown) => queryImpl(args),
}));

import {
  sanitizeTitle,
  fallbackPrTitle,
  fallbackCommitMessage,
  generatePrTitle,
  generateCommitMessage,
} from "../../src/git/messages.js";

function yields(result: string) {
  return () =>
    (async function* () {
      yield { type: "assistant", content: "..." };
      yield { result };
    })();
}

describe("git messages — pure helpers", () => {
  it("sanitizeTitle strips quotes, prefixes, trailing period, and collapses whitespace", () => {
    expect(sanitizeTitle('"feat: add login."')).toBe("feat: add login");
    expect(sanitizeTitle("Title: Fix the bug")).toBe("Fix the bug");
    expect(sanitizeTitle("  multiple   spaces  ")).toBe("multiple spaces");
  });

  it("sanitizeTitle takes the first non-empty line", () => {
    expect(sanitizeTitle("\n\nfeat: do thing\nmore detail")).toBe("feat: do thing");
  });

  it("sanitizeTitle caps length", () => {
    const long = "feat: " + "x".repeat(200);
    expect(sanitizeTitle(long).length).toBeLessThanOrEqual(72);
  });

  it("fallbackPrTitle tidies a multiline Russian task to its first line", () => {
    const title = fallbackPrTitle("Добавь валидацию email\nна форме регистрации");
    expect(title).toBe("Добавь валидацию email");
  });

  it("fallbackCommitMessage is neutral and never restates the task", () => {
    expect(fallbackCommitMessage(1, "feat", "implementation")).toBe("feat: implementation changes (1 file)");
    expect(fallbackCommitMessage(3, "test", "testing")).toBe("test: testing changes (3 files)");
  });
});

describe("generatePrTitle", () => {
  beforeEach(() => queryImpl.mockReset());

  it("returns the sanitized LLM output", async () => {
    queryImpl.mockImplementation(yields('"feat: add email validation to signup"'));
    const title = await generatePrTitle("Добавь валидацию email на форме регистрации");
    expect(title).toBe("feat: add email validation to signup");
  });

  it("falls back to the tidied task when the LLM call fails", async () => {
    queryImpl.mockImplementation(() => (async function* () { throw new Error("sdk down"); })());
    const title = await generatePrTitle("Добавь валидацию email\nеще строка");
    expect(title).toBe("Добавь валидацию email");
  });
});

describe("generateCommitMessage", () => {
  let repoDir: string;

  beforeEach(() => {
    queryImpl.mockReset();
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrium-msg-"));
    execSync("git init", { cwd: repoDir });
    execSync('git config user.email "t@t.com"', { cwd: repoDir });
    execSync('git config user.name "T"', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "README.md"), "# Test");
    execSync("git add .", { cwd: repoDir });
    execSync('git commit -m "init"', { cwd: repoDir });
  });

  afterEach(() => fs.rmSync(repoDir, { recursive: true }));

  it("builds a message from the diff and stages new files so they appear in it", async () => {
    let seenPrompt = "";
    queryImpl.mockImplementation((args: { prompt: string }) => {
      seenPrompt = args.prompt;
      return (async function* () { yield { result: "feat: add greeting helper" }; })();
    });
    fs.writeFileSync(path.join(repoDir, "greet.ts"), "export const hi = () => 'hi';");

    const msg = await generateCommitMessage(repoDir, ["greet.ts"], { type: "feat", stage: "implementation" });

    expect(msg).toBe("feat: add greeting helper");
    // The new file's content reached the prompt (i.e. it was staged for the diff)
    expect(seenPrompt).toContain("greet.ts");
    expect(seenPrompt).toContain("export const hi");
  });

  it("falls back to a neutral message when the LLM call fails", async () => {
    queryImpl.mockImplementation(() => (async function* () { throw new Error("sdk down"); })());
    fs.writeFileSync(path.join(repoDir, "a.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(repoDir, "b.ts"), "export const b = 2;");

    const msg = await generateCommitMessage(repoDir, ["a.ts", "b.ts"], { type: "feat", stage: "implementation" });
    expect(msg).toBe("feat: implementation changes (2 files)");
  });
});

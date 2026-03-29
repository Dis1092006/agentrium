import fs from "fs";
import path from "path";
import type { RepoContext } from "./types.js";

interface StackMarker {
  file: string;
  stack: string[];
}

const STACK_MARKERS: StackMarker[] = [
  { file: "tsconfig.json", stack: ["typescript"] },
  { file: "package.json", stack: ["node"] },
  { file: "uv.lock", stack: ["python", "uv"] },
  { file: "pyproject.toml", stack: ["python"] },
  { file: "requirements.txt", stack: ["python"] },
  { file: "Pipfile", stack: ["python"] },
  { file: "go.mod", stack: ["go"] },
  { file: "Cargo.toml", stack: ["rust"] },
  { file: "pom.xml", stack: ["java"] },
  { file: "build.gradle", stack: ["java"] },
  { file: "build.gradle.kts", stack: ["kotlin"] },
];

export function detectStack(repoPath: string): string[] {
  const detected = new Set<string>();
  const entries = fs.readdirSync(repoPath);

  for (const marker of STACK_MARKERS) {
    if (entries.includes(marker.file)) {
      for (const s of marker.stack) detected.add(s);
    }
  }

  if (entries.some((e) => e.endsWith(".csproj") || e.endsWith(".sln"))) {
    detected.add("dotnet");
  }

  return [...detected];
}

export function getDirectoryTree(repoPath: string, maxDepth: number = 3): string {
  const lines: string[] = [];
  buildTree(repoPath, "", 0, maxDepth, lines);
  return lines.join("\n");
}

function buildTree(dir: string, prefix: string, depth: number, maxDepth: number, lines: string[]): void {
  if (depth >= maxDepth) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`);

    if (entry.isDirectory()) {
      buildTree(path.join(dir, entry.name), prefix + childPrefix, depth + 1, maxDepth, lines);
    }
  }
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function analyzeRepo(repoPath: string): Promise<RepoContext> {
  const name = path.basename(repoPath);
  const stack = detectStack(repoPath);
  const structure = getDirectoryTree(repoPath);
  const conventions = readFileIfExists(path.join(repoPath, "CLAUDE.md"))
    ?? readFileIfExists(path.join(repoPath, "CONVENTIONS.md"));

  let recentCommits: string[] = [];
  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(repoPath);
    const log = await git.log({ maxCount: 10 });
    recentCommits = log.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`);
  } catch {
    // Not a git repo or git not available
  }

  return { name, path: repoPath, stack, structure, conventions, recentCommits };
}

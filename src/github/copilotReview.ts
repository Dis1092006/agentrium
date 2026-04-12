// src/github/copilotReview.ts
import { execFileSync } from "child_process";

export interface CopilotComment {
  id: number;
  path: string;
  line: number;
  body: string;
}

export interface CopilotReview {
  reviewId: number;
  comments: CopilotComment[];
}

export interface CommentReply {
  commentId: number;
  body: string;
}

const COPILOT_LOGIN = "copilot-pull-request-reviewer";
const DEFAULT_POLL_INTERVAL_MS = 10_000;

function getRepoInfo(repoPath: string): { owner: string; repo: string } {
  const output = execFileSync(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    { cwd: repoPath, encoding: "utf-8" },
  );
  const [owner, repo] = output.trim().split("/");
  return { owner, repo };
}

export function requestCopilotReview(repoPath: string, prNumber: number): void {
  const { owner, repo } = getRepoInfo(repoPath);
  execFileSync(
    "gh",
    [
      "api",
      "-XPOST",
      `/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
      "--field",
      `reviewers[]=${COPILOT_LOGIN}`,
    ],
    { cwd: repoPath },
  );
}

export async function waitForCopilotReview(
  repoPath: string,
  prNumber: number,
  timeoutMs: number,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
): Promise<CopilotReview | null> {
  const { owner, repo } = getRepoInfo(repoPath);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const reviews = JSON.parse(
      execFileSync(
        "gh",
        ["api", `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`],
        { cwd: repoPath, encoding: "utf-8" },
      ),
    ) as Array<{ id: number; user: { login: string }; state: string }>;

    const copilotReview = reviews.find((r) => r.user.login === COPILOT_LOGIN);
    if (copilotReview) {
      const rawComments = JSON.parse(
        execFileSync(
          "gh",
          ["api", `/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${copilotReview.id}/comments`],
          { cwd: repoPath, encoding: "utf-8" },
        ),
      ) as Array<{ id: number; path: string; line?: number; original_line?: number; body: string }>;

      const comments: CopilotComment[] = rawComments.map((c) => ({
        id: c.id,
        path: c.path,
        line: c.line ?? c.original_line ?? 0,
        body: c.body,
      }));

      return { reviewId: copilotReview.id, comments };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return null;
}

export function postCommentReplies(
  repoPath: string,
  prNumber: number,
  replies: CommentReply[],
): void {
  const { owner, repo } = getRepoInfo(repoPath);
  for (const reply of replies) {
    try {
      execFileSync(
        "gh",
        [
          "api",
          "-XPOST",
          `/repos/${owner}/${repo}/pulls/comments/${reply.commentId}/replies`,
          "--field",
          `body=${reply.body}`,
        ],
        { cwd: repoPath },
      );
    } catch {
      // Don't fail the pipeline if a reply can't be posted
    }
  }
}

export function formatCopilotFindings(review: CopilotReview): string {
  if (review.comments.length === 0) {
    return "GitHub Copilot reviewed the code and found no issues.";
  }

  const lines = ["GitHub Copilot inline review comments:\n"];
  for (const comment of review.comments) {
    lines.push(`### Comment (id:${comment.id})`);
    lines.push(`- **File:** ${comment.path}:${comment.line}`);
    lines.push(`- **Body:** ${comment.body}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function parseCopilotDispositions(arbiterOutput: string): CommentReply[] {
  const replies: CommentReply[] = [];
  const section = arbiterOutput.match(/##\s+Copilot Comment Dispositions\s*\n([\s\S]*?)(?=\n##|$)/);
  if (!section) return replies;

  const lines = section[1].split("\n").filter((l) => l.trim().startsWith("-"));
  for (const line of lines) {
    const match = line.match(/comment_id:(\d+)\s*→\s*(ADDRESSED|REJECTED|NOTED):\s*(.+)/i);
    if (match) {
      const [, id, disposition, explanation] = match;
      const verb = disposition.toUpperCase() === "ADDRESSED" ? "✅ Addressed" :
                   disposition.toUpperCase() === "REJECTED"  ? "❌ Won't fix" : "📝 Noted";
      replies.push({
        commentId: parseInt(id),
        body: `${verb}: ${explanation.trim()}`,
      });
    }
  }
  return replies;
}

export function extractPrNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull(?:s)?\/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

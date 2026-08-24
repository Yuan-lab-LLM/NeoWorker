/**
 * Lightweight context inference for personality context-aware behavior.
 * Detects whether the user is coding, chatting, planning, writing, or researching
 * to apply context-specific personality overrides.
 */

import type { ContextMode } from "../../shared/types";

const CODING_KEYWORDS = [
  "function",
  "class",
  "import",
  "export",
  "const",
  "let",
  "var",
  "return",
  "async",
  "await",
  "def ",
  "fn ",
  "=>",
  "=>",
  "{}",
  "()",
  "fix",
  "bug",
  "error",
  "compile",
  "test",
  "refactor",
  "implement",
  "code",
  "script",
  "api",
  "endpoint",
  "database",
  "schema",
  "migration",
  "npm",
  "yarn",
  "pip",
  "docker",
  "git",
  "commit",
  "merge",
  "branch",
];

const WRITING_KEYWORDS = [
  "write",
  "draft",
  "email",
  "letter",
  "blog",
  "article",
  "document",
  "proposal",
  "report",
  "summary",
  "outline",
  "paragraph",
  "sentence",
  "grammar",
  "proofread",
  "edit",
  "rewrite",
  "copy",
  "content",
  "marketing",
];

const RESEARCH_KEYWORDS = [
  "research",
  "find",
  "search",
  "look up",
  "investigate",
  "compare",
  "analyze",
  "study",
  "explore",
  "discover",
  "what is",
  "how does",
  "why does",
  "explain",
  "understand",
  "learn about",
  "background",
  "context",
  "survey",
  "review",
];

const PLANNING_KEYWORDS = [
  "plan",
  "strategy",
  "roadmap",
  "milestone",
  "sprint",
  "task",
  "todo",
  "schedule",
  "prioritize",
  "break down",
  "steps",
  "approach",
  "design",
  "architecture",
  "think through",
  "consider",
  "options",
  "trade-off",
  "decide",
];

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}

/**
 * Detect context mode from prompt text, conversation mode, and active tools.
 * Returns "all" when no specific mode is detected (base personality, no overrides).
 */
export function detectContextMode(
  prompt: string,
  conversationMode?: string,
  activeTools?: string[],
): ContextMode {
  if (conversationMode === "think") {
    return "planning";
  }

  const tools = activeTools ?? [];
  const hasCodingTools = tools.some((t) =>
    ["read_file", "write_file", "search_replace", "run_terminal_cmd", "list_dir", "grep"].some(
      (c) => t.includes(c),
    ),
  );

  const text = (prompt ?? "").trim();
  if (!text && !conversationMode) {
    return "all";
  }

  const codingScore = countMatches(text, CODING_KEYWORDS);
  const writingScore = countMatches(text, WRITING_KEYWORDS);
  const researchScore = countMatches(text, RESEARCH_KEYWORDS);
  const planningScore = countMatches(text, PLANNING_KEYWORDS);

  if (conversationMode === "chat" && codingScore < 2 && writingScore < 1 && researchScore < 1) {
    return "chat";
  }

  const scores: [ContextMode, number][] = [
    ["coding", codingScore + (hasCodingTools ? 1 : 0)],
    ["writing", writingScore],
    ["research", researchScore],
    ["planning", planningScore],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [topMode, topScore] = scores[0];

  if (topScore >= 2) {
    return topMode;
  }

  return "all";
}

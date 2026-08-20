/**
 * Spawn Intent Detection
 *
 * Detects prompts that request spawning subagents/agents (e.g. "spawn 3 subagents",
 * "spawn agents", "spawn sub-agents"). When matched, collaborative mode should
 * be auto-enabled so the whole process is handled by the collaborative team flow.
 */

/**
 * Patterns that indicate the user wants to spawn subagents/agents.
 * Two patterns cover all variants:
 *   1. "spawn [N] sub[-]agent[s]" — subagents form (with optional count/hyphen/plural)
 *   2. "spawn [N] agent[s]"        — plain agents form (with optional count/plural)
 */
const SPAWN_INTENT_PATTERNS = [
  /\bspawn\s+(?:\d+\s+)?sub\s*[-]?agents?\b/i,
  /\bspawn\s+(?:\d+\s+)?agents?\b/i,
];

/**
 * Returns true if the given text (title + prompt) indicates the user wants to
 * spawn subagents or agents. When true, collaborative mode should be enabled
 * before any other processing.
 */
export function isSpawnSubagentsPrompt(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return SPAWN_INTENT_PATTERNS.some((p) => p.test(trimmed));
}

/** Patterns to extract explicit agent count (e.g. "spawn 2 subagents" -> 2) */
const SPAWN_COUNT_PATTERNS = [
  /\bspawn\s+(\d+)\s+sub\s*[-]?agents?\b/i,
  /\bspawn\s+(\d+)\s+agents?\b/i,
];

/**
 * Extracts the requested number of agents from the prompt, if explicitly stated.
 * E.g. "spawn 2 subagents" -> 2, "spawn 3 agents" -> 3.
 * Returns null if no explicit number is found.
 */
export function parseSpawnAgentCount(text: string): number | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const p of SPAWN_COUNT_PATTERNS) {
    const m = trimmed.match(p);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
    }
  }
  return null;
}

import type { LLMTool } from "../llm/types";

export interface ToolSearchMatch {
  name: string;
  score: number;
  description: string;
}

function tokenize(value: string): string[] {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export class ToolSearchService {
  constructor(private readonly tools: LLMTool[]) {}

  search(query: string, limit = 10): ToolSearchMatch[] {
    const queryTokens = new Set(tokenize(query));
    return this.tools
      .map((tool) => {
        const haystack = `${tool.name} ${tool.description} ${(tool.runtime?.capabilityTags || []).join(" ")}`;
        const score = tokenize(haystack).reduce((total, token) => {
          return total + (queryTokens.has(token) ? 1 : 0);
        }, 0);
        return {
          name: tool.name,
          description: tool.description,
          score,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, limit);
  }
}

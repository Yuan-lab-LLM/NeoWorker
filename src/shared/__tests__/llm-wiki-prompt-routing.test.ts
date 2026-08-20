import { describe, expect, it } from "vitest";
import { parseNaturalLlmWikiPrompt } from "../llm-wiki-prompt-routing";

describe("llm-wiki natural prompt routing", () => {
  it("matches a GUI-style research vault request with an objective", () => {
    const result = parseNaturalLlmWikiPrompt(
      "Build a persistent Obsidian-friendly research vault for GRPO papers and tradeoffs.",
    );

    expect(result.matched).toBe(true);
    expect(result.objective).toBe("GRPO papers and tradeoffs");
    expect(result.obsidian).toBe("on");
    expect(result.args).toBe('"GRPO papers and tradeoffs" --obsidian on');
  });

  it("matches the starter-card prompt even when the topic is not supplied yet", () => {
    const result = parseNaturalLlmWikiPrompt(
      "Build a persistent Obsidian-friendly research vault in this workspace. If I have not given the topic yet, ask me for it first. Preserve raw sources, create linked notes, and keep the index, inbox, and log current.",
    );

    expect(result.matched).toBe(true);
    expect(result.objective).toBe("");
    expect(result.obsidian).toBe("on");
    expect(result.args).toBe("--obsidian on");
  });

  it("infers lint mode for vault audit prompts", () => {
    const result = parseNaturalLlmWikiPrompt(
      "Audit my research vault for broken links, stale pages, and orphan notes.",
    );

    expect(result.matched).toBe(true);
    expect(result.mode).toBe("lint");
    expect(result.args).toBe("--mode lint");
  });

  it("matches query-style GUI prompts for answering from the vault", () => {
    const result = parseNaturalLlmWikiPrompt(
      "Use the research vault in this workspace to answer a question. If I have not asked the question yet, ask me for it first.",
    );

    expect(result.matched).toBe(true);
    expect(result.mode).toBe("query");
    expect(result.args).toBe("--mode query");
  });

  it("does not hijack one-off summary requests", () => {
    const result = parseNaturalLlmWikiPrompt(
      "Give me a one-off summary of this article. Do not save anything durable to a research vault.",
    );

    expect(result.matched).toBe(false);
  });
});

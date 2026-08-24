import { describe, expect, it, vi } from "vitest";

vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockReturnValue({ changes: 1 }),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      close: vi.fn(),
    })),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/test-neoworker"),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
}));

import { MessageRouter } from "../router";
import { parseLeadingSkillSlashCommand } from "../../../shared/skill-slash-commands";

function createMockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 1 }),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    }),
    transaction: vi.fn((fn: Any) => fn),
  } as Any;
}

describe("MessageRouter skill slash serialization", () => {
  it("preserves llm-wiki objective and path semantics when values need quoting", () => {
    const router = new MessageRouter(createMockDb(), {}, undefined);
    const parsed = parseLeadingSkillSlashCommand(
      '/llm-wiki "research --mode notes" --mode ingest --path "Research Vault/GRPO Notes" --obsidian on',
    );
    expect(parsed.matched).toBe(true);
    expect(parsed.error).toBeUndefined();

    const serialized = (router as Any).serializeParsedSkillSlashCommand(parsed.parsed);
    expect(serialized).toBe(
      '/llm-wiki "research --mode notes" --mode ingest --path "Research Vault/GRPO Notes" --obsidian on',
    );

    const reparsed = parseLeadingSkillSlashCommand(serialized);
    expect(reparsed.matched).toBe(true);
    expect(reparsed.error).toBeUndefined();
    expect(reparsed.parsed).toEqual(parsed.parsed);
  });
});

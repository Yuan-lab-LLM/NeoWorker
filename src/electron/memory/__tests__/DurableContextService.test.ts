import { createRequire } from "module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurableContextService } from "../DurableContextService";
import { MemoryFeaturesManager } from "../../settings/memory-features-manager";

const databases: Array<import("better-sqlite3").Database> = [];

const require = createRequire(import.meta.url);
const BetterSqlite3Module = (() => {
  try {
    return require("better-sqlite3") as typeof import("better-sqlite3");
  } catch {
    return null;
  }
})();

const BetterSqlite3 = (() => {
  if (!BetterSqlite3Module) return null;
  try {
    const probe = new BetterSqlite3Module(":memory:");
    probe.close();
    return BetterSqlite3Module;
  } catch {
    return null;
  }
})();

const describeWithNativeDb = BetterSqlite3 ? describe : describe.skip;

function enableDurableContext(): void {
  vi.spyOn(MemoryFeaturesManager, "loadSettings").mockReturnValue({
    durableContextEnabled: true,
    durableContextMode: "experimental",
    durableContextLargePayloadThreshold: 20,
  });
}

function disableDurableContext(): void {
  vi.spyOn(MemoryFeaturesManager, "loadSettings").mockReturnValue({
    durableContextEnabled: false,
    durableContextMode: "off",
  });
}

function createDb(): import("better-sqlite3").Database {
  if (!BetterSqlite3) throw new Error("better-sqlite3 unavailable");
  const db = new BetterSqlite3(":memory:");
  databases.push(db);
  DurableContextService.setDatabaseForTests(db);
  return db;
}

afterEach(() => {
  DurableContextService.setDatabaseForTests(null);
  for (const db of databases.splice(0)) {
    db.close();
  }
  vi.restoreAllMocks();
});

describeWithNativeDb("DurableContextService", () => {
  it("records searchable task messages without re-indexing injected memory blocks", () => {
    enableDurableContext();
    createDb();

    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-1",
      source: "test",
      messages: [
        { role: "user", content: "Remember the alpha migration constraint." },
        {
          role: "assistant",
          content: "<neoworker_recall_hints>\nUse search_memories.\n</neoworker_recall_hints>",
        },
        { role: "assistant", content: "We chose the beta rollout path." },
      ],
    });

    const hits = DurableContextService.search({
      workspaceId: "ws-1",
      taskId: "task-1",
      query: "alpha migration",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe("message");
    expect(hits[0]?.snippet).toContain("alpha migration constraint");

    const injectedHits = DurableContextService.search({
      workspaceId: "ws-1",
      taskId: "task-1",
      query: "neoworker_recall_hints",
    });
    expect(injectedHits).toHaveLength(0);
  });

  it("does not re-index durable context tool result payloads", () => {
    enableDurableContext();
    createDb();

    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-1",
      source: "test",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call-context-grep",
              content: JSON.stringify({
                results: [
                  {
                    id: "dcm_existing",
                    kind: "message",
                    taskId: "task-1",
                    snippet: "Project codename: Lantern Harbor",
                  },
                ],
                totalFound: 1,
              }),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call-shell",
              content: "shell output mentions Lantern Harbor as a file name",
            },
          ],
        },
      ],
    });

    const hits = DurableContextService.search({
      workspaceId: "ws-1",
      taskId: "task-1",
      query: "Lantern Harbor",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snippet).toContain("shell output");
    expect(hits[0]?.snippet).not.toContain("dcm_existing");
  });

  it("prefers direct facts over execution wrapper messages", () => {
    enableDurableContext();
    createDb();

    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-1",
      source: "test",
      messages: [
        { role: "user", content: "Execute this step: Lantern Harbor" },
        { role: "assistant", content: "Lantern Harbor" },
      ],
    });

    const hits = DurableContextService.search({
      workspaceId: "ws-1",
      taskId: "task-1",
      query: "Lantern Harbor",
    });
    expect(hits[0]?.snippet).toBe("assistant: Lantern Harbor");
  });

  it("keeps durable searches scoped to the requested task", () => {
    enableDurableContext();
    createDb();

    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-source",
      source: "test",
      messages: [{ role: "user", content: "The rollback phrase is blue anchor." }],
    });
    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-other",
      source: "test",
      messages: [{ role: "user", content: "This task has no rollback phrase." }],
    });

    expect(
      DurableContextService.search({
        workspaceId: "ws-1",
        taskId: "task-other",
        query: "blue anchor",
      }),
    ).toEqual([]);
    expect(
      DurableContextService.search({
        workspaceId: "ws-1",
        taskId: "task-source",
        query: "blue anchor",
      }),
    ).toHaveLength(1);
  });

  it("stores compaction summaries linked back to source messages", () => {
    enableDurableContext();
    createDb();

    const summaryId = DurableContextService.recordCompactionSummary({
      workspaceId: "ws-1",
      taskId: "task-1",
      removedMessages: [
        { role: "user", content: "We investigated old workspace search behavior." },
        { role: "assistant", content: "The key tradeoff was retrieval precision." },
      ],
      summaryBlock:
        "<neoworker_compaction_summary>\nSummary-only marker: build a source-linked tree index.\n</neoworker_compaction_summary>",
      contextLabel: "test compaction",
    });

    expect(summaryId).toMatch(/^dcs_/);
    const hits = DurableContextService.search({
      workspaceId: "ws-1",
      taskId: "task-1",
      query: "source-linked tree",
    });
    expect(hits[0]?.id).toBe(summaryId);
    expect(hits[0]?.kind).toBe("summary");
    expect(hits[0]?.sourceMessageCount).toBe(2);

    const described = DurableContextService.describe({
      workspaceId: "ws-1",
      taskId: "task-1",
      id: summaryId || "",
    });
    expect(described?.kind).toBe("summary");
    expect(described?.text).toContain("source-linked tree index");
    expect(described?.text).not.toContain("neoworker_compaction_summary");
    expect(described?.sourceMessages).toHaveLength(2);
    expect(described?.sourceMessages?.[0]?.text).toContain("old workspace search");
  });

  it("does not read or write durable context while disabled", () => {
    disableDurableContext();
    createDb();

    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-1",
      source: "test",
      messages: [{ role: "user", content: "Do not persist this disabled message." }],
    });

    expect(
      DurableContextService.search({
        workspaceId: "ws-1",
        taskId: "task-1",
        query: "disabled message",
      }),
    ).toEqual([]);
  });

  it("stores large messages by reference while keeping a retrievable preview", () => {
    enableDurableContext();
    createDb();

    const longText = Array.from({ length: 120 }, (_, index) => `payload-${index}`).join(" ");
    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-1",
      source: "test",
      messages: [{ role: "assistant", content: longText }],
    });

    const hits = DurableContextService.search({
      workspaceId: "ws-1",
      taskId: "task-1",
      query: "payload-1",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snippet).toContain("large_payload_ref");

    const described = DurableContextService.describe({
      workspaceId: "ws-1",
      taskId: "task-1",
      id: hits[0]?.id || "",
    });
    expect(described?.largePayload?.id).toMatch(/^dcp_/);
    expect(described?.largePayload?.preview).toContain("payload-119");
  });

  it("links overlapping summaries into a parent DAG", () => {
    enableDurableContext();
    const db = createDb();

    const firstSummary = DurableContextService.recordCompactionSummary({
      workspaceId: "ws-1",
      taskId: "task-1",
      removedMessages: [
        { role: "user", content: "alpha decision one" },
        { role: "assistant", content: "alpha decision two" },
      ],
      summaryBlock: "Alpha summary",
    });
    const secondSummary = DurableContextService.recordCompactionSummary({
      workspaceId: "ws-1",
      taskId: "task-1",
      removedMessages: [
        { role: "user", content: "alpha decision one" },
        { role: "assistant", content: "alpha decision two" },
        { role: "user", content: "alpha decision three" },
      ],
      summaryBlock: "Rolled up alpha summary",
    });

    const parent = db
      .prepare(
        `SELECT parent_summary_id
         FROM durable_context_summary_parents
         WHERE summary_id = ?`,
      )
      .get(secondSummary) as { parent_summary_id?: string } | undefined;
    expect(parent?.parent_summary_id).toBe(firstSummary);
    const described = DurableContextService.describe({
      workspaceId: "ws-1",
      taskId: "task-1",
      id: secondSummary || "",
    });
    expect(described?.depth).toBe(1);
  });

  it("clears durable context for a workspace", () => {
    enableDurableContext();
    createDb();

    DurableContextService.recordHistory({
      workspaceId: "ws-1",
      taskId: "task-1",
      source: "test",
      messages: [{ role: "user", content: "erase this durable context" }],
    });

    expect(DurableContextService.clearWorkspace("ws-1")).toBeGreaterThan(0);
    expect(
      DurableContextService.search({
        workspaceId: "ws-1",
        taskId: "task-1",
        query: "erase this",
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { createToolBatchSummaryGenerator } from "../ToolBatchSummaryGenerator";
import type { ToolScheduleCallReport } from "../ToolScheduler";

function makeReport(
  name: string,
  id: string,
  options?: {
    input?: Record<string, unknown>;
    content?: string;
  },
): ToolScheduleCallReport {
  return {
    call: {
      index: Number(id),
      toolUse: {
        type: "tool_use",
        id,
        name,
        input: options?.input || {},
      },
    },
    effectiveToolName: name,
    status: "executed",
    toolResult: {
      type: "tool_result",
      tool_use_id: id,
      content: options?.content || "",
    },
  };
}

describe("ToolBatchSummaryGenerator", () => {
  it("falls back to a deterministic label for tiny batches", async () => {
    const generator = createToolBatchSummaryGenerator();

    const result = await generator.generateSummary({
      phase: "step",
      callReports: [makeReport("read_file", "1")],
      disableModel: true,
    });

    expect(result.source).toBe("fallback");
    expect(result.semanticSummary).toBe("Read File");
  });

  it("uses the assistant intent when provided", async () => {
    const generator = createToolBatchSummaryGenerator();

    const result = await generator.generateSummary({
      phase: "follow_up",
      callReports: [makeReport("search_files", "1"), makeReport("grep", "2")],
      assistantIntent: "review release notes",
      disableModel: true,
    });

    expect(result.semanticSummary).toBe("Review Release Notes");
  });

  it("ignores assistant intent for single-tool batches", async () => {
    const generator = createToolBatchSummaryGenerator();

    const result = await generator.generateSummary({
      phase: "verification",
      callReports: [makeReport("search_sessions", "1")],
      assistantIntent: "exit status is `0`",
      disableModel: true,
    });

    expect(result.semanticSummary).toBe("Check Task History");
  });

  it("falls back to a deterministic family label when assistant intent is long narrative prose", async () => {
    const generator = createToolBatchSummaryGenerator();

    const result = await generator.generateSummary({
      phase: "step",
      callReports: [makeReport("read_file", "1"), makeReport("list_directory", "2")],
      assistantIntent:
        "I’m checking the workspace for what this task is referring to, then validating the context.",
      disableModel: true,
    });

    expect(result.semanticSummary).toBe("Inspect Workspace");
  });

  it("does not surface structured task history payloads in single-tool labels", async () => {
    const generator = createToolBatchSummaryGenerator();

    const result = await generator.generateSummary({
      phase: "step",
      callReports: [
        makeReport("task_history", "1", {
          input: { period: "today" },
          content:
            'Task History {success:true,period:today,range:{startMs:177594840,endMs:177603480,startIso:"2026-04-12T00:00:00.000Z"}}',
        }),
      ],
      disableModel: true,
    });

    expect(result.semanticSummary).toBe("Check Task History");
  });
});

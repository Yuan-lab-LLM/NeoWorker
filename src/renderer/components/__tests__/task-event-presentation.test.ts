import { describe, expect, it } from "vitest";

import { getCompletionSummaryText } from "../MainContent/task-event-presentation";

describe("getCompletionSummaryText", () => {
  it("does not append an internal semantic tool summary to a delivered answer", () => {
    const text = getCompletionSummaryText({
      id: "completed-1",
      taskId: "task-1",
      timestamp: 1,
      type: "timeline_step_finished",
      payload: {
        legacyType: "task_completed",
        resultSummary: "这是正式回复。",
        semanticSummary: "Let Me Check The Workspace",
      },
    } as any);

    expect(text).toBe("这是正式回复。");
  });

  it("uses the semantic summary only when no delivery message is available", () => {
    const text = getCompletionSummaryText({
      id: "completed-2",
      taskId: "task-1",
      timestamp: 1,
      type: "timeline_step_finished",
      payload: {
        legacyType: "task_completed",
        semanticSummary: "任务已完成。",
      },
    } as any);

    expect(text).toBe("任务已完成。");
  });
});
